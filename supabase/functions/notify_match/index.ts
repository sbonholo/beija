// Edge function: notify_match
//
// Called by the client right after detecting a new mutual-swipe match. Sends a
// push to BOTH participants (the receiver of the match modal on this device,
// and the other person who isn't viewing the deck right now).
//
// Request body: { match_id: string }
// Auth: user JWT. Verifies caller is a participant.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.106.1';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { sendApns } from '../_shared/apns.ts';
import { sendFcm } from '../_shared/fcm.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

async function dispatchToProfile(
  admin: ReturnType<typeof createClient>,
  recipientId: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
): Promise<{ recipient: string; delivered: boolean; reason?: string }> {
  const { data: profile } = await admin
    .from('profiles')
    .select('push_token, push_platform, deleted_at')
    .eq('id', recipientId)
    .maybeSingle();
  if (!profile?.push_token || profile.deleted_at) {
    return { recipient: recipientId, delivered: false, reason: 'no_token_or_deleted' };
  }
  const stringData = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, String(v)]),
  );
  const result =
    profile.push_platform === 'android'
      ? await sendFcm({ token: profile.push_token, title, body, data: stringData })
      : await sendApns({ token: profile.push_token, title, body, data });
  return { recipient: recipientId, delivered: result.delivered, reason: result.reason };
}

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

  let body: { match_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, { status: 400 });
  }
  if (!body.match_id) return jsonResponse({ error: 'missing_match_id' }, { status: 400 });

  const { data: match } = await userClient
    .from('matches')
    .select('user1_id, user2_id')
    .eq('id', body.match_id)
    .maybeSingle();
  if (!match) return jsonResponse({ error: 'match_not_found_or_forbidden' }, { status: 404 });

  // Lookup both participant names for personalized titles.
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, name')
    .in('id', [match.user1_id, match.user2_id]);
  const nameById = new Map<string, string>(
    (profiles ?? []).map((p) => [p.id as string, (p.name as string | null) ?? 'Beija']),
  );

  const results = await Promise.all(
    [match.user1_id, match.user2_id].map((recipientId) => {
      const otherId = recipientId === match.user1_id ? match.user2_id : match.user1_id;
      return dispatchToProfile(
        admin,
        recipientId,
        'É beijo na boca!',
        `Você deu match com ${nameById.get(otherId) ?? 'alguém'} 💋`,
        { type: 'new_match', matchId: body.match_id, otherUserId: otherId },
      );
    }),
  );

  return jsonResponse({ ok: true, results });
});
