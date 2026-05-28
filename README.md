# Beija

[![CI](https://github.com/sbonholo/beija/actions/workflows/ci.yml/badge.svg)](https://github.com/sbonholo/beija/actions/workflows/ci.yml)
[![Lighthouse](https://github.com/sbonholo/beija/actions/workflows/lighthouse.yml/badge.svg)](https://github.com/sbonholo/beija/actions/workflows/lighthouse.yml)

App pra facilitar a pegação em eventos — festivais, shows, bares, baladas e
casas de show. **Supabase + Postgres + Vercel + Capacitor.**

> **Architecture:** This is a **Supabase (Postgres 15 + PostGIS) + Vercel + Capacitor 8**
> app. It was pivoted on 2026-05-27 from a previous SQLite + Express + Railway
> stack. See **[MIGRATION.md](MIGRATION.md)** for the full rationale and how to
> recover the old code (`archive/sqlite-railway-main` / tag `v0-sqlite-railway`).

> **Status:** pre-MVP. Schema + UI completos, faltam credenciais de produção (Supabase project, Apple Dev, Google Console) e assets visuais finais. See `AppStoreMetadata.md` and `ASSETS_SPEC.md`.

---

## Stack

- **Frontend:** React 18 + TypeScript + Vite + react-router-dom 6
- **Mobile shell:** Capacitor 8 (iOS + Android targets)
- **Backend-as-a-Service:** Supabase
  - Postgres 15 + **PostGIS** (location matching)
  - Supabase Auth (Sign in with Apple, Google) via `@capgo/capacitor-social-login` + `@capacitor-community/apple-sign-in`
  - Supabase Storage (`profile-photos` bucket)
  - Realtime (`postgres_changes` + presence) for chat
  - Edge Functions (push fan-out, deletion email — TODOs)
- **Native plugins:** `@capacitor/push-notifications`, `@capacitor/camera`, `@capacitor/geolocation`, `@capacitor/app`
- **Hosting:** Vercel (frontend) + Supabase (managed backend). The old Railway
  service (`b03a5964-…`) hosted the legacy backend and is **no longer canonical** — see [MIGRATION.md](MIGRATION.md) § Railway status.
- **Legacy Express backend (archived):** the SQLite/Express/Railway code is preserved
  on `archive/sqlite-railway-main` (tag `v0-sqlite-railway`). A read-only copy also
  remains in `backend/` for reference; see `backend/MIGRATION.md`.

---

## Folder layout

```
beija/
├── frontend/                    React + Capacitor app
│   ├── src/
│   │   ├── components/
│   │   │   ├── Auth/            SignInScreen, OnboardingFlow, ProfileSetup
│   │   │   ├── Chat/            ChatScreen, MessageBubble, MatchesList
│   │   │   ├── Discovery/       StackDeck, SwipeCard, DiscoveryFilters, MatchModal
│   │   │   ├── Moderation/      ReportModal, BlockButton
│   │   │   ├── Settings/        DeleteAccountFlow
│   │   │   └── pages/           lazy-loaded markdown wrappers (PrivacyPage, TermsPage)
│   │   ├── hooks/               useGeolocation
│   │   ├── lib/                 supabase, auth, storage, pushNotifications, labels, constants
│   │   ├── pages/               PrivacyPolicy.md, TermsOfService.md
│   │   ├── state/               AuthContext, UnreadContext
│   │   └── App.tsx, main.tsx
│   ├── ios/                     Capacitor-generated Xcode project
│   ├── android/                 Capacitor-generated Gradle project
│   ├── public/                  manifest.json, sw.js, icons/, 404.html
│   └── capacitor.config.ts
├── backend/                     Legacy Express + SQLite (deprecating)
│   ├── src/                     auth, events, profile, reactions, matches, supabaseAdapter
│   └── MIGRATION.md             SQLite → Supabase plan
├── supabase/migrations/         SQL schema + RPC functions
├── fastlane/                    iOS release pipeline (skeleton)
├── docs/                        ARCHITECTURE, API, DEPLOYMENT
├── .github/workflows/           ci.yml, release-testflight.yml, deploy-pages.yml
├── ASSETS_SPEC.md
├── ICON_DESIGN.md
├── AppStoreMetadata.md
├── PlayStoreMetadata.md         Play Console listing copy + Data Safety
├── AUDIT_REPORT.md
├── BUGS_FOUND.md
├── CLICK_FLOW_ANALYSIS.md
├── CREDENTIALS.md               ownership / status of external accounts
├── TEST_SCENARIOS.md
└── MORNING_REPORT.md
```

---

## Local development

```bash
# 1) Clone + install
git clone https://github.com/sbonholo/beija.git
cd beija/frontend
npm install --legacy-peer-deps

# 2) Configure env vars
cp .env.example .env.local
# fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY at minimum

# 3) Run the web app (hot reload)
npm run dev
# opens at http://localhost:5173
```

Required env vars are documented in `frontend/.env.example`. Without `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` the app loads but no DB calls succeed.

Want 50 perfis fake brasileiros pra testar visualmente? Veja **[docs/SEEDING.md](docs/SEEDING.md)** — `npm run db:seed` popula profiles + fotos + localização em SP/RJ/BH/Curitiba/POA.

---

## Database setup (Supabase)

```bash
# Install supabase CLI
brew install supabase/tap/supabase

# Link to your project
supabase login
supabase link --project-ref <your-project-ref>

# Apply migrations
supabase db push
```

Migrations live in `supabase/migrations/`. They create:
- 11 tables: profiles, photos, swipes, matches, messages, reports, blocks,
  deletion_requests, **events, check_ins, event_reactions**
- RPCs incl. `find_potential_matches`, `update_user_location`, `block_user`,
  **`get_nearby_events`, `get_event_attendees`**
- Mutual-swipe → match trigger **and mutual-kiss (at an event) → match trigger**
- Row Level Security policies for all tables (block-aware on matches/messages;
  event reactions require an active check-in)

Don't forget to enable the **Apple** and **Google** auth providers in the Supabase dashboard (`Authentication → Providers`) before users can sign in. See `docs/DEPLOYMENT.md`.

---

## Deploy web (testing)

Para gerar uma URL pública (smoke test no celular antes do app nativo):
**[docs/DEPLOY.md](docs/DEPLOY.md)**.

Caminhos:
- **Vercel** (recomendado): `.github/workflows/deploy-vercel.yml` —
  setup em 5min, preview URL por PR, SSL automático. Sem deploy se
  faltarem secrets — não quebra CI.
- **GitHub Pages** (backup): `.github/workflows/deploy-pages.yml` —
  já roda automático em push pra `main`. URL em `/beija/`.

Sem Supabase configurado, o app renderiza `MissingConfigScreen` com
instruções amigáveis em vez de tela branca.

---

## Native build (iOS / Android)

```bash
cd frontend

# Build the web bundle
npm run build

# Sync into the native projects
npx cap sync

# Open Xcode (requires macOS)
npx cap open ios

# Or Android Studio
npx cap open android
```

In Xcode you'll need to:
1. Select a development team (App ID `io.beija.app`)
2. Enable capabilities: Sign in with Apple, Push Notifications, Location When in Use
3. Configure URL types for OAuth callbacks
4. Build & run on a device or simulator

Step-by-step walkthrough: `docs/DEPLOYMENT.md`.

---

## Play Store release (Android)

The Android track can proceed **independently of Apple Dev**. Full walkthrough in `docs/DEPLOYMENT_ANDROID.md`. Quick version:

```bash
# 1) Generate an upload keystore (one-time, store securely):
keytool -genkey -v -keystore ~/keystores/beija-upload.jks \
  -alias upload -keyalg RSA -keysize 2048 -validity 25000

# 2) Export the keystore env vars
export BEIJA_KEYSTORE_PATH=~/keystores/beija-upload.jks
export BEIJA_KEYSTORE_PASSWORD=...
export BEIJA_KEY_ALIAS=upload
export BEIJA_KEY_PASSWORD=...

# 3) Build the release AAB
cd frontend
npm run build && npx cap sync android
cd android && ./gradlew bundleRelease
# → app/build/outputs/bundle/release/app-release.aab

# 4) Upload to Play Console → Testing → Internal testing → Create release
```

CI workflow: `.github/workflows/release-play.yml` (manual trigger).
Listing copy: `PlayStoreMetadata.md`.

---

## TestFlight release

Currently a skeleton (`.github/workflows/release-testflight.yml` + `fastlane/Fastfile`). To enable:

1. Provision an App Store Connect API key (.p8)
2. Add the secrets listed at the top of `release-testflight.yml`
3. Uncomment the fastlane steps
4. Manually trigger the workflow via the Actions tab

For local dry-runs:

```bash
cd fastlane
bundle install
bundle exec fastlane beta
```

---

## CI

`.github/workflows/ci.yml` roda em push/PR pra `main`:

- **lint:** ESLint (max-warnings 0) + `tsc --noEmit`
- **build:** `npm run build` + uploads `dist/` artifact + reports bundle sizes
- **test:** placeholder (vitest TBD)
- **a11y:** `npm run audit:a11y` (axe-core via jsdom)
- **android-debug:** `npx cap sync android` + `./gradlew assembleDebug` com SDK 36 instalado on-demand via `android-actions/setup-android@v3` + cache de gradle

Workflows secundários (não bloqueantes): `lighthouse.yml` (Performance/A11y/SEO scores), `release-play.yml` (Play Store AAB, manual), `release-testflight.yml` (iOS skeleton), `deploy-pages.yml` (GitHub Pages), `process-deletions.yml` (cron diário).

Detalhes, comandos pra rodar local, troubleshooting do Android build,
secrets necessários: **[docs/CI.md](docs/CI.md)**.

---

## Contributing

1. Branch from `main`: `git checkout -b feature/<short-name>`
2. Make changes, make sure `tsc --noEmit` and `npx eslint .` are clean
3. Commit using imperative mood: `feat(scope): description`
4. Push and open a PR. CI must pass before merge.

Style conventions:
- TypeScript strict mode; never use `any` unless explicitly justified
- One component per file under `components/<Group>/<Name>.tsx`
- Prefer functional components + hooks; class components only for ErrorBoundary
- All user-facing strings in PT-BR (i18n is a future task)
- Avoid inline magic numbers — use `lib/constants.ts`

---

## Internationalization

`react-i18next` com PT-BR como source-of-truth + EN placeholder traduzido.
9 namespaces (`common`, `auth`, `swipe`, `matches`, `chat`, `settings`,
`profile`, `moderation`, `errors`) em `src/i18n/locales/{pt-BR,en}/*.json`.
Detecção localStorage → navigator → fallback `pt-BR`.

Language picker em Settings → Idioma. Persiste em `profiles.locale` (DB) +
`localStorage` (instant). Edge functions futuras lêem `profiles.locale`
pra notificações localizadas.

Setup, convenções de chave, status de migração das strings, como adicionar
novo idioma: **[docs/I18N.md](docs/I18N.md)**.

---

## Accessibility

WCAG AA validado via `eslint-plugin-jsx-a11y` (0 warnings) + axe-core smoke
em CI + manual axe DevTools por rota. Skip-link, `:focus-visible`, focus
traps em modais, `aria-live` no StackDeck pra anunciar swipes/matches,
respeita `prefers-reduced-motion`. Touch targets 44×44px (chips 32×32).

Audit local: `cd frontend && npm run audit:a11y` (axe-core smoke).
Procedimento completo + checklist WCAG: **[docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md)**.

---

## Observability

Sentry (errors + session replay com PII mascarado) + PostHog (funil
`abrir app → swipe → match → mensagem`) + web-vitals (LCP/INP/CLS/FCP/TTFB).

- Frontend SDKs em `src/lib/{sentry,analytics,vitals}.ts`.
- Edge functions wrappadas via `supabase/functions/_shared/sentry.ts`.
- Opt-out LGPD-compliance em Settings → Privacidade
  (`profiles.allow_analytics`).
- Eventos, sample rates, setup e custos: **[docs/OBSERVABILITY.md](docs/OBSERVABILITY.md)**.

Tudo fail-safe — sem keys, no-op. Dev local funciona sem qualquer config.

---

## Compliance

App Store / Google Play exigem tooling de moderação + privacy controls
para apps com user-generated content (Apple Guideline 1.2 + 5.1.x).

**Privacy — defesa em profundidade**: filtros server-side via RPCs
`get_profile_safe` / `get_profiles_safe` / `find_potential_matches`
mascaram `birthdate` e `distance_km` antes do dado sair do banco. Cliente
recebe payload sanitizado — abrir DevTools não revela campos opt-out.
Detalhes + threat model + roteiro de validação SQL:
**[docs/PRIVACY.md](docs/PRIVACY.md)**.

**Pipeline two-stage de moderação de fotos**:
- **Pre-upload** (client → edge fn `moderate_photo`) via **Sightengine**.
  Bloqueia nudez explícita, suspeita de menor, gore, armas, drogas,
  golpes e símbolos de ódio antes de o arquivo chegar ao storage.
- **Post-upload** (storage webhook → edge fn `photo_moderation_hook`)
  via **OpenAI omni-moderation**. Quarentena + report automático.

Detalhes técnicos + thresholds + roteiro de teste pro Apple Review:
**[docs/PHOTO_MODERATION.md](docs/PHOTO_MODERATION.md)**.

Diretrizes públicas exibidas no app (rota `/community-guidelines`):
[`frontend/src/pages/CommunityGuidelines.md`](frontend/src/pages/CommunityGuidelines.md).

Outras superfícies de safety: **report** (`ReportModal`), **block**
(`BlockButton`), **delete account com janela de 30 dias** (`DeleteAccountFlow`
+ cron `process_pending_deletions`).

---

## License

Proprietary. © 2026 Beija Tecnologia Ltda. All rights reserved.
