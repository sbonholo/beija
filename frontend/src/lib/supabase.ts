import { createClient, type User } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[supabase] missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(SUPABASE_URL ?? '', SUPABASE_ANON_KEY ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

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
  deleted_at: string | null;
  created_at: string;
}

export interface Match {
  id: string;
  user1_id: string;
  user2_id: string;
  created_at: string;
  last_message_at: string | null;
  is_stale: boolean;
  is_archived: boolean;
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
