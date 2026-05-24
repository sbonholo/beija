-- Phase X: rewind, who_liked_me, find_potential_matches with distance.
--
-- 1) rewind_last_swipe() — undo the most recent swipe. If it created a match
--    in the last 60s (i.e. just now), undo the match too.
-- 2) who_liked_me() — return profiles who right/super-swiped me and that I
--    haven't swiped on yet. RLS on swipes is swiper-only by design; we go
--    around it via SECURITY DEFINER.
-- 3) find_potential_matches() recreated to also return distance_km computed
--    via st_distance — same filters as before.

-- ---------------------------------------------------------------------------
-- 1) rewind_last_swipe
-- ---------------------------------------------------------------------------
create or replace function rewind_last_swipe()
returns table (
  swipee_id uuid,
  direction text,
  unmatched boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  last_swipe record;
  v_unmatched boolean := false;
  v_lo uuid;
  v_hi uuid;
begin
  if me is null then
    raise exception 'not_authenticated';
  end if;

  select s.* into last_swipe
  from swipes s
  where s.swiper_id = me
  order by s.created_at desc
  limit 1;

  if last_swipe.id is null then
    return;
  end if;

  if last_swipe.direction in ('right', 'super') then
    v_lo := least(me, last_swipe.swipee_id);
    v_hi := greatest(me, last_swipe.swipee_id);
    delete from matches m
      where m.user1_id = v_lo
        and m.user2_id = v_hi
        and m.created_at > last_swipe.created_at - interval '1 minute';
    if found then
      v_unmatched := true;
    end if;
  end if;

  delete from swipes where id = last_swipe.id;

  return query select last_swipe.swipee_id, last_swipe.direction, v_unmatched;
end;
$$;

grant execute on function rewind_last_swipe() to authenticated;

-- ---------------------------------------------------------------------------
-- 2) who_liked_me
-- ---------------------------------------------------------------------------
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
       where ph.user_id = s.swiper_id and ph.slot = 0
       limit 1) as swiper_photo_url,
    s.direction,
    s.created_at
  from swipes s
  join profiles p on p.id = s.swiper_id
  where s.swipee_id = me
    and s.direction in ('right', 'super')
    and p.deleted_at is null
    -- exclude people I've already swiped (their outcome is already decided)
    and not exists (
      select 1 from swipes s2
      where s2.swiper_id = me and s2.swipee_id = s.swiper_id
    )
    -- exclude blocks (either direction)
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = me and b.blocked_id = s.swiper_id)
         or (b.blocker_id = s.swiper_id and b.blocked_id = me)
    )
    -- exclude open reports against this person (by me or by them)
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

-- ---------------------------------------------------------------------------
-- 3) find_potential_matches — recreated with distance_km in output
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
  last_active timestamptz,
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
    p.id,
    p.name,
    p.birthdate,
    p.gender,
    p.bio,
    p.city,
    p.interested_in,
    p.interests,
    p.last_active,
    case
      when me.location is null or p.location is null then null
      else (st_distance(me.location, p.location) / 1000)::int
    end as distance_km
  from profiles p
  where p.id <> p_user_id
    and p.deleted_at is null
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
  order by p.last_active desc nulls last
  limit 100;
end;
$$;

grant execute on function find_potential_matches(uuid, int) to authenticated;
