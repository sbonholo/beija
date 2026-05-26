import { Router } from 'express';
import { db, pairKey } from '../db.js';
import { authRequired, AuthedRequest } from '../auth.js';
import { newId } from '../lib/ids.js';
import { serializePublicUser } from './profile.js';
import { emitToUser } from '../socket.js';

const router = Router();
const REACTION_TYPES = ['kiss', 'heart', 'fire'];

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
    const payload = {
      matchId: match.id,
      eventId,
      createdAt: match.created_at,
    };
    emitToUser(fromId, 'match:new', { ...payload, otherUser: serializePublicUser(toUser) });
    emitToUser(toId, 'match:new', { ...payload, otherUser: serializePublicUser(fromUser) });
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
