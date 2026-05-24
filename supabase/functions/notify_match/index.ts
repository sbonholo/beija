// Edge function: notify_match
//
// Fired AFTER INSERT on `matches` via pg_net (preferred), or invoked by the
// client right after detecting the mutual swipe (legacy). Pushes to BOTH
// participants with a personalized title and the `match.caf` sound.
//
// Both modes share an admin client for recipient lookups; client mode keeps
// the participant check via user JWT for safety.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.106.1';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { withSentry } from '../_shared/sentry.ts';
import { sendApns } from '../_shared/apns.ts';
import { sendFcm } from '../_shared/fcm.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const MATCH_SOUND = 'match.caf';

function logJson(level: 'info' | 'warn' | 'error', fields: Record<string, unknown>) {
  console.log(JSON.stringify({ level, fn: 'notify_match', ts: new Date().toISOString(), ...fields }));
}

async function dispatchToProfile(
  admin: SupabaseClient,
  recipientId: string,
  otherId: string,
  matchId: string,
  nameById: Map<string, string>,
): Promise<{ recipient: string; delivered: boolean; reason?: string }> {
  const { data: profile } = await admin
    .from('profiles')
    .select('push_token, push_platform, deleted_at, mute_notifications')
    .eq('id', recipientId)
    .maybeSingle();

  if (!profile || profile.deleted_at) {
    return { recipient: recipientId, delivered: false, reason: 'recipient_deleted_or_missing' };
  }
  if (profile.mute_notifications) {
    await admin.from('notification_log').insert({
      recipient_id: recipientId,
      sender_id: otherId,
      notification_type: 'new_match',
      delivered: false,
      reason: 'muted',
    });
    return { recipient: recipientId, delivered: false, reason: 'muted' };
  }
  if (!profile.push_token) {
    return { recipient: recipientId, delivered: false, reason: 'no_token' };
  }

  const title = 'Novo match! 💋';
  const otherName = nameById.get(otherId) ?? 'alguém';
  const body = `Você deu match com ${otherName}`;
  const data = { type: 'match', matchId, otherUserId: otherId };

  const result =
    profile.push_platform === 'android'
      ? await sendFcm({
          token: profile.push_token,
          title,
          body,
          sound: 'match',
          data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
        })
      : await sendApns({
          token: profile.push_token,
          title,
          body,
          sound: MATCH_SOUND,
          data,
        });

  await admin.from('notification_log').insert({
    recipient_id: recipientId,
    sender_id: otherId,
    notification_type: 'new_match',
    delivered: !!result.delivered,
    reason: result.reason ?? null,
  });

  return { recipient: recipientId, delivered: !!result.delivered, reason: result.reason };
}

interface MatchRow {
  id: string;
  user1_id: string;
  user2_id: string;
}

async function resolveMatch(
  admin: SupabaseClient,
  body: unknown,
  authedUserId: string | null,
): Promise<MatchRow | { error: string; status: number }> {
  if (typeof body === 'object' && body !== null && (body as Record<string, unknown>).record) {
    const r = (body as { record: MatchRow }).record;
    if (!r?.id || !r.user1_id || !r.user2_id) return { error: 'invalid_webhook_record', status: 400 };
    return r;
  }
  const b = body as { match_id?: string };
  if (!b?.match_id || !authedUserId) return { error: 'missing_match_id_or_auth', status: 400 };
  const { data } = await admin
    .from('matches')
    .select('id, user1_id, user2_id')
    .eq('id', b.match_id)
    .maybeSingle();
  if (!data) return { error: 'match_not_found', status: 404 };
  if (data.user1_id !== authedUserId && data.user2_id !== authedUserId) {
    return { error: 'forbidden', status: 403 };
  }
  return data;
}

Deno.serve(withSentry('notify_match', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, { status: 405 });

  const authHeader = req.headers.get('Authorization') ?? '';
  const isServiceRole =
    !!SUPABASE_SERVICE_ROLE_KEY && authHeader === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  let authedUserId: string | null = null;
  if (!isServiceRole) {
    if (!authHeader) return jsonResponse({ error: 'missing_authorization' }, { status: 401 });
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data } = await userClient.auth.getUser();
    if (!data.user) return jsonResponse({ error: 'unauthorized' }, { status: 401 });
    authedUserId = data.user.id;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, { status: 400 });
  }

  const resolved = await resolveMatch(admin, body, authedUserId);
  if ('error' in resolved) {
    return jsonResponse({ error: resolved.error }, { status: resolved.status });
  }

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, name')
    .in('id', [resolved.user1_id, resolved.user2_id]);
  const nameById = new Map<string, string>(
    (profiles ?? []).map((p) => [p.id as string, (p.name as string | null) ?? 'alguém']),
  );

  const results = await Promise.all(
    [resolved.user1_id, resolved.user2_id].map((recipient) =>
      dispatchToProfile(
        admin,
        recipient,
        recipient === resolved.user1_id ? resolved.user2_id : resolved.user1_id,
        resolved.id,
        nameById,
      ),
    ),
  );

  logJson('info', { matchId: resolved.id, results });
  return jsonResponse({ ok: true, results });
}));
