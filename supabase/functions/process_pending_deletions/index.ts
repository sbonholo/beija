// Edge function: process_pending_deletions  (a.k.a. account_deletion_cron)
//
// Scheduled job (1×/day). Walks `deletion_requests` where scheduled_for <= now()
// AND cancelled_at IS NULL, then for each user:
//
//   1) ANONYMIZE the profile (name='Conta deletada', bio=null, photos rows
//      cleared, push_token cleared) — partner-facing safety in case any later
//      step fails midway.
//   2) HARD-DELETE Storage objects under profile-photos/<userId>/.
//   3) HARD-DELETE auth.users (cascades to profiles → swipes/matches/messages/
//      reports/blocks/photos/deletion_requests via FK ON DELETE CASCADE).
//
// Structured JSON logs (one per row + a final summary) so this is observable in
// Supabase log explorer.
//
// Auth: requires Bearer <SUPABASE_SERVICE_ROLE_KEY>. Anything else 401s.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.106.1';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { withSentry } from '../_shared/sentry.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const STORAGE_BUCKET = 'profile-photos';
const BATCH_SIZE = 100;

function logJson(level: 'info' | 'warn' | 'error', fields: Record<string, unknown>) {
  console.log(
    JSON.stringify({ level, fn: 'process_pending_deletions', ts: new Date().toISOString(), ...fields }),
  );
}

Deno.serve(withSentry('process_pending_deletions', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const auth = req.headers.get('Authorization') ?? '';
  const expected = `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
  if (!SUPABASE_SERVICE_ROLE_KEY || auth !== expected) {
    return jsonResponse({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: pending, error: queryErr } = await admin
    .from('deletion_requests')
    .select('user_id, scheduled_for')
    .is('cancelled_at', null)
    .lte('scheduled_for', new Date().toISOString())
    .limit(BATCH_SIZE);

  if (queryErr) {
    logJson('error', { stage: 'query', detail: queryErr.message });
    return jsonResponse({ error: 'query_failed', detail: queryErr.message }, { status: 500 });
  }
  if (!pending || pending.length === 0) {
    logJson('info', { stage: 'idle', batch: 0 });
    return jsonResponse({ ok: true, processed: 0, errors: [] });
  }

  const errors: { user_id: string; error: string; stage: string }[] = [];
  let processed = 0;

  for (const row of pending) {
    const userId = row.user_id as string;

    // 1) Anonymize first — partner-visible safety net.
    const { error: anonErr } = await admin
      .from('profiles')
      .update({
        name: 'Conta deletada',
        bio: null,
        push_token: null,
        push_platform: null,
        deleted_at: new Date().toISOString(),
      })
      .eq('id', userId);
    if (anonErr) {
      logJson('error', { stage: 'anonymize', userId, error: anonErr.message });
      errors.push({ user_id: userId, error: anonErr.message, stage: 'anonymize' });
      continue;
    }

    // Clear photos table rows up front (storage drained next).
    const { error: photosErr } = await admin.from('photos').delete().eq('user_id', userId);
    if (photosErr) {
      logJson('warn', { stage: 'photos_rows', userId, error: photosErr.message });
    }

    // 2) Drain storage objects.
    try {
      const { data: files } = await admin.storage.from(STORAGE_BUCKET).list(userId);
      if (files && files.length > 0) {
        const paths = files.map((f) => `${userId}/${f.name}`);
        const { error: removeErr } = await admin.storage.from(STORAGE_BUCKET).remove(paths);
        if (removeErr) throw new Error(removeErr.message);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      logJson('error', { stage: 'storage', userId, error: msg });
      errors.push({ user_id: userId, error: msg, stage: 'storage' });
      continue;
    }

    // 3) Hard-delete auth user (cascades the rest).
    const { error: deleteErr } = await admin.auth.admin.deleteUser(userId);
    if (deleteErr) {
      logJson('error', { stage: 'auth_delete', userId, error: deleteErr.message });
      errors.push({ user_id: userId, error: deleteErr.message, stage: 'auth_delete' });
      continue;
    }

    logJson('info', { stage: 'completed', userId });
    processed++;
  }

  logJson('info', { stage: 'summary', batch: pending.length, processed, errored: errors.length });
  return jsonResponse({ ok: true, processed, errors });
}));
