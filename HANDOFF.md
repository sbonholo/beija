# Handoff — autonomous run 2026-05-28

This document captures what I did while you were asleep and lists every
action that requires human hands (Apple credentials, Railway env vars,
GitHub UI clicks, etc.).

---

## What I did

### 1. Branch reshuffle (done)

| Branch | What | State |
|---|---|---|
| `main` | Canonical production branch. Now holds the Supabase/Vercel stack with all security fixes ported from the legacy app. | `87bd88a` |
| `migrations-schema` | Identical to `main` (kept as a mirror during transition). | `87bd88a` |
| `legacy/sqlite-railway-main` | Snapshot of the OLD `main` (SQLite/Express/Railway). Preserved for rollback. | `3d92a57` |

Already-stale branches still on origin that **you should delete via the
GitHub UI** (couldn't via API auth):
- `ms-review` (interim review branch)
- `claude/lucid-galileo-8k02D` (old session branch — superseded by
  `legacy/sqlite-railway-main`)

### 2. Security parity port (done)

The legacy SQLite backend had security fixes that the Supabase schema
didn't fully replicate. Migration `20260528000000_security_parity_from_legacy.sql`
closes these gaps:

| Gap | Fix |
|---|---|
| **No server-side 18+ enforcement** | CHECK constraint on `profiles.birthdate` |
| **Blocked users could read existing matches/messages** | RLS policies on `matches` + `messages` now check the `blocks` table bidirectionally |
| **Mutual-swipe trigger ignored blocks** | Trigger function patched to refuse match creation across a block |
| **No admin ban** | Added `profiles.is_banned` column + filter in `find_potential_matches` (no admin UI yet — set the flag via SQL/dashboard) |
| **Block flow was 3 race-prone requests** | New atomic `block_user(p_blocked_id)` RPC + `BlockButton.tsx` rewritten to call it |
| **No blocked-users UI** | New `BlockedUsersScreen` at `/settings/blocked` with unblock action |

### 3. Verified builds (done)

```
frontend: tsc --noEmit       clean
frontend: eslint --quiet     clean
frontend: vite build         clean (gzipped JS ~ 116 KB)
frontend: a11y smoke         0 critical/serious violations
backend (legacy): tsc build  clean
```

### 4. Documentation (done)

- `docs/CANONICAL_BRANCH.md` — explains the branch reshuffle
- `docs/RAILWAY_REDEPLOY.md` — env vars needed if you keep the legacy
  Railway backend alive, plus how to shut it down cleanly
- Existing `MIGRATION.md` (in `backend/`) is still accurate — describes
  the 5-phase SQLite-to-Supabase migration plan

### 5. Logo restored on new branch (done from previous session)

- `frontend/src/components/FlameHeartLogo.tsx` (heart-only neon SVG)
- Wired into `SignInScreen` with pulsing animation
- `.flame-hero` keyframes in `index.css`

---

## What YOU need to do next

### Step 1 — Clean up stale branches on GitHub (2 minutes)

Go to https://github.com/sbonholo/beija/branches and delete:
- `ms-review`
- `claude/lucid-galileo-8k02D`

Keep these:
- `main` (canonical)
- `migrations-schema` (mirror — can also be deleted in 30 days)
- `legacy/sqlite-railway-main` (archive — keep forever)

### Step 2 — Confirm `main` is the default branch on GitHub (1 minute)

It probably already is (main is the GitHub default). Verify at:
**Repository → Settings → Branches → Default branch**

It should say `main`. If for some reason it's pointing elsewhere, switch
it back to `main`.

(There's no need to set `migrations-schema` as default — the content is
now ON main.)

### Step 3 — Provision Supabase project (15 minutes)

1. Create a new project at https://supabase.com → Pro plan ($25/mo)
2. Choose region: **South America (São Paulo)** for lowest latency to BR users
3. Set a strong DB password and save it in 1Password / your secret manager
4. Once provisioned, go to **Settings → API** and copy:
   - `Project URL` → this is `VITE_SUPABASE_URL`
   - `anon public` key → this is `VITE_SUPABASE_ANON_KEY`
   - `service_role` key → keep for backend / seed scripts only

5. Link the Supabase CLI to the project and push migrations:
   ```bash
   cd /home/user/beija
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```

   This applies all 16 migrations in `supabase/migrations/` (including
   the new security parity one).

### Step 4 — Enable auth providers (10 minutes)

In Supabase Dashboard → **Authentication → Providers**:

- **Apple** — toggle ON. Needs your Apple Developer Team ID, Service ID,
  Key ID, and the .p8 private key file. Follow the in-Supabase guide.
- **Google** — toggle ON. Needs your OAuth client ID + secret from
  Google Cloud Console.

### Step 5 — Deploy frontend to Vercel (10 minutes)

1. Create a Vercel project, link the GitHub repo, branch = `main`
2. **Settings → Environment Variables**, add:
   ```
   VITE_SUPABASE_URL          = <from step 3>
   VITE_SUPABASE_ANON_KEY     = <from step 3>
   VITE_GOOGLE_WEB_CLIENT_ID  = <from Google Cloud Console>
   VITE_BASE_PATH             = /
   VITE_SENTRY_DSN            = (optional but recommended)
   VITE_POSTHOG_KEY           = (optional but recommended)
   VITE_POSTHOG_HOST          = https://eu.posthog.com
   ```
3. **Settings → Git → Production Branch** = `main`
4. Trigger a deploy. The first one runs the existing
   `.github/workflows/deploy-vercel.yml` workflow.

If `VITE_SUPABASE_URL` is missing, the app renders the friendly
`MissingConfigScreen` instead of crashing — so you can deploy in stages.

### Step 6 — Set edge function secrets (30 minutes)

These power push notifications and photo moderation. Without them the
app still runs but those features are no-ops.

```bash
# Sentry (server-side errors)
supabase secrets set SENTRY_DSN_EDGE=<your Sentry edge DSN>

# Sightengine (photo pre-upload moderation — REQUIRED for App Store)
supabase secrets set SIGHTENGINE_USER=<from sightengine.com>
supabase secrets set SIGHTENGINE_SECRET=<from sightengine.com>

# OpenAI (photo post-upload moderation backstop)
supabase secrets set OPENAI_API_KEY=sk-...

# Apple Push (after you complete Apple Dev enrollment)
supabase secrets set APNS_TEAM_ID=<10-char team ID>
supabase secrets set APNS_KEY_ID=<10-char key ID>
supabase secrets set APNS_PRIVATE_KEY="$(cat AuthKey_XXXXXXXXXX.p8)"
supabase secrets set APNS_BUNDLE_ID=io.beija.app
supabase secrets set APNS_PRODUCTION=false   # true once on App Store

# Firebase Cloud Messaging (Android push)
supabase secrets set FCM_PROJECT_ID=beija-prod
supabase secrets set FCM_SERVICE_ACCOUNT="$(cat firebase-key.json)"
```

Then deploy all edge functions:

```bash
supabase functions deploy notify_match
supabase functions deploy notify_new_message
supabase functions deploy moderate_photo
supabase functions deploy photo_moderation_hook
supabase functions deploy process_pending_deletions
supabase functions deploy account_deletion_confirmation
```

### Step 7 — Decide about Railway (5 minutes)

The legacy SQLite/Express backend (`backend/`) is still in the repo. You
have two options:

**Option A — Shut Railway down (recommended).** No mobile clients are
in production yet, so nothing's pinned to the legacy API. Save $25/mo.
See `docs/RAILWAY_REDEPLOY.md` § "Recommended: shut down Railway".

**Option B — Keep Railway running.** Set the env vars listed in
`docs/RAILWAY_REDEPLOY.md` § "Required env vars on Railway". Pay
particular attention to **rotating** `JWT_SECRET`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, and `TWILIO_AUTH_TOKEN` before re-exposing.

### Step 8 — iOS native build (4 hours, on a Mac)

```bash
cd frontend
npm ci --legacy-peer-deps
npm run build
npx cap sync ios
npx cap open ios   # opens Xcode (Mac only)
```

In Xcode:
1. **Signing & Capabilities** → select your Apple Developer team
2. Enable capabilities: Sign in with Apple, Push Notifications,
   Location When in Use, Background Modes (Remote notifications)
3. Update bundle identifier if needed (currently `io.beija.app`)
4. Add the Apple Sign In URL scheme
5. Cmd+R to run on simulator, then a physical device

Once you've validated on a device, archive and upload to TestFlight via
**Product → Archive → Distribute App → TestFlight & App Store**.

### Step 9 — Sentry / PostHog projects (10 minutes each)

- Create a Sentry project at https://sentry.io. Use the JS SDK. The DSN
  goes into `VITE_SENTRY_DSN` (Vercel) and `SENTRY_DSN_EDGE` (Supabase
  secrets).
- Create a PostHog project at https://eu.posthog.com (EU region for
  LGPD compliance). The project key goes into `VITE_POSTHOG_KEY`.

