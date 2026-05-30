import { useEffect } from 'react';
import { supabase } from '../lib/supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function urlBase64ToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/**
 * Requests notification permission and saves a Web Push subscription to
 * push_subscriptions when a logged-in user visits on a PWA/browser that
 * supports the Push API. No-ops silently when:
 *   - VITE_VAPID_PUBLIC_KEY is not set
 *   - The browser doesn't support Push API
 *   - The user denies the permission prompt
 */
export function usePushSubscription(userId: string | null): void {
  useEffect(() => {
    if (!userId) return;
    if (!VAPID_PUBLIC_KEY) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    void (async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        const reg = await navigator.serviceWorker.ready;

        const existing = await reg.pushManager.getSubscription();
        const sub = existing ?? await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });

        const json = sub.toJSON() as {
          endpoint: string;
          keys?: { p256dh?: string; auth?: string };
        };
        const p256dh = json.keys?.p256dh;
        const auth   = json.keys?.auth;
        if (!json.endpoint || !p256dh || !auth) return;

        await supabase.from('push_subscriptions').upsert(
          { user_id: userId, endpoint: json.endpoint, p256dh, auth },
          { onConflict: 'user_id,endpoint' },
        );
      } catch {
        // Non-fatal — push is best-effort
      }
    })();
  }, [userId]);
}
