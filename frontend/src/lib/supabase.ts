import { createClient, type User } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * True when both Supabase env vars are present at build time. The app shell
 * checks this and renders a "setup required" screen instead of crashing —
 * see `src/components/MissingConfigScreen.tsx`.
 */
export const SUPABASE_CONFIGURED = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

if (!SUPABASE_CONFIGURED) {
  console.warn('[supabase] missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — running in setup-required mode');
}

// Always create a client (even with placeholder URL) so imports don't fail.
// Calls will error at runtime in setup-required mode — the missing-config
// screen blocks the user before they can hit them.
export const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_ANON_KEY || 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // No-op lock: bypass the navigator.locks-based storage lock, whose
      // acquisition can deadlock and leave getSession()/token-refresh pending
      // forever (silent infinite splash). Tradeoff: concurrent token refreshes
      // across multiple tabs are no longer serialized — acceptable here, and
      // the AuthContext bootstrap timeout is the backstop.
      lock: (_name, _acquireTimeout, fn) => fn(),
    },
  },
);

export async function getCurrentUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new Error('not_authenticated');
  return user;
}

export type Gender = 'woman' | 'man' | 'non-binary' | 'other';

/**
 * Mirrors the `profiles` table from migrations/20260524000000_complete_schema.sql
 * (+ 20260524100000_add_interests.sql).
 */
export interface Profile {
  id: string;
  name: string | null;
  birthdate: string | null;
  gender: 'woman' | 'man' | 'non-binary' | 'other' | null;
  bio: string | null;
  location: unknown | null;
  city: string | null;
  interested_in: string[] | null;
  interests: string[];
  min_age: number | null;
  max_age: number | null;
  max_distance_km: number | null;
  push_token: string | null;
  last_active_at: string | null;
  is_inactive: boolean;
  mute_notifications: boolean;
  hide_distance: boolean;
  show_age: boolean;
  locale: 'pt-BR' | 'en';
  deleted_at: string | null;
  created_at: string;
}

/**
 * Shape returned by the `find_potential_matches` RPC: a slice of Profile plus
 * `distance_km` (integer kilometers, see migration 20260524800000_distance_km_back).
 */
export interface DiscoverableProfile extends Profile {
  distance_km: number | null;
}

export interface Match {
  id: string;
  user1_id: string;
  user2_id: string;
  created_at: string;
  last_message_at: string | null;
  is_stale: boolean;
  is_archived: boolean;
  user1_reaction: ReactionKind | null;
  user2_reaction: ReactionKind | null;
}

export interface Message {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
  deleted_at: string | null;
}

export type EventCategory = 'festival' | 'concert' | 'bar' | 'nightclub' | 'show' | 'other';
export type ReactionKind  = 'kiss' | 'heart' | 'fire';

export interface Event {
  id:          string;
  name:        string;
  venue:       string | null;
  city:        string | null;
  address:     string | null;
  category:    EventCategory;
  starts_at:   string;
  ends_at:     string | null;
  image_url:   string | null;
  is_verified: boolean;
  created_at:  string;
}

/** Returned by the `get_nearby_events` RPC */
export interface NearbyEvent extends Event {
  distance_km:    number | null;
  attendee_count: number;
  is_checked_in:  boolean;
}

/** Returned by the `get_event_attendees` RPC */
export interface EventAttendee {
  user_id:     string;
  name:        string | null;
  age:         number | null;
  photo_url:   string | null;
  my_reaction: ReactionKind | null;
}
