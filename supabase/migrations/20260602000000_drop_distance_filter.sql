-- Remove the distance filter from discovery — Beija is event-anchored so
-- geographic proximity is meaningless; people meet AT the party / festival.
--
-- DOES NOT drop profiles.max_distance_km (no data loss). The column stays
-- as a passive historical record and so old clients can keep writing without
-- error. We just stop reading it.
--
-- Signature of find_potential_matches is preserved: (uuid, int default null)
-- so any deployed client that still passes p_max_distance_km keeps working;
-- the parameter is silently ignored. distance_km in the SELECT output also
-- stays for backwards compatibility — it still returns the real geographic
-- distance for any UI bit that wants to display "X km away" cosmetically,
-- but it no longer filters.
--
-- Idempotency note: CREATE OR REPLACE FUNCTION cannot change a function's
-- RETURNS TABLE shape (Postgres errors with 42P13). Whenever we touch the
-- output columns we must DROP first. Drop every plausible historical
-- overload so this migration re-runs cleanly on any drifted live DB.

drop function if exists find_potential_matches(uuid, int);
drop function if exists find_potential_matches(uuid);

create or replace function find_potential_matches(
  p_user_id uuid,
  p_max_distance_km int default null  -- kept for signature stability; ignored
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
  hide_distance boolean,
  show_age boolean,
  distance_km int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  me profiles%rowtype;
begin
  select * into me from profiles where profiles.id = p_user_id;
  if me.id is null or me.deleted_at is not null then
    return;
  end if;

  return query
  select
    p.id, p.name,
    case when p.show_age then p.birthdate else null end as birthdate,
    p.gender, p.bio, p.city,
    p.interested_in, p.interests, p.last_active_at,
    p.hide_distance, p.show_age,
    case
      when p.hide_distance then null
      when me.location is null or p.location is null then null
      else (st_distance(me.location, p.location) / 1000)::int
    end as distance_km
  from profiles p
  where p.id <> p_user_id
    and p.deleted_at is null
    and p.is_inactive = false
    -- Distance filter removed. Event-anchored matching — proximity check
    -- happens implicitly via check_ins at the same event, not a radius.
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
