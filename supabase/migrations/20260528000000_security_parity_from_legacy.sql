-- Security parity with the legacy SQLite backend.
--
-- Findings from the post-merge security audit (docs/CANONICAL_BRANCH.md):
--   GAP 1 — no server-side age validation (18+)
--   GAP 2 — RLS on matches/messages did not consider blocks
--   GAP 3 — no admin ban; banned users still visible in discovery
--   GAP 4 — block flow was 3 separate client requests (race)
--
-- This migration is additive and idempotent. Safe to re-run.

-- ---------------------------------------------------------------------------
-- GAP 1 — Server-side 18+ enforcement
-- ---------------------------------------------------------------------------
-- The frontend already checks this, but a malicious client (or someone
-- calling Supabase REST directly) can bypass JS validation. Enforce at
-- the DB layer.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_birthdate_adult_check'
  ) then
    alter table profiles add constraint profiles_birthdate_adult_check
      check (
        birthdate is null
        or extract(year from age(birthdate)) >= 18
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- GAP 3 — Admin ban column
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists is_banned boolean not null default false;
create index if not exists idx_profiles_is_banned on profiles (is_banned) where is_banned = true;

-- ---------------------------------------------------------------------------
-- GAP 2 — Block-aware RLS on matches/messages
-- ---------------------------------------------------------------------------
-- A blocked user cannot read existing matches, cannot read messages in
-- those matches, and cannot insert new messages. The block check is
-- bidirectional: either party blocking the other hides the relationship.

drop policy if exists matches_select_participants on matches;
create policy matches_select_participants on matches
  for select using (
    auth.uid() in (user1_id, user2_id)
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = matches.user1_id and b.blocked_id = matches.user2_id)
         or (b.blocker_id = matches.user2_id and b.blocked_id = matches.user1_id)
    )
  );

drop policy if exists matches_update_participants on matches;
create policy matches_update_participants on matches
  for update
  using (
    auth.uid() in (user1_id, user2_id)
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = matches.user1_id and b.blocked_id = matches.user2_id)
         or (b.blocker_id = matches.user2_id and b.blocked_id = matches.user1_id)
    )
  )
  with check (auth.uid() in (user1_id, user2_id));

drop policy if exists messages_select_in_match on messages;
create policy messages_select_in_match on messages
  for select using (
    exists (
      select 1 from matches m
      where m.id = messages.match_id
        and auth.uid() in (m.user1_id, m.user2_id)
        and not exists (
          select 1 from blocks b
          where (b.blocker_id = m.user1_id and b.blocked_id = m.user2_id)
             or (b.blocker_id = m.user2_id and b.blocked_id = m.user1_id)
        )
    )
  );

drop policy if exists messages_insert_as_sender on messages;
create policy messages_insert_as_sender on messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from matches m
      where m.id = messages.match_id
        and auth.uid() in (m.user1_id, m.user2_id)
        and not exists (
          select 1 from blocks b
          where (b.blocker_id = m.user1_id and b.blocked_id = m.user2_id)
             or (b.blocker_id = m.user2_id and b.blocked_id = m.user1_id)
        )
    )
  );

-- ---------------------------------------------------------------------------
-- GAP 2.b — Block-aware match trigger
-- ---------------------------------------------------------------------------
-- If a block exists between two users, a mutual swipe must NOT materialize
-- a match. Replace the trigger function.
create or replace function create_match_on_mutual_swipe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reverse_exists boolean;
  v_blocked boolean;
  v_user_lo uuid;
  v_user_hi uuid;
begin
  if new.direction not in ('right', 'super') then
    return new;
  end if;

  select exists (
    select 1 from blocks
    where (blocker_id = new.swiper_id and blocked_id = new.swipee_id)
       or (blocker_id = new.swipee_id and blocked_id = new.swiper_id)
  ) into v_blocked;
  if v_blocked then
    return new;
  end if;

  select exists (
    select 1 from swipes
    where swiper_id = new.swipee_id
      and swipee_id = new.swiper_id
      and direction in ('right', 'super')
  ) into v_reverse_exists;

  if v_reverse_exists then
    v_user_lo := least(new.swiper_id, new.swipee_id);
    v_user_hi := greatest(new.swiper_id, new.swipee_id);
    insert into matches (user1_id, user2_id)
    values (v_user_lo, v_user_hi)
    on conflict (user1_id, user2_id) do nothing;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- GAP 3 — Banned-aware find_potential_matches
-- ---------------------------------------------------------------------------
-- Re-create with the same shape (returns the distance_km variant from
-- 20260524800000) plus filtering out banned profiles.
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
  if me.id is null or me.deleted_at is not null or me.is_banned = true then
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
    and p.is_banned = false
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

-- ---------------------------------------------------------------------------
-- GAP 4 — Atomic block_user RPC
-- ---------------------------------------------------------------------------
-- Wraps insert-block + delete-swipes + delete-match in a single transaction
-- so concurrent inserts cannot slip through. Caller is auth.uid().
create or replace function block_user(p_blocked_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lo uuid;
  v_hi uuid;
begin
  if p_blocked_id is null or p_blocked_id = auth.uid() then
    raise exception 'invalid_block_target';
  end if;

  v_lo := least(auth.uid(), p_blocked_id);
  v_hi := greatest(auth.uid(), p_blocked_id);

  insert into blocks (blocker_id, blocked_id)
  values (auth.uid(), p_blocked_id)
  on conflict (blocker_id, blocked_id) do nothing;

  delete from swipes
  where (swiper_id = auth.uid() and swipee_id = p_blocked_id)
     or (swiper_id = p_blocked_id and swipee_id = auth.uid());

  delete from matches
  where user1_id = v_lo and user2_id = v_hi;
end;
$$;

grant execute on function block_user(uuid) to authenticated;
