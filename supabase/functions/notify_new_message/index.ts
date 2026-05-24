// Edge function: notify_new_message
//
// Called by the client immediately after inserting a message. Looks up the
// other participant's push_token + push_platform, dispatches APNs or FCM.
//
// Auth: requires user JWT. We verify the caller is a participant of the match.
//
// Request body: { match_id: string, preview?: string }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.106.1';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { sendApns } from '../_shared/apns.ts';
import { sendFcm } from '../_shared/fcm.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, { status: 405 });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'missing_authorization' }, { status: 401 });

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: userData } = await userClient.auth.getUser();
  const user = userData.user;
  if (!user) return jsonResponse({ error: 'unauthorized' }, { status: 401 });

  let body: { match_id?: string; preview?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, { status: 400 });
  }
  if (!body.match_id) return jsonResponse({ error: 'missing_match_id' }, { status: 400 });

  // userClient honors RLS — if the user can read this match they're a participant.
  const { data: match } = await userClient
    .from('matches')
    .select('user1_id, user2_id')
    .eq('id', body.match_id)
    .maybeSingle();
  if (!match) return jsonResponse({ error: 'match_not_found_or_forbidden' }, { status: 404 });

  const otherId = match.user1_id === user.id ? match.user2_id : match.user1_id;

  // Admin client bypasses RLS to read push_token (otherwise self-only).
  const [{ data: otherProfile }, { data: senderProfile }] = await Promise.all([
    admin
      .from('profiles')
      .select('push_token, push_platform, deleted_at')
      .eq('id', otherId)
      .maybeSingle(),
    admin.from('profiles').select('name').eq('id', user.id).maybeSingle(),
  ]);

  if (!otherProfile?.push_token || otherProfile.deleted_at) {
    return jsonResponse({ ok: true, delivered: false, reason: 'no_token_or_deleted' });
  }

  const title = senderProfile?.name ?? 'Beija';
  const text = body.preview?.slice(0, 100) ?? 'Nova mensagem 💬';
  const data = {
    type: 'new_message',
    matchId: body.match_id,
    fromUserId: user.id,
  };

  let result;
  if (otherProfile.push_platform === 'ios') {
    result = await sendApns({ token: otherProfile.push_token, title, body: text, data });
  } else if (otherProfile.push_platform === 'android') {
    result = await sendFcm({
      token: otherProfile.push_token,
      title,
      body: text,
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
    });
  } else {
    // Unknown platform — try APNs first.
    result = await sendApns({ token: otherProfile.push_token, title, body: text, data });
  }

  return jsonResponse({ ok: true, ...result });
});
