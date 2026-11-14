import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PEPPER_MIN, banHash, normaliseEmail } from './email';

const PEPPER = 'p'.repeat(40);

// Provider domains are real because the rules are about them. Every local part is plainly fake
// (`test.user.example`), so no real person's address can sit in the repo.

describe('normalising an email before it is hashed', () => {
  it('trims and lower-cases every address', () => {
    expect(normaliseEmail('  Test.User.Example@Example.COM ')).toBe(
      'test.user.example@example.com',
    );
  });

  it('treats gmail.com and googlemail.com as one, and ignores dots in the name (Google help)', () => {
    expect(normaliseEmail('T.E.S.T.user.example@googlemail.com')).toBe('testuserexample@gmail.com');
    expect(normaliseEmail('testuserexample@gmail.com')).toBe('testuserexample@gmail.com');
    expect(normaliseEmail('test.user.example@GMAIL.com')).toBe('testuserexample@gmail.com');
  });

  it('does NOT drop a +tag at Gmail or elsewhere (no provider page states it yet)', () => {
    expect(normaliseEmail('test.user.example+shop@gmail.com')).toBe(
      'testuserexample+shop@gmail.com',
    );
    expect(normaliseEmail('test.user.example+shop@outlook.com')).toBe(
      'test.user.example+shop@outlook.com',
    );
  });

  it('drops a +tag at fastmail.com (Fastmail help), and only there', () => {
    expect(normaliseEmail('test.user.example+anything@fastmail.com')).toBe(
      'test.user.example@fastmail.com',
    );
    expect(normaliseEmail('test.user.example+anything@example.com')).toBe(
      'test.user.example+anything@example.com',
    );
  });

  it('keeps dots at other providers: they are different addresses there', () => {
    expect(normaliseEmail('te.st.user.example@example.com')).toBe('te.st.user.example@example.com');
  });

  it('refuses what is not an address', () => {
    for (const bad of ['', 'nope', '@x.com', 'a@', 'a@b', 'a@@b.com', 'a@b@c.com', 5 as never]) {
      expect(normaliseEmail(bad)).toBeNull();
    }
  });
});

describe('the ban hash', () => {
  it('is HMAC-SHA-256 of the normalised address, keyed with the pepper, in 64 hex characters', () => {
    const h = banHash('Test.User.Example@Example.com', PEPPER)!;
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(
      createHmac('sha256', PEPPER).update('test.user.example@example.com').digest('hex'),
    );
  });

  it('is the same for the spellings that reach one inbox, different for others', () => {
    expect(banHash('te.st.user.example@gmail.com', PEPPER)).toBe(
      banHash('TESTUSEREXAMPLE@googlemail.com', PEPPER),
    );
    expect(banHash('testuserexample@gmail.com', PEPPER)).not.toBe(
      banHash('testuserexample2@gmail.com', PEPPER),
    );
  });

  it('depends on the pepper: another pepper gives another hash', () => {
    expect(banHash('test.user.example@example.com', PEPPER)).not.toBe(
      banHash('test.user.example@example.com', 'q'.repeat(40)),
    );
  });

  it('refuses a missing or short pepper, and gives null for a non-address', () => {
    expect(() => banHash('test.user.example@example.com', '')).toThrow();
    expect(() => banHash('test.user.example@example.com', 'x'.repeat(PEPPER_MIN - 1))).toThrow();
    expect(banHash('not an address', PEPPER)).toBeNull();
  });
});
