-- Phase P2 — analytics opt-out flag (LGPD compliance).
--
-- profiles.allow_analytics:
--   true  → app may capture anonymized product events via PostHog (default).
--   false → posthog.opt_out_capturing() is honored on every session.
--
-- Default is true (implicit consent at signup via TOS), but the user can
-- flip it in Settings → Privacidade. The frontend reads it on login and
-- caches in localStorage for fast subsequent reads.

alter table profiles
  add column if not exists allow_analytics boolean not null default true;
