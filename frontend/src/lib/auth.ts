import { Capacitor } from '@capacitor/core';
import { SignInWithApple } from '@capacitor-community/apple-sign-in';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { supabase } from './supabase';

const APP_BUNDLE_ID = 'io.beija.app';

export type AuthResult = { success: true } | { success: false; error: string };

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
 * Sign in with Google. Uses native Capacitor plugin on iOS/Android,
 * falls back to Supabase OAuth flow on web.
 */
export async function signInWithGoogle(): Promise<AuthResult> {
  try {
    if (Capacitor.isNativePlatform()) {
      try {
        await GoogleAuth.initialize();
      } catch {
        /* idempotent — initialize may have already been called */
      }
      const result = await GoogleAuth.signIn();
      const idToken = result.authentication?.idToken;
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
 * Sign out from Supabase and clear any native sign-in state.
 */
export async function signOut(): Promise<AuthResult> {
  try {
    if (Capacitor.isNativePlatform()) {
      try {
        await GoogleAuth.signOut();
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
