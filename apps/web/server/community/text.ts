/**
 * What a player types, cleaned on the server before it is stored (never trusted from the browser).
 *
 * - The text is made NFC, so two ways of typing the same letter are one.
 * - Characters that hide or flip text are removed: zero-width spaces, the word joiner, the byte
 *   order mark, the left-to-right and right-to-left marks and every bidirectional override or
 *   isolate. They can make one word look like another, or slip a banned word past the filter
 *   ("ba" + zero-width space + "d"). The joiner (U+200D) stays, because emoji need it.
 * - Control characters go, except a new line (and tab, which becomes a space).
 * - Lengths are counted in characters a person sees (code points), and capped here as well as by
 *   the database.
 *
 * Nothing here makes text safe to put in a page: that is the page's job, and React escapes every
 * string. Text is only ever rendered as text, never as markup.
 */

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;
const HIDDEN = /[​‌⁠﻿‎‏؜‪-‮⁦-⁩­᠎]/g;
const HAS_HIDDEN = /[​‌⁠﻿‎‏؜‪-‮⁦-⁩­᠎]/;

export function cleanText(input: string, opts: { multiline?: boolean } = {}): string {
  let t = input.normalize('NFC').replace(/\r\n?/g, '\n').replace(/\t/g, ' ');
  t = t.replace(CONTROL, '').replace(HIDDEN, '');
  if (opts.multiline) {
    t = t
      .split('\n')
      .map((l) => l.replace(/ +$/g, ''))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n');
  } else {
    t = t.replace(/\n/g, ' ').replace(/ {2,}/g, ' ');
  }
  return t.trim();
}

export const length = (t: string): number => [...t].length;

export class TextError extends Error {}

/** A required or optional text field, cleaned and length-checked. Null for empty when optional. */
export function field(
  value: unknown,
  name: string,
  max: number,
  opts: { required?: boolean; multiline?: boolean } = {},
): string | null {
  if (value === undefined || value === null || value === '') {
    if (opts.required) throw new TextError(`Add ${name}.`);
    return null;
  }
  if (typeof value !== 'string') throw new TextError(`The ${name} was not sent properly.`);
  // A huge string is refused before it is cleaned.
  if (value.length > max * 8) throw new TextError(`The ${name} is too long.`);
  const t = cleanText(value, opts);
  if (t === '') {
    if (opts.required) throw new TextError(`Add ${name}.`);
    return null;
  }
  if (length(t) > max) throw new TextError(`The ${name} can be up to ${max} characters.`);
  return t;
}

/**
 * A link a player may share: https only, a real host name with a dot (no bare addresses), no
 * sign-in details in it, no other scheme (so no `javascript:` or `data:`), at most 300
 * characters, and no spaces or hidden characters. Returns the address as the browser reads it,
 * or null.
 */
export function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (raw.length === 0 || raw.length > 300) return null;
  if (/[\s\u0000-\u001f\u007f-\u009f]/.test(raw) || HAS_HIDDEN.test(raw)) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  // The URL class turns a non-English name into its ASCII form, so this checks that form.
  if (!/^(?:[a-z0-9-]+\.)+(?:[a-z]{2,}|xn--[a-z0-9-]+)$/i.test(u.hostname)) return null;
  return u.href.length <= 300 ? u.href : null;
}

/** The address to put in an `href`: only a safe https link. Anything else is shown as plain text. */
export function safeHref(value: string | null | undefined): string | null {
  return value ? safeUrl(value) : null;
}

export const LINK_KINDS = ['website', 'instagram', 'facebook', 'x', 'youtube', 'tiktok'] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export const REPORT_REASONS = [
  { id: 'spam', label: 'Spam' },
  { id: 'abuse', label: 'Abuse or bullying' },
  { id: 'nudity', label: 'Nudity' },
  { id: 'violence', label: 'Violence' },
  { id: 'hate', label: 'Hate' },
  { id: 'self_harm', label: 'Self-harm' },
  { id: 'impersonation', label: 'Pretending to be someone' },
  { id: 'other', label: 'Something else' },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]['id'];
