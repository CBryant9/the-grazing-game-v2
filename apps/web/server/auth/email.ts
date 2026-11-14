import 'server-only';
import { createHmac } from 'node:crypto';

/**
 * The ban hash (docs/DATABASE.md, "The ban list"). The database never sees an
 * email or the pepper: the server works out the finished hash and hands that
 * over.
 *
 * Normalising, before hashing:
 * - every address is trimmed and lower-cased;
 * - gmail.com and googlemail.com are one domain (Google's help,
 *   support.google.com/mail/answer/10313), and dots in the name before the @
 *   are ignored for personal Gmail (support.google.com/mail/answer/7436150),
 *   so the dots come out and the domain is written gmail.com;
 * - at fastmail.com, a `+tag` in the name is dropped: mail to `alias+anything`
 *   reaches the same account (fastmail.help/hc/en-us/articles/360060591053).
 *
 * No other provider rule is applied. A Gmail `+tag` or an Outlook alias still
 * counts as a different address until a provider page that states the rule
 * is found and the rule added here and in the doc.
 */
export function normaliseEmail(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim().toLowerCase();
  const at = text.lastIndexOf('@');
  if (at <= 0 || at !== text.indexOf('@') || at === text.length - 1) return null;
  let name = text.slice(0, at);
  let domain = text.slice(at + 1);
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') name = name.replaceAll('.', '');
  if (domain === 'fastmail.com') {
    const plus = name.indexOf('+');
    if (plus > 0) name = name.slice(0, plus);
  }
  if (!name || !domain.includes('.')) return null;
  return `${name}@${domain}`;
}

/** The shortest pepper the server accepts: 32 characters, as `randomBytes(32)` in hex gives 64. */
export const PEPPER_MIN = 32;

/** HMAC-SHA-256 of the normalised address, keyed with the pepper, as 64 hex characters. Null for something that is not an address. */
export function banHash(email: string, pepper: string): string | null {
  if (typeof pepper !== 'string' || pepper.length < PEPPER_MIN) {
    throw new Error('BAN_HASH_PEPPER is missing or too short.');
  }
  const normal = normaliseEmail(email);
  if (!normal) return null;
  return createHmac('sha256', pepper).update(normal).digest('hex');
}
