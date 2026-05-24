-- Seed helper RPC: lets the seed script set a profile's PostGIS location
-- without holding a Postgres direct connection. Service-role only — never
-- exposed to anon/authenticated clients.
--
-- Used by `frontend/scripts/seed.ts` (see docs/SEEDING.md).

create or replace function seed_set_location(p_user_id uuid, p_lat float, p_lng float)
returns void
language sql
security definer
set search_path = public
as $$
  update profiles
  set location = st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
  where id = p_user_id;
$$;

revoke all on function seed_set_location(uuid, float, float) from public;
revoke all on function seed_set_location(uuid, float, float) from anon;
revoke all on function seed_set_location(uuid, float, float) from authenticated;
grant execute on function seed_set_location(uuid, float, float) to service_role;
