-- Collapse photos to 1-per-user, resilient against schema drift.
--
-- HISTORY: an earlier version of this migration referenced `photos.slot`
-- unconditionally and failed on prod with `ERROR 42703: column "slot" does
-- not exist` — the live photos table is (id, user_id, url, blur_hash,
-- created_at) and never had the slot column. This rewrite handles BOTH
-- shapes (with and without slot) and is safe to re-run start-to-finish.
--
-- Product decision: a single profile photo is enough; we never want to
-- accumulate stale uploads. Replacing the photo means overwriting the
-- canonical object key in storage (<uid>/avatar.jpg with upsert: true).
--
-- This migration:
--   1. Deduplicates photos rows to ONE per user, keeping the most-recent
--      row by created_at (id as tiebreak). Works whether slot exists or not.
--   2. Ensures a UNIQUE constraint on photos(user_id) so the app's
--      upsert(..., onConflict: 'user_id') always has something to conflict
--      on. Drops the legacy (user_id, slot) unique if present.
--   3. Drops the slot column if it exists.
--   4. Keeps blur_hash for future progressive loading.
--   5. One-time safe storage cleanup: removes <uid>/<not-avatar.jpg> objects
--      from profile-photos where <uid> belongs to a real profile.
--
-- Fully idempotent. Re-running is a no-op.

-- 1. Dedupe to one row per user, keeping the most-recent.
--    created_at + id as tiebreak — works in both schema shapes.
delete from photos
where id in (
  select id from (
    select
      id,
      row_number() over (
        partition by user_id
        order by created_at desc nulls last, id desc
      ) as rn
    from photos
  ) ranked
  where rn > 1
);

-- 2. Constraint swap.
--    The legacy (user_id, slot) unique was named photos_user_id_slot_key by
--    Postgres convention in environments that ever had the slot column;
--    drop it if present so the new (user_id)-only unique can be added.
alter table photos drop constraint if exists photos_user_id_slot_key;
alter table photos drop constraint if exists photos_slot_check;

-- Replace any existing photos_user_id_key (its definition might differ across
-- environments) so the next ADD is unambiguous.
alter table photos drop constraint if exists photos_user_id_key;
alter table photos add constraint photos_user_id_key unique (user_id);

-- 3. Slot column — drop only if it exists. blur_hash retained intentionally.
alter table photos drop column if exists slot;

-- 4. One-time storage cleanup. Wrapped in DO so insufficient_privilege on
--    storage.objects (e.g. local stack run, or running as a role without
--    storage admin) doesn't abort. Only deletes objects whose <uid> prefix
--    matches a real profile — never touches accidental other content.
do $$
begin
  delete from storage.objects o
  where o.bucket_id = 'profile-photos'
    and o.name not like '%/avatar.jpg'
    and exists (
      select 1 from profiles pr
      where pr.id::text = split_part(o.name, '/', 1)
    );
exception when insufficient_privilege then
  raise notice 'skipping storage.objects cleanup (no privilege); '
               'run manually from the Dashboard Storage UI if needed';
end $$;
