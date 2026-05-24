-- Beija — Complete schema
-- Swipe-based dating model with PostGIS-backed location matching, RLS, and
-- a mutual-swipe trigger that materializes matches.
--
-- Supersedes 20260523000000_initial_schema.sql (events/reactions model).

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";
create extension if not exists "postgis";

-- ---------------------------------------------------------------------------
-- profiles  (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  birthdate date,
  gender text check (gender in ('woman', 'man', 'non-binary', 'other')),
  bio text,
  location geography(Point, 4326),
  city text,
  interested_in text[] default array[]::text[],
  min_age int default 18 check (min_age >= 18),
  max_age int default 99 check (max_age <= 120),
  max_distance_km int default 50 check (max_distance_km > 0),
  push_token text,
  last_active timestamptz default now(),
  deleted_at timestamptz,
  created_at timestamptz default now(),
  check (min_age <= max_age)
);

-- ---------------------------------------------------------------------------
-- photos  (6 slots per user)
-- ---------------------------------------------------------------------------
create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  slot int not null check (slot between 0 and 5),
  url text not null,
  blur_hash text,
  created_at timestamptz default now(),
  unique (user_id, slot)
);

-- ---------------------------------------------------------------------------
-- swipes  (every left/right/super decision)
-- ---------------------------------------------------------------------------
create table if not exists swipes (
  id uuid primary key default gen_random_uuid(),
  swiper_id uuid not null references profiles(id) on delete cascade,
  swipee_id uuid not null references profiles(id) on delete cascade,
  direction text not null check (direction in ('left', 'right', 'super')),
  created_at timestamptz default now(),
  unique (swiper_id, swipee_id),
  check (swiper_id <> swipee_id)
);

-- ---------------------------------------------------------------------------
-- matches  (materialized by trigger when both sides swipe right/super)
-- user1_id is always the lexicographically smaller uuid to keep the pair unique
-- ---------------------------------------------------------------------------
create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  user1_id uuid not null references profiles(id) on delete cascade,
  user2_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  last_message_at timestamptz,
  unique (user1_id, user2_id),
  check (user1_id < user2_id)
);

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  content text not null check (length(content) > 0 and length(content) <= 2000),
  read_at timestamptz,
  created_at timestamptz default now(),
  deleted_at timestamptz
);

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(id) on delete cascade,
  reported_id uuid not null references profiles(id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'pending' check (status in ('pending', 'actioned', 'dismissed')),
  created_at timestamptz default now(),
  check (reporter_id <> reported_id)
);

-- ---------------------------------------------------------------------------
-- blocks
-- ---------------------------------------------------------------------------
create table if not exists blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- ---------------------------------------------------------------------------
-- deletion_requests  (30-day soft delete window per App Store guideline 5.1.1(v))
-- ---------------------------------------------------------------------------
create table if not exists deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  requested_at timestamptz default now(),
  scheduled_for timestamptz default (now() + interval '30 days'),
  cancelled_at timestamptz,
  unique (user_id)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists idx_profiles_location on profiles using gist (location);
create index if not exists idx_profiles_last_active on profiles (last_active desc);
create index if not exists idx_profiles_deleted_at on profiles (deleted_at) where deleted_at is null;
create index if not exists idx_photos_user_id on photos (user_id);
create index if not exists idx_swipes_swiper_created on swipes (swiper_id, created_at desc);
create index if not exists idx_swipes_swipee_id on swipes (swipee_id);
create index if not exists idx_matches_user1_id on matches (user1_id);
create index if not exists idx_matches_user2_id on matches (user2_id);
create index if not exists idx_messages_match_created on messages (match_id, created_at);
create index if not exists idx_reports_reported_status on reports (reported_id, status);
create index if not exists idx_blocks_blocker on blocks (blocker_id);
create index if not exists idx_blocks_blocked on blocks (blocked_id);

-- ===========================================================================
-- Mutual-swipe → match trigger
-- ===========================================================================
create or replace function create_match_on_mutual_swipe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reverse_exists boolean;
  v_user_lo uuid;
  v_user_hi uuid;
begin
  if new.direction not in ('right', 'super') then
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

drop trigger if exists trg_create_match_on_mutual_swipe on swipes;
create trigger trg_create_match_on_mutual_swipe
  after insert on swipes
  for each row
  execute function create_match_on_mutual_swipe();

-- ===========================================================================
-- find_potential_matches(user_id, max_distance_km)
-- Returns profiles within distance, matching mutual gender/age preferences,
-- excluding already-swiped, blocked (both directions), and reported (open).
-- ===========================================================================
create or replace function find_potential_matches(
  p_user_id uuid,
  p_max_distance_km int default null
)
returns setof profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  me profiles%rowtype;
  v_effective_distance int;
