# Beija — Test Scenarios

Manual / automated test plan for the 15 most important user journeys. Each scenario lists trigger, expected behavior, and the components / DB rows that should change.

---

## 1. Signup novo com Apple

**Setup:** localStorage clean, never logged in.
**Steps:** open app → splash → `/signin` → tap "Continuar com Apple" → grant Apple credentials.
**Expected:**
- Supabase auth.users row created
- App navigates to `/onboarding`
- `AuthContext.session` becomes non-null
- BottomNav not shown (onboarding has no nav)
**Failure mode to watch:** OAuth deep-link returns but supabase session is null → user stuck on signin screen.

## 2. Signup novo com Google

**Steps:** same as #1 but tap "Continuar com Google".
**Expected:**
- `@capgo/capacitor-social-login` returns id_token
- `supabase.auth.signInWithIdToken({ provider: 'google', token })` succeeds
- Same nav as Apple
**Failure mode:** missing `VITE_GOOGLE_IOS_CLIENT_ID` env → init fails silently → toast error.

## 3. Onboarding incompleto (sair no meio)

**Steps:** complete name + birthdate (auto-advance to step 1), select gender, **kill app**.
**Expected on reopen:**
- Session restored
- `hasProfile` is false (no photo, partial profile)
- RootRedirect sends to `/onboarding`
- OnboardingFlow starts from step 0 (state not persisted) — user re-enters
**Known limitation:** form state is not persisted across cold starts. Acceptable for v1.

## 4. Swipe 50 perfis sem match

**Setup:** seeded test data with 50 profiles in radius, none of which have swiped you.
**Steps:** swipe left/right alternating on 50 cards.
**Expected:**
- Each swipe inserts into `swipes` table
- StackDeck calls `find_potential_matches` rpc; refills deck when <= STACK_VISIBLE+1 left
- No MatchModal shown
- After 50 cards: empty state with "aumentar distância" hint
**Perf target:** each swipe gesture < 50ms perceived latency.

## 5. Match instantâneo (likes recíprocos)

**Setup:** seed user A has already swiped right on me.
**Steps:** swipe right on user A.
**Expected:**
- Insert into `swipes` (mine, direction='right')
- Trigger `create_match_on_mutual_swipe` fires, creates row in `matches`
- Client polls/queries matches table within 5s window → detects new match
- MatchModal opens with confetti + my photo + A's photo
- Channel `chat-{matchId}` ready (lazy)
**Failure mode:** if RPC returned A in the deck but trigger didn't fire fast enough, modal won't show. Acceptable: A will still appear in `/matches`.

## 6. Enviar primeira mensagem do match modal (1-tap)

**Steps:** within MatchModal, edit textarea (pre-filled "Oi {Nome}!") → tap "Enviar mensagem".
**Expected:**
- Insert into `messages` (sender_id=me, match_id=newMatch.id)
- Modal closes
- Navigate to `/chat/{matchId}`
- Edge function `notify_new_message` invoked (best-effort, swallows error)
- ChatScreen opens with the message already in the list (via realtime echo or local insert)

## 7. Chat com 100+ mensagens (performance)

**Setup:** open a chat with 100+ historical messages.
**Expected:**
- Initial load: single `select messages where match_id=...` → all rows
- Scroll-to-bottom on mount
- MessageBubble is memoized → only the new bubble re-renders on incoming message
- Typing indicator update doesn't re-render existing bubbles
**Perf target:** 60fps scroll, no jank.

## 8. Report + auto-block

**Steps:** on a chat or PersonSheet → ⋮ → Denunciar → pick reason → Enviar.
**Expected:**
- Insert into `reports`
- Insert into `blocks` (reporter ↔ reported)
- Delete mutual `swipes` rows
- Delete `matches` row if exists
- ReportModal shows success state with "Equipe respondera em ate 24h"
- `onReported` callback fires → navigate back to `/matches`
- Subsequent `find_potential_matches` excludes the reported user

## 9. Block manual

**Steps:** on a chat header → ⋮ → Bloquear → confirm.
**Expected:**
- Insert into `blocks`
- Delete mutual swipes
- Delete match
- Toast "Usuário bloqueado."
- Navigate to `/matches`

## 10. Delete account + reativar antes dos 30d

**Steps:**
- Settings → "Excluir conta" → 3 steps → confirm
- App signs out, returns to `/signin`
- Sign in again with same Apple/Google within 30 days
**Expected:**
- `deletion_requests` row exists with `cancelled_at = null` and `scheduled_for ~ 30d`
- `profiles.deleted_at` is set (non-null)
- On re-sign-in: AuthContext.hasProfile returns false (because `deleted_at` is non-null)
- Should redirect to a "reactivate?" flow — **NOT IMPLEMENTED YET**, current code just sends to `/onboarding` which would try to upsert with same id and conflict
**Known gap:** reactivation flow needs UI (set `cancelled_at = now()`, clear `deleted_at`).

## 11. Network offline e voltar

**Steps:** open chat, drop network, send a message, restore network.
**Expected:**
- Send fails → text restored to textarea
- User sees error toast (currently silent — gap)
- On restore: user retries manually, succeeds
**Known gap:** no automatic retry queue.

## 12. Foto upload >5MB (deve rejeitar)

**Steps:** ProfileSetup → tap empty slot → pick a photo >5MB.
**Expected:**
- `uploadProfilePhoto` throws `file_too_large`
- Caught in onAddPhoto → toast with error message
- Slot stays empty

## 13. Geolocation negada (fallback)

**Steps:** open app, deny location permission.
**Expected:**
- `useGeolocation` returns `{lat: null, lng: null, error: 'permission_or_unavailable'}`
- `update_user_location` rpc not called
- `find_potential_matches` rpc still works using profile's existing `location` if any
- If no prior location, the geo filter is bypassed (returns matches regardless of distance)

## 14. Notificação push em background

**Steps:** app in background → another user matches with you → APNs/FCM delivers push.
**Expected:**
- iOS shows banner with title "Match!" + body "{Nome}"
- Tap banner → app comes to foreground
- App routes to `/discover` (or `/chat/{matchId}` if data has matchId)
**Known gap:** edge functions to dispatch push not yet implemented.

## 15. Open app via deep link de notificação

**Steps:** tap a push notification with `data.matchId = "..."`.
**Expected:**
- `setupPushListeners` `onTap` callback receives payload
- App navigates to `/chat/{matchId}`
**Known gap:** push listener not yet wired in App.tsx — needs Phase L.

---

## How to run

Manual: follow each scenario on TestFlight build or `npm run dev` (web).

Automated (future):
- Playwright for E2E web flows (1–6, 8–12)
- Detox / Maestro for iOS native (14, 15)
- Unit tests for `useGeolocation`, `storage.ts` validation, `mockedApi` fakes
