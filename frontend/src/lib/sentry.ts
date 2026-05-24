import * as Sentry from '@sentry/react';

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const VERSION = import.meta.env.VITE_APP_VERSION as string | undefined;

let initialized = false;

/**
 * Errors that should never be reported (browser-extension noise, offline blips,
 * harmless ResizeObserver loop warnings, etc.). Add patterns here over time
 * as we observe real noise in prod.
 */
const IGNORE_MESSAGE_PATTERNS: RegExp[] = [
  /ResizeObserver loop/i,
  /Network request failed/i,
  /Load failed$/i,
  /NetworkError when attempting to fetch/i,
  /chrome-extension:\/\//i,
  /moz-extension:\/\//i,
  /safari-extension:\/\//i,
  /Non-Error promise rejection captured/i,
];

function shouldIgnore(event: Sentry.ErrorEvent): boolean {
  const msg =
    event.exception?.values?.[0]?.value ??
    event.message ??
    '';
  if (typeof msg === 'string' && IGNORE_MESSAGE_PATTERNS.some((re) => re.test(msg))) return true;

  // Drop events whose top frame is in a browser extension.
  const frames = event.exception?.values?.[0]?.stacktrace?.frames ?? [];
  for (const f of frames) {
    if (typeof f.filename === 'string' && /-extension:\/\//.test(f.filename)) {
      return true;
    }
  }
  return false;
}

export function initSentry(): void {
  if (initialized) return;
  if (!DSN) {
    // Dev / unconfigured: no-op. SDK is never even imported beyond the static
    // tree-shaken module shell. Wrappers below already null-check.
    return;
  }
  initialized = true;
  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,
    release: VERSION ? `beija@${VERSION}` : undefined,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        // Mask user-generated text + photos in session replays. LGPD-friendly.
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
    ],
    tracesSampleRate: 0.2,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    beforeSend(event) {
      return shouldIgnore(event) ? null : event;
    },
  });
}

export function identifySentryUser(userId: string | null): void {
  if (!initialized) return;
  Sentry.setUser(userId ? { id: userId } : null);
}

export function captureSentryException(err: unknown, ctx?: Record<string, unknown>): void {
  if (!initialized) return;
  Sentry.captureException(err, ctx ? { extra: ctx } : undefined);
}

export { Sentry };
