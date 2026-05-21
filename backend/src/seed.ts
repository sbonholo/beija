import { db } from './db.js';
import { newId } from './lib/ids.js';

const now = Date.now();
const hours = (h: number) => h * 60 * 60 * 1000;

const seedEvents = [
  {
    name: 'Baile da Lapa',
    venue: 'Circo Voador',
    address: 'Rua dos Arcos, S/N - Lapa',
    city: 'Rio de Janeiro',
    lat: -22.9133,
    lng: -43.1791,
    starts_at: now + hours(2),
    ends_at: now + hours(10),
    image_url: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800',
    category: 'balada',
  },
  {
    name: 'Samba do Trabalhador',
    venue: 'Clube Renascença',
    address: 'R. Barão de São Francisco, 54 - Andaraí',
    city: 'Rio de Janeiro',
    lat: -22.9281,
    lng: -43.2417,
    starts_at: now + hours(4),
    ends_at: now + hours(12),
    image_url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800',
    category: 'show',
  },
  {
    name: 'Sexta Eletrônica',
    venue: 'D-Edge',
    address: 'Alameda Olga, 170 - Barra Funda',
    city: 'São Paulo',
    lat: -23.5234,
    lng: -46.6716,
    starts_at: now + hours(6),
    ends_at: now + hours(14),
    image_url: 'https://images.unsplash.com/photo-1571266028243-d220bc23d10e?w=800',
    category: 'balada',
  },
  {
    name: 'Forró no Bar do Juarez',
    venue: 'Bar do Juarez',
    address: 'R. Atílio Innocenti, 226 - Vila Olímpia',
    city: 'São Paulo',
    lat: -23.5957,
    lng: -46.6852,
    starts_at: now + hours(1),
    ends_at: now + hours(8),
    image_url: 'https://images.unsplash.com/photo-1543007630-9710e4a00a20?w=800',
    category: 'bar',
  },
  {
    name: 'Show da Anitta',
    venue: 'Allianz Parque',
    address: 'Av. Francisco Matarazzo, 1705 - Água Branca',
    city: 'São Paulo',
    lat: -23.5275,
    lng: -46.6789,
    starts_at: now + hours(3),
    ends_at: now + hours(9),
    image_url: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800',
    category: 'show',
  },
  {
    name: 'Pagode na Praia',
    venue: 'Quiosque do Pepê',
    address: 'Av. do Pepê, 1 - Barra da Tijuca',
    city: 'Rio de Janeiro',
    lat: -23.0119,
    lng: -43.3253,
    starts_at: now - hours(1),
    ends_at: now + hours(6),
    image_url: 'https://images.unsplash.com/photo-1531058020387-3be344556be6?w=800',
    category: 'festa',
  },
];

const insert = db.prepare(
  `INSERT INTO events (id, name, venue, address, city, lat, lng, starts_at, ends_at, image_url, category)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(id) DO NOTHING`
);

let inserted = 0;
for (const e of seedEvents) {
  const existing = db.prepare('SELECT id FROM events WHERE name = ? AND venue = ?').get(e.name, e.venue);
  if (existing) continue;
  insert.run(newId('e_'), e.name, e.venue, e.address, e.city, e.lat, e.lng, e.starts_at, e.ends_at, e.image_url, e.category);
  inserted++;
}

console.log(`[seed] inserted ${inserted} events (total now: ${(db.prepare('SELECT COUNT(*) AS c FROM events').get() as any).c})`);
