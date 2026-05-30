-- Event Rooms: schema extension
--
-- Extends existing events / check_ins tables — no new tables.
-- Reuses the on_mutual_kiss trigger and pg_cron infrastructure.
--
-- events:
--   + created_by   uuid → profiles(id)   NULL = admin/imported event
--   + expires_at   timestamptz           NULL = never expires
--
-- check_ins:
--   + left_at      timestamptz           NULL = currently present
--   UNIQUE (user_id, event_id)           → partial UNIQUE WHERE left_at IS NULL
--     (allows re-join after leaving; enforces at-most-one active check-in)

-- ──────────────────────────────────────────────────────────────
-- 1. events: add created_by
-- ──────────────────────────────────────────────────────────────
alter table events
  add column if not exists created_by uuid references profiles(id) on delete set null;

-- ──────────────────────────────────────────────────────────────
-- 2. events: add expires_at
-- ──────────────────────────────────────────────────────────────
alter table events
  add column if not exists expires_at timestamptz;

-- Index so expiry cron scans cheaply
create index if not exists events_expires_at_idx
  on events (expires_at)
  where expires_at is not null;

-- ──────────────────────────────────────────────────────────────
-- 3. check_ins: add left_at
-- ──────────────────────────────────────────────────────────────
alter table check_ins
  add column if not exists left_at timestamptz;

-- Index for "who is currently in room X" queries
create index if not exists check_ins_active_idx
  on check_ins (event_id, user_id)
  where left_at is null;

-- ──────────────────────────────────────────────────────────────
-- 4. Swap plain UNIQUE → partial UNIQUE WHERE left_at IS NULL
--
-- Drop all possible historical names for the old constraint first
-- (different migration sequences may have produced different names).
-- Then add the partial unique idempotently.
-- ──────────────────────────────────────────────────────────────
alter table check_ins
  drop constraint if exists check_ins_user_id_event_id_key;

alter table check_ins
  drop constraint if exists check_ins_user_event_unique;

-- Partial unique: at most one active (left_at IS NULL) check-in per user per event
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname   = 'check_ins'
      and c.conname   = 'check_ins_active_unique'
  ) then
    execute 'create unique index check_ins_active_unique
             on check_ins (user_id, event_id)
             where left_at is null';
    -- expose as a named constraint so PostgREST / ON CONFLICT can reference it
    alter table check_ins
      add constraint check_ins_active_unique
      unique using index check_ins_active_unique;
  end if;
end
$$;
