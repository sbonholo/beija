import { Router } from 'express';
import { db } from '../db.js';
import { authRequired, AuthedRequest } from '../auth.js';
import { haversineMeters } from '../lib/distance.js';
import { newId } from '../lib/ids.js';

const router = Router();

const DENSITY_MIN_USERS  = 5;           // including self
const DENSITY_RADIUS_M   = 200;         // cluster radius
const EVENT_EXCLUSION_M  = 300;         // don't create if event exists within this
const AUTO_DURATION_MS   = 4 * 3_600_000;
const STALE_MS           = 10 * 60_000; // location older than 10 min not counted

router.post('/', authRequired, (req: AuthedRequest, res) => {
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  if (isNaN(lat) || lat < -90  || lat > 90)  return res.status(400).json({ error: 'invalid_lat' });
  if (isNaN(lng) || lng < -180 || lng > 180) return res.status(400).json({ error: 'invalid_lng' });

  const now = Date.now();
  const userId = req.userId!;

  db.prepare('UPDATE users SET last_lat = ?, last_lng = ?, last_location_at = ? WHERE id = ?')
    .run(lat, lng, now, userId);

  const autoEventId = checkAndCreateCluster(userId, lat, lng, now);
  res.json({ ok: true, autoEventId: autoEventId ?? null });
});

function checkAndCreateCluster(userId: string, lat: number, lng: number, now: number): string | null {
  const staleThreshold = now - STALE_MS;

  // Bounding-box pre-filter (avoids full-table haversine)
  const dLat = DENSITY_RADIUS_M / 111_111;
  const dLng = DENSITY_RADIUS_M / (111_111 * Math.cos((lat * Math.PI) / 180));

  const nearby = db.prepare(`
    SELECT id, last_lat, last_lng FROM users
    WHERE id != ?
      AND last_location_at IS NOT NULL AND last_location_at > ?
      AND last_lat  BETWEEN ? AND ?
      AND last_lng  BETWEEN ? AND ?
      AND is_banned = 0
  `).all(userId, staleThreshold, lat - dLat, lat + dLat, lng - dLng, lng + dLng) as any[];

  const close = nearby.filter((u) => haversineMeters(lat, lng, u.last_lat, u.last_lng) <= DENSITY_RADIUS_M);
  if (close.length + 1 < DENSITY_MIN_USERS) return null;

  // Abort if any existing event (any source) is already within exclusion radius
  const activeEvents = db.prepare(
    'SELECT lat, lng FROM events WHERE ends_at > ?'
  ).all(now) as any[];

  const hasNearbyEvent = activeEvents.some(
    (e) => haversineMeters(lat, lng, e.lat, e.lng) <= EVENT_EXCLUSION_M
  );
  if (hasNearbyEvent) return null;

  const id = newId('ev_');
  db.prepare(`
    INSERT INTO events (id, name, venue, lat, lng, starts_at, ends_at, source, created_at)
    VALUES (?, 'Rolê Detectado 🎉', 'Localização Aproximada', ?, ?, ?, ?, 'auto', ?)
  `).run(id, lat, lng, now, now + AUTO_DURATION_MS, now);

  console.log(`[density] auto-event ${id}: ${close.length + 1} users within ${DENSITY_RADIUS_M}m`);
  return id;
}

export default router;
