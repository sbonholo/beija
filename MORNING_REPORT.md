# Beija — Overnight Work Report

**Date:** 2026-05-24
**Branch:** `migrations-schema` ([PR #1](https://github.com/sbonholo/beija/pull/1))

---

## Numbers

- **27 commits** on this branch
- **+14,708 / −3,722 lines** across **149 files**
- **14 phases** (A through N) executed end-to-end
- **0 TypeScript errors**, **0 ESLint errors / warnings**, **0 critical npm vulns**
- **Main JS bundle:** 131 KB gzip (down 24% from start of audit)
- **Build:** green

---

## All phases at a glance

| Phase | Theme | Key commits |
|---|---|---|
| A | Initial SQL schema (event-based, later superseded) | `fa92984`, `a01db2d` |
| B | Capacitor init + iOS/Android scaffolds | `23158e9`, `015ed06` |
| C | Supabase client lib + auth + storage + push wrappers | `fd205b8` |
| D | Schema rewrite (swipe-based) + RLS + PostGIS matching | `46f6146`, `519d09e` |
| — | Auth + Onboarding + ProfileSetup screens | `4bd64c8`, `93b1bdc` |
| — | Discovery (SwipeCard, StackDeck, MatchModal, interests col) | `ef2abd8` |
| E | Compliance (Block, Report, Delete, Privacy, Terms, App Store metadata) | `cb2ec82` |
| F | Backend Supabase adapter + SQLite migration plan | `a32c4c0` |
| G | Realtime chat + full app route wiring + legacy cleanup | `870383f` |
| H | Geolocation hook + Discovery filters + location RPC | `e45605f` |
| I | Audit + bundle code-split + memo + skeletons + SW + SEO | `9cc10a3`, `a6754a8`, `871df55`, `33ced94`, `c5d8b19`, `7728d67`, `103a1b7` |
| J | Test scenarios + 8 bug fixes | `244a0fb` |
| K | Click flow analysis + UX optimizations | `0e74cf6` |
| L | App Store assets spec + icon design spec | `be7f1b5` |
| M | CI workflow + TestFlight skeleton + README + .env.example | `6e9c3be` |
| N | ARCHITECTURE.md + API.md + DEPLOYMENT.md + this report | (current) |

---

## Functional state

The app boots into a fully reactive Tinder-style flow:

1. `/` → splash 1.5s → router decides:
   - No session → `/signin`
   - Session + incomplete profile → `/onboarding`
   - Session + complete profile → last visited tab (`/discover` by default)
2. **Sign in:** Apple or Google via Capacitor plugins → Supabase `signInWithIdToken`
3. **Onboarding:** 3 steps with auto-advance, photo required, age self-declared ≥18 → upsert `profiles` + upload photo
4. **Discover:** `find_potential_matches` RPC with PostGIS distance + mutual gender + age + exclusions → SwipeCard with NOPE/LIKE peek + photo carousel + swipe-up bio reveal
5. **Match:** mutual swipe trigger creates `matches` row → MatchModal with confetti + 1-tap "Enviar mensagem"
6. **Chat:** Realtime subscription on `messages` INSERT/UPDATE + presence for typing + read receipts + long-press copy/delete
7. **Profile editing:** 6 photo slots + bio + interests chips + age/distance sliders → upsert
8. **Moderation:** Report (6 reasons + auto-block + match removal) and Block buttons in chat menu
9. **Account deletion:** 3-step flow with 30-day cooldown + soft-delete + reactivation window
10. **Privacy / Terms:** /privacy and /terms render Markdown documents lazy-loaded

Bottom nav (Discover / Matches / Perfil) with active-tab gradient bar + live unread badge.

---

## What's outside the diff (still TODO)

### Blocking App Store submission
- [ ] **Apple Developer account** activation (`$99/yr`, 24–48h)
- [ ] **Supabase project** created + `supabase db push` run
- [ ] **Apple Sign In** configured in Supabase + Apple Dev (Services ID, Key, Team ID)
- [ ] **Google OAuth** clients created (iOS + Web) + put into Supabase + `.env.local`
- [ ] **APNs key** uploaded for push notifications
- [ ] **Icon master 1024×1024** designed and slotted in (see `ICON_DESIGN.md`)
- [ ] **5 App Store screenshots** captured (see `ASSETS_SPEC.md` § 5)
- [ ] **In-Xcode capabilities** (Sign in with Apple, Push, Location) + Info.plist usage strings (PT-BR) — see `docs/DEPLOYMENT.md` § 5

### Non-blocking (post-launch backlog)
- Reactivation UI for users who sign in within 30 days of deletion
- Edge functions for push fan-out + deletion confirmation email
- Cron job that hard-deletes expired `deletion_requests`
- Photo NSFW moderation hook (Sightengine or similar)
- Sentry / Crashlytics
- Vitest unit tests (skeleton CI job exists, no tests yet)
- Internationalization (currently PT-BR hard-coded)

---

## Time to first TestFlight

Assuming credentials in hand and one designer-day for the icon + first screenshot:

- Supabase project + migrations + OAuth providers: **half day**
- Xcode capabilities + Info.plist + first archive: **half day**
- Upload to TestFlight + invite internal testers: **30 min**

**Realistic: 1–2 calendar days from "ready to push" to "external TestFlight invite landing in inboxes"**.

---

## How to retake the work

```bash
cd ~/dev   # or wherever
git clone https://github.com/sbonholo/beija.git
cd beija
git checkout migrations-schema

# Frontend
cd frontend
npm install --legacy-peer-deps
cp .env.example .env.local
# fill in VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY + Google client ids
npm run dev   # http://localhost:5173

# Supabase
cd ..
supabase login
supabase link --project-ref <ref>
supabase db push

# iOS (macOS only)
cd frontend
npm run build
npx cap sync ios
npx cap open ios   # configure signing + capabilities in Xcode
```

Detailed walkthroughs:
- `README.md` — quick start
- `docs/ARCHITECTURE.md` — how everything fits
- `docs/API.md` — tables, RPCs, channels
- `docs/DEPLOYMENT.md` — Apple + Google + Supabase setup
- `ASSETS_SPEC.md` — what designer needs to produce
- `AppStoreMetadata.md` — App Store Connect copy fields
- `TEST_SCENARIOS.md` — manual test plan
- `CLICK_FLOW_ANALYSIS.md` — tap counts vs benchmarks

---

## Open PR

[PR #1 — migrations-schema](https://github.com/sbonholo/beija/pull/1) — ready to merge once you review.

Everything in this report lives on that branch. Force-pushes were used during cleanup (commit `fd205b8` rewrote the auto-committed `3de9600`) but the branch has been stable since.