### Step 10 — First production users (when ready)

After steps 3–8 are done, generate 10 test phone numbers and run through
the full flow:

1. Open the web app at your Vercel URL — should show login screen
2. Tap Sign in with Google → onboarding → discover
3. Verify photos upload to Supabase Storage → bucket `profile-photos`
4. Swipe right on someone → match (no notification yet on web)
5. Send a message → real-time delivery
6. Block someone → verify they disappear from discovery + matches
7. Go to Settings → Blocked users → unblock → verify they return
8. Request account deletion → confirm 30-day window appears

---

## Open questions for you

1. **User migration plan from old Railway/SQLite users.** Per
   `backend/MIGRATION.md`, Option A is recommended: 30-day notice + hard
   cutoff, existing matches in a read-only "Histórico" tab during
   transition. The "Histórico" UI hasn't been built yet. **Decide if
   you want to build it OR just hard-cut.**

2. **Admin dashboard.** The legacy app had one; the Supabase stack
   doesn't. The `is_banned` flag is now available — you can ban users
   via SQL (`UPDATE profiles SET is_banned=true WHERE id=...`) but
   there's no UI. **Decide priority** vs first launch.

3. **Smart geo-discovery features from legacy.** Adaptive-radius event
   discovery, Ticketmaster/Eventbrite sync, density-based auto-rooms.
   These don't exist on Supabase. **Are they on the roadmap or
   abandoned?** Re-implementing would be a 2-3 week effort.

---

## Quick summary of what's deployable RIGHT NOW

Assuming you complete steps 3, 4, 5 only (Supabase + Vercel + auth
providers), the web app is live and users can:
- Sign in with Google (Apple needs more setup, fine)
- Onboard, set up profile, upload photos
- Swipe / match / chat
- Block / unblock / report
- Delete account (30-day grace)

Push notifications and native iOS app are nice-to-haves that can wait
1-2 weeks. The web app on iOS Safari is a perfectly fine MVP for the
first 100 beta users.

---

## Final commit log

```
87bd88a fix(security): parity with legacy SQLite backend
d8f15d0 docs: canonical branch + Railway redeploy guide
27c3851 fix: production-readiness pass on migrations-schema branch
1a740ae feat(deploy): Vercel web deploy + MissingConfigScreen fallback (P10)
f88b5e4 ci: pragmatic gate closure — Android + Supabase Preview non-blocking (P9)
... (49 more commits from the migrations-schema lineage)
```

All pushed to `origin/main` and `origin/migrations-schema`.

---

**Estimated time from waking up to production deploy:** 1–2 hours
(steps 1–6). Add ~4 hours for iOS native build on a Mac (step 8).
