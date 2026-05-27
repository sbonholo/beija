import { Router } from 'express';
import { db } from '../db.js';
import { authRequired, AuthedRequest } from '../auth.js';
import { serializePublicUser } from './profile.js';
import { haversineMeters } from '../lib/distance.js';
import { emitToEvent } from '../socket.js';
import { safeJsonArray } from '../lib/utils.js';

const router = Router();

router.get('/', authRequired, (req, res) => {
  const now = Date.now();
  const lat = req.query.lat ? parseFloat(String(req.query.lat)) : null;
  const lng = req.query.lng ? parseFloat(String(req.query.lng)) : null;
  if (lat !== null && (Number.isNaN(lat) || lat < -90 || lat > 90)) return res.status(400).json({ error: 'invalid_lat' });
  if (lng !== null && (Number.isNaN(lng) || lng < -180 || lng > 180)) return res.status(400).json({ error: 'invalid_lng' });

  const rows = db
    .prepare(
      `SELECT e.*, (SELECT COUNT(*) FROM checkins c WHERE c.event_id = e.id) AS checkin_count
       FROM events e
       WHERE e.ends_at > ?
       ORDER BY e.starts_at ASC`
    )
    .all(now) as any[];

  const events = rows.map((r) => ({
    id: r.id,
    name: r.name,
    venue: r.venue,
    address: r.address,
    city: r.city,
    lat: r.lat,
    lng: r.lng,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    imageUrl: r.image_url,
    category: r.category,
    checkinCount: r.checkin_count,
    distanceMeters: lat != null && lng != null ? Math.round(haversineMeters(lat, lng, r.lat, r.lng)) : null,
  }));

  if (lat != null && lng != null) {
    events.sort((a, b) => (a.distanceMeters! - b.distanceMeters!));
  }

  res.json({ events });
});

router.get('/:id', authRequired, (req, res) => {
  const r = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id) as any;
  if (!r) return res.status(404).json({ error: 'not_found' });
  if (r.ends_at < Date.now()) return res.status(410).json({ error: 'event_ended' });
  res.json({
    event: {
      id: r.id,
      name: r.name,
      venue: r.venue,
      address: r.address,
      city: r.city,
      lat: r.lat,
      lng: r.lng,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      imageUrl: r.image_url,
      category: r.category,
    },
  });
});

router.post('/:id/checkin', authRequired, (req: AuthedRequest, res) => {
  const eventId = req.params.id;
  const event = db.prepare('SELECT id, ends_at FROM events WHERE id = ?').get(eventId) as any;
  if (!event) return res.status(404).json({ error: 'not_found' });
  if (event.ends_at < Date.now()) return res.status(400).json({ error: 'event_ended' });

  const now = Date.now();
  let leftEventId: string | null = null;

  db.transaction(() => {
    const prev = db
      .prepare('SELECT current_event_id FROM users WHERE id = ?')
      .get(req.userId) as { current_event_id: string | null } | undefined;
    const prevId = prev?.current_event_id ?? null;
    if (prevId && prevId !== eventId) {
      const prevEvent = db.prepare('SELECT ends_at FROM events WHERE id = ?').get(prevId) as any;
      if (prevEvent && prevEvent.ends_at > now) {
        db.prepare('DELETE FROM checkins WHERE user_id = ? AND event_id = ?').run(req.userId, prevId);
        leftEventId = prevId;
      }
    }
    db.prepare(
      `INSERT INTO checkins (user_id, event_id, checked_in_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id, event_id) DO UPDATE SET checked_in_at = excluded.checked_in_at`
    ).run(req.userId, eventId, now);
    db.prepare('UPDATE users SET current_event_id = ?, last_active = ? WHERE id = ?').run(eventId, now, req.userId);
  })();

  if (leftEventId) emitToEvent(leftEventId, 'checkin:update', { type: 'leave', userId: req.userId });
  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId) as any;
  emitToEvent(eventId, 'checkin:update', { type: 'join', user: serializePublicUser(userRow) });
  res.json({ ok: true });
});

router.post('/:id/checkout', authRequired, (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM checkins WHERE user_id = ? AND event_id = ?').run(req.userId, req.params.id);
  db.prepare('UPDATE users SET current_event_id = NULL WHERE id = ? AND current_event_id = ?').run(
    req.userId,
    req.params.id
  );
  emitToEvent(req.params.id, 'checkin:update', { type: 'leave', userId: req.userId });
  res.json({ ok: true });
});

router.get('/:id/people', authRequired, (req: AuthedRequest, res) => {
  const eventId = req.params.id;
  const meId = req.userId!;
  const me = db.prepare('SELECT gender, seeking FROM users WHERE id = ?').get(meId) as any;
  const mySeeking: string[] = me?.seeking ? JSON.parse(me.seeking) : [];

  const rows = db
    .prepare(
      `SELECT u.*, c.checked_in_at FROM checkins c
       JOIN users u ON u.id = c.user_id
       WHERE c.event_id = ? AND u.id != ?
         AND u.is_banned = 0
         AND u.id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?)
         AND u.id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = ?)
       ORDER BY c.checked_in_at DESC, u.id ASC`
    )
    .all(eventId, meId, meId, meId) as any[];

  const myGender: string | null = me?.gender ?? null;
  const filtered = rows.filter((r) => {
    const iWantThem = mySeeking.length === 0 || (r.gender && mySeeking.includes(r.gender));
    const theirSeeking: string[] = safeJsonArray(r.seeking);
    const theyWantMe = theirSeeking.length === 0 || !myGender || theirSeeking.includes(myGender);
    return iWantThem && theyWantMe;
  });

  const myReactions = db
    .prepare('SELECT to_user_id, type FROM reactions WHERE from_user_id = ? AND event_id = ?')
    .all(meId, eventId) as { to_user_id: string; type: string }[];
  const sentMap = new Map(myReactions.map((r) => [r.to_user_id, r.type]));

  const incomingReactions = db
    .prepare('SELECT from_user_id, type FROM reactions WHERE to_user_id = ? AND event_id = ?')
    .all(meId, eventId) as { from_user_id: string; type: string }[];
  const incomingMap = new Map(incomingReactions.map((r) => [r.from_user_id, r.type]));

  const matches = db
    .prepare(
      `SELECT user1_id, user2_id FROM matches WHERE event_id = ? AND (user1_id = ? OR user2_id = ?)`
    )
    .all(eventId, meId, meId) as { user1_id: string; user2_id: string }[];
  const matchedSet = new Set(matches.map((m) => (m.user1_id === meId ? m.user2_id : m.user1_id)));

  const people = filtered.map((r) => ({
    ...serializePublicUser(r),
    sentReaction: sentMap.get(r.id) || null,
    receivedReaction: incomingMap.get(r.id) || null,
    matched: matchedSet.has(r.id),
  }));

  res.json({ people });
});

export default router;
