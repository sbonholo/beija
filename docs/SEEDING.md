# Seeding — rodar o Beija local com 50 perfis fake

Este guia leva você do repo zerado até o app rodando com 50 perfis brasileiros
fake aparecendo no Discover. Tempo total: ~10 minutos (sem contar criar conta
Supabase).

## TL;DR

```bash
git clone https://github.com/sbonholo/beija.git
cd beija/frontend
npm install --legacy-peer-deps
cp .env.example .env.local           # edite com URL + ANON + SERVICE_ROLE
npm run db:seed                      # popula 50 perfis + fotos + localização
npm run dev                          # abre em http://localhost:5173
```

## 1. Pré-requisitos

- Node 20+ (testado em 20.x e 22.x)
- npm 10+
- Conta Supabase gratuita (https://supabase.com)

## 2. Criar projeto Supabase

1. Em https://supabase.com/dashboard, clique **New project**.
2. Escolha região `sa-east-1` (São Paulo) para latência baixa.
3. Anote a senha do banco — não é usada pelo seed, mas vale guardar.
4. Espere ~2min provisionar.

## 3. Aplicar migrations

```bash
# instale o CLI uma vez
brew install supabase/tap/supabase     # macOS
# ou: npm i -g supabase                # cross-platform

supabase login
supabase link --project-ref <seu-project-ref>
supabase db push
```

Isso cria as 8 tabelas (`profiles`, `photos`, `swipes`, `matches`, …), as
RPCs (`find_potential_matches`, `update_user_location`, `seed_set_location`),
o trigger de match mútuo, e todas as policies de RLS.

## 4. Configurar `.env.local`

Copie o template e preencha:

```bash
cd frontend
cp .env.example .env.local
```

Variáveis obrigatórias para o seed + app rodar:

| Var | Onde achar | Pra quê |
|---|---|---|
| `VITE_SUPABASE_URL` | Dashboard → Settings → API → Project URL | App (frontend) |
| `VITE_SUPABASE_ANON_KEY` | Dashboard → Settings → API → anon public | App (frontend) |
| `SUPABASE_URL` | mesma que acima | Script de seed |
| `SUPABASE_SERVICE_ROLE_KEY` | Dashboard → Settings → API → service_role secret | Script de seed (bypassa RLS) |

> ⚠️ **Nunca** comite `.env.local`. A service_role key dá acesso total ao banco.
> O `.gitignore` já cobre, mas confira.

## 5. Rodar o seed

```bash
npm run db:seed
```

Saída esperada:

```
[seed] starting — 50 fake profiles
[seed] progress: 10/50
[seed] progress: 20/50
...
[seed] done — created 50, updated 0, skipped 0
```

O script é **idempotente**: rodar de novo atualiza os perfis em vez de duplicar
(os emails `seed01@beija.dev`...`seed50@beija.dev` são chaves de identidade).

### O que ele cria

- 50 usuários em `auth.users` (emails `seedNN@beija.dev`, senha
  `Beija!Seed#2026` — útil pra logar como qualquer um deles via tela de login
  se você habilitar email/password no Supabase Auth)
- 50 entradas em `profiles` com nome, idade, bio, interesses, cidade,
  preferências de gênero e faixa etária
- 2 a 4 fotos em `photos` por perfil, via `https://picsum.photos/seed/...`
  (placeholders determinísticos — mesma URL = mesma foto)
- Localização real (PostGIS) espalhada por **São Paulo, Rio, Belo Horizonte,
  Curitiba e Porto Alegre** com jitter de ~5km

### Distribuição

- 25 mulheres, 21 homens, 3 não-binárias, 1 outro
- Mistura de orientações (hetero / gay / bi / inclusivo)
- Idades 19-52 anos
- Faixa de busca variada (alguns 18-30, outros 25-55, etc.)

## 6. Rodar o app

```bash
npm run dev
```

Abra http://localhost:5173, faça login (Google/Apple ou crie uma conta nova),
complete o onboarding informando sua localização **em São Paulo, Rio, BH,
Curitiba ou Porto Alegre** (ou habilite geolocation real do navegador) e os
perfis fake vão aparecer no Discover.

> 💡 Se o navegador estiver bloqueando geolocation, edite seu próprio profile e
> use a cidade São Paulo (`-23.5505, -46.6333`) — todos os 10 perfis de SP do
> seed vão aparecer.

## 7. Limpar o seed

```sql
-- via Supabase SQL Editor
delete from auth.users where email like 'seed%@beija.dev';
-- as deleções em cascata cuidam de profiles, photos, swipes, matches, etc.
```

## Troubleshooting

| Sintoma | Causa provável | Fix |
|---|---|---|
| `missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY` | `.env.local` faltando ou sem service_role | Cole a service_role secret do dashboard |
| `function seed_set_location does not exist` | Migration `20260524500000_seed_helpers.sql` não aplicada | Rode `supabase db push` de novo |
| `relation "profiles" does not exist` | Nenhuma migration foi aplicada | Rode `supabase db push` |
| Discover vazio mesmo após seed | Sua localização está longe das 5 capitais | Mude `max_distance_km` no profile ou mude sua localização |
| Foto não carrega | picsum.photos fora do ar (raro) | Substitua o domínio no `scripts/seed.ts` por `https://source.unsplash.com/600x800?sig=N` |

## Como o seed funciona por dentro

`frontend/scripts/seed.ts`:

1. Carrega `.env.local` sem dependência de `dotenv` (parser próprio simples)
2. Cria cliente Supabase com **service_role** (bypassa RLS)
3. Para cada um dos 50 perfis:
   - `auth.admin.createUser({ email, password, email_confirm: true })`
     (ou recupera via `listUsers` se já existe)
   - `insert` ou `update` em `profiles`
   - `rpc('seed_set_location', ...)` — única forma de setar PostGIS geography
     pelo client JS
   - Deleta fotos antigas + insere as novas (idempotência)
4. RNG determinístico (mulberry32) por índice → mesmas fotos, mesmos lat/lng,
   mesma bio em runs sucessivos

Sem dependências runtime extras — só `tsx` como dev dep pra rodar TypeScript
direto.
