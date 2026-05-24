-- Add interests array column to profiles + GIN index for fast contains/overlap queries.

alter table profiles
  add column if not exists interests text[] not null default '{}';

create index if not exists profiles_interests_gin
  on profiles using gin (interests);
