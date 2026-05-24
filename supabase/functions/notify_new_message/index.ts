// Edge function: notify_new_message
//
// Two invocation modes:
//
//   A) DB trigger (preferred): pg_net.http_post fired by AFTER INSERT on
//      `messages`. Auth header carries the service-role key; body is the
//      Supabase webhook envelope { type, table, record }.
//
//   B) Legacy client-fire: a user JWT calls the function directly with
//      { match_id, preview }. Kept for backwards compat.
//
// Server-side behavior in both modes:
//   - skip if recipient has mute_notifications = true
//   - skip if a notification_log row of (recipient_id, sender_id, 'new_message')
//     was written less than 30s ago (rate limit)
//   - body truncated to 100 chars
//   - log structured JSON (one line per dispatch) and an audit row in
//     notification_log

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.106.1';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { withSentry } from '../_shared/sentry.ts';
import { sendApns } from '../_shared/apns.ts';
import { sendFcm } from '../_shared/fcm.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const RATE_LIMIT_SECONDS = 30;
const BODY_MAX_CHARS = 100;

interface MessageRow {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
}

function logJson(level: 'info' | 'warn' | 'error', fields: Record<string, unknown>) {
  console.log(JSON.stringify({ level, fn: 'notify_new_message', ts: new Date().toISOString(), ...fields }));
}

async function resolveMessage(
  admin: SupabaseClient,
  body: unknown,
  authedUserId: string | null,
): Promise<{ message: MessageRow; senderId: string; recipientId: string } | { error: string; status: number }> {
  // Mode A — DB webhook envelope
  if (typeof body === 'object' && body !== null && (body as Record<string, unknown>).record) {
    const record = (body as { record: MessageRow }).record;
    if (!record?.id || !record.match_id || !record.sender_id || !record.content) {
      return { error: 'invalid_webhook_record', status: 400 };
    }
    const { data: match } = await admin
      .from('matches')
      .select('user1_id, user2_id')
      .eq('id', record.match_id)
      .maybeSingle();
    if (!match) return { error: 'match_not_found', status: 404 };
    const recipientId =
      match.user1_id === record.sender_id ? match.user2_id : match.user1_id;
    return { message: record, senderId: record.sender_id, recipientId };
  }

  // Mode B — legacy client invocation
  const b = body as { match_id?: string; preview?: string };
  if (!b?.match_id || !authedUserId) {
    return { error: 'missing_match_id_or_auth', status: 400 };
  }
  const { data: match } = await admin
    .from('matches')
    .select('user1_id, user2_id')
    .eq('id', b.match_id)
    .maybeSingle();
  if (!match) return { error: 'match_not_found', status: 404 };
  if (match.user1_id !== authedUserId && match.user2_id !== authedUserId) {
    return { error: 'forbidden', status: 403 };
  }
  const recipientId =
    match.user1_id === authedUserId ? match.user2_id : match.user1_id;
  return {
    message: {
      id: 'legacy',
      match_id: b.match_id,
      sender_id: authedUserId,
      content: b.preview ?? '',
    },
    senderId: authedUserId,
    recipientId,
  };
}

Deno.serve(withSentry('notify_new_message', async (req) => {
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

  const resolved = await resolveMessage(admin, body, authedUserId);
  if ('error' in resolved) {
    return jsonResponse({ error: resolved.error }, { status: resolved.status });
  }
  const { message, senderId, recipientId } = resolved;

  // --- Recipient + sender lookup ----------------------------------------
  const [{ data: recipient }, { data: sender }] = await Promise.all([
    admin
      .from('profiles')
      .select('push_token, push_platform, deleted_at, mute_notifications')
      .eq('id', recipientId)
      .maybeSingle(),
    admin.from('profiles').select('name').eq('id', senderId).maybeSingle(),
  ]);

  if (!recipient || recipient.deleted_at) {
    logJson('info', { matchId: message.match_id, recipientId, skip: 'deleted_or_missing' });
    return jsonResponse({ ok: true, delivered: false, reason: 'recipient_deleted_or_missing' });
  }
  if (recipient.mute_notifications) {
    logJson('info', { matchId: message.match_id, recipientId, skip: 'muted' });
    await admin.from('notification_log').insert({
      recipient_id: recipientId,
      sender_id: senderId,
      notification_type: 'new_message',
      delivered: false,
      reason: 'muted',
    });
    return jsonResponse({ ok: true, delivered: false, reason: 'muted' });
  }
  if (!recipient.push_token) {
    logJson('info', { matchId: message.match_id, recipientId, skip: 'no_token' });
    return jsonResponse({ ok: true, delivered: false, reason: 'no_token' });
  }

  // --- Rate limit: 1 push / 30s per (recipient, sender) ----------------
  const since = new Date(Date.now() - RATE_LIMIT_SECONDS * 1000).toISOString();
  const { data: recent } = await admin
    .from('notification_log')
    .select('id, sent_at')
    .eq('recipient_id', recipientId)
    .eq('sender_id', senderId)
    .eq('notification_type', 'new_message')
    .eq('delivered', true)
    .gte('sent_at', since)
    .limit(1);
  if (recent && recent.length > 0) {
    logJson('info', { matchId: message.match_id, recipientId, skip: 'rate_limited' });
    await admin.from('notification_log').insert({
      recipient_id: recipientId,
      sender_id: senderId,
      notification_type: 'new_message',
      delivered: false,
      reason: 'rate_limited',
    });
    return jsonResponse({ ok: true, delivered: false, reason: 'rate_limited' });
  }

  // --- Dispatch --------------------------------------------------------
  const title = sender?.name ?? 'Beija';
  const text = (message.content ?? '').slice(0, BODY_MAX_CHARS);
  const data = {
    type: 'message',
    matchId: message.match_id,
    fromUserId: senderId,
  };

  let result;
  if (recipient.push_platform === 'android') {
    result = await sendFcm({
      token: recipient.push_token,
      title,
      body: text,
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
    });
  } else {
    result = await sendApns({ token: recipient.push_token, title, body: text, data });
  }

  logJson(result.delivered ? 'info' : 'warn', {
    matchId: message.match_id,
    recipientId,
    senderId,
    delivered: result.delivered,
    reason: result.reason,
    platform: recipient.push_platform ?? 'apns_default',
  });

  await admin.from('notification_log').insert({
    recipient_id: recipientId,
    sender_id: senderId,
    notification_type: 'new_message',
    delivered: !!result.delivered,
    reason: result.reason ?? null,
  });

  return jsonResponse({ ok: true, ...result });
}));
