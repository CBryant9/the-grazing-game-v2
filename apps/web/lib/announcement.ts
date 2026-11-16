/**
 * The rules for the home page's announcement bar (PRD 11.8): one line, and an optional link to a
 * page on this site or an https address. The admin's form is checked with these on the server,
 * and the home page checks the stored value again before it writes the bar.
 *
 * Plain code with no server modules, so the home page (pages router) can use it at build time.
 */

export const ANNOUNCEMENT_MAX = 140;

export interface AnnouncementValue {
  text: string | null;
  link: string | null;
}

export type AnnouncementCheck =
  { ok: true; value: AnnouncementValue } | { ok: false; message: string };

/** Plain single-line text: no control characters, no line breaks. */
const oneLine = /^[^\u0000-\u001f\u007f]*$/;

export function checkAnnouncement(input: unknown): AnnouncementCheck {
  const bad = (message: string): AnnouncementCheck => ({ ok: false, message });
  if (typeof input !== 'object' || input === null) return bad('Send the text and the link.');
  const raw = input as { text?: unknown; link?: unknown };
  const text = typeof raw.text === 'string' ? raw.text.trim() : '';
  const link = typeof raw.link === 'string' ? raw.link.trim() : '';
  if (raw.text !== undefined && raw.text !== null && typeof raw.text !== 'string') {
    return bad('The text must be words.');
  }
  if (raw.link !== undefined && raw.link !== null && typeof raw.link !== 'string') {
    return bad('The link must be an address.');
  }
  if (text.length > ANNOUNCEMENT_MAX) {
    return bad(`Keep the announcement to ${ANNOUNCEMENT_MAX} characters or fewer.`);
  }
  if (!oneLine.test(text)) return bad('The announcement must be one line.');
  if (link && !text) return bad('Add the announcement text before a link.');
  if (link) {
    const ownPage = /^\/(?!\/)[A-Za-z0-9\-._~/%]{0,98}$/.test(link);
    let https = false;
    try {
      const u = new URL(link);
      https = u.protocol === 'https:' && link.length <= 200 && !/\s/.test(link);
    } catch {
      https = false;
    }
    if (!ownPage && !https) {
      return bad('The link must be a page on this site (starting with /) or an https address.');
    }
  }
  return { ok: true, value: { text: text || null, link: link || null } };
}
