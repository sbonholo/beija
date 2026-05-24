// Edge function: process_pending_deletions
//
// Cron job: finds deletion_requests where scheduled_for <= now() AND
// cancelled_at IS NULL, deletes the user's Storage files, then deletes the
// auth.users row (cascades to profiles → photos, swipes, matches, messages,
// reports, blocks, deletion_requests via FK ON DELETE CASCADE).
//
// Auth: requires the SERVICE ROLE key. Will reject anything else. Intended to
// be invoked by GitHub Actions on a cron schedule (see
// .github/workflows/process-deletions.yml) or by Supabase scheduled functions.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.106.1';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const STORAGE_BUCKET = 'profile-photos';
const BATCH_SIZE = 100;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Reject anything not authenticated as the service role.
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

  if (queryErr) return jsonResponse({ error: 'query_failed', detail: queryErr.message }, { status: 500 });
  if (!pending || pending.length === 0) {
    return jsonResponse({ ok: true, processed: 0, errors: [] });
  }

  const errors: { user_id: string; error: string }[] = [];
  let processed = 0;

  for (const row of pending) {
    const userId = row.user_id as string;
    try {
      // 1) Remove the user's Storage photos.
      const { data: files } = await admin.storage.from(STORAGE_BUCKET).list(userId);
      if (files && files.length > 0) {
        const paths = files.map((f) => `${userId}/${f.name}`);
        const { error: removeErr } = await admin.storage
          .from(STORAGE_BUCKET)
          .remove(paths);
        if (removeErr) throw new Error(`storage_remove: ${removeErr.message}`);
      }

      // 2) Delete the auth.users row. Cascades through profiles via the FK in
      // the profiles table (profiles.id references auth.users(id) on delete cascade)
      // which in turn cascades to photos / swipes / matches / messages / reports /
      // blocks / deletion_requests via their own ON DELETE CASCADE clauses.
      const { error: deleteErr } = await admin.auth.admin.deleteUser(userId);
      if (deleteErr) throw new Error(`auth_delete: ${deleteErr.message}`);

      processed++;
    } catch (e) {
      errors.push({
        user_id: userId,
        error: e instanceof Error ? e.message : 'unknown',
      });
    }
  }

  return jsonResponse({ ok: true, processed, errors });
});
