import { describe, expect, it } from 'vitest';
import { TOKEN_TTL_MS, makeUnsubToken, readUnsubToken } from './token';

const SECRET = 'a-long-secret-for-the-unsubscribe-tests-'.padEnd(48, 'x');
const USER = '00000000-0000-4000-8000-0000000000aa';
const NOW = Date.UTC(2026, 10, 17);

describe('the unsubscribe token', () => {
  const token = makeUnsubToken(SECRET, { userId: USER, kind: 'farm_alert', issuedAt: NOW });

  it('is valid for its account and type until it expires', () => {
    const r = readUnsubToken(SECRET, token, NOW + 1000);
    expect(r).toEqual({ ok: true, claims: { userId: USER, kind: 'farm_alert', issuedAt: NOW } });
    expect(readUnsubToken(SECRET, token, NOW + TOKEN_TTL_MS - 1).ok).toBe(true);
  });

  it('expires', () => {
    expect(readUnsubToken(SECRET, token, NOW + TOKEN_TTL_MS)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('reveals nothing: the account and the type are not in it, even when decoded', () => {
    expect(token).not.toContain(USER);
    expect(token).not.toContain('farm_alert');
    const raw = Buffer.from(token, 'base64url').toString('latin1');
    expect(raw).not.toContain(USER);
    expect(raw).not.toContain('farm_alert');
    // And two tokens for the same thing differ.
    expect(makeUnsubToken(SECRET, { userId: USER, kind: 'farm_alert', issuedAt: NOW })).not.toBe(
      token,
    );
  });

  it('fails when changed anywhere, cut short, from another secret, or not a token at all', () => {
    for (let i = 0; i < token.length; i += 7) {
      const flipped = token.slice(0, i) + (token[i] === 'A' ? 'B' : 'A') + token.slice(i + 1);
      expect(readUnsubToken(SECRET, flipped, NOW).ok, `at ${i}`).toBe(false);
    }
    expect(readUnsubToken(SECRET, token.slice(0, -4), NOW).ok).toBe(false);
    expect(readUnsubToken(SECRET + 'x', token, NOW).ok).toBe(false);
    for (const junk of ['', 'abc', null, undefined, 42, 'x'.repeat(500), '!!!'.repeat(30)]) {
      expect(readUnsubToken(SECRET, junk, NOW)).toEqual({ ok: false, reason: 'invalid' });
    }
  });
});
