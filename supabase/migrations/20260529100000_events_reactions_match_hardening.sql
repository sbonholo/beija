-- Batch 2: event reactions → match hardening + attendee discovery upgrades.
--
-- 1. Persist each side's event reaction on the match row so the chat/match
--    context can surface intent (a mutual fire reads very differently from a
--    mutual heart). NULL for swipe-born matches.
-- 2. Mutual-ANY matching: any two reactions in any combination (not just
--    kiss↔kiss) create a match. Also exclude pairs with an active
--    (pending/actioned) report — the safety gap that previously only the
--    swipe path closed.
-- 3. get_event_attendees: optional bidirectional gender filter + pagination.

-- 1. Reaction columns on matches ------------------------------------------
alter table matches add column if not exists user1_reaction text;
alter table matches add column if not exists user2_reaction text;

-- 2. Mutual-ANY match trigger (block- AND report-aware) -------------------
create or replace function create_match_on_mutual_kiss()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other_reaction text;
  v_u1 uuid;
  v_u2 uuid;
  v_u1_reaction text;
  v_u2_reaction text;
begin
  -- Reciprocal reaction of ANY kind in the same event makes it mutual.
  select kind into v_other_reaction
  from event_reactions
  where sender_id   = NEW.receiver_id
    and receiver_id = NEW.sender_id
    and event_id    = NEW.event_id;

  if v_other_reaction is null then
    return NEW;
  end if;

  -- Respect blocks (neither direction).
  if exists (
    select 1 from blocks
    where (blocker_id = NEW.sender_id   and blocked_id = NEW.receiver_id)
       or (blocker_id = NEW.receiver_id and blocked_id = NEW.sender_id)
  ) then
    return NEW;
  end if;

  -- Respect active reports (pending/actioned), either direction.
  if exists (
    select 1 from reports r
    where r.status in ('pending', 'actioned')
      and (
        (r.reporter_id = NEW.sender_id   and r.reported_id = NEW.receiver_id)
        or (r.reporter_id = NEW.receiver_id and r.reported_id = NEW.sender_id)
      )
  ) then
    return NEW;
  end if;

  -- Normalize to the user1_id < user2_id pair invariant and carry each
  -- side's reaction across to the matching column.
  if NEW.sender_id < NEW.receiver_id then
    v_u1 := NEW.sender_id;   v_u1_reaction := NEW.kind;
    v_u2 := NEW.receiver_id; v_u2_reaction := v_other_reaction;
  else
    v_u1 := NEW.receiver_id; v_u1_reaction := v_other_reaction;
    v_u2 := NEW.sender_id;   v_u2_reaction := NEW.kind;
  end if;

  insert into matches (user1_id, user2_id, user1_reaction, user2_reaction)
  values (v_u1, v_u2, v_u1_reaction, v_u2_reaction)
  on conflict (user1_id, user2_id) do update
    set user1_reaction = coalesce(matches.user1_reaction, excluded.user1_reaction),
        user2_reaction = coalesce(matches.user2_reaction, excluded.user2_reaction);

  return NEW;
end;
$$;

-- Trigger definition unchanged (AFTER INSERT OR UPDATE on event_reactions),
-- recreated for idempotency.
drop trigger if exists on_mutual_kiss on event_reactions;
create trigger on_mutual_kiss
  after insert or update on event_reactions
  for each row execute function create_match_on_mutual_kiss();

-- 3. get_event_attendees: gender filter + pagination ----------------------
drop function if exists get_event_attendees(uuid);

create or replace function get_event_attendees(
  p_event_id      uuid,
  p_gender_filter boolean default false,
  p_limit         int     default 100,
  p_offset        int     default 0
)
returns table (
  user_id     uuid,
  name        text,
  age         int,
  photo_url   text,
  my_reaction text
) language sql security definer set search_path = public as $$
  select
    p.id                                                    as user_id,
    p.name,
    extract(year from age(p.birthdate))::int                as age,
    (select url from photos ph
     where ph.user_id = p.id
     order by ph.slot asc limit 1)                          as photo_url,
    er.kind                                                 as my_reaction
  from check_ins ci
  join profiles p on p.id = ci.user_id
  left join event_reactions er
         on er.event_id    = p_event_id
        and er.sender_id   = auth.uid()
        and er.receiver_id = p.id
  where ci.event_id   = p_event_id
    and p.id          <> auth.uid()
    and p.is_banned   = false
    and p.deleted_at  is null
    -- Optional bidirectional gender filter (same shape as find_potential_matches).
    and (
      not p_gender_filter
      or (
        p.gender = any( (select interested_in from profiles where id = auth.uid()) )
        and (select gender from profiles where id = auth.uid()) = any(p.interested_in)
      )
    )
    -- exclude blocked / blocking
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id       and b.blocked_id = auth.uid())
    )
  order by ci.created_at desc
  limit p_limit offset p_offset;
$$;

grant execute on function get_event_attendees(uuid, boolean, int, int) to authenticated;
