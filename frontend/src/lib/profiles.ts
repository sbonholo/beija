import { supabase } from './supabase';

/**
 * Sanitized profile shape returned by the get_profile_safe RPC. All privacy
 * filters (show_age, hide_distance, blocks, reports, deleted_at, is_inactive)
 * are already applied server-side — the client only renders.
 *
 * `birthdate` is `null` when the target opted out of show_age.
 * `distance_km` is `null` when the target opted out of hide_distance, or
 * when either side has no location.
 */
export interface SafeProfile {
  id: string;
  name: string | null;
  birthdate: string | null;
  gender: string | null;
  bio: string | null;
  city: string | null;
  interested_in: string[] | null;
  interests: string[];
  hide_distance: boolean;
  show_age: boolean;
  last_active_at: string | null;
  photo_urls: string[];
  distance_km: number | null;
}

/**
 * Fetch one profile via the privacy-sanitizing RPC. Returns null when the
 * target doesn't exist, is blocked/reported/deleted, or is the caller.
 *
 * On RPC errors (network, permissions): captures to Sentry-via-console and
 * returns null. Callers should show a "perfil indisponível" state.
 */
export async function fetchProfileSafe(userId: string): Promise<SafeProfile | null> {
  const { data, error } = await supabase.rpc('get_profile_safe', {
    p_target_user_id: userId,
  });
  if (error) {
    console.warn('[profiles] get_profile_safe error:', error.message);
    return null;
  }
  const rows = (data ?? []) as SafeProfile[];
  return rows[0] ?? null;
}

/**
 * Batch variant — fetches many profiles in a single call. Order is NOT
 * preserved (server returns whatever the index scan emits); caller should
 * re-index by id if order matters.
 */
export async function fetchProfilesSafe(userIds: string[]): Promise<SafeProfile[]> {
  if (userIds.length === 0) return [];
  const { data, error } = await supabase.rpc('get_profiles_safe', {
    p_target_user_ids: userIds,
  });
  if (error) {
    console.warn('[profiles] get_profiles_safe error:', error.message);
    return [];
  }
  return (data ?? []) as SafeProfile[];
}
