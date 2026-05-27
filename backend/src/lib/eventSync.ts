import { db } from '../db.js';
import { newId } from './ids.js';
import { config } from '../config.js';

const TM_BASE = 'https://app.ticketmaster.com/discovery/v2/events.json';
const EB_BASE = 'https://www.eventbriteapi.com/v3/events/search/';

const insertEvent = db.prepare(`
  INSERT OR IGNORE INTO events
    (id, name, venue, address, city, lat, lng, starts_at, ends_at, image_url, category, source, external_id, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

async function syncTicketmaster(): Promise<number> {
  if (!config.ticketmasterApiKey) return 0;

  const url = new URL(TM_BASE);
  url.searchParams.set('apikey', config.ticketmasterApiKey);
  url.searchParams.set('latlong', `${config.syncLat},${config.syncLng}`);
  url.searchParams.set('radius', String(config.syncRadiusKm));
  url.searchParams.set('unit', 'km');
  url.searchParams.set('size', '50');
  url.searchParams.set('sort', 'date,asc');

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) { console.error(`[eventSync] Ticketmaster ${res.status}`); return 0; }

  const data = await res.json() as any;
  const evs: any[] = data._embedded?.events ?? [];
  let inserted = 0;

  for (const ev of evs) {
    try {
      const v = ev._embedded?.venues?.[0];
      if (!v?.location?.latitude || !v?.location?.longitude) continue;

      const startStr = ev.dates?.start?.dateTime ?? ev.dates?.start?.localDate;
      if (!startStr) continue;
      const startsAt = new Date(startStr).getTime();
      const endsAt = startsAt + 4 * 3_600_000;
      if (endsAt < Date.now()) continue;

      const img = ev.images?.find((i: any) => i.ratio === '16_9')?.url ?? ev.images?.[0]?.url ?? null;
      const r = insertEvent.run(
        newId('ev_'), ev.name,
        v.name ?? 'Venue', v.address?.line1 ?? null, v.city?.name ?? null,
        parseFloat(v.location.latitude), parseFloat(v.location.longitude),
        startsAt, endsAt, img,
        ev.classifications?.[0]?.segment?.name ?? null,
        'ticketmaster', `tm_${ev.id}`, Date.now(),
      );
      if (r.changes > 0) inserted++;
    } catch { /* skip malformed */ }
  }

  console.log(`[eventSync] Ticketmaster: +${inserted} new events`);
  return inserted;
}

async function syncEventbrite(): Promise<number> {
  if (!config.eventbriteToken) return 0;

  const url = new URL(EB_BASE);
  url.searchParams.set('location.latitude', String(config.syncLat));
  url.searchParams.set('location.longitude', String(config.syncLng));
  url.searchParams.set('location.within', `${config.syncRadiusKm}km`);
  url.searchParams.set('expand', 'venue');
  url.searchParams.set('page_size', '50');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${config.eventbriteToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) { console.error(`[eventSync] Eventbrite ${res.status}`); return 0; }

  const data = await res.json() as any;
  const evs: any[] = data.events ?? [];
  let inserted = 0;

  for (const ev of evs) {
    try {
      const v = ev.venue;
      if (!v?.latitude || !v?.longitude) continue;

      const startsAt = new Date(ev.start?.utc).getTime();
      const endsAt = new Date(ev.end?.utc).getTime();
      if (isNaN(startsAt) || endsAt < Date.now()) continue;

      const r = insertEvent.run(
        newId('ev_'), ev.name?.text ?? 'Evento',
        v.name ?? 'Venue', v.address?.address_1 ?? null, v.address?.city ?? null,
        parseFloat(v.latitude), parseFloat(v.longitude),
        startsAt, endsAt,
        ev.logo?.url ?? null,
        ev.category_id ?? null,
        'eventbrite', `eb_${ev.id}`, Date.now(),
      );
      if (r.changes > 0) inserted++;
    } catch { /* skip malformed */ }
  }

  console.log(`[eventSync] Eventbrite: +${inserted} new events`);
  return inserted;
}

export async function runSync(): Promise<void> {
  if (config.disableEventSync) return;
  try {
    await Promise.allSettled([syncTicketmaster(), syncEventbrite()]);
  } catch (err) {
    console.error('[eventSync] sync error:', err);
  }
}
