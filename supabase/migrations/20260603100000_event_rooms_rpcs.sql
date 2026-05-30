-- Event Rooms: backend RPCs + cron jobs
--
-- New RPCs:
--   create_event_room   — user-created room, expires_at = now() + 12h
--   join_event_room     — insert active check-in; idempotent for rejoins
--   leave_event_room    — stamp left_at on the active check-in
--   find_potential_matches_in_event — swipe deck scoped to active room attendees
--
-- Updated RPCs (shape changes → DROP first):
--   get_nearby_events   — adds created_by, expires_at; respects is_active + left_at
--
-- Updated RPCs (body only → CREATE OR REPLACE):
--   get_event_attendees — filter ci.left_at IS NULL (active attendees only)
--
-- New cron jobs (idempotent unschedule-before-schedule pattern):
--   beija_expire_event_rooms     — */15 * * * *   mark expired rooms is_active=false
--   beija_auto_leave_rooms       — */30 * * * *   auto-leave users idle ≥ 2h

-- ══════════════════════════════════════════════════════════════
-- 1. join_event_room
-- ══════════════════════════════════════════════════════════════
create or replace function join_event_room(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  -- Fail-closed: event must exist, be active, and not expired
  if not exists (
    select 1 from events e
    where e.id = p_event_id
      and e.is_active = true
      and (e.expires_at is null or e.expires_at > now())
  ) then
    raise exception 'event_not_found_or_expired';
  end if;

  -- Insert a fresh check-in. If there's already an active one (left_at IS NULL)
  -- the partial unique check_ins_active_unique will conflict → silently skip.
  insert into check_ins (user_id, event_id)
  values (auth.uid(), p_event_id)
  on conflict on constraint check_ins_active_unique do nothing;

  -- Keep last_active_at fresh so auto-leave timer resets on join
  update profiles set last_active_at = now(), is_inactive = false
  where id = auth.uid();
end;
$$;

grant execute on function join_event_room(uuid) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- 2. leave_event_room
-- ══════════════════════════════════════════════════════════════
create or replace function leave_event_room(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  update check_ins
    set left_at = now()
  where user_id  = auth.uid()
    and event_id = p_event_id
    and left_at  is null;
end;
$$;

grant execute on function leave_event_room(uuid) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- 3. create_event_room
-- ══════════════════════════════════════════════════════════════
create or replace function create_event_room(
  p_name     text,
  p_lat      double precision default null,
  p_lon      double precision default null,
  p_category text             default 'other',
  p_venue    text             default null,
  p_city     text             default null,
  p_address  text             default null
)
returns uuid   -- newly created event id
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_category text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  v_category := coalesce(
    nullif(trim(p_category), ''),
    'other'
  );

  if v_category not in ('festival', 'concert', 'bar', 'nightclub', 'show', 'other') then
    raise exception 'invalid_category';
  end if;

  insert into events (
    name, venue, city, address, location,
    category, starts_at, ends_at, expires_at, created_by
  )
  values (
    trim(p_name),
    nullif(trim(coalesce(p_venue, '')), ''),
    nullif(trim(coalesce(p_city,  '')), ''),
    nullif(trim(coalesce(p_address, '')), ''),
    case when p_lat is not null and p_lon is not null
         then st_point(p_lon, p_lat)::geography
         else null
    end,
    v_category,
    now(),
    now() + interval '12 hours',  -- ends_at (display)
    now() + interval '12 hours',  -- expires_at (hard cap, basis: created_at + 12h)
    auth.uid()
  )
  returning id into v_event_id;

  -- Creator auto-joins their own room
  insert into check_ins (user_id, event_id)
  values (auth.uid(), v_event_id)
  on conflict on constraint check_ins_active_unique do nothing;

  return v_event_id;
end;
$$;

grant execute on function create_event_room(text, double precision, double precision, text, text, text, text) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- 4. find_potential_matches_in_event
--    Fork of find_potential_matches scoped to one room's active attendees.
--    DROP first — return-type may diverge from any prior version.
--    (Same pattern applied after the 42P13 lesson from find_potential_matches.)
--
--    400m flat geo-dedup for v1 (event.location as anchor).
--    Fast-follow note: category-scaling (festival 800m / nightclub 200m)
--    documented here but not built — tune post-launch with real data.
-- ══════════════════════════════════════════════════════════════
drop function if exists find_potential_matches_in_event(uuid, uuid);
drop function if exists find_potential_matches_in_event(uuid);

create or replace function find_potential_matches_in_event(
  p_user_id  uuid,
  p_event_id uuid
)
returns table (
  id             uuid,
  name           text,
  birthdate      date,
  gender         text,
  bio            text,
  city           text,
  interested_in  text[],
  interests      text[],
  last_active_at timestamptz,
  hide_distance  boolean,
  show_age       boolean,
  distance_km    int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  me profiles%rowtype;
begin
  select * into me from profiles where profiles.id = p_user_id;
  if me.id is null or me.deleted_at is not null then
    return;
  end if;

  -- Fail-closed: caller must be actively checked in
  if not exists (
    select 1 from check_ins ci
    where ci.user_id  = p_user_id
      and ci.event_id = p_event_id
      and ci.left_at  is null
  ) then
    return;
  end if;

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
  -- Must be actively checked in to this event
  join check_ins ci
    on ci.user_id  = p.id
   and ci.event_id = p_event_id
   and ci.left_at  is null
  where p.id <> p_user_id
    and p.deleted_at  is null
    and p.is_inactive = false
    -- Bidirectional gender filter (fail-closed: null interested_in passes)
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

grant execute on function find_potential_matches_in_event(uuid, uuid) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- 5. get_nearby_events — shape change → DROP first
--    Adds created_by, expires_at to output.
--    attendee_count and is_checked_in now respect left_at IS NULL.
--    Filters: is_active = true AND (expires_at IS NULL OR expires_at > now()).
-- ══════════════════════════════════════════════════════════════
drop function if exists get_nearby_events(double precision, double precision, int);
drop function if exists get_nearby_events(double precision, double precision);
drop function if exists get_nearby_events();

create or replace function get_nearby_events(
  p_lat       double precision default null,
  p_lon       double precision default null,
  p_radius_km int              default 100
)
returns table (
  id             uuid,
  name           text,
  venue          text,
  city           text,
  category       text,
  starts_at      timestamptz,
  ends_at        timestamptz,
  expires_at     timestamptz,
  created_by     uuid,
  image_url      text,
  distance_km    int,
  attendee_count int,
  is_checked_in  boolean
)
language sql
security definer
set search_path = public
as $$
  select
    e.id,
    e.name,
    e.venue,
    e.city,
    e.category,
    e.starts_at,
    e.ends_at,
    e.expires_at,
    e.created_by,
    e.image_url,
    case
      when p_lat is not null and p_lon is not null and e.location is not null
      then (st_distance(e.location, st_point(p_lon, p_lat)::geography) / 1000)::int
      else null
    end                                                    as distance_km,
    -- Only count currently present attendees (left_at IS NULL)
    (select count(*)::int from check_ins ci
     where ci.event_id = e.id and ci.left_at is null)     as attendee_count,
    -- Is the caller currently inside?
    exists (
      select 1 from check_ins ci
      where ci.event_id = e.id
        and ci.user_id  = auth.uid()
        and ci.left_at  is null
    )                                                      as is_checked_in
  from events e
  where e.is_active = true
    and (e.expires_at is null or e.expires_at > now())
    -- still active: started within last 12h or not yet ended
    and (e.ends_at is null or e.ends_at > now())
    and e.starts_at > now() - interval '12 hours'
    -- geo filter (only when caller provides coords AND event has coords)
    and (
      p_lat is null or p_lon is null
      or e.location is null
      or st_dwithin(e.location, st_point(p_lon, p_lat)::geography, p_radius_km * 1000)
    )
  order by
    case when p_lat is not null and p_lon is not null and e.location is not null
         then st_distance(e.location, st_point(p_lon, p_lat)::geography)
         else null
    end asc nulls last,
    e.starts_at asc;
$$;

grant execute on function get_nearby_events(double precision, double precision, int) to authenticated;

-- ══════════════════════════════════════════════════════════════
-- 6. get_event_attendees — body only (shape unchanged)
--    Add ci.left_at IS NULL so only currently present people show.
-- ══════════════════════════════════════════════════════════════
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
)
language sql
security definer
set search_path = public
as $$
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
    and ci.left_at    is null          -- active attendees only
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

-- ══════════════════════════════════════════════════════════════
-- 7. cron_expire_event_rooms
--    Marks rooms inactive when expires_at passes; auto-leaves attendees.
-- ══════════════════════════════════════════════════════════════
create or replace function cron_expire_event_rooms()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  expired_cnt  int;
  left_cnt     int;
begin
  -- Step 1: mark expired rooms inactive
  update events
    set is_active = false
  where expires_at is not null
    and expires_at < now()
    and is_active  = true;
  get diagnostics expired_cnt = row_count;

  -- Step 2: auto-leave active check-ins in any inactive room
  update check_ins
    set left_at = now()
  where left_at is null
    and event_id in (
      select id from events where is_active = false
    );
  get diagnostics left_cnt = row_count;

  raise notice 'cron_expire_event_rooms: % rooms expired, % check-ins auto-left', expired_cnt, left_cnt;
end;
$$;

-- ══════════════════════════════════════════════════════════════
-- 8. cron_auto_leave_inactive_rooms
--    Stamps left_at for users idle ≥ 2 hours in any active room.
-- ══════════════════════════════════════════════════════════════
create or replace function cron_auto_leave_inactive_rooms()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cnt int;
begin
  update check_ins ci
    set left_at = now()
  where ci.left_at is null
    and exists (
      select 1 from profiles p
      where p.id = ci.user_id
        and (
          p.last_active_at is null
          or p.last_active_at < now() - interval '2 hours'
        )
    );
  get diagnostics cnt = row_count;
  raise notice 'cron_auto_leave_inactive_rooms: % check-ins auto-left', cnt;
end;
$$;

-- ══════════════════════════════════════════════════════════════
-- 9. Schedule the two new cron jobs (idempotent)
-- ══════════════════════════════════════════════════════════════
do $$
declare
  jobs jsonb := jsonb_build_object(
    'beija_expire_event_rooms',
      jsonb_build_array('*/15 * * * *', 'select cron_expire_event_rooms()'),
    'beija_auto_leave_rooms',
      jsonb_build_array('*/30 * * * *', 'select cron_auto_leave_inactive_rooms()')
  );
  job_name text;
  spec     jsonb;
begin
  for job_name, spec in select * from jsonb_each(jobs) loop
    if exists (select 1 from cron.job where jobname = job_name) then
      perform cron.unschedule(job_name);
    end if;
    perform cron.schedule(job_name, spec ->> 0, spec ->> 1);
  end loop;
end $$;
