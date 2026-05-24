// FCM (Firebase Cloud Messaging) v1 helper.
//
// Required env vars:
//   FCM_PROJECT_ID         — Firebase project id (e.g. "beija-prod")
//   FCM_SERVICE_ACCOUNT    — JSON string of the Firebase service account key.
//                            Get it from Firebase console → Project settings →
//                            Service accounts → Generate new private key.
//
// If unset, returns { delivered: false, reason: 'fcm_not_configured' } and logs.

interface SendFcmArgs {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  /** Android notification sound (channel id or filename in res/raw). */
  sound?: string;
}

interface SendFcmResult {
  delivered: boolean;
  reason?: string;
  status?: number;
  name?: string;
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

const ENC = new TextEncoder();

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

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

async function getAccessToken(serviceAccount: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60) {
    return cachedAccessToken.token;
  }

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const headerB64 = b64url(ENC.encode(JSON.stringify(header)));
  const payloadB64 = b64url(ENC.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(serviceAccount.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    ENC.encode(signingInput),
  );
  const jwt = `${signingInput}.${b64url(sig)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`fcm_oauth_failed_${res.status}`);
  const tokenJson = (await res.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = {
    token: tokenJson.access_token,
    expiresAt: now + tokenJson.expires_in,
  };
  return tokenJson.access_token;
}

export async function sendFcm(args: SendFcmArgs): Promise<SendFcmResult> {
  const projectId = Deno.env.get('FCM_PROJECT_ID');
  const serviceAccountJson = Deno.env.get('FCM_SERVICE_ACCOUNT');

  if (!projectId || !serviceAccountJson) {
    console.log(
      `[fcm] keys not configured; would have sent to ${args.token.slice(0, 8)}…`,
      args.title,
      args.body,
    );
    return { delivered: false, reason: 'fcm_not_configured' };
  }

  let serviceAccount: ServiceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch {
    return { delivered: false, reason: 'fcm_service_account_invalid_json' };
  }

  const accessToken = await getAccessToken(serviceAccount);
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  const body = {
    message: {
      token: args.token,
      notification: { title: args.title, body: args.body },
      data: args.data ?? {},
      ...(args.sound
        ? {
            android: {
              notification: { sound: args.sound, channel_id: args.sound },
            },
          }
        : {}),
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    return { delivered: false, status: res.status, reason: text };
  }
  const json = (await res.json()) as { name?: string };
  return { delivered: true, status: res.status, name: json.name };
}
