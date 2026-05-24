-- Re-add distance_km to find_potential_matches.
-- Phase R (20260524700000) recreated the function as `returns setof profiles`,
-- which dropped the distance_km column from Phase X (20260524500000).
-- This migration recreates the function with the table shape that includes
-- distance_km AND keeps Phase R's `is_inactive` filter + last_active_at order.

drop function if exists find_potential_matches(uuid, int);

create or replace function find_potential_matches(
  p_user_id uuid,
  p_max_distance_km int default null
)
returns table (
  id uuid,
  name text,
  birthdate date,
  gender text,
  bio text,
  city text,
  interested_in text[],
  interests text[],
  last_active_at timestamptz,
  distance_km int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  me profiles%rowtype;
  v_effective_distance int;
begin
  select * into me from profiles where profiles.id = p_user_id;
  if me.id is null or me.deleted_at is not null then
    return;
  end if;

  v_effective_distance := coalesce(p_max_distance_km, me.max_distance_km, 50);

  return query
  select
    p.id,
    p.name,
    p.birthdate,
    p.gender,
    p.bio,
    p.city,
    p.interested_in,
    p.interests,
    p.last_active_at,
    case
      when me.location is null or p.location is null then null
      else (st_distance(me.location, p.location) / 1000)::int
    end as distance_km
  from profiles p
  where p.id <> p_user_id
    and p.deleted_at is null
    and p.is_inactive = false
    and (
      me.location is null
      or p.location is null
      or st_dwithin(me.location, p.location, v_effective_distance * 1000)
    )
    and (
      me.interested_in is null
      or array_length(me.interested_in, 1) is null
      or p.gender = any(me.interested_in)
    )
    and (
      p.interested_in is null
      or array_length(p.interested_in, 1) is null
      or me.gender = any(p.interested_in)
    )
    and (
      me.min_age is null or p.birthdate is null
      or extract(year from age(p.birthdate))::int >= me.min_age
    )
    and (
      me.max_age is null or p.birthdate is null
      or extract(year from age(p.birthdate))::int <= me.max_age
    )
    and (
      p.min_age is null or me.birthdate is null
      or extract(year from age(me.birthdate))::int >= p.min_age
    )
    and (
      p.max_age is null or me.birthdate is null
      or extract(year from age(me.birthdate))::int <= p.max_age
    )
    and not exists (
      select 1 from swipes s
      where s.swiper_id = p_user_id and s.swipee_id = p.id
    )
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = p_user_id and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = p_user_id)
    )
    and not exists (
      select 1 from reports r
      where r.status in ('pending', 'actioned')
        and (
          (r.reporter_id = p_user_id and r.reported_id = p.id)
          or (r.reporter_id = p.id and r.reported_id = p_user_id)
        )
    )
  order by p.last_active_at desc nulls last
  limit 100;
end;
$$;

grant execute on function find_potential_matches(uuid, int) to authenticated;
