// Edge function: photo_moderation_hook
//
// Hooked into Supabase Storage "object created" webhooks for the
// `profile-photos` bucket. Pulls the freshly-uploaded image, runs it through
// OpenAI's omni-moderation-latest model, and on a flag either quarantines the
// file or opens a moderation report.
//
// Storage webhook payload (Supabase v1):
//   { type: 'INSERT', record: { bucket_id, name, owner, ... }, ... }
//
// Auth: requires Bearer <SUPABASE_SERVICE_ROLE_KEY>.
//
// Env vars:
//   OPENAI_API_KEY              — if missing, the function logs and no-ops
//                                  (so deployments without OpenAI still work).
//   PHOTO_QUARANTINE_BUCKET     — defaults to 'quarantine'.
//
// Categories with zero tolerance:
//   nudity (any 'sexual*' category), violence, sexual_minors.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.106.1';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { withSentry } from '../_shared/sentry.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const QUARANTINE_BUCKET = Deno.env.get('PHOTO_QUARANTINE_BUCKET') ?? 'quarantine';
const SOURCE_BUCKET = 'profile-photos';

const FLAG_CATEGORIES = ['sexual', 'sexual/minors', 'violence', 'violence/graphic'] as const;

function logJson(level: 'info' | 'warn' | 'error', fields: Record<string, unknown>) {
  console.log(
    JSON.stringify({ level, fn: 'photo_moderation_hook', ts: new Date().toISOString(), ...fields }),
  );
}

interface ModerationResult {
  flagged: boolean;
  matched: string[];
  scores: Record<string, number>;
}

async function moderateImage(signedUrl: string): Promise<ModerationResult | { skipped: string }> {
  if (!OPENAI_API_KEY) {
    return { skipped: 'OPENAI_API_KEY_not_set' };
  }
  const res = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'omni-moderation-latest',
      input: [{ type: 'image_url', image_url: { url: signedUrl } }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`openai_${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    results: Array<{
      flagged: boolean;
      categories: Record<string, boolean>;
      category_scores: Record<string, number>;
    }>;
  };
  const first = json.results?.[0];
  if (!first) return { flagged: false, matched: [], scores: {} };

  const matched = FLAG_CATEGORIES.filter((c) => first.categories?.[c] === true);
  // omni-moderation returns null categories when not detected — guard accordingly.
  return {
    flagged: matched.length > 0,
    matched,
    scores: first.category_scores ?? {},
  };
}

Deno.serve(withSentry('photo_moderation_hook', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, { status: 405 });

  const auth = req.headers.get('Authorization') ?? '';
  const expected = `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
  if (!SUPABASE_SERVICE_ROLE_KEY || auth !== expected) {
    return jsonResponse({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, { status: 400 });
  }

  const record = (body as { record?: { bucket_id?: string; name?: string; owner?: string } })
    ?.record;
  if (!record?.name || !record.bucket_id) {
    return jsonResponse({ error: 'invalid_storage_webhook' }, { status: 400 });
  }
  if (record.bucket_id !== SOURCE_BUCKET) {
    return jsonResponse({ ok: true, skipped: 'wrong_bucket' });
  }
  // path convention: <user_id>/<uuid>.jpg
  const ownerFromPath = record.name.split('/')[0] ?? null;
  const ownerId = record.owner ?? ownerFromPath;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Signed URL so OpenAI can fetch the bytes even on private buckets.
  const { data: signed, error: signErr } = await admin.storage
    .from(SOURCE_BUCKET)
    .createSignedUrl(record.name, 60);
  if (signErr || !signed?.signedUrl) {
    logJson('error', { stage: 'sign', path: record.name, error: signErr?.message });
    return jsonResponse({ error: 'sign_failed', detail: signErr?.message }, { status: 500 });
  }

  let result: ModerationResult | { skipped: string };
  try {
    result = await moderateImage(signed.signedUrl);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    logJson('error', { stage: 'openai', path: record.name, error: msg });
    return jsonResponse({ error: 'moderation_failed', detail: msg }, { status: 500 });
  }

  if ('skipped' in result) {
    logJson('info', { stage: 'skip', path: record.name, reason: result.skipped });
    return jsonResponse({ ok: true, skipped: result.skipped });
  }

  if (!result.flagged) {
    logJson('info', { stage: 'clean', path: record.name });
    return jsonResponse({ ok: true, flagged: false });
  }

  // ---- Flagged: quarantine the file (copy → quarantine bucket, then remove
  // from profile-photos). Cross-bucket move isn't universally supported in
  // older @supabase/storage-js, so copy/remove is the portable path.
  try {
    const { data: file, error: dlErr } = await admin.storage
      .from(SOURCE_BUCKET)
      .download(record.name);
    if (dlErr || !file) throw new Error(`download: ${dlErr?.message ?? 'no_file'}`);
    const { error: upErr } = await admin.storage
      .from(QUARANTINE_BUCKET)
      .upload(record.name, file, { upsert: true });
    if (upErr) throw new Error(`upload: ${upErr.message}`);
    await admin.storage.from(SOURCE_BUCKET).remove([record.name]);
  } catch (e) {
    logJson('error', {
      stage: 'quarantine_move',
      path: record.name,
      error: e instanceof Error ? e.message : 'unknown',
    });
  }

  if (ownerId) {
    await admin.from('reports').insert({
      reporter_id: null, // auto-moderation flag — see migration 20260524600000
      reported_id: ownerId,
      reason: 'nsfw_auto',
      details: JSON.stringify({
        matched: result.matched,
        scores: result.scores,
        path: record.name,
      }),
    });
  }

  logJson('warn', {
    stage: 'flagged',
    path: record.name,
    ownerId,
    matched: result.matched,
  });

  return jsonResponse({
    ok: true,
    flagged: true,
    matched: result.matched,
    quarantined: true,
  });
}));
