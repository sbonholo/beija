// Sentry helper for Beija edge functions.
//
// Wraps a Deno.serve-style handler with try/catch + Sentry.captureException.
// If SENTRY_DSN_EDGE is unset, no-op — handlers still run normally.
//
// Usage:
//   import { withSentry } from '../_shared/sentry.ts';
//   Deno.serve(withSentry('notify_new_message', async (req) => { ... }));

import * as Sentry from 'https://esm.sh/@sentry/deno@10.10.0';
import { jsonResponse } from './cors.ts';

let initialized = false;
const DSN = Deno.env.get('SENTRY_DSN_EDGE');

function init() {
  if (initialized) return;
  initialized = true;
  if (!DSN) return;
  Sentry.init({
    dsn: DSN,
    tracesSampleRate: 0.2,
    environment: Deno.env.get('SUPABASE_ENV') ?? 'production',
  });
}

init();

export function captureException(err: unknown, fn: string, ctx?: Record<string, unknown>) {
  if (!DSN) return;
  try {
    Sentry.withScope((scope) => {
      scope.setTag('edge_function', fn);
      if (ctx) scope.setContext('extra', ctx);
      Sentry.captureException(err);
    });
  } catch {
    /* ignore */
  }
}

export function withSentry(
  fnName: string,
  handler: (req: Request) => Promise<Response> | Response,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    try {
      return await handler(req);
    } catch (err) {
      captureException(err, fnName);
      console.error(JSON.stringify({
        level: 'error',
        fn: fnName,
        ts: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack?.split('\n').slice(0, 6) : undefined,
      }));
      return jsonResponse({ error: 'internal_error' }, { status: 500 });
    }
  };
}
