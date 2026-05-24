// APNs (Apple Push Notification service) helper.
//
// Required env vars (set via `supabase secrets set ...`):
//   APNS_TEAM_ID       — 10-character Apple Developer team ID
//   APNS_KEY_ID        — 10-character key ID from Apple Dev → Keys
//   APNS_PRIVATE_KEY   — full text of the .p8 file (PEM, includes BEGIN/END lines)
//   APNS_BUNDLE_ID     — defaults to io.beija.app
//   APNS_PRODUCTION    — set to "true" for production servers; defaults to sandbox
//
// If any of the first three are missing, the helper logs a TODO and returns
// { delivered: false, reason: 'apns_not_configured' } without throwing. That
// keeps the function deployable today and switches on real delivery when keys
// arrive without a code change.

interface SendApnsArgs {
  token: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** APNs sound filename (must ship in the app bundle). Defaults to 'default'. */
  sound?: string;
}

interface SendApnsResult {
  delivered: boolean;
  reason?: string;
  status?: number;
  apnsId?: string | null;
}

const ENC = new TextEncoder();

function pemToPkcs8(pem: string): Uint8Array {
  const cleaned = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const bytes = atob(cleaned);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes.charCodeAt(i);
  return out;
}

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signApnsJwt(teamId: string, keyId: string, pem: string): Promise<string> {
  const header = { alg: 'ES256', kid: keyId };
  const payload = { iss: teamId, iat: Math.floor(Date.now() / 1000) };
  const headerB64 = b64url(ENC.encode(JSON.stringify(header)));
  const payloadB64 = b64url(ENC.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(pem),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    ENC.encode(signingInput),
  );
  return `${signingInput}.${b64url(sig)}`;
}

export async function sendApns(args: SendApnsArgs): Promise<SendApnsResult> {
  const teamId = Deno.env.get('APNS_TEAM_ID');
  const keyId = Deno.env.get('APNS_KEY_ID');
  const pem = Deno.env.get('APNS_PRIVATE_KEY');
  const bundleId = Deno.env.get('APNS_BUNDLE_ID') ?? 'io.beija.app';
  const production = (Deno.env.get('APNS_PRODUCTION') ?? '').toLowerCase() === 'true';

  if (!teamId || !keyId || !pem) {
    console.log(
      `[apns] keys not configured; would have sent to ${args.token.slice(0, 8)}…`,
      args.title,
      args.body,
    );
    return { delivered: false, reason: 'apns_not_configured' };
  }

  const jwt = await signApnsJwt(teamId, keyId, pem);
  const host = production ? 'api.push.apple.com' : 'api.sandbox.push.apple.com';
  const url = `https://${host}/3/device/${args.token}`;
  const payload = {
    aps: {
      alert: { title: args.title, body: args.body },
      sound: args.sound ?? 'default',
      'mutable-content': 1,
    },
    ...(args.data ?? {}),
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `bearer ${jwt}`,
      'apns-topic': bundleId,
      'apns-push-type': 'alert',
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return {
    delivered: res.ok,
    status: res.status,
    apnsId: res.headers.get('apns-id'),
    reason: res.ok ? undefined : await res.text(),
  };
}
