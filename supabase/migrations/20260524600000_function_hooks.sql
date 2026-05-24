-- Phase O — DB-side hooks for edge functions
--
-- Adds:
--   1. profiles.mute_notifications      (per-user push opt-out)
--   2. notification_log table           (rate-limit + audit trail)
--   3. helper dispatch_edge(endpoint, payload)
--      → uses pg_net.http_post with project settings stored in
--        `app.settings.supabase_url` and `app.settings.service_role_key`.
--   4. AFTER INSERT triggers on messages + matches that fire the helper.
--
-- Deployment prerequisite (one-time per project):
--   alter database postgres set "app.settings.supabase_url"      = 'https://<ref>.supabase.co';
--   alter database postgres set "app.settings.service_role_key"  = '<service-role-key>';
-- (See docs/EDGE_FUNCTIONS.md.)

create extension if not exists pg_net;

-- 1) Per-user mute flag
alter table profiles
  add column if not exists mute_notifications boolean not null default false;

-- 2) Notification audit log — used by notify_new_message for the 30s
-- per-sender rate-limit and for general delivery debugging.
create table if not exists notification_log (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles(id) on delete cascade,
  sender_id uuid references profiles(id) on delete cascade,
  notification_type text not null check (notification_type in (
    'new_message', 'new_match', 'nsfw_quarantine'
  )),
  delivered boolean not null default false,
  reason text,
  sent_at timestamptz not null default now()
);

create index if not exists idx_notif_log_recipient_sender_type
  on notification_log (recipient_id, sender_id, notification_type, sent_at desc);

create index if not exists idx_notif_log_sent_at
  on notification_log (sent_at desc);

alter table notification_log enable row level security;

drop policy if exists notification_log_select_self on notification_log;
create policy notification_log_select_self on notification_log
  for select using (recipient_id = auth.uid());

-- 3) Helper: POST to a beija edge function, picking up URL + service role
-- from postgres settings. Returns the pg_net request id (caller can ignore).
create or replace function dispatch_edge(endpoint text, payload jsonb)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, net
as $$
declare
  base_url text := current_setting('app.settings.supabase_url', true);
  service_key text := current_setting('app.settings.service_role_key', true);
  request_id bigint;
begin
  if base_url is null or service_key is null then
    raise notice 'dispatch_edge: app.settings.supabase_url or service_role_key not set; skipping % call', endpoint;
    return null;
  end if;

  select net.http_post(
    url := base_url || '/functions/v1/' || endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := payload,
    timeout_milliseconds := 5000
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function dispatch_edge(text, jsonb) from public;
revoke all on function dispatch_edge(text, jsonb) from anon;
revoke all on function dispatch_edge(text, jsonb) from authenticated;

-- 4a) messages → notify_new_message
create or replace function trg_notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform dispatch_edge(
    'notify_new_message',
    jsonb_build_object('type', 'INSERT', 'table', 'messages', 'record', to_jsonb(new))
  );
  return new;
end;
$$;

drop trigger if exists messages_notify_after_insert on messages;
create trigger messages_notify_after_insert
  after insert on messages
  for each row
  execute function trg_notify_new_message();

-- 4c) reports table: allow auto-moderation (reporter_id NULL, self-report ok)
alter table reports
  alter column reporter_id drop not null;

-- The original anonymous self-report constraint is named `reports_check` by
-- postgres. Drop it (if present) and replace with one that lets auto-mod
-- flags reference the same user on both sides.
do $$
declare
  con_name text;
begin
  select conname into con_name
  from pg_constraint
  where conrelid = 'reports'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%reporter_id <> reported_id%';
  if con_name is not null then
    execute format('alter table reports drop constraint %I', con_name);
  end if;
end $$;

alter table reports
  add constraint reports_reporter_not_self_unless_auto
  check (reporter_id is null or reporter_id <> reported_id or reason in ('nsfw_auto'));

-- 4b) matches → notify_match
create or replace function trg_notify_new_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform dispatch_edge(
    'notify_match',
    jsonb_build_object('type', 'INSERT', 'table', 'matches', 'record', to_jsonb(new))
  );
  return new;
end;
$$;

drop trigger if exists matches_notify_after_insert on matches;
create trigger matches_notify_after_insert
  after insert on matches
  for each row
  execute function trg_notify_new_match();

-- 4d) storage.objects → photo_moderation_hook
-- Only the `profile-photos` bucket is considered. If this CREATE TRIGGER fails
-- because the migration role lacks privileges on `storage.objects` (rare on
-- Supabase, but possible on self-hosted), fall back to a Storage webhook in
-- the dashboard pointing to /functions/v1/photo_moderation_hook.
create or replace function trg_photo_moderation()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  if new.bucket_id = 'profile-photos' then
    perform dispatch_edge(
      'photo_moderation_hook',
      jsonb_build_object('type', 'INSERT', 'record', to_jsonb(new))
    );
  end if;
  return new;
end;
$$;

do $$
begin
  execute 'drop trigger if exists storage_objects_photo_moderation on storage.objects';
  execute 'create trigger storage_objects_photo_moderation '
          'after insert on storage.objects '
          'for each row execute function trg_photo_moderation()';
exception when insufficient_privilege then
  raise notice 'skipping storage.objects trigger (need to add Storage webhook via dashboard)';
end $$;
