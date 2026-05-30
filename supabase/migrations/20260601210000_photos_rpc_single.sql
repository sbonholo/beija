-- Update RPCs that previously joined photos on slot. Single-photo world now:
--   - get_profile_safe / get_profiles_safe: photo_urls stays text[] but is
--     either empty or a single-element array (cheaper, no array_agg ORDER BY).
--     Keeping the column type avoids a cascading break on every consumer
--     (ProfileDetailModal, SwipeCard renders an <img> per element).
--   - who_liked_me: drop the slot = 0 filter.
--   - get_event_attendees: drop the slot-asc sort, just LIMIT 1.
--
-- All three use CREATE OR REPLACE so we never end up with a dropped function.
-- find_potential_matches in 20260525300000 doesn't reference photos, so it's
-- untouched.

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
      (select array_agg(ph.url) from photos ph where ph.user_id = p.id),
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
      (select array_agg(ph.url) from photos ph where ph.user_id = p.id),
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

create or replace function who_liked_me()
returns table (
  swiper_id uuid,
  swiper_name text,
  swiper_age int,
  swiper_bio text,
  swiper_photo_url text,
  direction text,
  swiped_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    return;
  end if;

  return query
  select
    s.swiper_id,
    p.name,
    case when p.birthdate is null then null
         else extract(year from age(p.birthdate))::int
    end,
    p.bio,
    (select ph.url
       from photos ph
       where ph.user_id = s.swiper_id
       limit 1) as swiper_photo_url,
    s.direction,
    s.created_at
  from swipes s
  join profiles p on p.id = s.swiper_id
  where s.swipee_id = me
    and s.direction in ('right', 'super')
    and p.deleted_at is null
    and not exists (
      select 1 from swipes s2
      where s2.swiper_id = me and s2.swipee_id = s.swiper_id
    )
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = me and b.blocked_id = s.swiper_id)
         or (b.blocker_id = s.swiper_id and b.blocked_id = me)
    )
    and not exists (
      select 1 from reports r
      where r.status in ('pending', 'actioned')
        and (
          (r.reporter_id = me and r.reported_id = s.swiper_id)
          or (r.reporter_id = s.swiper_id and r.reported_id = me)
        )
    )
  order by s.created_at desc
  limit 200;
end;
$$;

grant execute on function who_liked_me() to authenticated;

create or replace function get_event_attendees(
  p_event_id      uuid,
  p_gender_filter boolean default false,
  p_limit         int     default 100,
  p_offset        int     default 0
)
returns table (
  user_id     uuid,
  name        text,
  age         int,
  photo_url   text,
  my_reaction text
) language sql security definer set search_path = public as $$
  select
    p.id                                                    as user_id,
    p.name,
    extract(year from age(p.birthdate))::int                as age,
    (select url from photos ph
     where ph.user_id = p.id
     limit 1)                                               as photo_url,
    er.kind                                                 as my_reaction
  from check_ins ci
  join profiles p on p.id = ci.user_id
  left join lateral (
    select interested_in as my_interested_in,
           gender        as my_gender
    from profiles
    where id = auth.uid()
  ) as me on true
  left join event_reactions er
         on er.event_id    = p_event_id
        and er.sender_id   = auth.uid()
        and er.receiver_id = p.id
  where ci.event_id   = p_event_id
    and p.id          <> auth.uid()
    and p.is_banned   = false
    and p.deleted_at  is null
    and (
      not p_gender_filter
      or (
        p.gender         = any(me.my_interested_in)
        and me.my_gender = any(p.interested_in)
      )
    )
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id       and b.blocked_id = auth.uid())
    )
    and not exists (
      select 1 from reports r
      where r.status in ('pending', 'actioned')
        and (
          (r.reporter_id = auth.uid() and r.reported_id = p.id)
          or (r.reporter_id = p.id    and r.reported_id = auth.uid())
        )
    )
  order by ci.created_at desc
  limit p_limit offset p_offset;
$$;

grant execute on function get_event_attendees(uuid, boolean, int, int) to authenticated;
