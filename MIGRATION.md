# MIGRATION.md — Architectural pivot: SQLite/Express/Railway → Supabase/Postgres/Vercel

> **One-line summary:** Beija moved off a self-hosted SQLite + Express + Socket.io
> backend on Railway to a managed Supabase (Postgres 15 + PostGIS) backend with a
> Vercel-hosted React/Capacitor frontend. This document records what changed, why,
> and how to recover the old code.

---

## (a) What changed

| Layer | Before (v0) | After (current) |
|---|---|---|
| Database | SQLite (WAL mode), single file | Supabase **Postgres 15 + PostGIS** |
| API | Express 4 REST + Socket.io | Supabase auto REST/Realtime + **Edge Functions** (Deno) |
| Auth | WhatsApp/SMS OTP (Twilio Verify) + JWT | Supabase Auth — **Sign in with Apple + Google** |
| Realtime | Socket.io (+ Redis adapter) | Supabase Realtime (`postgres_changes` + presence) |
| Photo storage | Cloudflare R2 | Supabase Storage (`profile-photos` bucket) |
| Hosting | **Railway** (backend), static frontend | **Vercel** (frontend) + Supabase (managed backend) |
| Product model | Event check-in + reactions | Swipe discovery **+ event-anchored kiss/heart/fire** (re-added 2026-05-28) |
| Mobile | PWA only | **Capacitor 8** iOS + Android shells |

---

## (b) Date of pivot

- **Pivot landed on `main`:** 2026-05-27
- **Old `main` (SQLite/Express/Railway) archived:** 2026-05-28
- **Event layer re-added on the new base:** 2026-05-28

---

## (c) Where the old code lives (recovery)

The pre-pivot codebase is **preserved and recoverable**:

| Ref | Points at | Notes |
|---|---|---|
| `archive/sqlite-railway-main` | `57c2795` | **PR #2 head** — last commit of the SQLite/Express/Railway lineage. Pushed to origin. |
| `legacy/sqlite-railway-main` | `3d92a57` | Pre-existing archive; a **descendant** of `57c2795` (same SQLite backend + a few extra commits incl. logo work). |
| tag `v0-sqlite-railway` | `3d92a57` | Annotated tag. **Created locally but the push to origin is blocked in the CI execution environment — push it manually (see checklist).** |

Recover the old stack at any time:

```bash
git fetch origin
git checkout archive/sqlite-railway-main   # full SQLite/Express/Railway tree
```

The legacy Express source also still exists in-tree under `backend/` on the current
`main` (deprecated, not deployed) with its own `backend/MIGRATION.md` describing the
original 5-phase SQLite→Supabase data migration plan.

---

## (d) Why we pivoted

The SQLite/Railway stack could not credibly carry the product to 10K users or
through App Store review. The managed stack closes these gaps:

1. **10K-user readiness** — Postgres + PgBouncer connection pooling and read
   scaling vs a single-writer SQLite file. PostGIS does proximity matching in the
   database instead of in app memory.
2. **Push notifications** — Edge Functions fan out APNs (iOS) + FCM (Android) on
   match / new-message events. The old stack had no push path.
3. **High availability** — managed Postgres with automated backups + PITR vs a
   single Railway container holding the only copy of the SQLite file.
4. **Observability** — Sentry (web + edge) and PostHog wired in; structured logs
   via Supabase. The old Express app had ad-hoc logging only.
5. **Photo moderation** — Sightengine pre-upload + OpenAI backstop via Edge
   Functions + storage hooks (App Store guideline 1.2 requirement).
6. **i18n** — full pt-BR / en namespaces (`react-i18next`), locale persisted per
   profile.
7. **Accessibility (a11y)** — axe-core smoke gate in CI, 0 critical/serious
   violations.
8. **PWA** — installable web app with service worker, offline shell, and a
   `MissingConfigScreen` fallback so a missing env var never white-screens.

---

## (e) What was ported from old `main` into the new base

Security and UX fixes that were architecture-agnostic were forward-ported
(see commit `87bd88a` and migration `20260528000000_security_parity_from_legacy.sql`):

- **Server-side 18+ enforcement** — `CHECK` constraint on `profiles.birthdate`.
- **Block enforcement on matches & messages** — bidirectional, block-aware RLS
  policies; mutual-swipe trigger refuses to materialize matches across a block.
- **Banned-user filtering** — `profiles.is_banned` column + filter in
  `find_potential_matches`.
- **Atomic `block_user(uuid)` RPC** — replaces the old race-prone 3-request flow.
- **Blocked-users management UI** — `/settings/blocked`.
- **Pulsing neon heart logo** — `FlameHeartLogo.tsx` + `.flame-hero` animation.
- **Event-anchored discovery (re-added)** — the original differentiator. New
  `events`, `check_ins`, `event_reactions` tables; mutual-kiss → match trigger;
  `get_nearby_events` / `get_event_attendees` RPCs; Eventos tab. See migration
  `20260528200000_events_layer.sql`.

---

## (f) Go-live checklist (summary)

Full copy-pasteable version lives in `HANDOFF.md`. High level:

1. **Supabase project** — create (region: South America / São Paulo), then
   `supabase link` + `supabase db push` to apply all migrations.
2. **Vercel** — import repo, set production branch = `main`, add env vars
   (see README + `docs/DEPLOY.md`), connect `beija.app` domain.
3. **Google OAuth** — client ID/secret in Supabase Auth → Providers.
4. **Sign in with Apple** — Team ID, Service ID, Key ID, `.p8` in Supabase Auth.
5. **Sentry** — `VITE_SENTRY_DSN` (web) + `SENTRY_DSN_EDGE` (edge functions).
6. **Sightengine** — `SIGHTENGINE_USER` / `SIGHTENGINE_SECRET` (photo moderation).
7. **Capacitor iOS** — `npx cap sync ios`, sign in Xcode, archive to TestFlight.
8. **APNs / FCM keys** — set as Supabase edge function secrets for push.

---

## (g) Railway status

- **Old Railway service ID:** `b03a5964-a6ce-4f08-bd7e-370bd2081e06`
- This service hosted the **old SQLite/Express backend** and is **no longer the
  canonical deployment.** The canonical backend is now Supabase.
- **Decision needed (pick one):**
  - **Shut it down** (recommended) — no production mobile clients are pinned to
    the old API, so nothing breaks. Saves the monthly cost. See
    `docs/RAILWAY_REDEPLOY.md` § "Recommended: shut down Railway".
  - **Repurpose** it as a relay/cron host for Supabase edge functions if you want
    a long-running worker outside Supabase's invocation model.
  - **Keep as-is** only if you still need the legacy API during a user-migration
    window — in which case **rotate all secrets** (`JWT_SECRET`, R2 keys, Twilio
    token) before re-exposing it. See `docs/RAILWAY_REDEPLOY.md`.

---

## Related docs

- `docs/CANONICAL_BRANCH.md` — branch reshuffle details
- `docs/RAILWAY_REDEPLOY.md` — Railway env vars / shutdown guide
- `backend/MIGRATION.md` — original SQLite→Supabase data migration plan
- `HANDOFF.md` — full ordered production go-live checklist
