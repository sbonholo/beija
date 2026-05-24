/**
 * Beija — dev seed script
 *
 * Cria 50 perfis brasileiros fake (com fotos + localização + interesses)
 * para teste visual local. Idempotente: rodar de novo só repõe o que falta.
 *
 * Uso:
 *   1. Copie frontend/.env.example -> frontend/.env.local
 *   2. Preencha SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (NÃO comite!)
 *   3. npm run db:seed
 *
 * Detalhes em docs/SEEDING.md.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ----- env loading (minimal, no dotenv dep) ---------------------------------
function loadDotenv() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(__dirname, '..', '.env.local'),
    join(__dirname, '..', '.env'),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const raw = readFileSync(path, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}
loadDotenv();

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    '[seed] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local',
  );
  console.error('       (Service role key, NOT anon key — needed to bypass RLS.)');
  process.exit(1);
}

const admin: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// ----- deterministic RNG (mulberry32) ---------------------------------------
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// ----- fixtures -------------------------------------------------------------
type Gender = 'woman' | 'man' | 'non-binary' | 'other';

const NAMES: Array<{ name: string; gender: Gender }> = [
  { name: 'Camila Souza', gender: 'woman' },
  { name: 'Mariana Oliveira', gender: 'woman' },
  { name: 'Júlia Santos', gender: 'woman' },
  { name: 'Beatriz Lima', gender: 'woman' },
  { name: 'Larissa Costa', gender: 'woman' },
  { name: 'Ana Pereira', gender: 'woman' },
  { name: 'Bruna Ferreira', gender: 'woman' },
  { name: 'Fernanda Almeida', gender: 'woman' },
  { name: 'Gabriela Rocha', gender: 'woman' },
  { name: 'Isabela Martins', gender: 'woman' },
  { name: 'Luana Carvalho', gender: 'woman' },
  { name: 'Manuela Ribeiro', gender: 'woman' },
  { name: 'Natália Gomes', gender: 'woman' },
  { name: 'Patrícia Barbosa', gender: 'woman' },
  { name: 'Raquel Mendes', gender: 'woman' },
  { name: 'Sofia Cardoso', gender: 'woman' },
  { name: 'Vitória Araújo', gender: 'woman' },
  { name: 'Yasmin Teixeira', gender: 'woman' },
  { name: 'Helena Moreira', gender: 'woman' },
  { name: 'Rafaela Dias', gender: 'woman' },
  { name: 'Letícia Pinto', gender: 'woman' },
  { name: 'Carolina Vieira', gender: 'woman' },
  { name: 'Amanda Reis', gender: 'woman' },
  { name: 'Bianca Castro', gender: 'woman' },
  { name: 'Daniela Cavalcanti', gender: 'woman' },
  { name: 'Lucas Silva', gender: 'man' },
  { name: 'Pedro Henrique', gender: 'man' },
  { name: 'Felipe Andrade', gender: 'man' },
  { name: 'Gabriel Nascimento', gender: 'man' },
  { name: 'Matheus Cunha', gender: 'man' },
  { name: 'Rafael Moura', gender: 'man' },
  { name: 'Thiago Borges', gender: 'man' },
  { name: 'Bruno Macedo', gender: 'man' },
  { name: 'Diego Freitas', gender: 'man' },
  { name: 'Eduardo Brito', gender: 'man' },
  { name: 'Gustavo Tavares', gender: 'man' },
  { name: 'Henrique Lopes', gender: 'man' },
  { name: 'João Vitor', gender: 'man' },
  { name: 'Leonardo Sales', gender: 'man' },
  { name: 'Marcelo Duarte', gender: 'man' },
  { name: 'Rodrigo Pires', gender: 'man' },
  { name: 'Vinícius Campos', gender: 'man' },
  { name: 'Caio Monteiro', gender: 'man' },
  { name: 'Daniel Farias', gender: 'man' },
  { name: 'Igor Marques', gender: 'man' },
  { name: 'André Batista', gender: 'man' },
  { name: 'Sam Ribeiro', gender: 'non-binary' },
  { name: 'Alex Moraes', gender: 'non-binary' },
  { name: 'Robin Carvalho', gender: 'non-binary' },
  { name: 'Jules Antunes', gender: 'other' },
];

// Geo: capitais brasileiras com jitter ~5km
const CITIES = [
  { city: 'São Paulo', lat: -23.5505, lng: -46.6333 },
  { city: 'Rio de Janeiro', lat: -22.9068, lng: -43.1729 },
  { city: 'Belo Horizonte', lat: -19.9167, lng: -43.9345 },
  { city: 'Curitiba', lat: -25.4284, lng: -49.2733 },
  { city: 'Porto Alegre', lat: -30.0346, lng: -51.2177 },
];

const INTERESTS_POOL = [
  'música', 'praia', 'cinema', 'culinária', 'viagem', 'pets',
  'academia', 'corrida', 'yoga', 'leitura', 'arte', 'fotografia',
  'samba', 'forró', 'sertanejo', 'rock', 'mpb', 'eletrônica',
  'futebol', 'vôlei', 'surf', 'trilha', 'camping', 'tatuagem',
  'café', 'vinho', 'gastronomia', 'teatro', 'shows', 'jogos',
];

const BIOS = [
  'Curto um café gelado e domingo sem alarme.',
  'Cachorro, sertanejo no carro, praia no fim de semana.',
  'Procurando alguém pra dividir playlist e madrugada.',
  'Cozinho mal, danço pior, mas faço rir.',
  'Trabalho com tecnologia, sonho com fazenda.',
  'Bota o samba que eu apareço.',
  'Vida é curta demais pra cerveja quente.',
  'Quero rir até passar mal num boteco bom.',
  'Tatuado, gato, e ainda em terapia. Pacote completo.',
  'Pediatra de dia, DJ amador de noite.',
  'Viajo mais do que devia. Topa um voo?',
  'Sem drama. Quero parceria, não terapia grátis.',
  'Engenheira, surfista, leitora compulsiva.',
  'Calmo, atencioso, e bom de beijo (diz minha mãe).',
  'Procuro conexão de verdade, sem joguinhos.',
  'Vegana, ciclista, sapeca.',
  'Faço churrasco no domingo. Apareça.',
  'Médico residente sobrevivendo a base de café.',
  'Curto cinema independente e brigadeiro.',
  'Quero alguém que dance comigo no Carnaval.',
];

// ----- helpers --------------------------------------------------------------
function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function sample<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)] as T;
}

function pickInterests(rand: () => number): string[] {
  const n = 3 + Math.floor(rand() * 4); // 3-6
  const pool = [...INTERESTS_POOL];
  const out: string[] = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = Math.floor(rand() * pool.length);
    out.push(pool.splice(idx, 1)[0]!);
  }
  return out;
}

function buildBirthdate(rand: () => number): string {
  // Idade 19-52 (atual: 2026)
  const year = 1974 + Math.floor(rand() * 34);
  const month = 1 + Math.floor(rand() * 12);
  const day = 1 + Math.floor(rand() * 28);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function buildEmail(index: number): string {
  // emails sintéticos, fáceis de identificar e limpar
  return `seed${pad2(index)}@beija.dev`;
}

function buildPhotos(index: number, rand: () => number): string[] {
  const count = 2 + Math.floor(rand() * 3); // 2-4
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(`https://picsum.photos/seed/beija_${pad2(index)}_${i}/600/800`);
  }
  return out;
}

function jitter(rand: () => number): number {
  // ±0.05 grau ≈ ±5km
  return (rand() - 0.5) * 0.1;
}

function chooseInterestedIn(gender: Gender, rand: () => number): string[] {
  // mistura realista: hetero, gay, bi
  const roll = rand();
  if (gender === 'woman') {
    if (roll < 0.55) return ['man'];
    if (roll < 0.75) return ['woman'];
    if (roll < 0.95) return ['woman', 'man'];
    return ['woman', 'man', 'non-binary'];
  }
  if (gender === 'man') {
    if (roll < 0.55) return ['woman'];
    if (roll < 0.75) return ['man'];
    if (roll < 0.95) return ['woman', 'man'];
    return ['woman', 'man', 'non-binary'];
  }
  // non-binary / other → mais inclusivo por padrão
  return ['woman', 'man', 'non-binary', 'other'];
}

// ----- main -----------------------------------------------------------------
async function main() {
  const total = NAMES.length;
  console.log(`[seed] starting — ${total} fake profiles`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < total; i++) {
    const idx = i + 1;
    const rand = mulberry32(0x42424200 + idx); // determinístico por índice
    const entry = NAMES[i]!;
    const email = buildEmail(idx);

    // 1) cria ou recupera auth user
    let userId: string | null = null;
    const { data: createRes, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        password: 'Beija!Seed#2026',
        email_confirm: true,
        user_metadata: { seed: true, name: entry.name },
      });

    if (createErr && !/already (been )?registered|exists/i.test(createErr.message)) {
      console.error(`[seed] ${idx} create user error:`, createErr.message);
      continue;
    }

    if (createRes?.user) {
      userId = createRes.user.id;
    } else {
      // já existe — busca via listUsers (paginado)
      let page = 1;
      while (page <= 20 && !userId) {
        const { data: list, error: listErr } = await admin.auth.admin.listUsers({
          page,
          perPage: 200,
        });
        if (listErr) {
          console.error(`[seed] ${idx} list users error:`, listErr.message);
          break;
        }
        const found = list?.users.find((u) => u.email === email);
        if (found) userId = found.id;
        if (!list || list.users.length < 200) break;
        page++;
      }
    }

    if (!userId) {
      console.error(`[seed] ${idx} could not resolve user id for ${email}`);
      skipped++;
      continue;
    }

    // 2) monta perfil
    const city = CITIES[i % CITIES.length]!;
    const lat = city.lat + jitter(rand);
    const lng = city.lng + jitter(rand);
    const interestedIn = chooseInterestedIn(entry.gender, rand);
    const minAge = 18 + Math.floor(rand() * 5);
    const maxAge = Math.min(99, minAge + 10 + Math.floor(rand() * 25));

    const profileRow = {
      id: userId,
      name: entry.name,
      birthdate: buildBirthdate(rand),
      gender: entry.gender,
      bio: sample(BIOS, rand),
      city: city.city,
      interested_in: interestedIn,
      interests: pickInterests(rand),
      min_age: minAge,
      max_age: maxAge,
      max_distance_km: 50,
      last_active_at: new Date(Date.now() - Math.floor(rand() * 7 * 24 * 3600 * 1000))
        .toISOString(),
    };

    const { data: existing } = await admin
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (existing) {
      const { error: upErr } = await admin
        .from('profiles')
        .update(profileRow)
        .eq('id', userId);
      if (upErr) {
        console.error(`[seed] ${idx} update profile error:`, upErr.message);
        continue;
      }
      updated++;
    } else {
      const { error: insErr } = await admin.from('profiles').insert(profileRow);
      if (insErr) {
        console.error(`[seed] ${idx} insert profile error:`, insErr.message);
        continue;
      }
      created++;
    }

    // 3) localização (precisa de RPC porque é PostGIS geography)
    const { error: locErr } = await admin.rpc('seed_set_location', {
      p_user_id: userId,
      p_lat: lat,
      p_lng: lng,
    });
    if (locErr) {
      console.error(`[seed] ${idx} location error:`, locErr.message);
    }

    // 4) fotos: substitui (delete + insert) pra ficar idempotente
    await admin.from('photos').delete().eq('user_id', userId);
    const urls = buildPhotos(idx, rand);
    const photoRows = urls.map((url, slot) => ({
      user_id: userId,
      slot,
      url,
    }));
    const { error: photoErr } = await admin.from('photos').insert(photoRows);
    if (photoErr) {
      console.error(`[seed] ${idx} photos error:`, photoErr.message);
    }

    if (idx % 10 === 0) {
      console.log(`[seed] progress: ${idx}/${total}`);
    }
  }

  console.log(
    `[seed] done — created ${created}, updated ${updated}, skipped ${skipped}`,
  );
}

main().catch((err) => {
  console.error('[seed] fatal:', err);
  process.exit(1);
});
