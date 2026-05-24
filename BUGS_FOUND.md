# Bugs Found — Manual Code Review

Reviewed the post-Phase-H codebase by reading every file under `frontend/src/`. Eight real bugs / fragilities identified. All fixed in this commit.

---

## Bug 1 — ChatScreen leaves "typing=true" presence on unmount

**File:** `src/components/Chat/ChatScreen.tsx`
**Symptom:** if the user is typing and navigates away (back, kill app, route change), the other user sees a stuck "digitando…" indicator until the presence channel times out (~30s+).
**Cause:** presence tracking is `typing: true` while typing, but the cleanup only does `supabase.removeChannel`. The remote presence state isn't explicitly cleared first.
**Fix:** before `removeChannel`, broadcast `typing: false` and untrack. Also clear any pending typing debounce.

## Bug 2 — AuthContext race condition on rapid signOut

**File:** `src/state/AuthContext.tsx`
**Symptom:** user signs out while `fetchProfileLite` is mid-flight → response sets `profile` after `signOut` cleared it → UI shows ghost profile until next state change.
**Cause:** `onAuthStateChange` calls `fetchProfileLite` async without checking if the session it was triggered for is still current.
**Fix:** track a "latest session ref" via `useRef`; ignore fetch responses for stale sessions.

## Bug 3 — OnboardingFlow auto-advance permanently disabled after first trigger

**File:** `src/components/Auth/OnboardingFlow.tsx`
**Symptom:** if user reaches step 1 (gender+seeking), goes back to step 0, then comes back to step 1, auto-advance never fires again — step 1 has no manual "Próximo" button, so user gets stuck.
**Cause:** `advancedFrom.current.add(step)` is permanent for the component lifecycle.
**Fix:** clear the flag for the destination step when going back.

## Bug 4 — BottomNav unread badge never updates

**File:** `src/components/BottomNav.tsx` + `src/state/UnreadContext.tsx`
**Symptom:** the red dot on the Matches tab is always 0 in the new (Supabase) flow. UnreadContext's `bump()` was only called from legacy socket listeners that no longer exist.
**Cause:** legacy UnreadContext wired to socket.io events that were removed.
**Fix:** drop the legacy UnreadContext code path; compute unread count via a single Supabase query on app load + subscribe to INSERT on `messages` for any of the user's matches. Update badge reactively.

## Bug 5 — SwipeCard accessibility uses deprecated `clip` property

**File:** `src/components/Discovery/SwipeCard.tsx`
**Symptom:** the visually-hidden alternative buttons (for screen readers) use `clip: rect(0 0 0 0)`, which Chrome/Firefox have deprecated. Eventually screen readers may stop seeing these.
**Fix:** use the modern `.sr-only` pattern (`clip-path: inset(50%)`, `width: 1px`, etc).

## Bug 6 — ChatScreen back button always goes to /matches

**File:** `src/components/Chat/ChatScreen.tsx`
**Symptom:** user matches on `/discover`, taps "Enviar mensagem" in MatchModal → arrives at `/chat/:id`. Tapping back goes to `/matches` instead of `/discover`, breaking the swipe rhythm.
**Cause:** hard-coded `nav('/matches')`.
**Fix:** use `nav(-1)` so the browser back behavior is respected. Falls back to `/matches` if there's no history (e.g. deep link).

## Bug 7 — `find_potential_matches` rpc may not include `interests` column

**File:** `supabase/migrations/20260524100000_add_interests.sql`
**Symptom:** the `interests` column was added in migration `..100000` but `find_potential_matches` was defined in `..000000` as `RETURNS SETOF profiles`. Postgres usually expands the row type at call time, but for schema-stable functions can cache. Safer to recreate the function after adding columns.
**Fix:** new migration `20260524300000_recreate_find_potential_matches.sql` that drops + recreates the function so its output schema includes the new column.

## Bug 8 — Photo slot count discrepancy: SwipeCard caps at 5, ProfileSetup allows 6

**File:** `src/components/Discovery/SwipeCard.tsx` (MAX_PHOTOS=5) vs `src/components/Auth/ProfileSetup.tsx` (TOTAL_SLOTS=6) and `src/lib/storage.ts` (MAX_SLOTS=6).
**Symptom:** if a user uploads 6 photos, the 6th is invisible in discovery cards.
**Cause:** inconsistent constants.
**Fix:** make `SwipeCard` show whatever exists up to the storage cap (6). Use the shared constant from `lib/constants.ts`.
