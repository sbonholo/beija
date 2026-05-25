import { Router } from 'express';
import { db } from '../db.js';
import { authRequired, AuthedRequest } from '../auth.js';
import { newId } from '../lib/ids.js';
import { emitToUser } from '../socket.js';

const router = Router();

const MATCH_SELECT = `
  SELECT m.*,
    (SELECT text FROM messages WHERE match_id = m.id ORDER BY created_at DESC LIMIT 1) AS last_text,
    (SELECT created_at FROM messages WHERE match_id = m.id ORDER BY created_at DESC LIMIT 1) AS last_at,
    e.name AS event_name, e.venue AS event_venue,
    u1.nickname AS u1_nickname, u1.gender AS u1_gender, u1.seeking AS u1_seeking,
    u1.bio AS u1_bio, u1.photo_url AS u1_photo_url, u1.birthdate AS u1_birthdate,
    u1.current_event_id AS u1_current_event_id, u1.last_active AS u1_last_active,
    u2.nickname AS u2_nickname, u2.gender AS u2_gender, u2.seeking AS u2_seeking,
    u2.bio AS u2_bio, u2.photo_url AS u2_photo_url, u2.birthdate AS u2_birthdate,
    u2.current_event_id AS u2_current_event_id, u2.last_active AS u2_last_active
  FROM matches m
  LEFT JOIN events e ON e.id = m.event_id
  LEFT JOIN users u1 ON u1.id = m.user1_id
  LEFT JOIN users u2 ON u2.id = m.user2_id`;

function serializeMatch(r: any, meId: string) {
  const isUser1 = r.user1_id === meId;
  const otherId   = isUser1 ? r.user2_id : r.user1_id;
  const nick      = isUser1 ? r.u2_nickname       : r.u1_nickname;
  const gender    = isUser1 ? r.u2_gender         : r.u1_gender;
  const seeking   = isUser1 ? r.u2_seeking        : r.u1_seeking;
  const bio       = isUser1 ? r.u2_bio            : r.u1_bio;
  const photoUrl  = isUser1 ? r.u2_photo_url      : r.u1_photo_url;
  const birthdate = isUser1 ? r.u2_birthdate      : r.u1_birthdate;
  const curEv     = isUser1 ? r.u2_current_event_id : r.u1_current_event_id;
  const lastActive = isUser1 ? r.u2_last_active   : r.u1_last_active;
  return {
    id: r.id,
    eventId: r.event_id,
    eventName: r.event_name,
    eventVenue: r.event_venue,
    createdAt: r.created_at,
    lastMessage: r.last_text ? { text: r.last_text, createdAt: r.last_at } : null,
    otherUser: {
      id: otherId,
      nickname: nick,
      gender,
      seeking: seeking ? JSON.parse(seeking) : [],
      bio,
      photoUrl,
      birthdate,
      currentEventId: curEv,
      lastActive,
    },
  };
}

// Prepared statements cached at module level
const stmtMatchById = db.prepare(
  `${MATCH_SELECT} WHERE m.id = ? AND (m.user1_id = ? OR m.user2_id = ?)`
);
const stmtMatchesByUser = db.prepare(
  `${MATCH_SELECT}
   WHERE m.user1_id = ? OR m.user2_id = ?
   ORDER BY COALESCE(
     (SELECT created_at FROM messages WHERE match_id = m.id ORDER BY created_at DESC LIMIT 1),
     m.created_at
   ) DESC`
);
const stmtMatchMembership = db.prepare(
  'SELECT user1_id, user2_id FROM matches WHERE id = ?'
);

router.get('/', authRequired, (req: AuthedRequest, res) => {
  const meId = req.userId!;
  const rows = stmtMatchesByUser.all(meId, meId) as any[];
  res.json({ matches: rows.map((r) => serializeMatch(r, meId)) });
});

router.get('/:id', authRequired, (req: AuthedRequest, res) => {
  const meId = req.userId!;
  const r = stmtMatchById.get(req.params.id, meId, meId) as any;
  if (!r) return res.status(404).json({ error: 'not_found' });
  res.json({ match: serializeMatch(r, meId) });
});

router.get('/:id/messages', authRequired, (req: AuthedRequest, res) => {
  const meId = req.userId!;
  const m = stmtMatchMembership.get(req.params.id) as any;
  if (!m) return res.status(404).json({ error: 'not_found' });
  if (m.user1_id !== meId && m.user2_id !== meId) return res.status(403).json({ error: 'forbidden' });

  const rows = db
    .prepare('SELECT id, from_user_id, text, created_at FROM messages WHERE match_id = ? ORDER BY created_at ASC')
    .all(req.params.id) as any[];

  res.json({
    messages: rows.map((r) => ({
      id: r.id,
      fromUserId: r.from_user_id,
      text: r.text,
      createdAt: r.created_at,
    })),
  });
});

router.post('/:id/messages', authRequired, (req: AuthedRequest, res) => {
  const meId = req.userId!;
  const text = String(req.body?.text || '').trim().slice(0, 1000);
  if (!text) return res.status(400).json({ error: 'empty' });

  const m = stmtMatchMembership.get(req.params.id) as any;
  if (!m) return res.status(404).json({ error: 'not_found' });
  if (m.user1_id !== meId && m.user2_id !== meId) return res.status(403).json({ error: 'forbidden' });

  const id = newId('msg_');
  const now = Date.now();
  db.prepare(
    'INSERT INTO messages (id, match_id, from_user_id, text, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, req.params.id, meId, text, now);

  const message = { id, matchId: req.params.id, fromUserId: meId, text, createdAt: now };
  const otherId = m.user1_id === meId ? m.user2_id : m.user1_id;
  emitToUser(otherId, 'message:new', message);
  emitToUser(meId, 'message:new', message);

  res.json({ message });
});

export default router;
