-- Feature 4: Women's safety controls.
--
-- (a) reactions_from — restricts who can send event reactions to you.
--     'everyone' (default) or 'matches_only'.
--     Enforced at the RLS INSERT policy on event_reactions so malicious
--     clients that bypass JS still can't send unwanted reactions.
--
-- (b) Discreet event exit — no new schema; leave_event_room already works
--     silently. UI-only change (see frontend commit).
--
-- (c) Quick report+block — UI enhancement of the existing report_user RPC
--     (which already supports p_also_block = true). No schema change.
--
-- Idempotent — safe to re-run.

-- ---------------------------------------------------------------------------
-- (a) reactions_from column
-- ---------------------------------------------------------------------------
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS reactions_from text NOT NULL DEFAULT 'everyone'
  CHECK (reactions_from IN ('everyone', 'matches_only'));

-- ---------------------------------------------------------------------------
-- (a) Updated event_reactions INSERT policy
--     (the existing er_insert policy did not check reactions_from or left_at)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS er_insert ON event_reactions;
CREATE POLICY er_insert ON event_reactions
  FOR INSERT WITH CHECK (
    -- Sender must be the authenticated user
    sender_id = auth.uid()
    -- Sender must be actively checked in (not left)
    AND EXISTS (
      SELECT 1 FROM check_ins ci
      WHERE ci.user_id  = auth.uid()
        AND ci.event_id = event_reactions.event_id
        AND ci.left_at  IS NULL
    )
    -- Receiver's reactions_from setting must allow this sender
    AND (
      -- 'everyone' — no restriction
      NOT EXISTS (
        SELECT 1 FROM profiles r
        WHERE r.id = event_reactions.receiver_id
          AND r.reactions_from = 'matches_only'
      )
      -- 'matches_only' — sender must be a mutual match with receiver
      OR EXISTS (
        SELECT 1 FROM matches m
        WHERE (m.user1_id = auth.uid() AND m.user2_id = event_reactions.receiver_id)
           OR (m.user1_id = event_reactions.receiver_id AND m.user2_id = auth.uid())
      )
    )
  );

-- Also drop and recreate the UPDATE policy to include the left_at check.
DROP POLICY IF EXISTS er_update ON event_reactions;
CREATE POLICY er_update ON event_reactions
  FOR UPDATE
  USING (sender_id = auth.uid())
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM check_ins ci
      WHERE ci.user_id  = auth.uid()
        AND ci.event_id = event_reactions.event_id
        AND ci.left_at  IS NULL
    )
    AND (
      NOT EXISTS (
        SELECT 1 FROM profiles r
        WHERE r.id = event_reactions.receiver_id
          AND r.reactions_from = 'matches_only'
      )
      OR EXISTS (
        SELECT 1 FROM matches m
        WHERE (m.user1_id = auth.uid() AND m.user2_id = event_reactions.receiver_id)
           OR (m.user1_id = event_reactions.receiver_id AND m.user2_id = auth.uid())
      )
    )
  );
