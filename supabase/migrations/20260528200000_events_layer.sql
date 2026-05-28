-- Events Layer: enable finding hookups at music events, bars, festivals, clubs
-- Tables: events, check_ins, event_reactions
-- Mutual kiss → creates a match (same as mutual swipe)

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  venue       text,
  city        text,
  address     text,
  location    geography(Point, 4326),
  category    text NOT NULL DEFAULT 'other'
                CHECK (category IN ('festival', 'concert', 'bar', 'nightclub', 'show', 'other')),
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz,
  image_url   text,
  is_verified boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- check_ins  (user signals "I'm here")
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS check_ins (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id   uuid NOT NULL REFERENCES events(id)   ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_id)
);

-- ---------------------------------------------------------------------------
-- event_reactions  (kiss / heart / fire within an event)
-- One reaction per sender↔receiver pair per event; UPDATE replaces it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_reactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id    uuid NOT NULL REFERENCES events(id)   ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('kiss', 'heart', 'fire')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sender_id, receiver_id, event_id),
  CHECK (sender_id <> receiver_id)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_check_ins_event   ON check_ins (event_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_user    ON check_ins (user_id);
CREATE INDEX IF NOT EXISTS idx_er_event_receiver ON event_reactions (event_id, receiver_id);
CREATE INDEX IF NOT EXISTS idx_er_sender_event   ON event_reactions (sender_id, event_id);
CREATE INDEX IF NOT EXISTS idx_events_starts     ON events (starts_at);
CREATE INDEX IF NOT EXISTS idx_events_location   ON events USING GIST (location);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_ins       ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_reactions ENABLE ROW LEVEL SECURITY;

-- Events: anyone authenticated can browse
CREATE POLICY events_select ON events
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Check-ins: authenticated users can view all; manage only their own
CREATE POLICY check_ins_select ON check_ins
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY check_ins_insert ON check_ins
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY check_ins_delete ON check_ins
  FOR DELETE USING (auth.uid() = user_id);

-- Reactions: sender/receiver can read; only sender can write (must be checked in)
CREATE POLICY er_select ON event_reactions
  FOR SELECT USING (auth.uid() IN (sender_id, receiver_id));

CREATE POLICY er_insert ON event_reactions
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM check_ins
      WHERE user_id = auth.uid() AND event_id = event_reactions.event_id
    )
  );

CREATE POLICY er_update ON event_reactions
  FOR UPDATE USING (auth.uid() = sender_id);

