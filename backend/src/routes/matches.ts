import { Router } from 'express';
import { db } from '../db.js';
import { authRequired, AuthedRequest } from '../auth.js';
import { serializeUser } from './profile.js';
import { newId } from '../lib/ids.js';
import { emitToUser } from '../socket.js';

const router = Router();

router.get('/', authRequired, (req: AuthedRequest, res) => {
  const meId = req.userId!;
  const rows = db
    .prepare(
      `SELECT m.*,
              (SELECT text FROM messages WHERE match_id = m.id ORDER BY created_at DESC LIMIT 1) AS last_text,
              (SELECT created_at FROM messages WHERE match_id = m.id ORDER BY created_at DESC LIMIT 1) AS last_at,
              e.name AS event_name, e.venue AS event_venue
       FROM matches m
       LEFT JOIN events e ON e.id = m.event_id
       WHERE m.user1_id = ? OR m.user2_id = ?
       ORDER BY COALESCE((SELECT created_at FROM messages WHERE match_id = m.id ORDER BY created_at DESC LIMIT 1), m.created_at) DESC`
    )
    .all(meId, meId) as any[];

  const matches = rows.map((r) => {
    const otherId = r.user1_id === meId ? r.user2_id : r.user1_id;
    const other = db.prepare('SELECT * FROM users WHERE id = ?').get(otherId) as any;
    return {
      id: r.id,
      eventId: r.event_id,
      eventName: r.event_name,
      eventVenue: r.event_venue,
      createdAt: r.created_at,
      lastMessage: r.last_text ? { text: r.last_text, createdAt: r.last_at } : null,
      otherUser: serializeUser(other),
    };
  });

  res.json({ matches });
});

router.get('/:id/messages', authRequired, (req: AuthedRequest, res) => {
  const meId = req.userId!;
  const m = db.prepare('SELECT user1_id, user2_id FROM matches WHERE id = ?').get(req.params.id) as any;
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

  const m = db.prepare('SELECT user1_id, user2_id FROM matches WHERE id = ?').get(req.params.id) as any;
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
