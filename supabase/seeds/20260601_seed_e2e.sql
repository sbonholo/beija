-- ===========================================================================
-- Beija E2E seed — 100 synthetic profiles, idempotent, re-runnable.
--
-- BEFORE RUNNING: apply migration 20260601000000_profiles_is_seed.sql first
-- so the is_seed flag exists.
--
-- These rows are NOT real users. encrypted_password is a non-functional
-- placeholder — none of these accounts can sign in. Emails follow the
-- seed-NNN@seed.beija.test pattern. Every profile row has is_seed = true.
-- IDs are 00000000-0000-0000-0000-NNNNNNNNNNNN so they're trivially spotted.
--
-- ---------------------------------------------------------------------------
-- LIVE-SCHEMA NOTES (verified against the running DB, not just migration files)
-- ---------------------------------------------------------------------------
-- profiles columns we touch: id, name, birthdate, gender, bio, city, location,
--   interested_in, min_age, max_age, max_distance_km, last_active_at,
--   is_inactive, is_seed.
--   Drift caught: an early migration named the column `last_active`; the
--   cron-jobs migration renamed it to `last_active_at` and added `is_inactive`.
--   Always use last_active_at + is_inactive in seed code.
-- photos columns we touch:           user_id, slot, url           (unchanged)
-- check_ins columns we touch:        user_id, event_id            (unchanged)
-- event_reactions columns we touch:  sender_id, receiver_id, event_id, kind
--                                                                 (unchanged)
--
-- ---------------------------------------------------------------------------
-- AUTH.USERS COLUMNS WE INSERT (step 2 below)
-- ---------------------------------------------------------------------------
--   instance_id, id, aud, role, email,
--   encrypted_password, email_confirmed_at,
--   raw_app_meta_data, raw_user_meta_data,
--   created_at, updated_at,
--   confirmation_token, recovery_token,
--   email_change_token_new, email_change_token_current, email_change
--
-- If your Supabase project's auth schema has a newer NOT NULL column that
-- isn't in this list (e.g. is_sso_user, is_anonymous, or a future addition),
-- the INSERT will fail with a clear error:
--   "null value in column \"<colname>\" of relation \"users\" violates
--    not-null constraint"
-- Fix: add that column to the INSERT ... SELECT block at step 2 with a
-- sensible default (false / '' / now()). No silent corruption is possible.
-- ===========================================================================

begin;

