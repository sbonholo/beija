-- Feature 3: Proximity / event push notifications.
--
-- Tables:
--   push_subscriptions  — Web Push (VAPID) endpoints saved by the PWA.
--   event_push_log      — One row per (user_id, event_id); prevents duplicate
--                         notifications within 12 hours.
--
-- RPC:
--   get_event_push_eligible() — returns eligible (user_id, event_id) pairs;
--     called by the notify_nearby_events edge function.
--
-- Cron:
--   Every 15 minutes → dispatch_edge('notify_nearby_events', '{}').
--   Reuses the dispatch_edge() helper from 20260524600000_function_hooks.sql.
--
-- Idempotent — safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. push_subscriptions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint  text        NOT NULL,
  p256dh    text        NOT NULL,
  auth      text        NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_own ON push_subscriptions;
CREATE POLICY push_subscriptions_own ON push_subscriptions
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions (user_id);

-- ---------------------------------------------------------------------------
-- 2. event_push_log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_push_log (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id   uuid        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  sent_at    timestamptz DEFAULT now(),
  UNIQUE (user_id, event_id)
);

-- Not exposed to anon/authenticated — only used by edge function (service role).
ALTER TABLE event_push_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_event_push_log_event ON event_push_log (event_id);
CREATE INDEX IF NOT EXISTS idx_event_push_log_user  ON event_push_log (user_id);

-- ---------------------------------------------------------------------------
-- 3. get_event_push_eligible() — security-definer RPC for the edge function
-- ---------------------------------------------------------------------------
-- Returns the top candidate (one event per user) for users who:
--   - are active, non-deleted, non-muted
--   - are geographically near an active event (within their max_distance_km)
--   - have NOT received an event_push_log entry for that event yet
--
-- Uses DISTINCT ON (p.id) to emit at most one event per user per invocation.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_event_push_eligible()
RETURNS TABLE (
  user_id       uuid,
  push_token    text,
  push_platform text,
  event_id      uuid,
  event_name    text,
  event_city    text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (p.id)
    p.id                  AS user_id,
    p.push_token,
    p.push_platform,
    e.id                  AS event_id,
    e.name                AS event_name,
    e.city                AS event_city
  FROM events e
  JOIN profiles p ON (
    p.deleted_at          IS NULL
    AND p.is_inactive     = FALSE
    AND p.is_banned       = FALSE
    AND p.mute_notifications = FALSE
    AND (
      p.location IS NULL
      OR e.location IS NULL
      OR ST_DWithin(
           p.location,
           e.location,
           COALESCE(p.max_distance_km, 50) * 1000
         )
    )
  )
  WHERE e.is_active = TRUE
    AND e.starts_at > now() - INTERVAL '2 hours'
    AND e.ends_at   > now()
    AND NOT EXISTS (
      SELECT 1 FROM event_push_log epl
      WHERE epl.user_id  = p.id
        AND epl.event_id = e.id
    )
  ORDER BY p.id, e.starts_at ASC
  LIMIT 500;
$$;

REVOKE ALL ON FUNCTION get_event_push_eligible() FROM PUBLIC, anon, authenticated;
-- Edge function uses service role key — no explicit grant needed (service role bypasses RLS).

-- ---------------------------------------------------------------------------
-- 4. pg_cron: fire every 15 minutes
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  job_name constant text := 'beija_notify_nearby_events';
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = job_name) THEN
    PERFORM cron.unschedule(job_name);
  END IF;
  PERFORM cron.schedule(
    job_name,
    '*/15 * * * *',
    $$SELECT dispatch_edge('notify_nearby_events', '{}')$$
  );
END $$;
