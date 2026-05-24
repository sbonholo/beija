// Edge function: moderate_photo
//
// PRE-upload photo moderation via Sightengine. Called by the client BEFORE
// pushing the file to Supabase Storage. Defense in depth — `photo_moderation_hook`
// (FASE O) still runs server-side post-upload using OpenAI as a backstop.
//
// Apple Guideline 1.2 (User-Generated Content): we need a method for
// filtering objectionable material. This is the primary path.
//
// Auth: requires a user JWT.
//
// Request body (JSON):
//   { "photo_base64": "<base64 string, no data: prefix>", "mime_type"?: "image/jpeg" }
//   — or —
//   { "photo_url": "https://..." }
//
// Response:
//   { approved: true,  reasons: [], scores: { ... } }
//   { approved: false, reasons: ['nudity', 'minor'], scores: { ... } }
//   On rate limit: 429 { approved: false, reasons: ['rate_limited'] }
//   On unconfigured (no Sightengine key): { approved: true, reasons: [], unconfigured: true }
//
// Models hit at Sightengine: nudity-2.1, weapon, recreational_drug, gore,
// offensive, minor, scam.
//
// Thresholds — anything above triggers a reject:
//   nudity.sexual_activity > 0.5
//   nudity.sexual_display  > 0.5
//   minor.prob             > 0.3   (zero tolerance toward suspected minors)
//   gore.prob              > 0.5
//   weapon.classes.firearm > 0.5 (or any weapon class)
//   offensive.* (any)      > 0.5
//   drug.prob              > 0.6
//   scam.prob              > 0.7

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.106.1';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { withSentry } from '../_shared/sentry.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SIGHTENGINE_USER = Deno.env.get('SIGHTENGINE_USER') ?? '';
const SIGHTENGINE_SECRET = Deno.env.get('SIGHTENGINE_SECRET') ?? '';
const MODELS = 'nudity-2.1,weapon,recreational_drug,medical,gore,offensive,minor,scam';
const RATE_LIMIT_PER_MIN = 10;

interface RequestBody {
  photo_base64?: string;
  photo_url?: string;
  mime_type?: string;
}

interface ModerationResult {
  approved: boolean;
  reasons: string[];
  scores: Record<string, number>;
}

function logJson(level: 'info' | 'warn' | 'error', fields: Record<string, unknown>) {
  console.log(JSON.stringify({ level, fn: 'moderate_photo', ts: new Date().toISOString(), ...fields }));
}