-- 1. Build the 100-row spec ---------------------------------------------------
-- Names are indexed arrays; gender/interested_in derive from the index range.
with seed_spec as (
  select
    n,
    ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid as user_id,
    'seed-' || lpad(n::text, 3, '0') || '@seed.beija.test'       as email,
    (array[
      -- 1..30 — straight women (interested_in = {man})
      'Camila Souza','Mariana Oliveira','Júlia Santos','Beatriz Lima','Larissa Costa',
      'Ana Pereira','Bruna Ferreira','Fernanda Almeida','Gabriela Rocha','Isabela Martins',
      'Luana Carvalho','Manuela Ribeiro','Natália Gomes','Patrícia Barbosa','Raquel Mendes',
      'Sofia Cardoso','Vitória Araújo','Yasmin Teixeira','Helena Moreira','Rafaela Dias',
      'Letícia Pinto','Carolina Vieira','Amanda Reis','Bianca Castro','Daniela Cavalcanti',
      'Clara Andrade','Eduarda Nunes','Giovanna Pires','Hellen Brito','Ingrid Moraes',
      -- 31..42 — lesbian women (interested_in = {woman})
      'Joana Tavares','Karen Lopes','Lúcia Cunha','Melissa Sales','Nicole Duarte',
      'Olívia Borges','Paula Macedo','Renata Freitas','Sabrina Antunes','Tatiane Marques',
      'Verônica Batista','Wanessa Campos',
      -- 43..52 — bi women (interested_in = {woman, man})
      'Aline Farias','Bárbara Monteiro','Cíntia Sales','Débora Tavares','Estela Pinheiro',
      'Flávia Moura','Graziela Ramos','Heloísa Vargas','Iara Maia','Janaína Cabral',
      -- 53..55 — inclusive women (interested_in = {woman, man, non-binary})
      'Kátia Sampaio','Laís Bittencourt','Marina Falcão',
      -- 56..80 — straight men (interested_in = {woman})
      'Lucas Silva','Pedro Henrique','Felipe Andrade','Gabriel Nascimento','Matheus Cunha',
      'Rafael Moura','Thiago Borges','Bruno Macedo','Diego Freitas','Eduardo Brito',
      'Gustavo Tavares','Henrique Lopes','João Vitor','Leonardo Sales','Marcelo Duarte',
      'Rodrigo Pires','Vinícius Campos','Caio Monteiro','Daniel Farias','Igor Marques',
      'André Batista','Arthur Sampaio','Bernardo Vargas','Davi Pinheiro','Enzo Ramos',
      -- 81..88 — gay men (interested_in = {man})
      'Fábio Maia','Heitor Cabral','Iago Falcão','Júlio Bittencourt','Kauê Moreira',
      'Luiz Tavares','Murilo Ribeiro','Nelson Borges',
      -- 89..94 — bi men (interested_in = {woman, man})
      'Otávio Brito','Paulo Andrade','Raul Cunha','Samuel Pires','Tomás Mendes',
      'Ulisses Lopes',
      -- 95..97 — inclusive men (interested_in = {woman, man, non-binary})
      'Victor Antunes','Wesley Reis','Xavier Pinto',
      -- 98..99 — non-binary
      'Sam Ribeiro','Alex Moraes',
      -- 100 — prefer not to say
      'Robin Castro'
    ])[n] as name,
    case
      when n between  1 and 55  then 'woman'
      when n between 56 and 97  then 'man'
      when n between 98 and 99  then 'non-binary'
      else                            'prefer_not_to_say'
    end as gender,
    case
      when n between  1 and 30  then array['man']
      when n between 31 and 42  then array['woman']
      when n between 43 and 52  then array['woman','man']
      when n between 53 and 55  then array['woman','man','non-binary']
      when n between 56 and 80  then array['woman']
      when n between 81 and 88  then array['man']
      when n between 89 and 94  then array['woman','man']
      when n between 95 and 97  then array['woman','man','non-binary']
      when n between 98 and 99  then array['woman','man','non-binary']
      else                            array['woman','man','non-binary','prefer_not_to_say']
    end as interested_in,
    -- Cities: 50 SP, 30 RJ, 20 BH. Jitter via deterministic offset (~4km).
    case
      when n <= 50         then 'São Paulo'
      when n <= 80         then 'Rio de Janeiro'
      else                      'Belo Horizonte'
    end as city,
    case
      when n <= 50         then -23.5505
      when n <= 80         then -22.9068
      else                      -19.9167
    end + ((n * 37 % 100) - 50) * 0.0008 as lat,
    case
      when n <= 50         then -46.6333
      when n <= 80         then -43.1729
      else                      -43.9345
    end + ((n * 53 % 100) - 50) * 0.0008 as lon,
    -- Ages 19..50 (2026 reference). Deterministic, no Feb 29 edge cases.
    make_date(
      2026 - (19 + (n * 7 % 32)),
      1 + (n % 12),
      1 + (n * 11 % 28)
    ) as birthdate,
    -- 6 stock bios cycled by index
    (array[
      'Curto um café gelado e domingo sem alarme.',
      'Procurando alguém pra dividir playlist e madrugada.',
      'Trabalho com tecnologia, sonho com fazenda.',
      'Quero rir até passar mal num boteco bom.',
      'Engenheira por formação, surfista por vocação.',
      'Sem drama. Parceria, não terapia grátis.'
    ])[1 + (n % 6)] as bio
  from generate_series(1, 100) as n
)

-- 2. Seed auth.users (no-login placeholders) ---------------------------------
-- See header comment for the exact column list and self-diagnosis guidance
-- if your auth schema has drifted from the standard Supabase migration.
insert into auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token,
  email_change_token_new, email_change_token_current, email_change
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  user_id, 'authenticated', 'authenticated', email,
  '$2a$10$seedonlydoesnotloginxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  now(),
  '{"provider":"seed","providers":["seed"]}'::jsonb,
  jsonb_build_object('seed', true, 'name', name),
  now() - interval '14 days', now(),
  '', '', '', '', ''
from seed_spec
on conflict (id) do nothing;

