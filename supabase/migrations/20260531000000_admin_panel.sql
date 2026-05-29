-- Batch 4: admin panel — server-enforced is_admin flag + admin-only RPCs.
--
-- Re-run safe: ALTER ... ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
-- and CREATE OR REPLACE throughout. No DROP of any function, so a failure can
-- never leave a function dropped-but-not-recreated (Batch 2 lesson).
--
-- ACCESS MODEL: admin data is reached only through SECURITY DEFINER RPCs that
-- self-check is_admin(). The client reads profiles.is_admin solely to show/hide
-- the hidden route — it is NOT the security boundary. No password anywhere.
-- The operator flips their own row to true manually (see deploy note).

-- 1. Flags + index -----------------------------------------------------------
alter table profiles add column if not exists is_admin  boolean not null default false;
alter table events   add column if not exists is_active boolean not null default true;

create index if not exists idx_profiles_created_at on profiles (created_at);

-- 2. Admin guard -------------------------------------------------------------
create or replace function is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select p.is_admin from profiles p where p.id = auth.uid()), false);
$$;
grant execute on function is_admin() to authenticated;

-- 3. Event management (PostGIS kept server-side) -----------------------------
create or replace function admin_upsert_event(
  p_id        uuid,
  p_name      text,
  p_venue     text,
  p_city      text,
  p_address   text,
  p_lat       double precision,
  p_lng       double precision,
  p_category  text,
  p_starts_at timestamptz,
  p_ends_at   timestamptz,
  p_image_url text,
  p_is_active boolean
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id  uuid;
  v_loc geography;
begin
  if not is_admin() then raise exception 'not_authorized'; end if;

  v_loc := case
    when p_lat is not null and p_lng is not null
      then st_point(p_lng, p_lat)::geography
    else null
  end;

  if p_id is null then
    insert into events (name, venue, city, address, location, category,
                        starts_at, ends_at, image_url, is_active)
    values (p_name, p_venue, p_city, p_address, v_loc, p_category,
            p_starts_at, p_ends_at, p_image_url, coalesce(p_is_active, true))
    returning id into v_id;
  else
    update events set
      name      = p_name,
      venue     = p_venue,
      city      = p_city,
      address   = p_address,
      location  = coalesce(v_loc, location),
      category  = p_category,
      starts_at = p_starts_at,
      ends_at   = p_ends_at,
      image_url = p_image_url,
      is_active = coalesce(p_is_active, is_active)
    where id = p_id
    returning id into v_id;
  end if;

  return v_id;
end;
$$;
grant execute on function admin_upsert_event(uuid, text, text, text, text, double precision, double precision, text, timestamptz, timestamptz, text, boolean) to authenticated;

create or replace function admin_set_event_active(p_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_authorized'; end if;
  update events set is_active = p_active where id = p_id;
end;
$$;
grant execute on function admin_set_event_active(uuid, boolean) to authenticated;

create or replace function admin_list_events()
returns setof events
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_authorized'; end if;
  return query select * from events order by starts_at desc;
end;
$$;
grant execute on function admin_list_events() to authenticated;

-- 4. KPIs (single round trip, cheap aggregates) ------------------------------
create or replace function admin_dashboard_kpis()
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_authorized'; end if;
  return json_build_object(
    'total_users',        (select count(*) from profiles where deleted_at is null),
    'new_24h',            (select count(*) from profiles where created_at > now() - interval '24 hours'),
    'new_7d',             (select count(*) from profiles where created_at > now() - interval '7 days'),
    'new_30d',            (select count(*) from profiles where created_at > now() - interval '30 days'),
    'profiles_completed', (select count(*) from profiles where deleted_at is null and name is not null and gender is not null and birthdate is not null),
    'dau',                (select count(*) from profiles where last_active_at > now() - interval '24 hours'),
    'wau',                (select count(*) from profiles where last_active_at > now() - interval '7 days'),
    'total_checkins',     (select count(*) from check_ins),
    'total_matches',      (select count(*) from matches),
    'reactions_kiss',     (select count(*) from event_reactions where kind = 'kiss'),
    'reactions_heart',    (select count(*) from event_reactions where kind = 'heart'),
    'reactions_fire',     (select count(*) from event_reactions where kind = 'fire'),
    'reports_pending',    (select count(*) from reports where status = 'pending'),
    'reports_actioned',   (select count(*) from reports where status = 'actioned'),
    'total_blocks',       (select count(*) from blocks),
    'banned_users',       (select count(*) from profiles where is_banned = true),
    'total_events',       (select count(*) from events),
    'active_events',      (select count(*) from events where is_active = true)
  );
end;
$$;
grant execute on function admin_dashboard_kpis() to authenticated;

create or replace function admin_event_checkins()
returns table (
  event_id  uuid,
  name      text,
  starts_at timestamptz,
  is_active boolean,
  checkins  int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_authorized'; end if;
  return query
    select e.id, e.name, e.starts_at, e.is_active,
           (select count(*)::int from check_ins ci where ci.event_id = e.id)
    from events e
    where e.starts_at > now() - interval '30 days'
    order by e.starts_at desc;
end;
$$;
grant execute on function admin_event_checkins() to authenticated;

-- 5. Moderation --------------------------------------------------------------
create or replace function admin_list_pending_reports()
returns table (
  report_id             uuid,
  reason                text,
  details               text,
  created_at            timestamptz,
  reporter_id           uuid,
  reporter_name         text,
  reported_id           uuid,
  reported_name         text,
  reported_is_banned    boolean,
  reported_report_count int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_authorized'; end if;
  return query
    select r.id, r.reason, r.details, r.created_at,
           r.reporter_id, rp.name,
           r.reported_id, tp.name,
           tp.is_banned,
           (select count(*)::int from reports r2 where r2.reported_id = r.reported_id)
    from reports r
    left join profiles rp on rp.id = r.reporter_id
    left join profiles tp on tp.id = r.reported_id
    where r.status = 'pending'
    order by r.created_at asc;
end;
$$;
grant execute on function admin_list_pending_reports() to authenticated;

create or replace function admin_ban_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_authorized'; end if;
  if p_user_id is null then raise exception 'invalid_target'; end if;
  update profiles set is_banned = true where id = p_user_id;
  update reports set status = 'actioned'
    where reported_id = p_user_id and status = 'pending';
end;
$$;
grant execute on function admin_ban_user(uuid) to authenticated;

create or replace function admin_dismiss_report(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_authorized'; end if;
  update reports set status = 'dismissed' where id = p_report_id;
end;
$$;
grant execute on function admin_dismiss_report(uuid) to authenticated;

-- 6. get_nearby_events: hide deactivated events (otherwise identical to the
--    deployed version). CREATE OR REPLACE with unchanged signature.
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
  image_url      text,
  distance_km    int,
  attendee_count int,
  is_checked_in  boolean
) language sql security definer as $$
  select
    e.id,
    e.name,
    e.venue,
    e.city,
    e.category,
    e.starts_at,
    e.ends_at,
    e.image_url,
    case
      when p_lat is not null and p_lon is not null and e.location is not null
      then (st_distance(e.location, st_point(p_lon, p_lat)::geography) / 1000)::int
      else null
    end                                                      as distance_km,
    (select count(*)::int from check_ins ci where ci.event_id = e.id)
                                                             as attendee_count,
    exists (
      select 1 from check_ins ci
      where ci.event_id = e.id and ci.user_id = auth.uid()
    )                                                        as is_checked_in
  from events e
  where
    e.is_active = true
    and (e.ends_at is null or e.ends_at > now())
    and e.starts_at > now() - interval '12 hours'
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
