// Edge function: notify_nearby_events
//
// Triggered every 15 minutes via pg_cron → dispatch_edge().
// Finds users near currently-active events who haven't been notified yet
// (one notification per user per event per 12 h), then sends:
//   - APNs  (iOS native, if push_token + push_platform='apns')
//   - FCM   (Android native, if push_token + push_platform='fcm')
//   - Web Push (PWA, if a row exists in push_subscriptions)
//
// Required secrets (set in Supabase dashboard → Edge Functions → Secrets):
//   SUPABASE_URL            — auto-provided
//   SUPABASE_SERVICE_ROLE_KEY — auto-provided
//   VAPID_PUBLIC_KEY        — base64url uncompressed P-256 public key (65 bytes)
//   VAPID_PRIVATE_KEY       — base64url raw P-256 private key (32 bytes)
//   VAPID_SUBJECT           — mailto:contact@beija.app  (or https://beija.app)
//   APNS_* / FCM_*          — same as notify_match / notify_new_message

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.106.1';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { withSentry } from '../_shared/sentry.ts';
import { sendApns } from '../_shared/apns.ts';
import { sendFcm } from '../_shared/fcm.ts';
import { sendWebPush, type WebPushSubscription } from '../_shared/webpush.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:hello@beija.app';

function log(level: 'info' | 'warn' | 'error', fields: Record<string, unknown>) {
  console.log(JSON.stringify({ level, fn: 'notify_nearby_events', ts: new Date().toISOString(), ...fields }));
}

interface EventRow {
  id: string;
  name: string;
  city: string | null;
}

interface EligibleUser {
  user_id: string;
  push_token: string | null;
  push_platform: string | null;
  event_id: string;
  event_name: string;
  event_city: string | null;
}

async function run() {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Find users near active events who haven't been notified in the last 12 h.
  // Events qualify if: is_active=true, ends_at > now(), starts_at within next 2 h or already started.
  // Distance check: use user's max_distance_km (default 50 km) against event.location.
  const { data: eligible, error } = await admin.rpc('get_event_push_eligible');
  if (error) {
    log('error', { msg: 'get_event_push_eligible failed', error: error.message });
    return { sent: 0, errors: [error.message] };
  }

  const users = (eligible ?? []) as EligibleUser[];
  log('info', { msg: `found ${users.length} eligible user-event pairs` });

  const vapidConfigured = VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY;
  let sent = 0;
  const errors: string[] = [];

  // Batch: dedupe by user_id so one user doesn't get N notifications for N events in one pass.
  // The RPC already limits one event per user (most-recent active event).
  for (const u of users) {
    const title = 'Tem balada bombando perto de você! 🔥';
    const body = u.event_city
      ? `${u.event_name} em ${u.event_city} — entra aí`
      : `${u.event_name} — entra aí`;
    const eventUrl = `/events/${u.event_id}`;

    // Insert log row first (fail-closed: if this fails we skip notification).
    const { error: logErr } = await admin
      .from('event_push_log')
      .insert({ user_id: u.user_id, event_id: u.event_id });
    if (logErr) {
      // Most likely a duplicate key — another instance beat us to it. Skip.
      log('warn', { msg: 'log insert skipped', user_id: u.user_id, event_id: u.event_id, reason: logErr.message });
      continue;
    }

    let delivered = false;

    // APNs / FCM (native tokens)
    if (u.push_token) {
      const result = u.push_platform === 'apns'
        ? await sendApns({ token: u.push_token, title, body, data: { type: 'nearby_event', eventId: u.event_id } })
        : await sendFcm({ token: u.push_token, title, body, data: { type: 'nearby_event', eventId: u.event_id } });
      if (result.delivered) delivered = true;
    }

    // Web Push (PWA)
    if (vapidConfigured) {
      const { data: subs } = await admin
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('user_id', u.user_id);

      for (const sub of (subs ?? []) as WebPushSubscription[]) {
        const result = await sendWebPush(
          sub,
          { title, body, url: eventUrl, tag: `event-${u.event_id}` },
          { vapidPublicKey: VAPID_PUBLIC_KEY, vapidPrivateKey: VAPID_PRIVATE_KEY, vapidSubject: VAPID_SUBJECT },
        );
        if (result.ok) {
          delivered = true;
        } else if (result.reason === 'subscription_expired') {
          // Clean up stale subscription
          await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        }
      }
    }

    if (delivered) sent++;
    log('info', { msg: 'notified', user_id: u.user_id, event_id: u.event_id, delivered });
  }

  return { sent, total: users.length };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  return withSentry(async () => {
    const result = await run();
    log('info', { msg: 'done', ...result });
    return jsonResponse({ ok: true, ...result });
  });
});
