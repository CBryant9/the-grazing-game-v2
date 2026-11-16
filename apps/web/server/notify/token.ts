import 'server-only';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { isNotifyKind, type NotifyKind } from '../../lib/notify/kinds';

/**
 * The unsubscribe token in an email's link. It is encrypted and signed in one step (AES-256-GCM
 * with a key made from a secret only the server has), so it:
 *
 * - reveals nothing: the account and the type are inside, not readable;
 * - can not be changed: any edit fails the check;
 * - expires: it carries its own end time;
 * - does one thing: it names one account and one type, and the only change it can make is to
 *   turn that type's email off.
 *
 * A replay does no harm. The change is only made if the player has not touched that setting since
 * the email was sent (see `applyUnsubscribe` in store.ts), so an old link can not turn an email
 * off again after the player turned it back on.
 */

export const TOKEN_TTL_MS = 60 * 24 * 3600 * 1000;
export const TOKEN_SECRET_MIN = 32;

function key(secret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, 'gg-notify', 'unsubscribe-v1', 32));
}

export interface UnsubClaims {
  userId: string;
  kind: NotifyKind;
  /** When the email was made (ms since 1970). */
  issuedAt: number;
}

export function makeUnsubToken(secret: string, claims: UnsubClaims, ttlMs = TOKEN_TTL_MS): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(secret), iv);
  const plain = JSON.stringify({
    u: claims.userId,
    k: claims.kind,
    i: claims.issuedAt,
    e: claims.issuedAt + ttlMs,
  });
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

export type TokenRead =
  { ok: true; claims: UnsubClaims } | { ok: false; reason: 'invalid' | 'expired' };

export function readUnsubToken(secret: string, token: unknown, now: number): TokenRead {
  if (typeof token !== 'string' || token.length < 40 || token.length > 400) {
    return { ok: false, reason: 'invalid' };
  }
  try {
    const raw = Buffer.from(token, 'base64url');
    if (raw.length < 12 + 16 + 2) return { ok: false, reason: 'invalid' };
    const decipher = createDecipheriv('aes-256-gcm', key(secret), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const plain = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString(
      'utf8',
    );
    const c = JSON.parse(plain) as { u?: unknown; k?: unknown; i?: unknown; e?: unknown };
    if (
      typeof c.u !== 'string' ||
      !isNotifyKind(c.k) ||
      typeof c.i !== 'number' ||
      typeof c.e !== 'number'
    ) {
      return { ok: false, reason: 'invalid' };
    }
    if (now >= c.e) return { ok: false, reason: 'expired' };
    return { ok: true, claims: { userId: c.u, kind: c.k, issuedAt: c.i } };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}