-- 3. Seed profiles -----------------------------------------------------------
-- NOTE on column names: the live schema uses last_active_at (renamed from
-- last_active in migration 20260524700000_cron_jobs.sql) and has an
-- is_inactive flag (added in the same migration; cron flips it true after
-- 30 days idle and find_potential_matches/get_event_attendees filter it out).
-- We explicitly set is_inactive = false so seeds always show up in the grid
-- regardless of last_active_at staleness or prior cron runs.
insert into profiles (
  id, name, birthdate, gender, bio, city,
  location, interested_in,
  min_age, max_age, max_distance_km,
  last_active_at, is_inactive, is_seed
)
select
  user_id, name, birthdate, gender, bio, city,
  st_setsrid(st_makepoint(lon, lat), 4326)::geography,
  interested_in,
  18, 60, 100,
  now() - (n * interval '11 minutes'),  -- staggered last_active_at for realism
  false,
  true
from seed_spec
on conflict (id) do update set
  name           = excluded.name,
  birthdate      = excluded.birthdate,
  gender         = excluded.gender,
  bio            = excluded.bio,
  city           = excluded.city,
  location       = excluded.location,
  interested_in  = excluded.interested_in,
  last_active_at = excluded.last_active_at,
  is_inactive    = false,
  is_seed        = true;

-- 4. Seed avatars (2 photos per profile, DiceBear illustrated) ---------------
-- DiceBear's 'lorelei' style is clearly synthetic line art — no real people,
-- deterministic per seed string. Renders crisply at any size.
insert into photos (user_id, slot, url)
select
  user_id, slot,
  'https://api.dicebear.com/9.x/lorelei/png?seed=beija-' || lpad(n::text, 3, '0')
    || '-' || slot || '&size=600&backgroundColor=ffd5dc,ffdfbf,e1bee7,b39ddb,c5cae9'
from seed_spec, generate_series(0, 1) as slot
on conflict (user_id, slot) do update set url = excluded.url;

-- 5. Check-ins — spread the 100 across your 5 events -------------------------
-- Picks the 5 earliest-starting active events.
with target_events as (
  select id, row_number() over (order by starts_at) - 1 as idx
  from events
  where coalesce(is_active, true) = true
  order by starts_at
  limit 5
)
insert into check_ins (user_id, event_id)
select
  s.user_id,
  e.id
from seed_spec s
cross join target_events e
-- ~60% of profiles check into a given event, deterministic per (n, event idx)
where ((s.n * 31 + e.idx * 17) % 10) < 6
on conflict (user_id, event_id) do nothing;

-- 6. Mutual reactions — 20 pairs, exercise heart/kiss/fire mix --------------
-- Each pair is both checked into the same event. The on_mutual_kiss trigger
-- creates the match automatically when the second-direction reaction fires.
with target_events as (
  select id, row_number() over (order by starts_at) - 1 as idx
  from events
  where coalesce(is_active, true) = true
  order by starts_at
  limit 5
),
pairs as (
  -- (sender_n, receiver_n, sender_kind, receiver_kind, event_idx)
  select * from (values
    -- 10 straight pairs across all 5 events (2 per event)
    ( 1, 56, 'kiss',  'heart', 0),
    ( 2, 57, 'heart', 'fire',  0),
    ( 3, 58, 'fire',  'kiss',  1),
    ( 4, 59, 'kiss',  'kiss',  1),
    ( 5, 60, 'heart', 'heart', 2),
    ( 6, 61, 'fire',  'fire',  2),
    ( 7, 62, 'kiss',  'heart', 3),
    ( 8, 63, 'heart', 'fire',  3),
    ( 9, 64, 'fire',  'kiss',  4),
    (10, 65, 'kiss',  'kiss',  4),
    -- 3 lesbian pairs
    (31, 32, 'heart', 'kiss',  0),
    (33, 34, 'fire',  'heart', 1),
    (35, 36, 'kiss',  'fire',  2),
    -- 3 gay pairs
    (81, 82, 'kiss',  'kiss',  3),
    (83, 84, 'heart', 'fire',  4),
    (85, 86, 'fire',  'heart', 0),
    -- 3 bi cross-pairs (bi woman ↔ bi man)
    (43, 89, 'heart', 'kiss',  1),
    (44, 90, 'fire',  'heart', 2),
    (45, 91, 'kiss',  'fire',  3),
    -- 1 non-binary pair
    (98, 99, 'heart', 'fire',  4)
  ) as p(sender_n, receiver_n, sender_kind, receiver_kind, event_idx)
),
resolved as (
  select
    ('00000000-0000-0000-0000-' || lpad(p.sender_n::text,   12, '0'))::uuid as sender_id,
    ('00000000-0000-0000-0000-' || lpad(p.receiver_n::text, 12, '0'))::uuid as receiver_id,
    p.sender_kind,
    p.receiver_kind,
    e.id as event_id
  from pairs p
  join target_events e on e.idx = p.event_idx
),
-- Ensure both sides checked in to the event (idempotent — covers seeds the
-- ~60% check-in spread above happened to skip).
ensured_checkins as (
  insert into check_ins (user_id, event_id)
  select sender_id,  event_id from resolved
  union
  select receiver_id, event_id from resolved
  on conflict (user_id, event_id) do nothing
  returning 1
)
-- Insert sender → receiver reactions (one direction)
insert into event_reactions (sender_id, receiver_id, event_id, kind)
select sender_id, receiver_id, event_id, sender_kind from resolved
on conflict (sender_id, receiver_id, event_id) do update set kind = excluded.kind;

