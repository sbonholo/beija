-- Phase P4 — i18n.
--
-- profiles.locale: stores the user's preferred locale (BCP 47 tag) so the
-- edge functions (notify_new_message, notify_match, deletion email, etc.)
-- can pick the right translation when localized templates ship. Defaults
-- to 'pt-BR' since the launch market is Brazil.

alter table profiles
  add column if not exists locale text not null default 'pt-BR';

-- Sanity check: keep this aligned with the list in src/i18n/index.ts.
alter table profiles
  drop constraint if exists profiles_locale_check;
alter table profiles
  add constraint profiles_locale_check
  check (locale in ('pt-BR', 'en'));
