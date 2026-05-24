# API Reference — Beija

Canonical reference for the data layer the client talks to. All persistence is Supabase; "API" here means tables, RPCs, storage buckets, realtime channels, and edge functions.

---

## Tables

All tables enable RLS. Default deny; specific policies grant access. See migrations for the policy bodies.

### `profiles`

1:1 with `auth.users`. Created on first sign-in via OnboardingFlow upsert.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | references `auth.users(id) on delete cascade` |
| `name` | text |  |
| `birthdate` | date |  |
| `gender` | text | check: woman / man / non-binary / other |
| `bio` | text |  |
| `location` | `geography(Point, 4326)` | written via `update_user_location` RPC |
| `city` | text |  |
| `interested_in` | text[] | array of gender values |
| `interests` | text[] | added in 20260524100000 |
| `min_age` | int | default 18, check >= 18 |
| `max_age` | int | default 99, check <= 120 |
| `max_distance_km` | int | default 50 |
| `push_token` | text | last APNs/FCM token |
| `last_active` | timestamptz | bumped by `update_user_location` |
| `deleted_at` | timestamptz | soft delete; non-null hides from app |
| `created_at` | timestamptz |  |

**Policies:** `select_undeleted` (anyone, where deleted_at is null), `insert_self`, `update_self`, `delete_self`.

### `photos`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK |  |
| `user_id` | uuid FK | references `profiles(id)` cascade |
| `slot` | int | check 0..5; unique per user |
| `url` | text | Supabase Storage public URL |
| `blur_hash` | text |  |
| `created_at` | timestamptz |  |

**Policies:** `select_all`, `insert_own`, `update_own`, `delete_own`.

### `swipes`

Append-only — `unique(swiper_id, swipee_id)` prevents re-swiping.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK |  |
| `swiper_id` | uuid FK |  |
| `swipee_id` | uuid FK |  |
| `direction` | text | check: left / right / super |
| `created_at` | timestamptz |  |

**Policies:** `select_own` (only my swipes), `insert_self`.

### `matches`

Created **only by trigger** `create_match_on_mutual_swipe`. No client-side insert policy.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK |  |
| `user1_id` | uuid FK | always the lexicographically smaller id |
| `user2_id` | uuid FK |  |
| `created_at` | timestamptz |  |
| `last_message_at` | timestamptz |  |

Check: `user1_id < user2_id`. Unique: `(user1_id, user2_id)`.

**Policies:** `select_participants`, `update_participants`.

### `messages`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK |  |
| `match_id` | uuid FK |  |
| `sender_id` | uuid FK |  |
| `content` | text | check len 1..2000 |
| `read_at` | timestamptz |  |
| `deleted_at` | timestamptz | soft delete |
| `created_at` | timestamptz |  |

**Policies:** `select_in_match`, `insert_as_sender`, `update_sender` (for editing read_at and soft-deleting own messages).

### `reports`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK |  |
| `reporter_id` | uuid FK |  |
| `reported_id` | uuid FK | check != reporter_id |
| `reason` | text | UI restricts to 6 enum values, DB accepts free text |
| `details` | text |  |
| `status` | text | pending / actioned / dismissed; default pending |
| `created_at` | timestamptz |  |

**Policies:** `insert_self`, `select_own` (you only see your own reports).

### `blocks`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK |  |
| `blocker_id` | uuid FK |  |
| `blocked_id` | uuid FK |  |
| `created_at` | timestamptz |  |

Unique: `(blocker_id, blocked_id)`. Check: `blocker_id != blocked_id`.

**Policies:** `select_own`, `insert_own`, `delete_own`.

### `deletion_requests`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK |  |
| `user_id` | uuid FK | unique — one open request per user |
| `requested_at` | timestamptz |  |
| `scheduled_for` | timestamptz | default `now() + 30d` |
| `cancelled_at` | timestamptz |  |

**Policies:** `select_own`, `insert_own`, `update_own`.

---

## RPC functions

### `find_potential_matches(p_user_id uuid, p_max_distance_km int default null) returns setof profiles`

Server-side discovery query. Excludes already-swiped, blocked (either direction), reported (pending/actioned), deleted, and self. Applies mutual gender + age preferences. Ordered by `last_active DESC NULLS LAST`, limit 100.

```ts
const { data } = await supabase.rpc('find_potential_matches', { p_user_id: meId });
```

Latest version: `supabase/migrations/20260524300000_recreate_find_potential_matches.sql` (regenerated to include the `interests` column).

### `update_user_location(p_lat float, p_lng float) returns void`

Sets `profiles.location` for the current `auth.uid()` using PostGIS `ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography`. Also bumps `last_active`.

```ts
await supabase.rpc('update_user_location', { p_lat, p_lng });
```

Used by the `useGeolocation` hook every 30 min / on app open.

---

## Triggers

### `trg_create_match_on_mutual_swipe`

`AFTER INSERT ON swipes FOR EACH ROW`. If the new swipe is right/super, checks for a reverse right/super swipe; if found, inserts into `matches` with `(LEAST, GREATEST)` ordering. `SECURITY DEFINER` so RLS doesn't block the matches insert.

---

## Storage buckets

### `profile-photos`

Public-read. Per-user folder structure:

```
profile-photos/
  <user-id>/
    0.jpg   ← slot 0 (main)
    1.jpg
    ...
    5.jpg
```

Path is enforced client-side by `src/lib/storage.ts`. Each upload:
1. Detects MIME from base64 header
2. Validates size (≤5 MB), format (jpg/png/webp), min dimensions (400×400)
3. Resizes via canvas if longest edge > 1080
4. Uploads with `upsert: true` (overwrite same slot)

---

## Realtime channels

### `chat-{matchId}`

Per-conversation channel. Subscriptions:
- `postgres_changes` INSERT on `messages` filtered by `match_id`
- `postgres_changes` UPDATE on `messages` filtered by `match_id`
- `presence` — each client tracks `{ userId, typing: boolean }`

### `unread-{userId}`

Session-wide channel that fires the `UnreadContext` to refetch the unread count whenever any `messages` row changes. Filtered client-side (RLS already ensures only relevant rows arrive).

---

## Edge functions (placeholders — not deployed yet)

### `notify_new_message`

Called from `ChatScreen.send()` after a message is inserted. Should:
1. Read `messages.match_id`, find the other participant
2. Lookup `profiles.push_token` for them
3. Send APNs/FCM push with title `Match!` and body preview

```ts
await supabase.functions.invoke('notify_new_message', {
  body: { match_id, sender_id, preview }
});
```

### `account_deletion_confirmation`

Called from `DeleteAccountFlow.confirmDelete()`. Sends an email to the user confirming the 30-day deletion schedule with a cancellation link.

```ts
await supabase.functions.invoke('account_deletion_confirmation', {
  body: { user_id, reasons }
});
```

Both functions are wrapped in try/catch on the client — failures are best-effort and don't block the user-facing flow.

---

## Pending RPCs / Edge functions (future)

- `reactivate_account(user_id uuid)` — clears `profiles.deleted_at` and sets `deletion_requests.cancelled_at`. UI not built yet (see `TEST_SCENARIOS.md` #10).
- `process_pending_deletions()` — cron job (every 1h) that hard-deletes rows where `scheduled_for <= now() AND cancelled_at IS NULL`. Should: delete photos from Storage, delete profile, delete swipes/matches/messages/reports/blocks via FK cascade.
- `moderate_photo(url)` — call Sightengine or similar on photo upload to flag NSFW before publishing.
