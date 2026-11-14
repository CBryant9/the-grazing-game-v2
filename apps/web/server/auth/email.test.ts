import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PEPPER_MIN, banHash, normaliseEmail } from './email';

const PEPPER = 'p'.repeat(40);

describe('normalising an email before it is hashed', () => {
  it('trims and lower-cases every address', () => {
    expect(normaliseEmail('  Alex.Smith@Example.COM ')).toBe('alex.smith@example.com');
  });

  it('treats gmail.com and googlemail.com as one, and ignores dots in the name (Google help)', () => {
    expect(normaliseEmail('A.L.E.X@googlemail.com')).toBe('alex@gmail.com');
    expect(normaliseEmail('alex@gmail.com')).toBe('alex@gmail.com');
    expect(normaliseEmail('a.lex@GMAIL.com')).toBe('alex@gmail.com');
  });

  it('does NOT drop a +tag at Gmail or elsewhere (no provider page states it yet)', () => {
    expect(normaliseEmail('alex+shop@gmail.com')).toBe('alex+shop@gmail.com');
    expect(normaliseEmail('alex+shop@outlook.com')).toBe('alex+shop@outlook.com');
  });

  it('drops a +tag at fastmail.com (Fastmail help), and only there', () => {
    expect(normaliseEmail('alex+anything@fastmail.com')).toBe('alex@fastmail.com');
    expect(normaliseEmail('alex+anything@example.com')).toBe('alex+anything@example.com');
  });

  it('keeps dots at other providers: they are different addresses there', () => {
    expect(normaliseEmail('a.lex@example.com')).toBe('a.lex@example.com');
  });

  it('refuses what is not an address', () => {
    for (const bad of ['', 'nope', '@x.com', 'a@', 'a@b', 'a@@b.com', 'a@b@c.com', 5 as never]) {
      expect(normaliseEmail(bad)).toBeNull();
    }
  });
});

describe('the ban hash', () => {
  it('is HMAC-SHA-256 of the normalised address, keyed with the pepper, in 64 hex characters', () => {
    const h = banHash('Alex.Smith@Example.com', PEPPER)!;
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(createHmac('sha256', PEPPER).update('alex.smith@example.com').digest('hex'));
  });

  it('is the same for the spellings that reach one inbox, different for others', () => {
    expect(banHash('a.lex@gmail.com', PEPPER)).toBe(banHash('ALEX@googlemail.com', PEPPER));
    expect(banHash('alex@gmail.com', PEPPER)).not.toBe(banHash('alex2@gmail.com', PEPPER));
  });

  it('depends on the pepper: another pepper gives another hash', () => {
    expect(banHash('alex@example.com', PEPPER)).not.toBe(
      banHash('alex@example.com', 'q'.repeat(40)),
    );
  });

  it('refuses a missing or short pepper, and gives null for a non-address', () => {
    expect(() => banHash('alex@example.com', '')).toThrow();
    expect(() => banHash('alex@example.com', 'x'.repeat(PEPPER_MIN - 1))).toThrow();
    expect(banHash('not an address', PEPPER)).toBeNull();
  });
});
