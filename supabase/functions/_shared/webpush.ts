// Web Push encryption per RFC 8291 + VAPID authentication per RFC 8292.
// Pure Deno Web Crypto implementation — zero external dependencies.
//
// Required VAPID key format:
//   vapidPublicKey  — base64url-encoded uncompressed P-256 point (65 bytes; starts 0x04)
//   vapidPrivateKey — base64url-encoded raw P-256 scalar (32 bytes)
//   vapidSubject    — mailto:contact@domain or https://domain (owner-supplied)
//
// To generate keys: `npx web-push generate-vapid-keys`

export interface WebPushSubscription {
  endpoint: string;
  p256dh: string; // base64url subscriber ECDH public key (65 bytes, uncompressed P-256)
  auth: string;   // base64url 16-byte auth secret
}

export interface WebPushResult {
  ok: boolean;
  status: number;
  reason?: string;
}

// ─── base64url helpers ─────────────────────────────────────────────────────

function b64uDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    s.length + (4 - s.length % 4) % 4, '=',
  );
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function b64uEncode(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ─── HKDF-SHA256 (extract + expand in one call via Web Crypto) ────────────

async function hkdf(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

// ─── VAPID JWT (RFC 8292, ES256) ──────────────────────────────────────────

async function createVapidJwt(
  endpoint: string,
  pubBytes: Uint8Array,
  privJwk: JsonWebKey,
  subject: string,
): Promise<string> {
  const enc = new TextEncoder();
  const header = b64uEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = {
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 43200, // 12 h
    sub: subject,
  };
  const payload = b64uEncode(enc.encode(JSON.stringify(claims)));
  const unsigned = enc.encode(`${header}.${payload}`);

  const sigKey = await crypto.subtle.importKey(
    'jwk', privJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign'],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, sigKey, unsigned),
  );
  return `${header}.${payload}.${b64uEncode(sig)}`;
}

// ─── RFC 8291 content encryption (aes128gcm) ─────────────────────────────

async function encryptPayload(
  plaintext: string,
  sub: WebPushSubscription,
): Promise<{ body: Uint8Array; senderPublicBytes: Uint8Array }> {
  const RS = 4096;

  // Ephemeral sender ECDH key pair
  const senderPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true, ['deriveBits'],
  );
  const senderPublicBytes = new Uint8Array(
    await crypto.subtle.exportKey('raw', senderPair.publicKey),
  );

  // Subscriber keys
  const subPubBytes = b64uDecode(sub.p256dh);
  const subPubKey = await crypto.subtle.importKey(
    'raw', subPubBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, ['deriveBits'],
  );

  // ECDH shared secret
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: subPubKey }, senderPair.privateKey, 256),
  );

  // IKM (RFC 8291 §3.3): HKDF(ikm=shared_secret, salt=auth, info="WebPush: info\0" + ua_key + as_key)
  const authSecret = b64uDecode(sub.auth);
  const keyInfoBytes = new Uint8Array([
    ...new TextEncoder().encode('WebPush: info\x00'),
    ...subPubBytes,
    ...senderPublicBytes,
  ]);
  const ikm = await hkdf(sharedSecret, authSecret, keyInfoBytes, 32);

  // Encrypt (RFC 8188 §2)
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(ikm, salt, new TextEncoder().encode('Content-Encoding: aes128gcm\x00'), 16);
  const nonce = await hkdf(ikm, salt, new TextEncoder().encode('Content-Encoding: nonce\x00'), 12);

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // Append 0x02 = "last record" delimiter (RFC 8188 §2.3)
  const padded = new Uint8Array([...new TextEncoder().encode(plaintext), 0x02]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded),
  );

  // Header: salt(16) + rs(4 BE uint32) + idlen(1) + sender_key(65)
  const header = new Uint8Array(86);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RS, false);
  header[20] = 65;
  header.set(senderPublicBytes, 21);

  return { body: new Uint8Array([...header, ...ciphertext]), senderPublicBytes };
}

// ─── Public API ──────────────────────────────────────────────────────────

export async function sendWebPush(
  sub: WebPushSubscription,
  payload: { title: string; body: string; url?: string; tag?: string },
  opts: {
    vapidPublicKey: string;
    vapidPrivateKey: string;
    vapidSubject: string;
    ttl?: number;
  },
): Promise<WebPushResult> {
  const { vapidPublicKey, vapidPrivateKey, vapidSubject, ttl = 86400 } = opts;

  // Build JWK from raw public + private bytes
  const pubBytes = b64uDecode(vapidPublicKey);
  const privJwk: JsonWebKey = {
    kty: 'EC', crv: 'P-256',
    d: vapidPrivateKey,
    x: b64uEncode(pubBytes.slice(1, 33)),
    y: b64uEncode(pubBytes.slice(33, 65)),
  };

  let jwt: string;
  try {
    jwt = await createVapidJwt(sub.endpoint, pubBytes, privJwk, vapidSubject);
  } catch (e) {
    return { ok: false, status: 0, reason: `vapid_sign_failed: ${String(e)}` };
  }

  let body: Uint8Array;
  try {
    ({ body } = await encryptPayload(JSON.stringify(payload), sub));
  } catch (e) {
    return { ok: false, status: 0, reason: `encrypt_failed: ${String(e)}` };
  }

  try {
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'TTL': String(ttl),
        'Authorization': `vapid t=${jwt},k=${vapidPublicKey}`,
      },
      body,
    });
    if (res.ok || res.status === 201) return { ok: true, status: res.status };
    if (res.status === 410 || res.status === 404) {
      return { ok: false, status: res.status, reason: 'subscription_expired' };
    }
    return { ok: false, status: res.status, reason: 'push_service_error' };
  } catch (e) {
    return { ok: false, status: 0, reason: `fetch_failed: ${String(e)}` };
  }
}
