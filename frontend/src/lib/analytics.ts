import posthog from 'posthog-js';

const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const HOST =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://eu.posthog.com';
const OPT_OUT_KEY = 'beija_analytics_opt_out';

let initialized = false;
let optedOut = false;

function readLocalOptOut(): boolean {
  try {
    return localStorage.getItem(OPT_OUT_KEY) === '1';
  } catch {
    return false;
  }
}

function writeLocalOptOut(v: boolean): void {
  try {
    if (v) localStorage.setItem(OPT_OUT_KEY, '1');
    else localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    /* private mode */
  }
}

/**
 * Initialize PostHog. Idempotent and safe to call before/without keys. If the
 * VITE_POSTHOG_KEY env is missing, every track()/identify() below becomes a
 * no-op — dev workflows keep working unchanged.
 */
export function initAnalytics(): void {
  if (initialized) return;
  if (!KEY) return;
  initialized = true;
  optedOut = readLocalOptOut();
  try {
    posthog.init(KEY, {
      api_host: HOST,
      capture_pageview: false,       // we drive route changes manually
      capture_pageleave: true,
      person_profiles: 'identified_only',
      autocapture: false,
      disable_session_recording: true, // session replay handled by Sentry
      loaded: (ph) => {
        if (optedOut) ph.opt_out_capturing();
      },
    });
  } catch (e) {
    console.warn('[analytics] init failed:', e);
    initialized = false;
  }
}

/** Track an event. Never throws. */
export function track(event: string, props?: Record<string, unknown>): void {
  if (!initialized || optedOut) return;
  try {
    posthog.capture(event, props);
  } catch (e) {
    console.warn('[analytics] track failed:', event, e);
  }
}

export function identifyAnalytics(userId: string, traits?: Record<string, unknown>): void {
  if (!initialized || optedOut) return;
  try {
    posthog.identify(userId, traits);
  } catch (e) {
    console.warn('[analytics] identify failed:', e);
  }
}

export function resetAnalytics(): void {
  if (!initialized) return;
  try {
    posthog.reset();
  } catch {
    /* never throw */
  }
}

/**
 * Honor the user's allow_analytics column (DB) and mirror to localStorage so
 * subsequent sessions on this device pick the decision up before a network
 * call. Call this whenever the toggle changes OR on app boot once the
 * profile is loaded.
 */
export function setAnalyticsConsent(allow: boolean): void {
  optedOut = !allow;
  writeLocalOptOut(optedOut);
  if (!initialized) return;
  try {
    if (allow) posthog.opt_in_capturing();
    else posthog.opt_out_capturing();
  } catch {
    /* ignore */
  }
}

export function getAnalyticsOptOut(): boolean {
  return optedOut;
}
