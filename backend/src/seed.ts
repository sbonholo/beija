import { db } from './db.js';
import { newId } from './lib/ids.js';

const now = Date.now();
const hours = (h: number) => h * 60 * 60 * 1000;

// ─── Events ───────────────────────────────────────────────────────
const seedEvents = [
  {
    name: 'Baile da Lapa',
    venue: 'Circo Voador',
    address: 'Rua dos Arcos, S/N - Lapa',
    city: 'Rio de Janeiro',
    lat: -22.9133, lng: -43.1791,
    starts_at: now + hours(2), ends_at: now + hours(10),
    image_url: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800',
    category: 'balada',
  },
  {
    name: 'Samba do Trabalhador',
    venue: 'Clube Renascença',
    address: 'R. Barão de São Francisco, 54 - Andaraí',
    city: 'Rio de Janeiro',
    lat: -22.9281, lng: -43.2417,
    starts_at: now + hours(4), ends_at: now + hours(12),
    image_url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800',
    category: 'show',
  },
  {
    name: 'Sexta Eletrônica',
    venue: 'D-Edge',
    address: 'Alameda Olga, 170 - Barra Funda',
    city: 'São Paulo',
    lat: -23.5234, lng: -46.6716,
    starts_at: now + hours(6), ends_at: now + hours(14),
    image_url: 'https://images.unsplash.com/photo-1571266028243-d220bc23d10e?w=800',
    category: 'balada',
  },
  {
    name: 'Forró no Bar do Juarez',
    venue: 'Bar do Juarez',
    address: 'R. Atílio Innocenti, 226 - Vila Olímpia',
    city: 'São Paulo',
    lat: -23.5957, lng: -46.6852,
    starts_at: now + hours(1), ends_at: now + hours(8),
    image_url: 'https://images.unsplash.com/photo-1543007630-9710e4a00a20?w=800',
    category: 'bar',
  },
  {
    name: 'Show da Anitta',
    venue: 'Allianz Parque',
    address: 'Av. Francisco Matarazzo, 1705 - Água Branca',
    city: 'São Paulo',
    lat: -23.5275, lng: -46.6789,
    starts_at: now + hours(3), ends_at: now + hours(9),
    image_url: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800',
    category: 'show',
  },
  {
    name: 'Pagode na Praia',
    venue: 'Quiosque do Pepê',
    address: 'Av. do Pepê, 1 - Barra da Tijuca',
    city: 'Rio de Janeiro',
    lat: -23.0119, lng: -43.3253,
    starts_at: now - hours(1), ends_at: now + hours(6),
    image_url: 'https://images.unsplash.com/photo-1531058020387-3be344556be6?w=800',
    category: 'festa',
  },
];

const upsertEvent = db.prepare(
  `INSERT INTO events (id, name, venue, address, city, lat, lng, starts_at, ends_at, image_url, category)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(id) DO NOTHING`
);
const updateTimestamps = db.prepare(
  `UPDATE events SET starts_at = ?, ends_at = ? WHERE name = ? AND venue = ?`
);

let eventsInserted = 0;
for (const e of seedEvents) {
  const existing = db.prepare('SELECT id FROM events WHERE name = ? AND venue = ?').get(e.name, e.venue);
  if (existing) {
    updateTimestamps.run(e.starts_at, e.ends_at, e.name, e.venue);
  } else {
    upsertEvent.run(newId('e_'), e.name, e.venue, e.address, e.city, e.lat, e.lng, e.starts_at, e.ends_at, e.image_url, e.category);
    eventsInserted++;
  }
}

const eventTotal = (db.prepare('SELECT COUNT(*) AS c FROM events').get() as any).c;
console.log(`[seed] ${eventsInserted} events inserted, ${eventTotal} total (timestamps refreshed on restart)`);

// ─── Helpers to look up event IDs ─────────────────────────────────
function getEventId(name: string, venue: string): string | null {
  const row = db.prepare('SELECT id FROM events WHERE name = ? AND venue = ?').get(name, venue) as { id: string } | undefined;
  return row?.id ?? null;
}