begin
  select * into me from profiles where id = p_user_id;
  if me.id is null or me.deleted_at is not null then
    return;
  end if;

  v_effective_distance := coalesce(p_max_distance_km, me.max_distance_km, 50);

  return query
  select p.*
  from profiles p
  where p.id <> p_user_id
    and p.deleted_at is null
    -- Geographic proximity (skipped when either side has no location)
    and (
      me.location is null
      or p.location is null
      or st_dwithin(me.location, p.location, v_effective_distance * 1000)
    )
    -- I'm interested in their gender (or no preference set)
    and (
      me.interested_in is null
      or array_length(me.interested_in, 1) is null
      or p.gender = any(me.interested_in)
    )
    -- They're interested in my gender (or no preference set)
    and (
      p.interested_in is null
      or array_length(p.interested_in, 1) is null
      or me.gender = any(p.interested_in)
    )
    -- My age window over their age
    and (
      me.min_age is null or p.birthdate is null
      or extract(year from age(p.birthdate))::int >= me.min_age
    )
    and (
      me.max_age is null or p.birthdate is null
      or extract(year from age(p.birthdate))::int <= me.max_age
    )
    -- Their age window over my age
    and (
      p.min_age is null or me.birthdate is null
      or extract(year from age(me.birthdate))::int >= p.min_age
    )
    and (
      p.max_age is null or me.birthdate is null
      or extract(year from age(me.birthdate))::int <= p.max_age
    )
    -- Exclude anyone I already swiped
    and not exists (
      select 1 from swipes s
      where s.swiper_id = p_user_id and s.swipee_id = p.id
    )
    -- Exclude blocks (either direction)
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = p_user_id and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = p_user_id)
    )
    -- Exclude open reports (either direction)
    and not exists (
      select 1 from reports r
      where r.status in ('pending', 'actioned')
        and (
          (r.reporter_id = p_user_id and r.reported_id = p.id)
          or (r.reporter_id = p.id and r.reported_id = p_user_id)
        )
    )
  order by p.last_active desc nulls last
  limit 100;
end;
$$;

-- ===========================================================================
-- Row Level Security
-- ===========================================================================
alter table profiles enable row level security;
alter table photos enable row level security;
alter table swipes enable row level security;
alter table matches enable row level security;
alter table messages enable row level security;
alter table reports enable row level security;
alter table blocks enable row level security;
alter table deletion_requests enable row level security;

-- profiles
drop policy if exists profiles_select_undeleted on profiles;
create policy profiles_select_undeleted on profiles
  for select using (deleted_at is null);

drop policy if exists profiles_insert_self on profiles;
create policy profiles_insert_self on profiles
  for insert with check (id = auth.uid());

drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_delete_self on profiles;
create policy profiles_delete_self on profiles
  for delete using (id = auth.uid());

-- photos
drop policy if exists photos_select_all on photos;
create policy photos_select_all on photos
  for select using (true);

drop policy if exists photos_insert_own on photos;
create policy photos_insert_own on photos
  for insert with check (user_id = auth.uid());

drop policy if exists photos_update_own on photos;
create policy photos_update_own on photos
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists photos_delete_own on photos;
create policy photos_delete_own on photos
  for delete using (user_id = auth.uid());

-- swipes  (only see your own; insert as yourself)
drop policy if exists swipes_select_own on swipes;
create policy swipes_select_own on swipes
  for select using (swiper_id = auth.uid());

drop policy if exists swipes_insert_self on swipes;
create policy swipes_insert_self on swipes
  for insert with check (swiper_id = auth.uid());

-- matches  (no direct insert; trigger uses SECURITY DEFINER)
drop policy if exists matches_select_participants on matches;
create policy matches_select_participants on matches
  for select using (auth.uid() in (user1_id, user2_id));

drop policy if exists matches_update_participants on matches;
create policy matches_update_participants on matches
  for update using (auth.uid() in (user1_id, user2_id))
  with check (auth.uid() in (user1_id, user2_id));

-- messages
drop policy if exists messages_select_in_match on messages;
create policy messages_select_in_match on messages
  for select using (
    exists (
      select 1 from matches m
      where m.id = messages.match_id
        and auth.uid() in (m.user1_id, m.user2_id)
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
    )
  );

drop policy if exists messages_update_sender on messages;
create policy messages_update_sender on messages
  for update using (sender_id = auth.uid())
  with check (sender_id = auth.uid());

-- reports
drop policy if exists reports_insert_self on reports;
create policy reports_insert_self on reports
  for insert with check (reporter_id = auth.uid());

drop policy if exists reports_select_own on reports;
create policy reports_select_own on reports
  for select using (reporter_id = auth.uid());

-- blocks
drop policy if exists blocks_select_own on blocks;
create policy blocks_select_own on blocks
  for select using (blocker_id = auth.uid());

drop policy if exists blocks_insert_own on blocks;
create policy blocks_insert_own on blocks
  for insert with check (blocker_id = auth.uid());

drop policy if exists blocks_delete_own on blocks;
create policy blocks_delete_own on blocks
  for delete using (blocker_id = auth.uid());

-- deletion_requests
drop policy if exists deletion_requests_select_own on deletion_requests;
create policy deletion_requests_select_own on deletion_requests
  for select using (user_id = auth.uid());

drop policy if exists deletion_requests_insert_own on deletion_requests;
create policy deletion_requests_insert_own on deletion_requests
  for insert with check (user_id = auth.uid());

drop policy if exists deletion_requests_update_own on deletion_requests;
create policy deletion_requests_update_own on deletion_requests
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ===========================================================================
-- Grants for the matching function
-- ===========================================================================
grant execute on function find_potential_matches(uuid, int) to authenticated;
grant execute on function create_match_on_mutual_swipe() to authenticated;
