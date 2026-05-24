-- Phase P1 — photo_moderation_log
--
-- Audit trail for pre-upload Sightengine moderation calls (FASE P1) AND
-- rate-limit source: 10 req/min per user is enforced by the edge function
-- via SELECT count() on this table.
--
-- RLS: service_role bypasses; authenticated users can SEE only their own
-- rows (transparency); never INSERT directly — only the edge function
-- writes here (as service_role).

create table if not exists photo_moderation_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  decision text not null check (decision in ('approved', 'rejected', 'error', 'rate_limited', 'unconfigured')),
  reasons text[] not null default '{}',
  scores jsonb,
  source text not null default 'sightengine',
  created_at timestamptz not null default now()
);

create index if not exists idx_photo_mod_log_user_created
  on photo_moderation_log (user_id, created_at desc);

create index if not exists idx_photo_mod_log_decision
  on photo_moderation_log (decision)
  where decision = 'rejected';

alter table photo_moderation_log enable row level security;

drop policy if exists photo_mod_log_select_self on photo_moderation_log;
create policy photo_mod_log_select_self on photo_moderation_log
  for select using (user_id = auth.uid());

-- No insert/update/delete policies → only service_role writes here.
