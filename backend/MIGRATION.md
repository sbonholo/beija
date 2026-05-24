# Backend Migration Plan: SQLite → Supabase

Current state: the Express + SQLite backend implements the **events-based** model (users with phone, events, reactions, event-anchored matches). The Supabase schema implements the **swipe-based** model (profiles, swipes, matches, messages, blocks, reports, deletion_requests).

These two data models do not overlap directly. This document describes how to migrate without losing service availability and without an irreversible commitment.

---

## Goals

1. **Zero downtime** during cutover.
2. **Reversible at any stage** until the SQLite shutdown step.
3. **Audit trail** preserved (reports, blocks, deletion requests).
4. **Idempotent** — re-runnable steps in case of partial failure.

## Constraints

- Existing users on SQLite have phone-based auth. New users on Supabase use Apple/Google. **We will not auto-migrate accounts**; existing users sign in again via the new providers on first launch of the new client.
- The events/reactions model is deprecated. Existing matches in SQLite will be exported for historical access only — they will not be re-created in Supabase.

---

## Phases

### Phase 0 — Adapter is in place ✅

`backend/src/supabaseAdapter.ts` exposes admin-level Supabase access for moderation, deletion, and cross-user queries that the client cannot do under RLS.

### Phase 1 — Dual-write (NEW writes go to both stores)

Goal: keep SQLite as primary read, write to Supabase shadow in parallel. If Supabase write fails, log but do not block the SQLite write.

Affected endpoints:

| Endpoint | SQLite action | Supabase shadow write |
|---|---|---|
| `POST /api/profile/me` | upsert into `users` (SQLite) | upsert into `profiles` (Supabase) |
| `POST /api/profile/me/photo` | update `users.photo_url` | upload to Storage bucket + insert `photos(slot=0)` |
| `POST /api/reactions` | insert into `reactions` | insert into `swipes` with mapped direction (kiss/heart/fire → 'right') |
| `POST /api/matches/:id/messages` | insert into `messages` (SQLite) | insert into `messages` (Supabase) — only if the match exists in Supabase |

Implementation sketch:

```ts
// inside each route handler
import { db } from './db.js';
import { getSupabaseAdmin } from './supabaseAdapter.js';

router.post('/profile/me', async (req, res) => {
  // 1) primary: SQLite (synchronous)
  db.prepare('UPDATE users SET nickname = ?, bio = ? WHERE id = ?')
    .run(req.body.nickname, req.body.bio, req.user.id);

  // 2) shadow: Supabase (best-effort, non-blocking)
  getSupabaseAdmin()
    .from('profiles')
    .upsert({ id: req.user.id, name: req.body.nickname, bio: req.body.bio })
    .then((r) => {
      if (r.error) console.warn('[shadow] profile shadow write failed:', r.error);
    });

  res.json({ user: /* ... */ });
});
```

**Exit criteria:** Dual-write running stable for 14 days with <0.1% shadow write failures.

### Phase 2 — Backfill historical data

Run a one-shot script that:

1. Reads all `users` from SQLite where `nickname IS NOT NULL`.
2. For each user, ensures a corresponding `profiles` row exists in Supabase (mapping phone → bridge identifier — see "Identity bridge" below).
3. Reads all `reactions` from the last 30 days; creates corresponding `swipes` in Supabase.
4. Reads all live `matches` (both users still active); creates corresponding `matches` in Supabase via the trigger (insert mutual swipes, trigger creates the match).
5. Skips messages — chat history is not migrated; new chats start fresh in Supabase.

The script is idempotent: it uses `upsert` and `on conflict do nothing` everywhere.

**Exit criteria:** Spot-check on 50 random users confirms parity between SQLite and Supabase profile core fields.

### Phase 3 — Read switch

Flip a feature flag (`READ_FROM_SUPABASE=true`) per endpoint, starting with the lowest-risk reads:

1. `GET /api/profile/me` — read from Supabase
2. `GET /api/events/:id/people` — replaced by `find_potential_matches` RPC (different shape; client must already support both)
3. `GET /api/matches` — read from Supabase via `getMatchedUsers`
4. `GET /api/matches/:id/messages` — read from Supabase

Keep writing to both for safety. Roll back at any read switch if errors spike.

**Exit criteria:** 7 days of reads from Supabase with parity in business metrics (matches/day, messages/day, DAU).

### Phase 4 — Stop writing to SQLite

Single-write to Supabase. SQLite is read-only from this point.

**Exit criteria:** 14 days of single-write with no manual SQLite touch needed.

### Phase 5 — Decommission SQLite

1. Final dump to S3 for legal retention (LGPD: 5 years for reports/audit).
2. Stop the Express server processes that depend on SQLite.
3. Migrate any remaining endpoints to call Supabase directly.
4. Delete the SQLite file.

---

## Identity bridge

Existing SQLite users authenticated via phone OTP. New Supabase users via Apple/Google. **They are different identity systems.**

Two options:

### Option A — Hard cutoff (recommended)
- Notify existing users 30 days in advance via push and email.
- New version forces re-signup with Apple/Google.
- Existing matches/messages displayed in a "Histórico" tab (read-only, served from SQLite during transition).
- After Phase 5, "Histórico" tab is removed.

**Pros:** Clean, no risky identity mapping. Reduces compliance surface (we don't store phone numbers in the new schema).
**Cons:** Some users won't migrate, some matches will be lost in the experience.

### Option B — Identity bridge table
- Add `auth_bridges` table mapping `phone_hash → auth.users.id`.
- On first successful Apple/Google login, ask user to confirm their old phone number for migration.
- If verified (OTP to old number), associate the new auth.uid with the SQLite user_id; copy profile fields over.
- Complex, error-prone, and requires keeping phone OTP infrastructure alive longer.

We are recommending **Option A** unless retention metrics show major loss.

---

## Reactions ↔ swipes mapping

In the legacy model, a "reaction" is one of `kiss | heart | fire`. In the new model, a "swipe" is `left | right | super`.

| Legacy | New | Rationale |
|---|---|---|
| `kiss` | `right` | Equivalent positive signal |
| `heart` | `right` | Equivalent positive signal |
| `fire` | `super` | Strongest signal → super-like |
| (no reaction) | `left` | Implicit pass — only generate on backfill if user spent >X seconds viewing without reacting (unreliable; skip) |

Backfill only generates `right` and `super` from reactions. We do not infer `left` swipes.

---

## Rollback plan per phase

- **Phase 1:** disable shadow writes via feature flag, no data loss.
- **Phase 2:** Supabase backfill is idempotent; running the script again with different params is safe. If the backfill is bad, truncate the Supabase tables and re-run.
- **Phase 3:** flip feature flag back; SQLite reads resume immediately.
- **Phase 4:** flip the SQLite writes back on; some Supabase-only data may be lost going forward, but no historical loss.
- **Phase 5:** restore from S3 dump within 24h.

---

## Open questions

1. **Photo storage:** existing photos live in `backend/uploads/` (multer). Need to migrate to Supabase Storage bucket `profile-photos`. Plan: backfill script downloads from URL, re-uploads to Supabase Storage under `userId/0.jpg`.
2. **Push tokens:** SQLite doesn't store push tokens (legacy uses sockets). Supabase has `profiles.push_token`. No migration needed — clients will register fresh.
3. **Events model:** the events/people-at-event flow is dead in the new schema. Either re-introduce as a future feature on top of Supabase, or accept that this functionality is gone post-migration.

---

## Owner

- Backend migration: TBD
- Data engineering / backfill: TBD
- QA / parity checks: TBD

Updates to this document should land in PRs that change adapter behavior or migration steps.
