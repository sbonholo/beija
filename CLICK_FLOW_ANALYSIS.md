# Click Flow Analysis — Beija

Measuring the number of **taps** between intent and outcome on the six most-trafficked journeys, and comparing to publicly-documented baselines for benchmark dating apps. The goal is to land below benchmark on every flow that matters for activation and retention.

> "Tap" here = a single deliberate touch on an interactive element. Doesn't count typing characters, scroll, system permission dialogs, OAuth provider UI (those are outside our control).

---

## Journey A — Signup até primeiro swipe

**Target:** ≤ 5 taps.

| # | Step | Tap |
|---|---|---|
| 1 | App opens → splash → /signin lands | — |
| 2 | "Continuar com Apple" / "Continuar com Google" | **1** |
| 3 | (system OAuth UI — N/A) | — |
| 4 | Onboarding step 1: name + birthdate inputs (auto-advance) | typing only |
| 5 | Onboarding step 2: gender chip | **2** |
| 6 | Onboarding step 2: seeking chip (auto-advance) | **3** |
| 7 | Onboarding step 3: photo picker open | **4** |
| 8 | (system photo picker — N/A) | — |
| 9 | "Pronto, ver pessoas" button | **5** |
| 10 | Lands on /discover with top card visible — first swipe is on the card | (swipe = gesture, not a tap; counts as 0 separate taps) |

**Result:** **5 taps**, hits target. ✅

**Benchmark:** Tinder's onboarding is famously 9+ taps (Apple, name, birthdate-day, birthdate-month, birthdate-year, gender, show-me, photos, agree). Beija is roughly half. Wins via auto-advance on steps 1 + 2 and consolidating gender/seeking into one screen.

---

## Journey B — Swipe até primeiro match

**Target:** Variable (depends on people who already liked you). **App-side cost: 1 tap (or 1 swipe gesture) per profile.**

| # | Step | Tap |
|---|---|---|
| 1 | Swipe right OR tap heart button | **1** per profile |

**Result:** **1 tap per evaluation**, hits target. ✅

**Benchmark:** Tinder same (swipe is the universal pattern). Beija matches it. We don't add an "are you sure?" confirmation.

---

## Journey C — Match até primeira mensagem

**Target:** 1 tap (via match modal).

| # | Step | Tap |
|---|---|---|
| 1 | MatchModal opens automatically on mutual swipe | — |
| 2 | (Optional) edit the pre-filled "Oi {Nome}!" textarea | typing |
| 3 | "Enviar mensagem 💬" | **1** |

**Result:** **1 tap**, hits target. ✅

**Benchmark:** Tinder/Bumble: ~3 taps (close modal → go to matches → tap match → type → send). Beija collapses to 1 because the modal already has the textarea + send button inline.

---

## Journey D — App open recorrente até swipe

**Target:** 0 taps if already authenticated.

| # | Step | Tap |
|---|---|---|
| 1 | Cold open → splash 1.5s → RootRedirect resolves session → lands on /discover | — |
| 2 | Top card already rendered, ready to swipe | — |

**Result:** **0 taps**, hits target. ✅

**Improvement landing in this phase:** if last session was already on `/discover`, skip the splash redirect logic and just resume on `/discover`. (See "Remember last route" below.)

---

## Journey E — Editar profile

**Target:** 3 taps.

| # | Step | Tap |
|---|---|---|
| 1 | Bottom-nav "Perfil" | **1** |
| 2 | Edit field (e.g. tap chip to toggle interest) | **2** |
| 3 | "Salvar" | **3** |

**Result:** **3 taps**, hits target. ✅

(Editing a photo costs 1 extra tap: empty slot → system picker → confirm. That's a different sub-journey.)

---

## Journey F — Reportar usuário

**Target:** 4 taps.

| # | Step | Tap |
|---|---|---|
| 1 | In chat header (or profile sheet), tap ⋮ | **1** |
| 2 | Tap "Denunciar" | **2** |
| 3 | Tap a reason radio | **3** |
| 4 | "Enviar denúncia" | **4** |

**Result:** **4 taps**, hits target. ✅

Auto-block + match removal happen server-side — no extra taps needed.

---

## Improvements landed in this phase

1. **Remember-last-route on reopen** (Journey D): when the app cold-starts on an authenticated session, restore the route you were on (`/discover`, `/matches`, `/profile`) instead of always forcing `/discover`. Saved by writing `beija_last_route` to localStorage on every nav change.

2. **Filter persistence across sessions** (Journey D supporting): `DiscoveryFilters` reads + writes `profiles.{min_age, max_age, max_distance_km, interested_in}`. These now also cache to localStorage so the first deck load on a fresh session uses the user's last filter immediately, without waiting for a profile read round-trip.

3. **Match modal "Enviar mensagem" works without typing** (Journey C): the pre-filled "Oi {Nome}!" was already the default. Now if the user clears the textarea, the send button stays enabled with the pre-filled greeting — pure 1-tap path even after accidentally clearing.

4. **Skip confirmation on reactions** (Journey B): kept. We never added a confirmation dialog. This is on purpose.

5. **Bottom-nav routes preserve scroll position** (Journey E supporting): going Profile → Matches → back to Profile doesn't reset scroll. Achieved by mounting all 3 tab routes inside the persistent `TabLayout` — React Router keeps them in-memory.

---

## What we are NOT doing (and why)

- **Swipe-to-super-like (up gesture)**: keeping the explicit ⭐ button. Up-swipe collides with our existing swipe-up-to-reveal-bio. Discoverability is better with a visible button.
- **"Undo last swipe"**: deferred. Tinder gates it behind premium; without subscription tier, it's not a v1 priority.
- **Boost / spotlight buttons**: deferred to premium tier.
- **Skip the splash on cold start**: kept, since it doubles as a wait for session resume.

---

## Methodology note

We don't have telemetry yet, so these counts are theoretical from reading the code. When analytics ship (Phase L+), we should verify tap counts in the wild and update this doc.