// ─── Seed users ───────────────────────────────────────────────────
// Phones in the 119-0000-XXXX range are reserved for test accounts.
// gender:   man | woman | non-binary | other
// seeking:  array — empty means show everyone
const seedUsers: {
  phone: string;
  nickname: string;
  gender: string;
  seeking: string[];
  bio: string;
  photo_url: string;
  birthdate: string;
  event_name: string;
  event_venue: string;
}[] = [
  // ── Baile da Lapa (10 users) ─────────────────────────────────
  {
    phone: '11900000001',
    nickname: 'Ana',
    gender: 'woman',
    seeking: ['man'],
    bio: 'Amo samba e forró 🎵 Sou carioca raiz e adoro uma roda de pagode',
    photo_url: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=400&q=80',
    birthdate: '1997-04-12',
    event_name: 'Baile da Lapa',
    event_venue: 'Circo Voador',
  },
  {
    phone: '11900000002',
    nickname: 'Bruno',
    gender: 'man',
    seeking: ['woman'],
    bio: 'Produtor musical, toco violão e guitarra 🎸 Apaixonado por MPB',
    photo_url: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&q=80',
    birthdate: '1993-11-08',
    event_name: 'Baile da Lapa',
    event_venue: 'Circo Voador',
  },
  {
    phone: '11900000003',
    nickname: 'Carla',
    gender: 'woman',
    seeking: ['woman', 'non-binary'],
    bio: 'Fotógrafa 📷 Viajante incorrigível. Cafézinho e bons papos',
    photo_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&q=80',
    birthdate: '1995-07-22',
    event_name: 'Baile da Lapa',
    event_venue: 'Circo Voador',
  },
  {
    phone: '11900000004',
    nickname: 'Diego',
    gender: 'man',
    seeking: ['woman', 'non-binary'],
    bio: 'Chef de cozinha 🍳 Cozinho para conquistar. Rumo ao próximo rolê',
    photo_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&q=80',
    birthdate: '1991-02-14',
    event_name: 'Baile da Lapa',
    event_venue: 'Circo Voador',
  },
  {
    phone: '11900000005',
    nickname: 'Emília',
    gender: 'non-binary',
    seeking: ['woman', 'man', 'non-binary', 'other'],
    bio: 'Arte, dança e muito afeto ✨ Pronomes: ela/ele. Vem dançar comigo',
    photo_url: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400&q=80',
    birthdate: '2000-09-30',
    event_name: 'Baile da Lapa',
    event_venue: 'Circo Voador',
  },
  {
    phone: '11900000006',
    nickname: 'Felipe',
    gender: 'man',
    seeking: ['man', 'woman'],
    bio: 'Arquiteto de dia, DJ às sextas 🎧 Amo arte moderna e boas conversas',
    photo_url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&q=80',
    birthdate: '1989-06-18',
    event_name: 'Baile da Lapa',
    event_venue: 'Circo Voador',
  },
  {
    phone: '11900000007',
    nickname: 'Gabi',
    gender: 'woman',
    seeking: ['man'],
    bio: 'Psicóloga e dançarina de salsa 💃 Curiosa sobre tudo e todos',
    photo_url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&q=80',
    birthdate: '1998-12-03',
    event_name: 'Baile da Lapa',
    event_venue: 'Circo Voador',
  },
  {
    phone: '11900000008',
    nickname: 'Henrique',
    gender: 'man',
    seeking: ['woman'],
    bio: 'Surf, cerveja gelada e pôr do sol 🏄 Estudante de engenharia, morador da Barra',
    photo_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80',
    birthdate: '2001-03-27',
    event_name: 'Baile da Lapa',
    event_venue: 'Circo Voador',
  },
  {
    phone: '11900000009',
    nickname: 'Isa',
    gender: 'woman',
    seeking: ['man', 'non-binary'],
    bio: 'Jornalista e escritora 📝 Escrevo crônicas sobre a vida noturna carioca',
    photo_url: 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=400&q=80',
    birthdate: '1994-08-16',
    event_name: 'Baile da Lapa',
    event_venue: 'Circo Voador',
  },
  {
    phone: '11900000010',
    nickname: 'João',
    gender: 'man',
    seeking: ['man'],
    bio: 'Ator e professor de teatro 🎭 Vivo pra arte e pra boa energia',
    photo_url: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400&q=80',
    birthdate: '1990-01-05',
    event_name: 'Baile da Lapa',
    event_venue: 'Circo Voador',
  },

  // ── Pagode na Praia (6 users) ─────────────────────────────────
  {
    phone: '11900000011',
    nickname: 'Karina',
    gender: 'woman',
    seeking: ['woman', 'man', 'non-binary', 'other'],
    bio: 'Nutricionista e surfista 🏄‍♀️ Praia, sol e muita leveza na vida',
    photo_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&q=80',
    birthdate: '1996-05-09',
    event_name: 'Pagode na Praia',
    event_venue: 'Quiosque do Pepê',
  },
  {
    phone: '11900000012',
    nickname: 'Lucas',
    gender: 'man',
    seeking: ['woman'],
    bio: 'Engenheiro de software e músico amador 🎹 Adoro tecnologia e pagode',
    photo_url: 'https://images.unsplash.com/photo-1547425260-76bcadfb4f2c?w=400&q=80',
    birthdate: '1992-10-21',
    event_name: 'Pagode na Praia',
    event_venue: 'Quiosque do Pepê',
  },
  {
    phone: '11900000013',
    nickname: 'Mari',
    gender: 'woman',
    seeking: ['man'],
    bio: 'Designer gráfica ✏️ Faço arte, bebo vinho e ouço Caetano',
    photo_url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&q=80',
    birthdate: '1999-02-28',
    event_name: 'Pagode na Praia',
    event_venue: 'Quiosque do Pepê',
  },
  {
    phone: '11900000014',
    nickname: 'Natan',
    gender: 'non-binary',
    seeking: ['woman', 'man', 'non-binary', 'other'],
    bio: 'Artivista e poeta slam ✊ Acredito na potência das conexões reais',
    photo_url: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=400&q=80',
    birthdate: '1998-07-14',
    event_name: 'Pagode na Praia',
    event_venue: 'Quiosque do Pepê',
  },
  {
    phone: '11900000015',
    nickname: 'Olívia',
    gender: 'woman',
    seeking: ['woman'],
    bio: 'Advogada, apaixonada por literatura e vinhos 🍷 Sapiossexual assumida',
    photo_url: 'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=400&q=80',
    birthdate: '1993-11-30',
    event_name: 'Pagode na Praia',
    event_venue: 'Quiosque do Pepê',
  },
  {
    phone: '11900000016',
    nickname: 'Pedro',
    gender: 'man',
    seeking: ['man'],
    bio: 'Médico residente e maratonista 🏃 Nas horas vagas: cozinhando ou correndo',
    photo_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400&q=80',
    birthdate: '1988-09-04',
    event_name: 'Pagode na Praia',
    event_venue: 'Quiosque do Pepê',
  },

  // ── Sexta Eletrônica (2 users) ───────────────────────────────
  {
    phone: '11900000017',
    nickname: 'Quinn',
    gender: 'non-binary',
    seeking: ['woman', 'non-binary'],
    bio: 'DJ e produtor de techno 🎛️ Vivo entre São Paulo e Berlim',
    photo_url: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=400&q=80',
    birthdate: '1995-04-01',
    event_name: 'Sexta Eletrônica',
    event_venue: 'D-Edge',
  },
  {
    phone: '11900000018',
    nickname: 'Rafa',
    gender: 'man',
    seeking: ['woman'],
    bio: 'Publicitário criativo 🖌️ Câmera na mão, olho no mundo',
    photo_url: 'https://images.unsplash.com/photo-1528892952291-009c663ce843?w=400&q=80',
    birthdate: '1996-06-15',
    event_name: 'Sexta Eletrônica',
    event_venue: 'D-Edge',
  },

  // ── Forró no Bar do Juarez (2 users) ─────────────────────────
  {
    phone: '11900000019',
    nickname: 'Sara',
    gender: 'woman',
    seeking: ['man'],
    bio: 'Bióloga e ambientalista 🌿 Forró, trilha e pão na chapa',
    photo_url: 'https://images.unsplash.com/photo-1489424731084-a5d8b219a5bb?w=400&q=80',
    birthdate: '2000-11-19',
    event_name: 'Forró no Bar do Juarez',
    event_venue: 'Bar do Juarez',
  },
  {
    phone: '11900000020',
    nickname: 'Thiago',
    gender: 'other',
    seeking: ['woman', 'man', 'non-binary', 'other'],
    bio: 'Astronomo amador e cozinheiro aos fins de semana 🌌 O céu não é o limite',
    photo_url: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=400&q=80',
    birthdate: '1991-08-07',
    event_name: 'Forró no Bar do Juarez',
    event_venue: 'Bar do Juarez',
  },
];

