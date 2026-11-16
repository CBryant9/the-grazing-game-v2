import 'server-only';
import {
  createCipheriv,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  sign,
  type KeyObject,
} from 'node:crypto';

/**
 * Web Push from the server, with nothing but Node's own crypto: the message is encrypted for the
 * browser (RFC 8291, aes128gcm, RFC 8188) and the server proves who it is with a VAPID token
 * (RFC 8292, ES256). A test checks the encryption byte for byte against RFC 8291's own example.
 *
 * `PushSender` is the small interface the sender uses. The real one is `vapidPushSender`. Tests
 * give a fake. The keys come from the environment (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY).
 */

export interface PushTarget {
  endpoint: string;
  /** The browser's public key, base64url, 65 bytes. */
  p256dh: string;
  /** The browser's auth secret, base64url, 16 bytes. */
  authSecret: string;
}

/** What a device shows. Kept small: a lock screen shows it. */
export interface PushMessage {
  id: string;
  title: string;
  body: string | null;
  /** A path on this site, or null. */
  link: string | null;
}

export interface PushOptions {
  /** How long the push service may hold it for a device that is off, in seconds. */
  ttlSec: number;
  /** A short name so a repeat replaces the first one in the push service. */
  topic: string;
}

export type PushResult =
  | { ok: true }
  | { ok: false; gone: boolean; retry: boolean; retryAfterSec?: number; reason: string };

export interface PushSender {
  send(to: PushTarget, message: PushMessage, options: PushOptions): Promise<PushResult>;
}

export interface Vapid {
  /** base64url, 65 bytes (04 || x || y). */
  publicKey: string;
  /** base64url, 32 bytes. */
  privateKey: string;
  /** `mailto:` an address, or an `https:` address of the site (RFC 8292 `sub`). */
  subject: string;
}

const b64 = (b: Buffer): string => b.toString('base64url');
const unb64 = (s: string): Buffer => Buffer.from(s, 'base64url');

function publicKeyObject(raw: Buffer): KeyObject {
  if (raw.length !== 65 || raw[0] !== 4) throw new Error('bad_public_key');
  return createPublicKey({
    key: { kty: 'EC', crv: 'P-256', x: b64(raw.subarray(1, 33)), y: b64(raw.subarray(33, 65)) },
    format: 'jwk',
  });
}

function privateKeyObject(d: Buffer, publicRaw: Buffer): KeyObject {
  return createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      d: b64(d),
      x: b64(publicRaw.subarray(1, 33)),
      y: b64(publicRaw.subarray(33, 65)),
    },
    format: 'jwk',
  });
}

/** Can this be used as a VAPID key pair? (Checked at start so a bad key is said plainly, not at the first send.) */
export function vapidUsable(v: { publicKey: string; privateKey: string }): boolean {
  try {
    const pub = unb64(v.publicKey);
    const d = unb64(v.privateKey);
    if (d.length !== 32) return false;
    privateKeyObject(d, pub);
    return true;
  } catch {
    return false;
  }
}

export interface Fixed {
  /** For tests only: the sender's one-time key pair and salt. */
  privateKey: Buffer;
  publicKey: Buffer;
  salt: Buffer;
}

/**
 * The body of a push message: salt, record size, the sender's one-time public key and the
 * encrypted text in one record (RFC 8291 section 4, RFC 8188). The text must fit one record.
 */
export function encryptPayload(
  plaintext: Buffer,
  target: { p256dh: Buffer; authSecret: Buffer },
  fixed?: Fixed,
): Buffer {
  if (plaintext.length > 4096 - 17 - 86) throw new Error('payload_too_large');
  let asPublic: Buffer;
  let asPrivate: KeyObject;
  if (fixed) {
    asPublic = fixed.publicKey;
    asPrivate = privateKeyObject(fixed.privateKey, fixed.publicKey);
  } else {
    const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = pair.publicKey.export({ format: 'jwk' });
    asPublic = Buffer.concat([Buffer.from([4]), unb64(jwk.x!), unb64(jwk.y!)]);
    asPrivate = pair.privateKey;
  }
  const salt = fixed?.salt ?? randomBytes(16);
  const uaPublic = target.p256dh;
  const secret = diffieHellman({ privateKey: asPrivate, publicKey: publicKeyObject(uaPublic) });
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0', 'utf8'), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync('sha256', secret, target.authSecret, keyInfo, 32));
  const cek = Buffer.from(
    hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16),
  );
  const nonce = Buffer.from(
    hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12),
  );
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  // 0x02 marks the last (here the only) record.
  const body = Buffer.concat([
    cipher.update(Buffer.concat([plaintext, Buffer.from([2])])),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const header = Buffer.alloc(16 + 4 + 1);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, body]);
}

