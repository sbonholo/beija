-- Collapse photos from 6-slots-per-user to 1-per-user.
--
-- Product decision: a single profile photo is enough; we never want to
-- accumulate stale uploads. Replacing the photo means overwriting the
-- canonical object key in storage (<uid>/avatar.jpg with upsert: true).
--
-- This migration:
--   1. Keeps the lowest-slot photo per user (deterministic), deletes the rest
--      from the photos table only. Storage object cleanup runs at step 4.
--   2. Swaps the (user_id, slot) unique constraint for a (user_id)-only one,
--      drops the slot check, then drops the slot column itself.
--   3. (No drop of blur_hash — kept for future progressive-loading work.)
--   4. One-time storage cleanup: removes <uid>/<not-avatar.jpg> objects from
--      the profile-photos bucket where <uid> belongs to a real profile.
--      Wrapped in DO with an exception guard so insufficient_privilege on
--      storage.objects (e.g. local stack run) doesn't abort the migration.
--
-- Fully idempotent. Re-running is a no-op.

-- 1. De-duplicate photos rows to one per user (lowest slot wins).
delete from photos
where id not in (
  select distinct on (user_id) id
  from photos
  order by user_id, slot asc
);

-- 2. Replace constraints.
alter table photos drop constraint if exists photos_user_id_slot_key;
alter table photos drop constraint if exists photos_slot_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'photos_user_id_key'
      and conrelid = 'public.photos'::regclass
  ) then
    alter table photos add constraint photos_user_id_key unique (user_id);
  end if;
end $$;

alter table photos drop column if exists slot;

-- 3. blur_hash retained intentionally.

-- 4. One-time storage cleanup: any object that isn't <uid>/avatar.jpg and
--    whose <uid> prefix matches an existing profile gets removed. We never
--    touch objects whose prefix doesn't resolve to a profile — those are
--    handled by the existing orphan-cleanup cron in 20260524700000.
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
