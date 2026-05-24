-- Phase R — backend cron jobs (pg_cron) + supporting schema bumps
--
-- New columns:
--   profiles.last_active_at  (renamed from last_active for naming consistency)
--   profiles.is_inactive     (set true after 30d idle; hidden in matching)
--   matches.is_stale         (no message in 7+ days)
--   matches.is_archived      (no message in 30+ days; hidden from MatchesList)
--
-- Jobs (all UTC):
--   03:00 daily  → process_deletion_requests   (dispatch to edge fn)
--   04:00 daily  → mark_inactive_profiles      (sql)
--   05:00 daily  → refresh_match_decay         (sql)
--   06:00 daily  → vacuum_notification_log     (sql, 7-day retention)
--   02:00 Sunday → cleanup_orphan_photos       (sql + storage)
--
-- Run `select jobname, schedule, last_run_at, last_status from cron.job
-- left join cron.job_run_details using (jobid)` to inspect.

create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- 1) Schema bumps
-- ---------------------------------------------------------------------------

-- Rename last_active → last_active_at (idempotent).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'last_active'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'last_active_at'
  ) then
    alter table profiles rename column last_active to last_active_at;
  end if;
end $$;

-- Make sure the column exists (fresh installs).
alter table profiles
  add column if not exists last_active_at timestamptz default now();

alter table profiles
  add column if not exists is_inactive boolean not null default false;

alter table matches
  add column if not exists is_stale boolean not null default false;

alter table matches
  add column if not exists is_archived boolean not null default false;

-- Replace the old index name with the new one.
drop index if exists idx_profiles_last_active;
create index if not exists idx_profiles_last_active_at
  on profiles (last_active_at desc);

create index if not exists idx_profiles_is_inactive
  on profiles (is_inactive)
  where is_inactive = false;

create index if not exists idx_matches_is_archived
  on matches (is_archived)
  where is_archived = false;

-- ---------------------------------------------------------------------------
-- 2) RPC: recreate update_user_location + find_potential_matches against the
-- renamed column, and add is_inactive / is_archived filters.
-- ---------------------------------------------------------------------------

create or replace function update_user_location(p_lat float, p_lng float)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  update profiles
    set location = st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
        last_active_at = now(),
        is_inactive = false
    where id = auth.uid();
end;
$$;

grant execute on function update_user_location(float, float) to authenticated;

-- find_potential_matches: add `and not p.is_inactive` + replace last_active ref.
drop function if exists find_potential_matches(uuid, int);

create or replace function find_potential_matches(
  p_user_id uuid,
  p_max_distance_km int default null
)
returns setof profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  me profiles%rowtype;
  v_effective_distance int;
begin
  select * into me from profiles where id = p_user_id;
  if me.id is null or me.deleted_at is not null then
    return;
  end if;

  v_effective_distance := coalesce(p_max_distance_km, me.max_distance_km, 50);

  return query
  select p.*
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

-- ---------------------------------------------------------------------------
-- 3) Cron job bodies (each wrapped as a security-definer function so pg_cron
-- runs them in a predictable role context).
-- ---------------------------------------------------------------------------

-- 3a) Dispatch the deletion-processing edge function.
create or replace function cron_process_deletion_requests()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Reuses dispatch_edge() from migration 20260524600000_function_hooks.sql.
  perform dispatch_edge('process_pending_deletions', '{}'::jsonb);
end;
$$;

-- 3b) Mark profiles idle for 30+ days as inactive.
create or replace function cron_mark_inactive_profiles()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cnt int;
begin
  update profiles
     set is_inactive = true
   where deleted_at is null
     and is_inactive = false
     and (last_active_at is null or last_active_at < now() - interval '30 days');
  get diagnostics cnt = row_count;
  raise notice 'cron_mark_inactive_profiles: marked % rows inactive', cnt;
end;
$$;

-- 3c) Match decay: 7 days stale, 30 days archived.
create or replace function cron_refresh_match_decay()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  stale_cnt int;
  archived_cnt int;
begin
  update matches
     set is_stale = true
   where is_stale = false
     and is_archived = false
     and coalesce(last_message_at, created_at) < now() - interval '7 days';
  get diagnostics stale_cnt = row_count;

  update matches
     set is_archived = true
   where is_archived = false
     and coalesce(last_message_at, created_at) < now() - interval '30 days';
  get diagnostics archived_cnt = row_count;

  raise notice 'cron_refresh_match_decay: % stale, % archived', stale_cnt, archived_cnt;
end;
$$;

-- 3d) Drop notification_log rows older than 7 days.
create or replace function cron_vacuum_notification_log()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cnt int;
begin
  delete from notification_log
   where sent_at < now() - interval '7 days';
  get diagnostics cnt = row_count;
  raise notice 'cron_vacuum_notification_log: removed % rows', cnt;
end;
$$;

-- 3e) Orphan photo cleanup: photos table rows + storage objects whose owner
-- (UUID prefix in the path) is gone from profiles. The photos FK already
-- cascades on profile delete, but storage objects don't; this is the safety
-- net for any drift.
create or replace function cron_cleanup_orphan_photos()
returns void
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  photo_cnt int;
  storage_cnt int := 0;
begin
  -- 1) Photos rows whose user vanished (rare — FK cascade should cover this).
  delete from photos p
   where not exists (select 1 from profiles pr where pr.id = p.user_id);
  get diagnostics photo_cnt = row_count;

  -- 2) Storage objects under profile-photos/<uuid>/... with no matching profile.
  -- Guarded in DO so insufficient privilege on storage.objects doesn't abort.
  begin
    delete from storage.objects o
     where o.bucket_id = 'profile-photos'
       and not exists (
         select 1 from profiles pr
         where pr.id::text = split_part(o.name, '/', 1)
       );
    get diagnostics storage_cnt = row_count;
  exception when insufficient_privilege then
    raise notice 'cron_cleanup_orphan_photos: skipped storage cleanup (insufficient privilege)';
  end;

  raise notice 'cron_cleanup_orphan_photos: % rows, % storage objects', photo_cnt, storage_cnt;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Schedule the jobs. cron.schedule() is idempotent on (jobname) only when
-- we unschedule first; safer to unschedule-if-exists before each create.
-- ---------------------------------------------------------------------------

do $$
declare
  jobs jsonb := jsonb_build_object(
    'beija_process_deletion_requests', jsonb_build_array('0 3 * * *',  'select cron_process_deletion_requests()'),
    'beija_mark_inactive_profiles',    jsonb_build_array('0 4 * * *',  'select cron_mark_inactive_profiles()'),
    'beija_refresh_match_decay',       jsonb_build_array('0 5 * * *',  'select cron_refresh_match_decay()'),
    'beija_vacuum_notification_log',   jsonb_build_array('0 6 * * *',  'select cron_vacuum_notification_log()'),
    'beija_cleanup_orphan_photos',     jsonb_build_array('0 2 * * 0',  'select cron_cleanup_orphan_photos()')
  );
  job_name text;
  spec jsonb;
begin
  for job_name, spec in select * from jsonb_each(jobs) loop
    -- Drop any prior schedule under this name (idempotent migration).
    if exists (select 1 from cron.job where jobname = job_name) then
      perform cron.unschedule(job_name);
    end if;
    perform cron.schedule(
      job_name,
      (spec ->> 0),
      (spec ->> 1)
    );
  end loop;
end $$;