const upsertUser = db.prepare(`
  INSERT INTO users (id, phone, nickname, gender, seeking, bio, photo_url, birthdate, current_event_id, last_active, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
  ON CONFLICT(phone) DO UPDATE SET
    nickname   = excluded.nickname,
    gender     = excluded.gender,
    seeking    = excluded.seeking,
    bio        = excluded.bio,
    photo_url  = excluded.photo_url,
    birthdate  = excluded.birthdate
`);

const upsertCheckin = db.prepare(`
  INSERT INTO checkins (user_id, event_id, checked_in_at)
  VALUES (?, ?, ?)
  ON CONFLICT(user_id, event_id) DO NOTHING
`);

const setCurrentEvent = db.prepare(`
  UPDATE users SET current_event_id = ?, last_active = ? WHERE id = ?
`);

let usersInserted = 0;
let checkinsInserted = 0;

for (const u of seedUsers) {
  const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(u.phone) as { id: string } | undefined;
  const userId = existing?.id ?? newId('u_');
  const createdAt = now - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000);
  const lastActive = now - Math.floor(Math.random() * 30 * 60 * 1000); // up to 30 min ago

  upsertUser.run(
    userId,
    u.phone,
    u.nickname,
    u.gender,
    JSON.stringify(u.seeking),
    u.bio,
    u.photo_url,
    u.birthdate,
    lastActive,
    createdAt,
  );

  if (!existing) usersInserted++;

  const eventId = getEventId(u.event_name, u.event_venue);
  if (eventId) {
    const checkinAt = now - Math.floor(Math.random() * 60 * 60 * 1000); // up to 1h ago
    const result = upsertCheckin.run(userId, eventId, checkinAt);
    if (result.changes > 0) checkinsInserted++;
    setCurrentEvent.run(eventId, lastActive, userId);
  }
}

const userTotal = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as any).c;
console.log(`[seed] ${usersInserted} users inserted / updated, ${userTotal} total · ${checkinsInserted} checkins created`);
