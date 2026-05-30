-- Allow up to 2 profile photos per user.
-- slot 0 = primary (shown everywhere), slot 1 = secondary (gallery only).
--
-- Schema change:
--   - Adds a `slot` smallint column (0 or 1) to photos.
--   - Drops the old UNIQUE(user_id) guard.
--   - Adds CHECK(slot IN (0,1)) + UNIQUE(user_id, slot).
--     The two constraints together cap the maximum at 2 without a trigger.
--   - All existing rows are assigned slot = 0.
--
-- RPC updates:
--   - get_profile_safe, get_profiles_safe: ORDER BY slot ASC so the
--     caller can rely on photo_urls[1] being the primary photo.
--
-- Idempotent — safe to re-run.

-- 1. Add slot column (no-op if already present).
ALTER TABLE photos ADD COLUMN IF NOT EXISTS slot smallint NOT NULL DEFAULT 0;

-- 2. Seed any pre-existing rows (DEFAULT handles future INSERTs, but rows
--    created before this migration won't have it set via the column default
--    on older environments).
UPDATE photos SET slot = 0 WHERE slot IS NULL;

-- 3. Remove the single-user unique constraint that blocked slot 1.
ALTER TABLE photos DROP CONSTRAINT IF EXISTS photos_user_id_key;

-- 4. Slot-value guard (idempotent: drop then add).
ALTER TABLE photos DROP CONSTRAINT IF EXISTS photos_slot_check;
ALTER TABLE photos ADD CONSTRAINT photos_slot_check CHECK (slot IN (0, 1));

-- 5. Per-user-per-slot unique — this is the hard limit of 2.
ALTER TABLE photos DROP CONSTRAINT IF EXISTS photos_user_id_slot_key;
ALTER TABLE photos ADD CONSTRAINT photos_user_id_slot_key UNIQUE (user_id, slot);

-- 6. Update get_profile_safe: order photo_urls by slot so index 0 is always
--    the primary photo for every consumer.
CREATE OR REPLACE FUNCTION get_profile_safe(p_target_user_id uuid)
RETURNS TABLE (
  id            uuid,
  name          text,
  birthdate     date,
  gender        text,
  bio           text,
  city          text,
  interested_in text[],
  interests     text[],
  hide_distance boolean,
  show_age      boolean,
  last_active_at timestamptz,
  photo_urls    text[],
  distance_km   int
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me profiles%rowtype;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF auth.uid() = p_target_user_id THEN RETURN; END IF;
  SELECT * INTO me FROM profiles WHERE profiles.id = auth.uid();

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    CASE WHEN p.show_age THEN p.birthdate ELSE NULL END,
    p.gender,
    p.bio,
    p.city,
    p.interested_in,
    p.interests,
    p.hide_distance,
    p.show_age,
    p.last_active_at,
    COALESCE(
      (SELECT array_agg(ph.url ORDER BY ph.slot ASC)
       FROM photos ph WHERE ph.user_id = p.id),
      ARRAY[]::text[]
    ) AS photo_urls,
    CASE
      WHEN p.hide_distance THEN NULL
      WHEN me.location IS NULL OR p.location IS NULL THEN NULL
      ELSE (st_distance(me.location, p.location) / 1000)::int
    END AS distance_km
  FROM profiles p
  WHERE p.id = p_target_user_id
    AND p.deleted_at IS NULL
    AND p.is_inactive = FALSE
    AND NOT EXISTS (
      SELECT 1 FROM blocks b
      WHERE (b.blocker_id = auth.uid() AND b.blocked_id = p.id)
         OR (b.blocker_id = p.id AND b.blocked_id = auth.uid())
    )
    AND NOT EXISTS (
      SELECT 1 FROM reports r
      WHERE r.status IN ('pending', 'actioned')
        AND (
          (r.reporter_id = auth.uid() AND r.reported_id = p.id)
          OR (r.reporter_id = p.id AND r.reported_id = auth.uid())
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_profile_safe(uuid) TO authenticated;

-- 7. Same update for get_profiles_safe (bulk variant).
CREATE OR REPLACE FUNCTION get_profiles_safe(p_target_user_ids uuid[])
RETURNS TABLE (
  id            uuid,
  name          text,
  birthdate     date,
  gender        text,
  bio           text,
  city          text,
  interested_in text[],
  interests     text[],
  hide_distance boolean,
  show_age      boolean,
  last_active_at timestamptz,
  photo_urls    text[],
  distance_km   int
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me profiles%rowtype;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF p_target_user_ids IS NULL OR array_length(p_target_user_ids, 1) IS NULL THEN RETURN; END IF;
  SELECT * INTO me FROM profiles WHERE profiles.id = auth.uid();

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    CASE WHEN p.show_age THEN p.birthdate ELSE NULL END,
    p.gender,
    p.bio,
    p.city,
    p.interested_in,
    p.interests,
    p.hide_distance,
    p.show_age,
    p.last_active_at,
    COALESCE(
      (SELECT array_agg(ph.url ORDER BY ph.slot ASC)
       FROM photos ph WHERE ph.user_id = p.id),
      ARRAY[]::text[]
    ) AS photo_urls,
    CASE
      WHEN p.hide_distance THEN NULL
      WHEN me.location IS NULL OR p.location IS NULL THEN NULL
      ELSE (st_distance(me.location, p.location) / 1000)::int
    END AS distance_km
  FROM profiles p
  WHERE p.id = ANY(p_target_user_ids)
    AND p.id <> auth.uid()
    AND p.deleted_at IS NULL
    AND p.is_inactive = FALSE
    AND NOT EXISTS (
      SELECT 1 FROM blocks b
      WHERE (b.blocker_id = auth.uid() AND b.blocked_id = p.id)
         OR (b.blocker_id = p.id AND b.blocked_id = auth.uid())
    )
    AND NOT EXISTS (
      SELECT 1 FROM reports r
      WHERE r.status IN ('pending', 'actioned')
        AND (
          (r.reporter_id = auth.uid() AND r.reported_id = p.id)
          OR (r.reporter_id = p.id AND r.reported_id = auth.uid())
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_profiles_safe(uuid[]) TO authenticated;
