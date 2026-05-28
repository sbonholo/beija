# Canonical branch + production stack

**As of 2026-05-28**, `main` is the **Supabase/Postgres + Vercel** stack. The
legacy SQLite/Express/Railway stack has been archived to
`legacy/sqlite-railway-main`.

## Branch map

| Branch | Purpose | Status |
|---|---|---|
| `main` | Canonical production branch. Supabase + Capacitor + Vercel. | Active |
| `migrations-schema` | Same content as `main` (kept as a mirror during transition). Will be deleted after 30-day cooling-off. | Mirror |
| `legacy/sqlite-railway-main` | Old SQLite/Express app. Preserved for historical reference + emergency rollback. | Archived, read-only |
| `claude/lucid-galileo-8k02D` | Old session branch, superseded. | Stale, delete-eligible |

## Why this happened

Two parallel development streams diverged from a common ancestor:
- One built features on the legacy SQLite/Express model (admin dashboard,
  events model, geo-discovery, neon UI, Capacitor scaffold).
- The other rewrote the backend to Supabase/Postgres + native Apple/Google
  auth + edge functions + observability + i18n + a11y.

For a 10K-user dating app, the Supabase stack is the better long-term
choice:

1. Managed Postgres with PITR, RLS, real-time, edge functions
2. Apple/Google native auth (App Store requires Sign in with Apple)
3. Push notifications already plumbed (APNs + FCM)
4. Two-stage photo moderation (Sightengine + OpenAI)
5. Sentry + PostHog + web-vitals already wired
6. WCAG AA + i18n (PT-BR/EN) already shipped
7. CI/CD + TestFlight skeleton already in place
8. LGPD-compliant deletion flow with 30-day grace period

The legacy main shipped first to Railway with SQLite. That deployment can
keep running until the new stack is fully live, but new feature work
should go to `main` only.

## Reading the legacy code

The old `main` is preserved at `legacy/sqlite-railway-main`. Useful for:

- **Security review:** what fixes were applied to the SQLite/Express app
  that need verifying in the Supabase RLS layer (see
  `docs/SECURITY_PARITY.md` for the audit).
- **Feature parity:** the legacy app had an admin dashboard, event model,
  smart geo-discovery (radius tiers, Ticketmaster/Eventbrite sync,
  density auto-rooms). The new app has none of these — they're product
  decisions to revisit.
- **Rollback:** in an emergency, you can re-deploy
  `legacy/sqlite-railway-main` to Railway without data migration (the
  SQLite volume on Railway still exists).

```bash
# Inspect the legacy code locally
git checkout legacy/sqlite-railway-main

# Return to the canonical branch
git checkout main
```
