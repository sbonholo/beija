import { Router } from 'express';
import { db, pairKey } from '../db.js';
import { authRequired, AuthedRequest } from '../auth.js';
import { newId } from '../lib/ids.js';
import { safeJsonArray } from '../lib/utils.js';
import { serializePublicUser } from './profile.js';
import { emitToUser } from '../socket.js';

const router = Router();
const REACTION_TYPES = ['kiss', 'heart', 'fire'];
const REACTION_EMOJI: Record<string, string> = { kiss: '💋', heart: '❤️', fire: '🔥' };

// GET /api/reactions/received — who reacted to me
router.get('/received', authRequired, (req: AuthedRequest, res) => {
  const meId = req.userId!;

  const rows = db.prepare(`
    SELECT r.id, r.type, r.event_id, r.created_at,
           u.id AS sender_id, u.nickname, u.gender, u.seeking, u.bio, u.photo_url,
           e.name AS event_name, e.ends_at AS event_ends_at,
           EXISTS(
             SELECT 1 FROM matches m
             WHERE (m.user1_id = r.from_user_id AND m.user2_id = ?)
                OR (m.user2_id = r.from_user_id AND m.user1_id = ?)
           ) AS is_matched,
           (SELECT id FROM matches m2
            WHERE (m2.user1_id = r.from_user_id AND m2.user2_id = ?)
               OR (m2.user2_id = r.from_user_id AND m2.user1_id = ?)
            LIMIT 1) AS match_id
    FROM reactions r
    JOIN users u ON u.id = r.from_user_id
    JOIN events e ON e.id = r.event_id
    WHERE r.to_user_id = ?
      AND u.is_banned = 0
      AND NOT EXISTS (
        SELECT 1 FROM blocks b
        WHERE (b.blocker_id = ? AND b.blocked_id = r.from_user_id)
           OR (b.blocker_id = r.from_user_id AND b.blocked_id = ?)
      )
    ORDER BY r.created_at DESC
  `).all(meId, meId, meId, meId, meId, meId, meId) as any[];

  res.json({
    reactions: rows.map((r) => ({
      id: r.id,
      type: r.type,
      eventId: r.event_id,
      eventName: r.event_name,
      eventEndsAt: r.event_ends_at,
      createdAt: r.created_at,
      isMatched: !!r.is_matched,
      matchId: r.match_id ?? null,
      user: {
        id: r.sender_id,
        nickname: r.nickname,
        gender: r.gender,
        seeking: safeJsonArray(r.seeking),
        bio: r.bio,
        photoUrl: r.photo_url,
      },
    })),
  });
});

router.post('/', authRequired, (req: AuthedRequest, res) => {
  const fromId = req.userId!;
  const toId = String(req.body?.toUserId || '');
  const eventId = String(req.body?.eventId || '');
  const type = String(req.body?.type || '');

  if (!toId || !eventId || !REACTION_TYPES.includes(type)) {
    return res.status(400).json({ error: 'invalid_request' });
  }
  if (fromId === toId) return res.status(400).json({ error: 'self_reaction' });

  const blocked = db
    .prepare('SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)')
    .get(fromId, toId, toId, fromId);
  if (blocked) return res.status(403).json({ error: 'blocked' });

  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(toId);
  if (!target) return res.status(404).json({ error: 'user_not_found' });

  const inEvent = db
    .prepare('SELECT 1 FROM checkins WHERE event_id = ? AND user_id IN (?, ?)')
    .all(eventId, fromId, toId);
  if (inEvent.length < 2) return res.status(403).json({ error: 'not_at_event' });

  const id = newId('r_');
  const now = Date.now();
  db.prepare(
    `INSERT INTO reactions (id, from_user_id, to_user_id, event_id, type, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(from_user_id, to_user_id, event_id) DO UPDATE SET type = excluded.type, created_at = excluded.created_at`
  ).run(id, fromId, toId, eventId, type, now);

  const reverse = db
    .prepare('SELECT id FROM reactions WHERE from_user_id = ? AND to_user_id = ? AND event_id = ?')
    .get(toId, fromId, eventId);

  let match: any = null;
  let isNewMatch = false;
  if (reverse) {
    const [u1, u2] = pairKey(fromId, toId);
    const existing = db
      .prepare('SELECT * FROM matches WHERE user1_id = ? AND user2_id = ? AND event_id = ?')
      .get(u1, u2, eventId) as any;
    if (existing) {
      match = existing;
    } else {
      const matchId = newId('m_');
      db.prepare(
        'INSERT INTO matches (id, user1_id, user2_id, event_id, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(matchId, u1, u2, eventId, now);
      match = { id: matchId, user1_id: u1, user2_id: u2, event_id: eventId, created_at: now };
      isNewMatch = true;
    }
  }

  const fromUser = db.prepare('SELECT * FROM users WHERE id = ?').get(fromId) as any;
  const toUser = db.prepare('SELECT * FROM users WHERE id = ?').get(toId) as any;

  emitToUser(toId, 'reaction:incoming', {
    fromUser: serializePublicUser(fromUser),
    eventId,
    type,
    createdAt: now,
  });

  if (match) {
    const payload = { matchId: match.id, eventId, createdAt: match.created_at };
    emitToUser(fromId, 'match:new', { ...payload, otherUser: serializePublicUser(toUser) });
    emitToUser(toId, 'match:new', { ...payload, otherUser: serializePublicUser(fromUser) });

    // Auto-send reaction emoji as the opening message on a brand-new match
    if (isNewMatch) {
      const emoji = REACTION_EMOJI[type] ?? '💋';
      const msgId = newId('msg_');
      db.prepare(
        'INSERT INTO messages (id, match_id, from_user_id, text, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(msgId, match.id, fromId, emoji, now);
      const autoMsg = { id: msgId, matchId: match.id, fromUserId: fromId, text: emoji, createdAt: now };
      emitToUser(fromId, 'message:new', autoMsg);
      emitToUser(toId, 'message:new', autoMsg);
    }
  }

  res.json({
    ok: true,
    reaction: { fromUserId: fromId, toUserId: toId, eventId, type, createdAt: now },
    match: match ? { id: match.id, eventId, createdAt: match.created_at } : null,
  });
});

router.delete('/', authRequired, (req: AuthedRequest, res) => {
  const fromId = req.userId!;
  const toId = String(req.body?.toUserId || '');
  const eventId = String(req.body?.eventId || '');
  if (!toId || !eventId) return res.status(400).json({ error: 'invalid_request' });
  db.prepare('DELETE FROM reactions WHERE from_user_id = ? AND to_user_id = ? AND event_id = ?').run(
    fromId,
    toId,
    eventId
  );
  res.json({ ok: true });
});

export default router;
