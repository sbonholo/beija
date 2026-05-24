# Beija

App de relacionamentos feito pra brasileiros. React + Capacitor 8 + Supabase.

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
- **Legacy Express backend:** `backend/` (event-based app) — being decommissioned per `backend/MIGRATION.md`

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
├── AUDIT_REPORT.md
├── BUGS_FOUND.md
├── CLICK_FLOW_ANALYSIS.md
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
- 8 tables: profiles, photos, swipes, matches, messages, reports, blocks, deletion_requests
- 2 RPCs: `find_potential_matches(uuid, int)`, `update_user_location(float, float)`
- Mutual-swipe → match trigger
- Row Level Security policies for all tables

Don't forget to enable the **Apple** and **Google** auth providers in the Supabase dashboard (`Authentication → Providers`) before users can sign in. See `docs/DEPLOYMENT.md`.

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

`.github/workflows/ci.yml` runs on every push and PR to `main`:

- **lint:** ESLint (max-warnings 0) + `tsc --noEmit`
- **build:** `npm run build` + uploads `dist/` artifact + reports bundle sizes
- **test:** placeholder (vitest TBD)

All three jobs run in parallel after `lint` succeeds.

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

## License

Proprietary. © 2026 Beija Tecnologia Ltda. All rights reserved.