-- ---------------------------------------------------------------------------
-- Trigger: mutual kiss → create a match (respects blocks)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_match_on_mutual_kiss()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Only act on kiss reactions
  IF NEW.kind <> 'kiss' THEN RETURN NEW; END IF;

  -- Check for mutual kiss in the same event
  IF NOT EXISTS (
    SELECT 1 FROM event_reactions
    WHERE sender_id   = NEW.receiver_id
      AND receiver_id = NEW.sender_id
      AND event_id    = NEW.event_id
      AND kind        = 'kiss'
  ) THEN RETURN NEW; END IF;

  -- Respect blocks (neither direction)
  IF EXISTS (
    SELECT 1 FROM blocks
    WHERE (blocker_id = NEW.sender_id   AND blocked_id = NEW.receiver_id)
       OR (blocker_id = NEW.receiver_id AND blocked_id = NEW.sender_id)
  ) THEN RETURN NEW; END IF;

  -- Materialize the match (idempotent via ON CONFLICT)
  INSERT INTO matches (user1_id, user2_id)
  VALUES (
    LEAST(NEW.sender_id, NEW.receiver_id),
    GREATEST(NEW.sender_id, NEW.receiver_id)
  )
  ON CONFLICT (user1_id, user2_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_mutual_kiss ON event_reactions;
CREATE TRIGGER on_mutual_kiss
  AFTER INSERT OR UPDATE ON event_reactions
  FOR EACH ROW EXECUTE FUNCTION create_match_on_mutual_kiss();

-- ---------------------------------------------------------------------------
-- RPC: get_event_attendees
-- Returns people checked in at the event (excluding caller), with first photo
-- and the caller's reaction to each attendee.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_event_attendees(p_event_id uuid)
RETURNS TABLE (
  user_id     uuid,
  name        text,
  age         int,
  photo_url   text,
  my_reaction text
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    p.id                                                    AS user_id,
    p.name,
    EXTRACT(year FROM age(p.birthdate))::int                AS age,
    (SELECT url FROM photos ph
     WHERE ph.user_id = p.id
     ORDER BY ph.slot ASC LIMIT 1)                         AS photo_url,
    er.kind                                                 AS my_reaction
  FROM check_ins ci
  JOIN profiles p ON p.id = ci.user_id
  LEFT JOIN event_reactions er
         ON er.event_id    = p_event_id
        AND er.sender_id   = auth.uid()
        AND er.receiver_id = p.id
  WHERE ci.event_id   = p_event_id
    AND p.id          <> auth.uid()
    AND p.is_banned   = false
    AND p.deleted_at  IS NULL
    -- exclude blocked / blocking
    AND NOT EXISTS (
      SELECT 1 FROM blocks b
      WHERE (b.blocker_id = auth.uid() AND b.blocked_id = p.id)
         OR (b.blocker_id = p.id       AND b.blocked_id = auth.uid())
    )
  ORDER BY ci.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_event_attendees(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC: get_nearby_events
-- When lat/lon are NULL, returns all upcoming events (no geo filter).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_nearby_events(
  p_lat       double precision DEFAULT NULL,
  p_lon       double precision DEFAULT NULL,
  p_radius_km int              DEFAULT 100
)
RETURNS TABLE (
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
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    e.id,
    e.name,
    e.venue,
    e.city,
    e.category,
    e.starts_at,
    e.ends_at,
    e.image_url,
    CASE
      WHEN p_lat IS NOT NULL AND p_lon IS NOT NULL AND e.location IS NOT NULL
      THEN (ST_Distance(e.location, ST_Point(p_lon, p_lat)::geography) / 1000)::int
      ELSE NULL
    END                                                      AS distance_km,
    (SELECT count(*)::int FROM check_ins ci WHERE ci.event_id = e.id)
                                                             AS attendee_count,
    EXISTS (
      SELECT 1 FROM check_ins ci
      WHERE ci.event_id = e.id AND ci.user_id = auth.uid()
    )                                                        AS is_checked_in
  FROM events e
  WHERE
    -- still active: started within last 12h or not yet ended
    (e.ends_at IS NULL OR e.ends_at > now())
    AND e.starts_at > now() - interval '12 hours'
    -- geo filter (only when caller provides coords AND event has coords)
    AND (
      p_lat IS NULL OR p_lon IS NULL
      OR e.location IS NULL
      OR ST_DWithin(e.location, ST_Point(p_lon, p_lat)::geography, p_radius_km * 1000)
    )
  ORDER BY
    CASE WHEN p_lat IS NOT NULL AND p_lon IS NOT NULL AND e.location IS NOT NULL
         THEN ST_Distance(e.location, ST_Point(p_lon, p_lat)::geography)
         ELSE NULL
    END ASC NULLS LAST,
    e.starts_at ASC;
$$;

GRANT EXECUTE ON FUNCTION get_nearby_events(double precision, double precision, int) TO authenticated;

-- ---------------------------------------------------------------------------
-- Seed data — realistic Brazilian events for testing
-- All times relative to migration run so they always appear as current/upcoming.
-- ---------------------------------------------------------------------------
INSERT INTO events (name, venue, city, address, location, category, starts_at, ends_at) VALUES
  (
    'Lollapalooza Brasil 2026',
    'Autódromo de Interlagos',
    'São Paulo',
    'Av. Sen. Teotônio Vilela, 261 - Interlagos, SP',
    ST_Point(-46.699, -23.703)::geography,
    'festival',
    now() - interval '2 hours',
    now() + interval '10 hours'
  ),
  (
    'The Weeknd – After Hours Tour',
    'Allianz Parque',
    'São Paulo',
    'Av. Francisco Matarazzo, 1705 - Água Branca, SP',
    ST_Point(-46.719, -23.527)::geography,
    'concert',
    now() + interval '3 hours',
    now() + interval '7 hours'
  ),
  (
    'Noite de Samba — Bar Brahma',
    'Bar Brahma',
    'São Paulo',
    'Av. São João, 677 - República, SP',
    ST_Point(-46.638, -23.543)::geography,
    'bar',
    now() - interval '1 hour',
    now() + interval '5 hours'
  ),
  (
    'Balada Eletrônica — Club Neon',
    'Club Neon',
    'São Paulo',
    'R. Augusta, 765 - Consolação, SP',
    ST_Point(-46.654, -23.553)::geography,
    'nightclub',
    now() + interval '5 hours',
    now() + interval '13 hours'
  ),
  (
    'Rave do Caju',
    'Parque do Flamengo',
    'Rio de Janeiro',
    'Av. Infante Dom Henrique - Flamengo, RJ',
    ST_Point(-43.174, -22.924)::geography,
    'festival',
    now() + interval '2 days',
    now() + interval '2 days 8 hours'
  );
