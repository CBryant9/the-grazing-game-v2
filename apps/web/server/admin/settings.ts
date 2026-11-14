import 'server-only';
import { DISTRICTS, DISTRICT_IDS } from '@gg/shared';
import { MAINTENANCE_SETTING, MAINTENANCE_WORDINGS } from './info';

/**
 * The site settings the admin can change (PRD 11.8), each typed and checked here on the server.
 * The browser's form is a convenience: whatever it sends is parsed again and refused if it does
 * not fit. A value that fits is stored as JSON in `site_settings`.
 *
 * The audit row never carries the text (the log has a fixed shape with no free text): it
 * carries a number, the length of the text, how many districts, or the wording's place in the list.
 */
export type SettingKey =
  | 'announcement'
  | 'districts_available'
  | 'community_rules'
  | typeof MAINTENANCE_SETTING;

export interface SettingDef {
  key: SettingKey;
  label: string;
  /** What it does, and where it is used today. */
  help: string;
  /** Shown to visitors' browsers (the database's `is_public` flag). */
  isPublic: boolean;
  /** The value when no row is stored. */
  initial: unknown;
}

export const SETTINGS: readonly SettingDef[] = [
  {
    key: 'announcement',
    label: 'Announcement bar',
    help: 'A short line and an optional link for the bar on the home page. Saved now. The pages do not show it yet: they start reading it in a later milestone.',
    isPublic: true,
    initial: { text: null, link: null },
  },
  {
    key: 'districts_available',
    label: 'Districts available',
    help: 'The districts a new farm can start in. Saved now. The setup screen does not read it yet.',
    isPublic: true,
    initial: [...DISTRICT_IDS],
  },
  {
    key: 'community_rules',
    label: 'Community rules text',
    help: 'The text of the community rules. Saved now. The community rules page does not read it yet. Privacy and terms text, and the market data upload, are built in a later milestone.',
    isPublic: true,
    initial: { text: null },
  },
  {
    key: MAINTENANCE_SETTING,
    label: 'Maintenance wording',
    help: 'Which of the fixed wordings players see while maintenance mode is on. Read by the game on the next request.',
    isPublic: false,
    initial: { id: MAINTENANCE_WORDINGS[0].id },
  },
];

export const settingDef = (key: unknown): SettingDef | undefined =>
  SETTINGS.find((s) => s.key === key);

export const ANNOUNCEMENT_MAX = 140;
export const RULES_MAX = 10_000;

export type Parsed =
  | { ok: true; value: unknown; audit: { count: number } | { value: number } }
  | { ok: false; message: string };

const bad = (message: string): Parsed => ({ ok: false, message });

/** Plain single-line text: no control characters, no line breaks. */
const oneLine = /^[^\u0000-\u001f\u007f]*$/;

function parseAnnouncement(input: unknown): Parsed {
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
  return {
    ok: true,
    value: { text: text || null, link: link || null },
    audit: { count: text.length },
  };
}

function parseDistricts(input: unknown): Parsed {
  if (!Array.isArray(input)) return bad('Choose at least one district.');
  const ids = [...new Set(input)];
  if (ids.length === 0) return bad('Keep at least one district available.');
  if (!ids.every((d) => typeof d === 'string' && d in DISTRICTS)) {
    return bad('One of those is not a district.');
  }
  const ordered = DISTRICT_IDS.filter((d) => ids.includes(d));
  return { ok: true, value: ordered, audit: { count: ordered.length } };
}

function parseRules(input: unknown): Parsed {
  if (typeof input !== 'object' || input === null) return bad('Send the text.');
  const raw = (input as { text?: unknown }).text;
  if (raw !== null && raw !== undefined && typeof raw !== 'string') return bad('The text must be words.');
  const text = (typeof raw === 'string' ? raw : '').replace(/\r\n?/g, '\n').trim();
  if (text.length > RULES_MAX) return bad(`Keep the rules to ${RULES_MAX} characters or fewer.`);
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
    return bad('The text has a character that can not be saved.');
  }
  return { ok: true, value: { text: text || null }, audit: { count: text.length } };
}

function parseWording(input: unknown): Parsed {
  const id = typeof input === 'object' && input !== null ? (input as { id?: unknown }).id : null;
  const at = MAINTENANCE_WORDINGS.findIndex((w) => w.id === id);
  if (at < 0) return bad('Choose one of the wordings on the list.');
  return { ok: true, value: { id: MAINTENANCE_WORDINGS[at]!.id }, audit: { value: at + 1 } };
}

export function parseSetting(key: SettingKey, input: unknown): Parsed {
  switch (key) {
    case 'announcement':
      return parseAnnouncement(input);
    case 'districts_available':
      return parseDistricts(input);
    case 'community_rules':
      return parseRules(input);
    case MAINTENANCE_SETTING:
      return parseWording(input);
  }
}
