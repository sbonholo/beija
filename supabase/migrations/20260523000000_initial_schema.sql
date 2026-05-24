-- Beija Database Schema
-- Initial migration for the event connection app

-- Enable necessary extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgjson";

-- Users table
create table if not exists users (
  id uuid primary key default uuid_generate_v4(),
  phone_number text unique not null,
  nickname text not null,
  birthdate date,
  bio text,
  gender text check (gender in ('M', 'F', 'Other', 'Prefer not to say')),
  seeking text check (seeking in ('M', 'F', 'Both')),
  photo_url text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Events table
create table if not exists events (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  location text,
  latitude float,
  longitude float,
  start_time timestamp with time zone not null,
  end_time timestamp with time zone,
  event_type text,
  max_attendees integer,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- People at event tracking
create table if not exists people_at_event (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  joined_at timestamp with time zone default now(),
  left_at timestamp with time zone,
  unique(user_id, event_id)
);

-- Reactions table
create table if not exists reactions (
  id uuid primary key default uuid_generate_v4(),
  from_user_id uuid not null references users(id) on delete cascade,
  to_user_id uuid not null references users(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  reaction_type text not null check (reaction_type in ('kiss', 'heart', 'fire')),
  created_at timestamp with time zone default now(),
  unique(from_user_id, to_user_id, event_id, reaction_type)
);

-- Matches table (mutual reactions)
create table if not exists matches (
  id uuid primary key default uuid_generate_v4(),
  user_1_id uuid not null references users(id) on delete cascade,
  user_2_id uuid not null references users(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  matched_at timestamp with time zone default now(),
  last_message_at timestamp with time zone,
  unique(user_1_id, user_2_id, event_id),
  check (user_1_id < user_2_id)
);

-- Messages table
create table if not exists messages (
  id uuid primary key default uuid_generate_v4(),
  match_id uuid not null references matches(id) on delete cascade,
  sender_id uuid not null references users(id) on delete cascade,
  content text not null,
  created_at timestamp with time zone default now(),
  read_at timestamp with time zone
);

-- Indexes for better query performance
create index if not exists idx_people_at_event_user_id on people_at_event(user_id);
create index if not exists idx_people_at_event_event_id on people_at_event(event_id);
create index if not exists idx_reactions_from_user_id on reactions(from_user_id);
create index if not exists idx_reactions_to_user_id on reactions(to_user_id);
create index if not exists idx_reactions_event_id on reactions(event_id);
create index if not exists idx_matches_user_1_id on matches(user_1_id);
create index if not exists idx_matches_user_2_id on matches(user_2_id);
create index if not exists idx_matches_event_id on matches(event_id);
create index if not exists idx_messages_match_id on messages(match_id);
create index if not exists idx_messages_sender_id on messages(sender_id);
create index if not exists idx_messages_created_at on messages(created_at);

-- Enable Row Level Security
alter table users enable row level security;
alter table events enable row level security;
alter table people_at_event enable row level security;
alter table reactions enable row level security;
alter table matches enable row level security;
alter table messages enable row level security;
