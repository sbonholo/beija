# Architecture — Beija

End-to-end map of how the app is wired, who owns which data, and where each user interaction lands.

---

## 1. High-level

```
┌──────────────────────────────────────────────────────────────────┐
│                       Devices (users)                            │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────┐  │
│  │ iOS Capacitor│   │ Android Capac│   │ Web (PWA — GH Pages) │  │
│  └──────┬───────┘   └──────┬───────┘   └──────────┬───────────┘  │
└─────────┼──────────────────┼──────────────────────┼──────────────┘
          │                  │                      │
          ▼                  ▼                      ▼
       ┌───────────────────────────────────────────────────┐
       │              React SPA (Vite bundle)              │
       │  routes: /signin /onboarding /discover /matches   │
       │          /chat/:id /profile /settings/delete      │
       │          /privacy /terms                          │
       │  state: AuthContext (session) + UnreadContext     │
       │  realtime: supabase.channel('chat-{id}')          │
       └────────────────┬──────────────────────────────────┘
                        │ HTTPS + WSS
                        ▼
       ┌───────────────────────────────────────────────────┐
       │                    Supabase                       │
       │ ┌─────────────┐ ┌──────────────┐ ┌────────────┐   │
       │ │ Auth        │ │ Postgres 15  │ │ Storage    │   │
       │ │ (Apple,     │ │ + PostGIS    │ │ buckets    │   │
       │ │  Google)    │ │ + RLS        │ │ profile-   │   │
       │ │             │ │ + Triggers   │ │   photos   │   │
       │ └─────────────┘ └──────────────┘ └────────────┘   │
       │ ┌─────────────┐ ┌──────────────┐                  │
       │ │ Realtime    │ │ Edge         │                  │
       │ │ (postgres   │ │ Functions    │                  │
       │ │  changes +  │ │ (push fan-   │                  │
       │ │  presence)  │ │  out, email) │                  │
       │ └─────────────┘ └──────────────┘                  │
       └─────────────────────┬─────────────────────────────┘
                             │
                             ▼
                ┌──────────────────────────┐
                │ APNs (iOS) + FCM (Android)│
                │  for push notifications   │
                └──────────────────────────┘
```

Single Supabase project hosts auth, DB, storage, realtime, and edge functions. **No custom backend in production** — the legacy Express server in `backend/` is being decommissioned per `backend/MIGRATION.md`.

---

## 2. Auth flow

```
User taps "Continuar com Apple"
       │
       ▼
┌─────────────────────────────────────────┐
│ SignInScreen.handleSignIn('apple')      │
│   ├─ Capacitor.isNativePlatform()       │
│   ├─ native: SignInWithApple.authorize  │
│   └─ web:    supabase.auth.signInWithOAuth
└─────────────┬───────────────────────────┘
              │ returns identityToken
              ▼
┌─────────────────────────────────────────┐
│ supabase.auth.signInWithIdToken({       │
│   provider: 'apple',                    │
│   token: idToken,                       │
│ })                                      │
└─────────────┬───────────────────────────┘
              │ creates row in auth.users
              │ + emits 'SIGNED_IN' event
              ▼
┌─────────────────────────────────────────┐
│ AuthContext.onAuthStateChange listener  │
│   ├─ setSession(newSession)             │
│   └─ fetchProfileLite(user.id)          │
└─────────────┬───────────────────────────┘
              │ profile?.has_photo ?
       ┌──────┴──────┐
       ▼             ▼
   /discover    /onboarding
```

The session is persisted by `@supabase/supabase-js` in `localStorage` automatically. On reload, `AuthContext` reads it via `supabase.auth.getSession()`.

---

## 3. Onboarding flow

3 steps, 5 taps to enter `/discover`. See `CLICK_FLOW_ANALYSIS.md`.

```
Step 0: name + birthdate (auto-advance when both valid + age >= 18)
Step 1: gender + seeking chips (auto-advance after both selected)
Step 2: photo + bio (manual "Pronto, ver pessoas" button)
                │
                ▼
        upsert into profiles
        + upload Capacitor.Camera Base64 → Supabase Storage profile-photos/<userId>/0.jpg
        + insert into photos (user_id, slot=0, url)
                │
                ▼
            /discover
```

