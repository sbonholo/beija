-- Growth & engagement metrics for the admin panel.
--
-- Replaces admin_dashboard_kpis() in-place. New JSON keys:
--   * mau / yau              — 30-day / 365-day active users
--   * matches_24h/_7d/_30d/_365d — match velocity windows
--   * seed_users / seed_matches — toggle inputs (so the client can recompute
--                                  seed-inclusive totals without a 2nd RPC)
--
-- All real-user counts now filter is_seed = false so the pitch numbers are
-- defensible. Time windows use now() - interval, matching the codebase pattern.
-- "Match happened" = include is_stale/is_archived (historical truth).
--
-- CREATE OR REPLACE keeps the existing signature so the frontend keeps working
-- across the rollout window. Old clients ignore the new keys.

create or replace function admin_dashboard_kpis()
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then raise exception 'not_authorized'; end if;
  return json_build_object(
    -- Totals — real users only (seed-excluded)
    'total_users',        (select count(*) from profiles
                           where deleted_at is null and is_seed = false),
    'new_24h',            (select count(*) from profiles
                           where created_at > now() - interval '24 hours'
                             and is_seed = false),
    'new_7d',             (select count(*) from profiles
                           where created_at > now() - interval '7 days'
                             and is_seed = false),
    'new_30d',            (select count(*) from profiles
                           where created_at > now() - interval '30 days'
                             and is_seed = false),
    'profiles_completed', (select count(*) from profiles
                           where deleted_at is null and is_seed = false
                             and name is not null
                             and gender is not null
                             and birthdate is not null),

    -- Active users by window (real users only)
    'dau',                (select count(*) from profiles
                           where last_active_at > now() - interval '24 hours'
                             and deleted_at is null and is_seed = false),
    'wau',                (select count(*) from profiles
                           where last_active_at > now() - interval '7 days'
                             and deleted_at is null and is_seed = false),
    'mau',                (select count(*) from profiles
                           where last_active_at > now() - interval '30 days'
                             and deleted_at is null and is_seed = false),
    'yau',                (select count(*) from profiles
                           where last_active_at > now() - interval '365 days'
                             and deleted_at is null and is_seed = false),

    -- Matches — historical truth (include is_stale/is_archived), real users only
    'total_matches',      (select count(*) from matches m
                           where not exists (
                             select 1 from profiles p
                             where p.is_seed = true
                               and p.id in (m.user1_id, m.user2_id))),
    'matches_24h',        (select count(*) from matches m
                           where m.created_at > now() - interval '24 hours'
                             and not exists (
                               select 1 from profiles p
                               where p.is_seed = true
                                 and p.id in (m.user1_id, m.user2_id))),
    'matches_7d',         (select count(*) from matches m
                           where m.created_at > now() - interval '7 days'
                             and not exists (
                               select 1 from profiles p
                               where p.is_seed = true
                                 and p.id in (m.user1_id, m.user2_id))),
    'matches_30d',        (select count(*) from matches m
                           where m.created_at > now() - interval '30 days'
                             and not exists (
                               select 1 from profiles p
                               where p.is_seed = true
                                 and p.id in (m.user1_id, m.user2_id))),
    'matches_365d',       (select count(*) from matches m
                           where m.created_at > now() - interval '365 days'
                             and not exists (
                               select 1 from profiles p
                               where p.is_seed = true
                                 and p.id in (m.user1_id, m.user2_id))),

    -- Rest of the original payload (unchanged)
    'total_checkins',     (select count(*) from check_ins),
    'reactions_kiss',     (select count(*) from event_reactions where kind = 'kiss'),
    'reactions_heart',    (select count(*) from event_reactions where kind = 'heart'),
    'reactions_fire',     (select count(*) from event_reactions where kind = 'fire'),
    'reports_pending',    (select count(*) from reports where status = 'pending'),
    'reports_actioned',   (select count(*) from reports where status = 'actioned'),
    'total_blocks',       (select count(*) from blocks),
    'banned_users',       (select count(*) from profiles where is_banned = true),
    'total_events',       (select count(*) from events),
    'active_events',      (select count(*) from events where is_active = true),

    -- Seed totals so the client toggle can flip to seed-inclusive view
    'seed_users',         (select count(*) from profiles where is_seed = true),
    'seed_matches',       (select count(*) from matches m
                           where exists (
                             select 1 from profiles p
                             where p.is_seed = true
                               and p.id in (m.user1_id, m.user2_id)))
  );
end;
$$;
