-- Phase P5 — get_profile_safe centralizes profile-detail fetching with all
-- privacy filters enforced server-side.
--
-- Why: the ProfileDetailModal used to (a) fetch me.location, (b) fetch the
-- target profile + photos in parallel, (c) apply hide_distance / show_age /
-- block checks client-side. Easy to forget a filter when adding a new
-- consumer (e.g. server-rendered share page). This RPC is the single
-- authoritative path.
--
-- Behavior:
--   - Returns 0 rows if:
--       · caller not authenticated
--       · target doesn't exist
--       · target.deleted_at IS NOT NULL
--       · target.is_inactive = true
--       · blocks row exists in either direction (caller↔target)
--       · open report (pending/actioned) exists in either direction
--       · caller asks for themselves (use the standard SELECT for that)
--   - birthdate is masked to NULL when target.show_age = false
--   - distance_km is masked to NULL when target.hide_distance = true OR
--     either side has no location
--   - photo_urls is the slot-ordered array (0..5) — empty array if no photos

drop function if exists get_profile_safe(uuid);

create or replace function get_profile_safe(p_target_user_id uuid)
returns table (
  id uuid,
  name text,
  birthdate date,
  gender text,
  bio text,
  city text,
  interested_in text[],
  interests text[],
  hide_distance boolean,
  show_age boolean,
  last_active_at timestamptz,
  photo_urls text[],
  distance_km int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  me profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if auth.uid() = p_target_user_id then
    return;
  end if;

  -- Using %rowtype avoids declaring a local of the postgis `geography` type,
  -- which is only resolvable when the `extensions` schema is in search_path.
  -- The rowtype is parsed lazily — same pattern as find_potential_matches.
  select * into me from profiles where profiles.id = auth.uid();

  return query
  select
    p.id,
    p.name,
    case when p.show_age then p.birthdate else null end as birthdate,
    p.gender,
    p.bio,
    p.city,
    p.interested_in,
    p.interests,
    p.hide_distance,
    p.show_age,
    p.last_active_at,
    coalesce(
      (
        select array_agg(ph.url order by ph.slot)
        from photos ph
        where ph.user_id = p.id
      ),
      array[]::text[]
    ) as photo_urls,
    case
      when p.hide_distance then null
      when me.location is null or p.location is null then null
      else (st_distance(me.location, p.location) / 1000)::int
    end as distance_km
  from profiles p
  where p.id = p_target_user_id
    and p.deleted_at is null
    and p.is_inactive = false
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid())
    )
    and not exists (
      select 1 from reports r
      where r.status in ('pending', 'actioned')
        and (
          (r.reporter_id = auth.uid() and r.reported_id = p.id)
          or (r.reporter_id = p.id and r.reported_id = auth.uid())
        )
    );
end;
$$;

grant execute on function get_profile_safe(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Batch variant: get_profiles_safe(uuid[])
-- Same sanitization rules as get_profile_safe, but for an arbitrary list of
-- targets. Used when the client already knows the ids (matches, likes-you).
-- ---------------------------------------------------------------------------

drop function if exists get_profiles_safe(uuid[]);

create or replace function get_profiles_safe(p_target_user_ids uuid[])
returns table (
  id uuid,
  name text,
  birthdate date,
  gender text,
  bio text,
  city text,
  interested_in text[],
  interests text[],
  hide_distance boolean,
  show_age boolean,
  last_active_at timestamptz,
  photo_urls text[],
  distance_km int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  me profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_target_user_ids is null or array_length(p_target_user_ids, 1) is null then
    return;
  end if;

  select * into me from profiles where profiles.id = auth.uid();

  return query
  select
    p.id, p.name,
    case when p.show_age then p.birthdate else null end as birthdate,
    p.gender, p.bio, p.city, p.interested_in, p.interests,
    p.hide_distance, p.show_age, p.last_active_at,
    coalesce(
      (select array_agg(ph.url order by ph.slot) from photos ph where ph.user_id = p.id),
      array[]::text[]
    ) as photo_urls,
    case
      when p.hide_distance then null
      when me.location is null or p.location is null then null
      else (st_distance(me.location, p.location) / 1000)::int
    end as distance_km
  from profiles p
  where p.id = any(p_target_user_ids)
    and p.id <> auth.uid()
    and p.deleted_at is null
    and p.is_inactive = false
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid())
    )
    and not exists (
      select 1 from reports r
      where r.status in ('pending', 'actioned')
        and (
          (r.reporter_id = auth.uid() and r.reported_id = p.id)
          or (r.reporter_id = p.id and r.reported_id = auth.uid())
        )
    );
end;
$$;

grant execute on function get_profiles_safe(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- find_potential_matches v4 — same shape as before but birthdate is masked
-- when the candidate has show_age = false, and distance_km is masked when
-- hide_distance = true. Filter set identical to migration 900000.
-- ---------------------------------------------------------------------------

drop function if exists find_potential_matches(uuid, int);

create or replace function find_potential_matches(
  p_user_id uuid,
  p_max_distance_km int default null
)
returns table (
  id uuid,
  name text,
  birthdate date,
  gender text,
  bio text,
  city text,
  interested_in text[],
  interests text[],
  last_active_at timestamptz,
  hide_distance boolean,
  show_age boolean,
  distance_km int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  me profiles%rowtype;
  v_effective_distance int;
begin
  select * into me from profiles where profiles.id = p_user_id;
  if me.id is null or me.deleted_at is not null then
    return;
  end if;

  v_effective_distance := coalesce(p_max_distance_km, me.max_distance_km, 50);

  return query
  select
    p.id, p.name,
    case when p.show_age then p.birthdate else null end as birthdate,
    p.gender, p.bio, p.city,
    p.interested_in, p.interests, p.last_active_at,
    p.hide_distance, p.show_age,
    case
      when p.hide_distance then null
      when me.location is null or p.location is null then null
      else (st_distance(me.location, p.location) / 1000)::int
    end as distance_km
  from profiles p
  where p.id <> p_user_id
    and p.deleted_at is null
    and p.is_inactive = false
    and (
      me.location is null
      or p.location is null
      or st_dwithin(me.location, p.location, v_effective_distance * 1000)
    )
    and (
      me.interested_in is null
      or array_length(me.interested_in, 1) is null
      or p.gender = any(me.interested_in)
    )
    and (
      p.interested_in is null
      or array_length(p.interested_in, 1) is null
      or me.gender = any(p.interested_in)
    )
    and (
      me.min_age is null or p.birthdate is null
      or extract(year from age(p.birthdate))::int >= me.min_age
    )
    and (
      me.max_age is null or p.birthdate is null
      or extract(year from age(p.birthdate))::int <= me.max_age
    )
    and (
      p.min_age is null or me.birthdate is null
      or extract(year from age(me.birthdate))::int >= p.min_age
    )
    and (
      p.max_age is null or me.birthdate is null
      or extract(year from age(me.birthdate))::int <= p.max_age
    )
    and not exists (
      select 1 from swipes s
      where s.swiper_id = p_user_id and s.swipee_id = p.id
    )
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = p_user_id and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = p_user_id)
    )
    and not exists (
      select 1 from reports r
      where r.status in ('pending', 'actioned')
        and (
          (r.reporter_id = p_user_id and r.reported_id = p.id)
          or (r.reporter_id = p.id and r.reported_id = p_user_id)
        )
    )
  order by p.last_active_at desc nulls last
  limit 100;
end;
$$;

grant execute on function find_potential_matches(uuid, int) to authenticated;
