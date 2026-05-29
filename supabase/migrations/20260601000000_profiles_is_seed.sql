-- Adds is_seed flag for synthetic E2E test profiles. Default false so it never
-- accidentally tags real users. Deleting where is_seed = true (via auth.users
-- cascade) is the supported teardown for supabase/seeds/20260601_seed_e2e.sql.

alter table profiles
  add column if not exists is_seed boolean not null default false;

create index if not exists idx_profiles_is_seed on profiles (is_seed) where is_seed = true;
