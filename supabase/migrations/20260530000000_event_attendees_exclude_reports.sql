-- Batch 3: community safety — close the event-grid reports gap + atomic report.
--
-- Re-run safe: both functions use CREATE OR REPLACE with their already-deployed
-- signatures, so each is replaced in place in a single valid statement. There
-- is no DROP, so a failure cannot leave a function dropped-but-not-recreated.

-- 1. get_event_attendees: full corrected function (lateral-join gender filter +
--    pagination from commit 23712d9) PLUS a reports (pending/actioned) exclusion
--    mirroring find_potential_matches. Signature unchanged, so CREATE OR REPLACE
--    swaps the body atomically.
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
  -- Materialize viewer profile fields once as typed columns so that
  -- "= any(me.my_interested_in)" resolves as the array-expression form of ANY.
  left join lateral (
    select interested_in as my_interested_in,
           gender        as my_gender
    from profiles
    where id = auth.uid()
  ) as me on true
  left join event_reactions er
         on er.event_id    = p_event_id
        and er.sender_id   = auth.uid()
        and er.receiver_id = p.id
  where ci.event_id   = p_event_id
    and p.id          <> auth.uid()
    and p.is_banned   = false
    and p.deleted_at  is null
    -- Optional bidirectional gender filter. LEFT JOIN means me.* is NULL when
    -- viewer has no profile, making this condition false (fail closed).
    and (
      not p_gender_filter
      or (
        p.gender         = any(me.my_interested_in)
        and me.my_gender = any(p.interested_in)
      )
    )
    -- exclude blocked / blocking
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id       and b.blocked_id = auth.uid())
    )
    -- exclude active reports either direction (mirror find_potential_matches)
    and not exists (
      select 1 from reports r
      where r.status in ('pending', 'actioned')
        and (
          (r.reporter_id = auth.uid() and r.reported_id = p.id)
          or (r.reporter_id = p.id    and r.reported_id = auth.uid())
        )
    )
  order by ci.created_at desc
  limit p_limit offset p_offset;
$$;

grant execute on function get_event_attendees(uuid, boolean, int, int) to authenticated;

-- 2. report_user: atomic report + optional block. Inserts the report with
--    status 'pending' and, when p_also_block, delegates to block_user (which
--    atomically inserts the block and deletes swipes + match).
create or replace function report_user(
  p_reported_id uuid,
  p_reason      text,
  p_details     text    default null,
  p_also_block  boolean default true
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_reported_id is null or p_reported_id = auth.uid() then
    raise exception 'invalid_report_target';
  end if;

  insert into reports (reporter_id, reported_id, reason, details, status)
  values (auth.uid(), p_reported_id, p_reason, nullif(p_details, ''), 'pending');

  if p_also_block then
    perform block_user(p_reported_id);
  end if;
end;
$$;

grant execute on function report_user(uuid, text, text, boolean) to authenticated;
