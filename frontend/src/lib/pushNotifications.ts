import {
  PushNotifications,
  type PushNotificationSchema,
  type ActionPerformed,
  type Token,
} from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase, getCurrentUser } from './supabase';

export type PushPayloadType = 'new_match' | 'new_message' | 'profile_liked';

export interface PushPayload {
  type: PushPayloadType | undefined;
  matchId?: string;
  fromUserId?: string;
  eventId?: string;
  /** Original notification data, in case the consumer needs extra fields. */
  raw: Record<string, unknown>;
}

export interface RegisterResult {
  success: boolean;
  token?: string;
  error?: string;
}

let registeredToken: string | null = null;

/**
 * Ask for push permission, register with APNs/FCM, and persist the token
 * on the current user's profile. No-op on web.
 */
export async function registerPushNotifications(): Promise<RegisterResult> {
  if (!Capacitor.isNativePlatform()) {
    return { success: false, error: 'not_native_platform' };
  }
  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') {
      return { success: false, error: 'permission_denied' };
    }

    const tokenPromise = new Promise<string>((resolve, reject) => {
      let regHandle: { remove: () => Promise<void> } | null = null;
      let errHandle: { remove: () => Promise<void> } | null = null;

      PushNotifications.addListener('registration', async (token: Token) => {
        await regHandle?.remove();
        await errHandle?.remove();
        resolve(token.value);
      }).then((h) => {
        regHandle = h;
      });

      PushNotifications.addListener('registrationError', async (err) => {
        await regHandle?.remove();
        await errHandle?.remove();
        reject(new Error(err.error || 'registration_failed'));
      }).then((h) => {
        errHandle = h;
      });
    });

    await PushNotifications.register();
    const token = await tokenPromise;
    registeredToken = token;

    const user = await getCurrentUser();
    if (user) {
      await supabase.from('profiles').update({ push_token: token }).eq('id', user.id);
    }

    return { success: true, token };
  } catch (e) {
    return { success: false, error: errorMessage(e) };
  }
}

/**
 * Wire up listeners for incoming pushes and notification taps.
 * Returns a teardown function that removes the listeners.
 */
export async function setupPushListeners(
  onReceive: (payload: PushPayload, raw: PushNotificationSchema) => void,
  onTap: (payload: PushPayload, raw: ActionPerformed) => void,
): Promise<() => Promise<void>> {
  if (!Capacitor.isNativePlatform()) {
    return async () => {
      /* no-op on web */
    };
  }
  const recv = await PushNotifications.addListener('pushNotificationReceived', (n) => {
    onReceive(parsePayload(n.data ?? {}), n);
  });
  const tap = await PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
    onTap(parsePayload(a.notification.data ?? {}), a);
  });
  return async () => {
    await recv.remove();
    await tap.remove();
  };
}

/** Clear the stored token from the user's profile and detach listeners. */
export async function unregister(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const user = await getCurrentUser();
    if (user && registeredToken) {
      await supabase.from('profiles').update({ push_token: null }).eq('id', user.id);
    }
    await PushNotifications.removeAllListeners();
    registeredToken = null;
  } catch {
    /* swallow — best-effort cleanup */
  }
}

function parsePayload(data: Record<string, unknown>): PushPayload {
  const rawType = data.type;
  const type =
    rawType === 'new_match' || rawType === 'new_message' || rawType === 'profile_liked'
      ? rawType
      : undefined;
  return {
    type,
    matchId: typeof data.matchId === 'string' ? data.matchId : undefined,
    fromUserId: typeof data.fromUserId === 'string' ? data.fromUserId : undefined,
    eventId: typeof data.eventId === 'string' ? data.eventId : undefined,
    raw: data,
  };
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return 'unknown_error';
}