-- Insert receiver → sender reactions (the other direction).
-- This INSERT is what fires the on_mutual_kiss trigger, which finds the
-- first reaction we just inserted and creates the match.
with target_events as (
  select id, row_number() over (order by starts_at) - 1 as idx
  from events
  where coalesce(is_active, true) = true
  order by starts_at
  limit 5
),
pairs as (
  select * from (values
    ( 1, 56, 'kiss',  'heart', 0),
    ( 2, 57, 'heart', 'fire',  0),
    ( 3, 58, 'fire',  'kiss',  1),
    ( 4, 59, 'kiss',  'kiss',  1),
    ( 5, 60, 'heart', 'heart', 2),
    ( 6, 61, 'fire',  'fire',  2),
    ( 7, 62, 'kiss',  'heart', 3),
    ( 8, 63, 'heart', 'fire',  3),
    ( 9, 64, 'fire',  'kiss',  4),
    (10, 65, 'kiss',  'kiss',  4),
    (31, 32, 'heart', 'kiss',  0),
    (33, 34, 'fire',  'heart', 1),
    (35, 36, 'kiss',  'fire',  2),
    (81, 82, 'kiss',  'kiss',  3),
    (83, 84, 'heart', 'fire',  4),
    (85, 86, 'fire',  'heart', 0),
    (43, 89, 'heart', 'kiss',  1),
    (44, 90, 'fire',  'heart', 2),
    (45, 91, 'kiss',  'fire',  3),
    (98, 99, 'heart', 'fire',  4)
  ) as p(sender_n, receiver_n, sender_kind, receiver_kind, event_idx)
)
insert into event_reactions (sender_id, receiver_id, event_id, kind)
select
  ('00000000-0000-0000-0000-' || lpad(p.receiver_n::text, 12, '0'))::uuid,
  ('00000000-0000-0000-0000-' || lpad(p.sender_n::text,   12, '0'))::uuid,
  e.id,
  p.receiver_kind
from pairs p
join target_events e on e.idx = p.event_idx
on conflict (sender_id, receiver_id, event_id) do update set kind = excluded.kind;

commit;

-- ===========================================================================
-- Sanity check (optional, paste in editor after running):
--   select count(*) from profiles where is_seed;                              -- 100
--   select count(*) from photos p join profiles s on p.user_id = s.id where s.is_seed;            -- 200
--   select count(*) from check_ins c join profiles s on c.user_id = s.id where s.is_seed;
--   select count(*) from event_reactions r join profiles s on r.sender_id = s.id where s.is_seed; -- 40
--   select count(*) from matches m
--     join profiles a on a.id = m.user1_id
--     join profiles b on b.id = m.user2_id
--     where a.is_seed and b.is_seed;                                          -- 20
-- ===========================================================================

-- ===========================================================================
-- TEARDOWN — wipes every seed row in one query.
-- Run as a separate statement when you want to reset.
-- The DELETE on auth.users cascades to profiles → photos, swipes, matches,
-- messages, reports, blocks, check_ins, event_reactions.
--
--   delete from auth.users where id in (select id from profiles where is_seed = true);
--
-- Equivalent email-based teardown (also fine — same rows):
--
--   delete from auth.users where email like 'seed-%@seed.beija.test';
-- ===========================================================================
