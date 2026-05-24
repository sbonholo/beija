/**
 * Supabase admin adapter for the backend.
 *
 * Uses the SUPABASE_SERVICE_ROLE_KEY which bypasses Row Level Security.
 * NEVER expose this key to the client. This module is server-only.
 *
 * Used during the SQLite → Supabase migration (see MIGRATION.md) and for
 * operations the client cannot perform under RLS (moderation, scheduled
 * deletion, batch reads across users).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars. ' +
        'Set them before calling the adapter.',
    );
  }
  cached = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export interface MatchedUser {
  matchId: string;
  otherUserId: string;
  otherName: string | null;
  otherPhotoUrl: string | null;
  createdAt: string;
  lastMessageAt: string | null;
}

/**
 * Return all matches for a given user, joined with the other user's name and
 * primary photo. Designed for /matches endpoint backed by Supabase.
 */
export async function getMatchedUsers(userId: string): Promise<MatchedUser[]> {
  const supabase = getSupabaseAdmin();
  const { data: matches, error } = await supabase
    .from('matches')
    .select('id, user1_id, user2_id, created_at, last_message_at')
    .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!matches || matches.length === 0) return [];

  const otherIds = matches.map((m) => (m.user1_id === userId ? m.user2_id : m.user1_id));

  const [{ data: profiles }, { data: photos }] = await Promise.all([
    supabase.from('profiles').select('id, name').in('id', otherIds),
    supabase.from('photos').select('user_id, url').in('user_id', otherIds).eq('slot', 0),
  ]);

  const nameById = new Map<string, string | null>(
    (profiles ?? []).map((p) => [p.id, p.name ?? null]),
  );
  const photoById = new Map<string, string>(
    (photos ?? []).map((p) => [p.user_id, p.url]),
  );

  return matches.map((m) => {
    const otherId = m.user1_id === userId ? m.user2_id : m.user1_id;
    return {
      matchId: m.id,
      otherUserId: otherId,
      otherName: nameById.get(otherId) ?? null,
      otherPhotoUrl: photoById.get(otherId) ?? null,
      createdAt: m.created_at,
      lastMessageAt: m.last_message_at,
    };
  });
}

export interface ProcessReportInput {
  reporterId: string;
  reportedId: string;
  reason: string;
  details?: string | null;
}

export interface ProcessReportResult {
  reportId: string;
  autoBlocked: boolean;
  reportedUserOpenReports: number;
}

/**
 * Insert a moderation report and apply automatic side effects:
 *   1. block the reporter ↔ reported pair
 *   2. delete mutual swipes
 *   3. delete the match (if any)
 *   4. if the reported user already has >= 3 pending reports, soft-delete them
 *
 * Returns the created report ID and metadata for the audit log.
 */
export async function processReport(input: ProcessReportInput): Promise<ProcessReportResult> {
  const supabase = getSupabaseAdmin();
  const { reporterId, reportedId, reason, details } = input;

  const { data: report, error: reportErr } = await supabase
    .from('reports')
    .insert({
      reporter_id: reporterId,
      reported_id: reportedId,
      reason,
      details: details ?? null,
    })
    .select('id')
    .single();
  if (reportErr || !report) throw reportErr ?? new Error('report_insert_failed');

  // 1) block
  await supabase
    .from('blocks')
    .insert({ blocker_id: reporterId, blocked_id: reportedId })
    .then((r) => {
      if (r.error && r.error.code !== '23505') throw r.error;
    });

  // 2) mutual swipes
  await supabase
    .from('swipes')
    .delete()
    .or(
      `and(swiper_id.eq.${reporterId},swipee_id.eq.${reportedId}),` +
        `and(swiper_id.eq.${reportedId},swipee_id.eq.${reporterId})`,
    );

  // 3) match
  const lo = reporterId < reportedId ? reporterId : reportedId;
  const hi = reporterId < reportedId ? reportedId : reporterId;
  await supabase.from('matches').delete().eq('user1_id', lo).eq('user2_id', hi);

  // 4) count open reports against the reported user
  const { count } = await supabase
    .from('reports')
    .select('id', { count: 'exact', head: true })
    .eq('reported_id', reportedId)
    .eq('status', 'pending');

  const openReports = count ?? 0;
  if (openReports >= 3) {
    await supabase
      .from('profiles')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', reportedId);
  }

  return {
    reportId: report.id,
    autoBlocked: true,
    reportedUserOpenReports: openReports,
  };
}

export interface ScheduleDeletionResult {
  scheduledFor: string;
  cancelable: boolean;
}

/**
 * LGPD/GDPR-compliant account deletion: schedule deletion 30 days out,
 * soft-delete the profile immediately. The actual data wipe is performed
 * by a cron job that reads `deletion_requests` where scheduled_for <= now()
 * and cancelled_at IS NULL.
 */
export async function scheduleAccountDeletion(
  userId: string,
  reasons: string[] = [],
): Promise<ScheduleDeletionResult> {
  const supabase = getSupabaseAdmin();
  const now = new Date();
  const scheduledFor = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const { error: reqErr } = await supabase.from('deletion_requests').upsert(
    {
      user_id: userId,
      requested_at: now.toISOString(),
      scheduled_for: scheduledFor.toISOString(),
      cancelled_at: null,
    },
    { onConflict: 'user_id' },
  );
  if (reqErr) throw reqErr;

  const { error: softErr } = await supabase
    .from('profiles')
    .update({ deleted_at: now.toISOString(), push_token: null })
    .eq('id', userId);
  if (softErr) throw softErr;

  // reasons are not persisted in the schema yet — log for now.
  if (reasons.length > 0) {
    console.log('[scheduleAccountDeletion]', userId, 'reasons:', reasons);
  }

  return {
    scheduledFor: scheduledFor.toISOString(),
    cancelable: true,
  };
}
