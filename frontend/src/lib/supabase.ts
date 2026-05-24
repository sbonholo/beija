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

export type Gender = 'M' | 'F' | 'Other' | 'Prefer not to say';
export type Seeking = 'M' | 'F' | 'Both';

export interface Profile {
  id: string;
  phone_number: string;
  nickname: string;
  birthdate: string | null;
  bio: string | null;
  gender: Gender | null;
  seeking: Seeking | null;
  photo_url: string | null;
  push_token: string | null;
  created_at: string;
  updated_at: string;
}

export interface Match {
  id: string;
  user_1_id: string;
  user_2_id: string;
  event_id: string;
  matched_at: string;
  last_message_at: string | null;
}

export interface Message {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
}
