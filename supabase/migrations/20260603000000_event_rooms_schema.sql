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
-- 4. Swap plain UNIQUE → partial unique index WHERE left_at IS NULL
--
-- A partial UNIQUE INDEX enforces at-most-one-active-check-in on its
-- own. We deliberately do NOT promote it to a formal UNIQUE CONSTRAINT
-- via ADD CONSTRAINT ... USING INDEX — Postgres rejects that with
-- "Cannot create a primary key or unique constraint using such an
-- index" (42809) because the index is partial.
--
-- Consequence for upserts: ON CONFLICT cannot reference a constraint
-- name, so RPCs must use index-inference form:
--   ON CONFLICT (user_id, event_id) WHERE left_at IS NULL DO NOTHING
-- ──────────────────────────────────────────────────────────────
alter table check_ins
  drop constraint if exists check_ins_user_id_event_id_key;

alter table check_ins
  drop constraint if exists check_ins_user_event_unique;

-- Idempotent partial unique. If a previous run created it, this is a no-op.
create unique index if not exists check_ins_active_unique
  on check_ins (user_id, event_id)
  where left_at is null;