State is held in component memory; **no draft persistence across cold starts** (acceptable for v1, see `TEST_SCENARIOS.md` #3).

---

## 4. Discovery / swipe flow

```
/discover (StackDeck)
   │
   ▼ on mount + when deck < STACK_VISIBLE+1
┌────────────────────────────────────────────────────────────────┐
│ supabase.rpc('find_potential_matches', { p_user_id })           │
│   - PostGIS ST_DWithin filter by max_distance_km                │
│   - mutual gender & age range                                   │
│   - excludes: already-swiped, blocks (either direction),        │
│     pending/actioned reports, deleted profiles, self            │
│   - returns SETOF profiles (limit 100)                          │
└─────────────────────┬──────────────────────────────────────────┘
                      │
                      ▼
            For each profile in batch:
              - fetch photos (slot ASC) via separate SELECT
              - render in stacked deck (top 3 visible)
                      │
            User swipes left | right | super (or taps button)
                      │
                      ▼
┌────────────────────────────────────────────────────────────────┐
│ insert into swipes (swiper_id, swipee_id, direction)            │
│   - Trigger create_match_on_mutual_swipe checks for reverse     │
│     right/super swipe                                           │
│   - if found: insert into matches (user1_id = LEAST, user2_id = │
│     GREATEST) — UNIQUE prevents dupes                           │
└─────────────────────┬──────────────────────────────────────────┘
                      │
                      ▼ client polls matches table (5s window)
                  if new match → <MatchModal />
                  else → next card
```

`SwipeCard` is `React.memo`'d with a custom comparator that only re-renders on `id`, `stackIndex`, or `photos` change. The card itself uses pointer events + CSS transforms (translate3d + rotate) for animation.

---

## 5. Chat flow

```
/chat/:matchId (ChatScreen)
   │
   ▼ on mount
1. fetch match (verify user is participant)
2. fetch other user profile + slot-0 photo
3. fetch existing messages (where match_id = X, order by created_at)
4. mark unread received messages as read_at = now()
   │
   ▼ subscribe to channel `chat-${matchId}`
   │
   ├─ postgres_changes INSERT on messages → append to list, mark read
   ├─ postgres_changes UPDATE on messages → patch in place (deleted_at, read_at)
   └─ presence sync → derive other-user typing state
   │
   ▼ on send
1. insert into messages (sender_id, match_id, content)
2. optimistic local append (deduplicated by id on realtime echo)
3. invoke edge function 'notify_new_message' (best-effort, fire-and-forget)
   │
   ▼ on unmount
1. broadcast typing=false
2. untrack presence
3. removeChannel
```

Typing is throttled (800ms broadcast min interval) + auto-clears after 3s of no input.

---

## 6. Storage strategy

| What | Where |
|---|---|
| Profile metadata (name, gender, bio, location, preferences) | Postgres `profiles` table |
| Photos | Supabase Storage bucket `profile-photos`, path `<userId>/<slot>.jpg` (slot 0–5) |
| Photo metadata (URL, blur_hash) | Postgres `photos` table — joined client-side with profiles |
| Sessions / auth tokens | Browser localStorage (managed by supabase-js) |
| Push tokens | `profiles.push_token` (single token per user — last device wins) |
| Filter preferences | `profiles.{min_age, max_age, max_distance_km, interested_in}` + localStorage cache for instant hydration |
| Resume route | localStorage `beija_last_route` |
| Deletion requests | `deletion_requests` table — 30-day grace window |

The Storage bucket has RLS policies that match the Postgres-side `photos_insert_own` / `photos_update_own` rules.

---

## 7. Realtime strategy

Two distinct uses of Supabase Realtime:

| Channel | Purpose | Subscribed by | Lifecycle |
|---|---|---|---|
| `chat-{matchId}` | postgres_changes on `messages` for this match + presence (typing) | ChatScreen | mount → unmount |
| `unread-{userId}` | postgres_changes on `messages` globally (filtered client-side to user's matches) | UnreadProvider in `state/UnreadContext.tsx` | session lifetime |

Both leverage Postgres RLS — Realtime respects the same policies as direct queries, so users only see events for rows they could SELECT.

---

## 8. Privacy & compliance

| Concern | Handling |
|---|---|
| LGPD | Privacy policy at `/privacy`. Account deletion in-app with 30-day reactivation window. Data export not yet implemented (LGPD art. 18 IV — TODO). |
| Apple guideline 1.2 (UGC) | Report (`reports` table) + auto-block + 24h SLA messaging in modal. |
| Apple guideline 5.1.1(v) | In-app account deletion (`DeleteAccountFlow`) + `deletion_requests` table + soft-delete via `profiles.deleted_at`. |
| Apple guideline 4.8 (auth) | Sign in with Apple offered alongside Google. |
| GDPR (if expanding) | Compatible by virtue of LGPD compliance (similar regime) — add specific consent UX before EU launch. |
| Age verification | Self-declared 18+ checkbox + `birthdate` field. No identity verification (acceptable per current Apple guidance). |

---

## 9. Performance budget

| Metric | Target | Current (post Phase I) |
|---|---|---|
| Initial bundle (main JS, gzip) | < 200 KB | 131 KB ✅ |
| LCP (Largest Contentful Paint) | < 2.5 s | not measured yet |
| FID / INP | < 100 ms | not measured yet |
| Cold start to first interactive | < 3 s | not measured yet |

Code-split chunks (gzip): MarkdownPage 36 KB, OnboardingFlow 2 KB, DeleteAccountFlow 2 KB, PrivacyPage/TermsPage ~4 KB each.
