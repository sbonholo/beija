import { Capacitor } from '@capacitor/core';
import { SignInWithApple } from '@capacitor-community/apple-sign-in';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { supabase } from './supabase';

const APP_BUNDLE_ID = 'io.beija.app';
const GOOGLE_IOS_CLIENT_ID = import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID as string | undefined;
const GOOGLE_WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID as string | undefined;

export type AuthResult = { success: true } | { success: false; error: string };

let socialLoginInitialized = false;

async function initSocialLogin(): Promise<void> {
  if (socialLoginInitialized) return;
  await SocialLogin.initialize({
    google: {
      iOSClientId: GOOGLE_IOS_CLIENT_ID,
      webClientId: GOOGLE_WEB_CLIENT_ID,
    },
  });
  socialLoginInitialized = true;
}

/**
 * Sign in with Apple. Uses native Capacitor plugin on iOS/Android,
 * falls back to Supabase OAuth flow on web.
 */
export async function signInWithApple(): Promise<AuthResult> {
  try {
    if (Capacitor.isNativePlatform()) {
      const result = await SignInWithApple.authorize({
        clientId: APP_BUNDLE_ID,
        redirectURI: `https://${APP_BUNDLE_ID}/auth/callback`,
        scopes: 'email name',
        state: cryptoRandomState(),
      });
      const idToken = result.response?.identityToken;
      if (!idToken) return { success: false, error: 'no_identity_token' };
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: idToken,
      });
      if (error) return { success: false, error: error.message };
      return { success: true };
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: window.location.origin },
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    return { success: false, error: errorMessage(e) };
  }
}

/**
 * Sign in with Google. Uses @capgo/capacitor-social-login on iOS/Android,
 * falls back to Supabase OAuth flow on web.
 */
export async function signInWithGoogle(): Promise<AuthResult> {
  try {
    if (Capacitor.isNativePlatform()) {
      await initSocialLogin();
      const result = await SocialLogin.login({
        provider: 'google',
        options: { scopes: ['email', 'profile'] },
      });
      const idToken = extractIdToken(result);
      if (!idToken) return { success: false, error: 'no_identity_token' };
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });
      if (error) return { success: false, error: error.message };
      return { success: true };
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    return { success: false, error: errorMessage(e) };
  }
}

/**
 * Sign out from Supabase and clear native sign-in state.
 */
export async function signOut(): Promise<AuthResult> {
  try {
    if (Capacitor.isNativePlatform()) {
      try {
        await SocialLogin.logout({ provider: 'google' });
      } catch {
        /* not signed in via Google — ignore */
      }
    }
    const { error } = await supabase.auth.signOut();
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    return { success: false, error: errorMessage(e) };
  }
}

/** Returns the current Supabase auth session, or null. */
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session;
}

function extractIdToken(result: unknown): string | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const r = result as Record<string, unknown>;
  const inner = r.result as Record<string, unknown> | undefined;
  const candidate =
    (inner?.idToken as string | undefined) ??
    (r.idToken as string | undefined) ??
    (inner?.identityToken as string | undefined);
  return typeof candidate === 'string' ? candidate : undefined;
}

function cryptoRandomState(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return 'unknown_error';
}
