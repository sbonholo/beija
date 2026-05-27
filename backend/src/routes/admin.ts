import { Router } from 'express';
import { db } from '../db.js';
import { adminRequired, AuthedRequest } from '../auth.js';
import { newId } from '../lib/ids.js';

const router = Router();
router.use(adminRequired);

router.get('/stats', (_req, res) => {
  const now = Date.now();
  const d = 86_400_000;

  const count = (sql: string, ...args: any[]) =>
    (db.prepare(sql).get(...args) as { n: number }).n;

  const dau = count('SELECT COUNT(*) as n FROM users WHERE last_active >= ? AND is_banned = 0', now - d);
  const wau = count('SELECT COUNT(*) as n FROM users WHERE last_active >= ? AND is_banned = 0', now - 7 * d);
  const mau = count('SELECT COUNT(*) as n FROM users WHERE last_active >= ? AND is_banned = 0', now - 30 * d);
  const yau = count('SELECT COUNT(*) as n FROM users WHERE last_active >= ? AND is_banned = 0', now - 365 * d);

  const totalUsers = count('SELECT COUNT(*) as n FROM users WHERE is_banned = 0');
  const bannedUsers = count('SELECT COUNT(*) as n FROM users WHERE is_banned = 1');
  const totalEvents = count('SELECT COUNT(*) as n FROM events');
  const activeCheckins = count(
    'SELECT COUNT(*) as n FROM checkins c JOIN events e ON e.id = c.event_id WHERE e.ends_at > ?',
    now,
  );
  const totalReactions = count('SELECT COUNT(*) as n FROM reactions');
  const totalMatches = count('SELECT COUNT(*) as n FROM matches');
  const totalMessages = count('SELECT COUNT(*) as n FROM messages');
  const openReports = count('SELECT COUNT(*) as n FROM reports');

  const newLast24h = count('SELECT COUNT(*) as n FROM users WHERE created_at >= ?', now - d);
  const newLast7d = count('SELECT COUNT(*) as n FROM users WHERE created_at >= ?', now - 7 * d);
  const newLast30d = count('SELECT COUNT(*) as n FROM users WHERE created_at >= ?', now - 30 * d);

  res.json({
    dau, wau, mau, yau,
    totalUsers, bannedUsers, totalEvents, activeCheckins,
    totalReactions, totalMatches, totalMessages, openReports,
    newLast24h, newLast7d, newLast30d,
  });
});

router.get('/reports', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  const rows = db.prepare(`
    SELECT r.id, r.reason, r.created_at,
           rep.id  AS reporter_id,  rep.nickname  AS reporter_nickname,  rep.phone  AS reporter_phone,
           rep2.id AS reported_id, rep2.nickname AS reported_nickname, rep2.phone AS reported_phone,
           rep2.is_banned AS reported_is_banned, rep2.photo_url AS reported_photo_url
    FROM reports r
    JOIN users rep  ON rep.id  = r.reporter_id
    JOIN users rep2 ON rep2.id = r.reported_id
    ORDER BY r.created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset) as any[];

  const total = (db.prepare('SELECT COUNT(*) as n FROM reports').get() as any).n;

  res.json({
    total,
    reports: rows.map((r) => ({
      id: r.id,
      reason: r.reason,
      createdAt: r.created_at,
      reporter: { id: r.reporter_id, nickname: r.reporter_nickname, phone: r.reporter_phone },
      reported: {
        id: r.reported_id,
        nickname: r.reported_nickname,
        phone: r.reported_phone,
        isBanned: !!r.reported_is_banned,
        photoUrl: r.reported_photo_url,
      },
    })),
  });
});

router.get('/users', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const q = String(req.query.q || '').trim();

  const cols = 'id, phone, nickname, gender, photo_url, created_at, last_active, is_admin, is_banned';
  let rows: any[];
  let total: number;

  if (q) {
    const pat = `%${q}%`;
    rows = db.prepare(
      `SELECT ${cols} FROM users WHERE nickname LIKE ? OR phone LIKE ?
       ORDER BY last_active DESC LIMIT ? OFFSET ?`,
    ).all(pat, pat, limit, offset) as any[];
    total = (db.prepare('SELECT COUNT(*) as n FROM users WHERE nickname LIKE ? OR phone LIKE ?').get(pat, pat) as any).n;
  } else {
    rows = db.prepare(
      `SELECT ${cols} FROM users ORDER BY last_active DESC LIMIT ? OFFSET ?`,
    ).all(limit, offset) as any[];
    total = (db.prepare('SELECT COUNT(*) as n FROM users').get() as any).n;
  }

  res.json({
    total,
    users: rows.map((r) => ({
      id: r.id,
      phone: r.phone,
      nickname: r.nickname,
      gender: r.gender,
      photoUrl: r.photo_url,
      createdAt: r.created_at,
      lastActive: r.last_active,
      isAdmin: !!r.is_admin,
      isBanned: !!r.is_banned,
    })),
  });
});

router.post('/users/:id/ban', (req: AuthedRequest, res) => {
  if (req.params.id === req.userId) return res.status(400).json({ error: 'cannot_ban_self' });
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'not_found' });
  db.prepare('UPDATE users SET is_banned = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/users/:id/unban', (req, res) => {
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'not_found' });
  db.prepare('UPDATE users SET is_banned = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/events', (_req, res) => {
  const rows = db.prepare(`
    SELECT e.*, (SELECT COUNT(*) FROM checkins c WHERE c.event_id = e.id) AS checkin_count
    FROM events e ORDER BY e.starts_at DESC
  `).all() as any[];

  res.json({
    events: rows.map((r) => ({
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
    })),
  });
});

router.post('/events', (req, res) => {
  const { name, venue, address, city, lat, lng, startsAt, endsAt, category } = req.body || {};
  if (!name || !venue || lat == null || lng == null || !startsAt || !endsAt) {
    return res.status(400).json({ error: 'missing_fields' });
  }
  const latN = parseFloat(String(lat));
  const lngN = parseFloat(String(lng));
  const startsAtN = Number(startsAt);
  const endsAtN = Number(endsAt);
  if (isNaN(latN) || isNaN(lngN) || isNaN(startsAtN) || isNaN(endsAtN)) {
    return res.status(400).json({ error: 'invalid_fields' });
  }
  if (endsAtN <= startsAtN) return res.status(400).json({ error: 'invalid_dates' });

  const id = newId('ev_');
  db.prepare(
    `INSERT INTO events (id, name, venue, address, city, lat, lng, starts_at, ends_at, category)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    String(name).trim(),
    String(venue).trim(),
    address ? String(address).trim() : null,
    city ? String(city).trim() : null,
    latN, lngN, startsAtN, endsAtN,
    category ? String(category).trim() : null,
  );

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id) as any;
  res.status(201).json({
    event: {
      id: event.id, name: event.name, venue: event.venue,
      address: event.address, city: event.city,
      lat: event.lat, lng: event.lng,
      startsAt: event.starts_at, endsAt: event.ends_at,
      category: event.category, checkinCount: 0,
    },
  });
});

router.delete('/events/:id', (req, res) => {
  const event = db.prepare('SELECT id FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'not_found' });
  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