/** The `Authorization` header value for a push service (RFC 8292). Valid for 12 hours. */
export function vapidAuthorization(endpoint: string, vapid: Vapid, nowMs: number): string {
  const aud = new URL(endpoint).origin;
  const head = b64(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64(
    Buffer.from(
      JSON.stringify({ aud, exp: Math.floor(nowMs / 1000) + 12 * 3600, sub: vapid.subject }),
    ),
  );
  const pub = unb64(vapid.publicKey);
  const key = privateKeyObject(unb64(vapid.privateKey), pub);
  const sig = sign('sha256', Buffer.from(`${head}.${claims}`), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${claims}.${b64(sig)}, k=${vapid.publicKey}`;
}

/** What a device is sent: only the fact line, an optional second line, a same-site link and an id. */
export function payloadText(m: PushMessage): string {
  return JSON.stringify({
    id: m.id,
    title: m.title.slice(0, 120),
    body: m.body ? m.body.slice(0, 140) : null,
    link: m.link,
  });
}

/** What a push service's answer means for us. */
export function classify(status: number, retryAfter: string | null): PushResult {
  if (status >= 200 && status < 300) return { ok: true };
  if (status === 404 || status === 410) {
    return { ok: false, gone: true, retry: false, reason: 'push_gone' };
  }
  if (status === 429 || status >= 500) {
    const n = Number(retryAfter);
    return {
      ok: false,
      gone: false,
      retry: true,
      ...(Number.isFinite(n) && n > 0 ? { retryAfterSec: Math.min(n, 7200) } : {}),
      reason: status === 429 ? 'push_throttled' : 'push_service_error',
    };
  }
  if (status === 413) return { ok: false, gone: false, retry: false, reason: 'push_too_large' };
  if (status === 401 || status === 403) {
    return { ok: false, gone: false, retry: false, reason: 'push_auth_rejected' };
  }
  return { ok: false, gone: false, retry: false, reason: 'push_rejected' };
}

/**
 * The real sender. It never follows a redirect (an endpoint that redirects is not a push
 * service), waits at most 8 seconds, and never puts the endpoint or the text in an error.
 */
export function vapidPushSender(
  vapid: Vapid,
  fetchFn: typeof fetch = fetch,
  now: () => number = Date.now,
): PushSender {
  return {
    async send(to, message, options) {
      let body: Buffer;
      let auth: string;
      try {
        body = encryptPayload(Buffer.from(payloadText(message), 'utf8'), {
          p256dh: unb64(to.p256dh),
          authSecret: unb64(to.authSecret),
        });
        auth = vapidAuthorization(to.endpoint, vapid, now());
      } catch {
        // The saved keys do not work: this device can not be reached, however often we try.
        return { ok: false, gone: true, retry: false, reason: 'push_bad_keys' };
      }
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 8000);
      try {
        const res = await fetchFn(to.endpoint, {
          method: 'POST',
          redirect: 'error',
          signal: abort.signal,
          headers: {
            Authorization: auth,
            'Content-Encoding': 'aes128gcm',
            'Content-Type': 'application/octet-stream',
            TTL: String(options.ttlSec),
            Urgency: 'normal',
            Topic: options.topic,
          },
          body: new Uint8Array(body),
        });
        return classify(res.status, res.headers.get('retry-after'));
      } catch {
        return { ok: false, gone: false, retry: true, reason: 'push_network' };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