/** Decode base64 → Uint8Array (no atob in Deno globals on all runtimes). */
function decodeBase64(b64: string): Uint8Array {
  // Strip data: prefix if accidentally included.
  const cleaned = b64.replace(/^data:[^;]+;base64,/, '');
  const bin = atob(cleaned);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

interface SightengineNudityV21 {
  sexual_activity?: number;
  sexual_display?: number;
  erotica?: number;
  very_suggestive?: number;
  suggestive?: number;
  mildly_suggestive?: number;
  none?: number;
}

interface SightengineResponse {
  status?: string;
  error?: { message?: string; code?: string };
  nudity?: SightengineNudityV21;
  weapon?: { prob?: number; classes?: Record<string, number> };
  recreational_drug?: { prob?: number };
  medical?: { prob?: number };
  gore?: { prob?: number };
  offensive?: Record<string, number>;
  minor?: { prob?: number };
  scam?: { prob?: number };
}

function evaluate(resp: SightengineResponse): ModerationResult {
  const reasons: string[] = [];
  const scores: Record<string, number> = {};

  const nud = resp.nudity ?? {};
  scores.nudity_sexual_activity = nud.sexual_activity ?? 0;
  scores.nudity_sexual_display = nud.sexual_display ?? 0;
  scores.nudity_erotica = nud.erotica ?? 0;
  if ((nud.sexual_activity ?? 0) > 0.5) reasons.push('nudity_sexual_activity');
  if ((nud.sexual_display ?? 0) > 0.5) reasons.push('nudity_sexual_display');
  if ((nud.erotica ?? 0) > 0.7) reasons.push('nudity_erotica');

  const minorProb = resp.minor?.prob ?? 0;
  scores.minor = minorProb;
  if (minorProb > 0.3) reasons.push('minor');

  const goreProb = resp.gore?.prob ?? 0;
  scores.gore = goreProb;
  if (goreProb > 0.5) reasons.push('gore');

  const weaponClasses = resp.weapon?.classes ?? {};
  let weaponMax = 0;
  for (const v of Object.values(weaponClasses)) if (v > weaponMax) weaponMax = v;
  scores.weapon = weaponMax;
  if (weaponMax > 0.5) reasons.push('weapon');

  const drugProb = resp.recreational_drug?.prob ?? 0;
  scores.recreational_drug = drugProb;
  if (drugProb > 0.6) reasons.push('drug');

  const scamProb = resp.scam?.prob ?? 0;
  scores.scam = scamProb;
  if (scamProb > 0.7) reasons.push('scam');

  const offensive = resp.offensive ?? {};
  let offMax = 0;
  let offKey = '';
  for (const [k, v] of Object.entries(offensive)) {
    if (typeof v === 'number' && v > offMax) {
      offMax = v;
      offKey = k;
    }
  }
  scores.offensive = offMax;
  if (offMax > 0.5) reasons.push(`offensive_${offKey || 'generic'}`);

  return { approved: reasons.length === 0, reasons, scores };
}

async function callSightengine(body: RequestBody): Promise<SightengineResponse> {
  const form = new FormData();
  form.append('models', MODELS);
  form.append('api_user', SIGHTENGINE_USER);
  form.append('api_secret', SIGHTENGINE_SECRET);

  if (body.photo_base64) {
    const bytes = decodeBase64(body.photo_base64);
    const blob = new Blob([bytes], { type: body.mime_type ?? 'image/jpeg' });
    form.append('media', blob, 'photo.jpg');
  } else if (body.photo_url) {
    form.append('url', body.photo_url);
  } else {
    throw new Error('missing_media');
  }

  const res = await fetch('https://api.sightengine.com/1.0/check.json', {
    method: 'POST',
    body: form,
  });
  const json = (await res.json()) as SightengineResponse;
  if (!res.ok || json.status !== 'success') {
    throw new Error(`sightengine_${res.status}: ${json.error?.message ?? 'unknown'}`);
  }
  return json;
}

Deno.serve(withSentry('moderate_photo', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, { status: 405 });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return jsonResponse({ error: 'missing_authorization' }, { status: 401 });

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData.user;
  if (!user) return jsonResponse({ error: 'unauthorized' }, { status: 401 });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Rate limit: 10 calls / minute / user.
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count: recentCount } = await admin
    .from('photo_moderation_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', since);
  if ((recentCount ?? 0) >= RATE_LIMIT_PER_MIN) {
    await admin.from('photo_moderation_log').insert({
      user_id: user.id,
      decision: 'rate_limited',
      reasons: ['rate_limited'],
      scores: { window: recentCount },
    });
    logJson('warn', { userId: user.id, rateLimited: true, recentCount });
    return jsonResponse(
      { approved: false, reasons: ['rate_limited'] },
      { status: 429 },
    );
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: 'invalid_json' }, { status: 400 });
  }
  if (!body.photo_base64 && !body.photo_url) {
    return jsonResponse({ error: 'missing_photo_base64_or_url' }, { status: 400 });
  }

  // Unconfigured: skip Sightengine, fail-open, but log.
  if (!SIGHTENGINE_USER || !SIGHTENGINE_SECRET) {
    await admin.from('photo_moderation_log').insert({
      user_id: user.id,
      decision: 'unconfigured',
      reasons: [],
      scores: {},
    });
    logJson('warn', { userId: user.id, unconfigured: true });
    return jsonResponse({ approved: true, reasons: [], scores: {}, unconfigured: true });
  }

  let result: ModerationResult;
  try {
    const resp = await callSightengine(body);
    result = evaluate(resp);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    await admin.from('photo_moderation_log').insert({
      user_id: user.id,
      decision: 'error',
      reasons: ['provider_error'],
      scores: { error: msg.slice(0, 200) },
    });
    logJson('error', { userId: user.id, error: msg });
    // Fail-open at the client: the post-upload hook (OpenAI) will still run.
    return jsonResponse({ approved: true, reasons: [], scores: {}, provider_error: true });
  }

  await admin.from('photo_moderation_log').insert({
    user_id: user.id,
    decision: result.approved ? 'approved' : 'rejected',
    reasons: result.reasons,
    scores: result.scores,
  });

  logJson(result.approved ? 'info' : 'warn', {
    userId: user.id,
    decision: result.approved ? 'approved' : 'rejected',
    reasons: result.reasons,
  });

  return jsonResponse(result);
}));
