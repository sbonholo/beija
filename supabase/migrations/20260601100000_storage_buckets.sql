-- =========================================================================
-- Beija — storage bucket setup. Idempotent. Re-runnable.
-- Run as the Supabase project owner (the SQL editor uses postgres role,
-- which has the privileges to write to storage.buckets and storage.objects
-- policies).
--
-- Historical note: bucket creation used to be a manual step documented in
-- docs/DEPLOYMENT.md and docs/EDGE_FUNCTIONS.md. The Vercel/Supabase
-- migration skipped those steps, the live project ended up with zero
-- buckets, and uploads failed with "Bucket not found". This migration
-- locks the setup in so future projects get it automatically.
--
-- Path convention enforced by the client (frontend/src/lib/storage.ts):
--   profile-photos/<auth.uid()>/<slot>.jpg   where slot ∈ 0..5
-- =========================================================================

-- 1. profile-photos (PUBLIC, 5MB cap, image/jpeg|png|webp) -----------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos',
  'profile-photos',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2. quarantine (PRIVATE, server-only via service role) --------------------
insert into storage.buckets (id, name, public)
values ('quarantine', 'quarantine', false)
on conflict (id) do update set public = excluded.public;

-- 3. RLS policies on storage.objects for profile-photos --------------------
--    Path convention: <auth.uid()>/<slot>.jpg  (slot 0..5).
--    storage.foldername(name) returns the path segments as text[];
--    [1] is the first folder, which must equal the caller's uid.

drop policy if exists "profile_photos_select_all"   on storage.objects;
drop policy if exists "profile_photos_insert_own"   on storage.objects;
drop policy if exists "profile_photos_update_own"   on storage.objects;
drop policy if exists "profile_photos_delete_own"   on storage.objects;

create policy "profile_photos_select_all"
  on storage.objects for select
  using ( bucket_id = 'profile-photos' );

create policy "profile_photos_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "profile_photos_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "profile_photos_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 4. quarantine: no end-user policies. Edge functions use the service-role
--    key, which bypasses RLS. Leaving the bucket private with zero policies
--    means anon/authenticated cannot touch it. That's the desired state.

-- Sanity check (optional — run after):
-- select id, public, file_size_limit, allowed_mime_types from storage.buckets;
-- select policyname, cmd, qual, with_check from pg_policies
--   where schemaname = 'storage' and tablename = 'objects';
