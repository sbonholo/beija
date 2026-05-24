-- update_user_location: lets the client push a {lat, lng} pair without writing
-- raw PostGIS expressions over the supabase-js client. Also bumps last_active.

create or replace function update_user_location(p_lat float, p_lng float)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  update profiles
    set location = st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
        last_active = now()
    where id = auth.uid();
end;
$$;

grant execute on function update_user_location(float, float) to authenticated;
