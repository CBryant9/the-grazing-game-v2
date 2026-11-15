import type { NotifyKind } from '../../lib/notify/kinds';

/**
 * What each notification says. A fact and what it is about, never guilt, streaks, countdown
 * pressure or praise (BUILD_PLAN 3.4, CLAUDE.md rule 2). Each line is short enough for a lock
 * screen and carries nothing private: no money, no email, no date of birth.
 *
 * The morning reminder is the PRD's own line: "First light at Kooringa. 3 things to check."
 * The one later reminder states the same facts in the same plain way.
 */

export type NotifyEvent =
  | { type: 'morning_reminder'; farm: string; toCheck: number | null }
  | { type: 'later_nudge'; farm: string; toCheck: number | null }
  | { type: 'trough_low'; farm: string; paddock: string }
  | { type: 'trough_empty'; farm: string; paddock: string }
  | { type: 'no_water'; farm: string; mob: string; days: number }
  | { type: 'feed_low'; farm: string; mob: string; days: number }
  | { type: 'through_tape'; farm: string; mob: string }
  | { type: 'calving_started'; farm: string; mob: string }
  | { type: 'deaths'; farm: string; mob: string; count: number; cause: string }
  | { type: 'rain'; farm: string; mm: number }
  | { type: 'evening_no_water'; farm: string; mob: string }
  | { type: 'evening_feed_low'; farm: string; mob: string; days: number }
  | { type: 'new_follower'; name: string }
  | { type: 'new_comment'; name: string }
  | { type: 'likes'; count: number; name: string | null }
  | { type: 'group_invite'; name: string; group: string }
  | { type: 'challenge_started'; challenge: string }
  | { type: 'challenge_finished'; challenge: string }
  | { type: 'league_started'; league: string }
  | { type: 'league_finished'; league: string }
  | { type: 'purchase_confirmed'; product: string }
  | { type: 'purchase_refunded'; product: string }
  | { type: 'community_opened' };

export interface Described {
  kind: NotifyKind;
  title: string;
  body: string | null;
  link: string;
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** Text that came from a player (a farm name, a username): one line, no control characters, cut to length. */
export function plain(text: string, max = 60): string {
  const t = text
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}.` : t;
}

const mm = (n: number): string => (Math.round(n * 10) / 10).toLocaleString('en-AU');

/** The notification an event makes. */
export function describeEvent(e: NotifyEvent): Described {
  const play = '/play';
  switch (e.type) {
    case 'morning_reminder': {
      const farm = plain(e.farm);
      const n = e.toCheck;
      return {
        kind: 'morning_reminder',
        title:
          n && n > 0
            ? `First light at ${farm}. ${plural(n, 'thing')} to check.`
            : `First light at ${farm}.`,
        body: null,
        link: play,
      };
    }
    case 'later_nudge': {
      const farm = plain(e.farm);
      const n = e.toCheck;
      return {
        kind: 'later_nudge',
        title: n && n > 0 ? `${farm}: ${plural(n, 'thing')} to check.` : `A reminder for ${farm}.`,
        body: null,
        link: play,
      };
    }
    case 'trough_low':
      return alert(`Trough low in ${plain(e.paddock)} at ${plain(e.farm)}.`);
    case 'trough_empty':
      return alert(`Trough empty in ${plain(e.paddock)} at ${plain(e.farm)}.`);
    case 'no_water':
      return alert(
        `${plain(e.mob)} has had no water for ${plural(e.days, 'day')} at ${plain(e.farm)}.`,
      );
    case 'feed_low':
      return alert(
        `${plain(e.mob)} has about ${plural(e.days, 'day')} of feed left at ${plain(e.farm)}.`,
      );
    case 'through_tape':
      return alert(`${plain(e.mob)} went through the tape at ${plain(e.farm)}.`);
    case 'calving_started':
      return alert(`Calving has started in ${plain(e.mob)} at ${plain(e.farm)}.`);
    case 'deaths':
      return alert(
        `${plural(e.count, 'head', 'head')} died in ${plain(e.mob)} at ${plain(e.farm)}: ${plain(e.cause, 40)}.`,
      );
    case 'rain':
      return alert(`Rain overnight at ${plain(e.farm)}: ${mm(e.mm)} mm.`);
    case 'evening_no_water':
      return {
        kind: 'evening_warning',
        title: `${plain(e.mob)} has no water at ${plain(e.farm)}.`,
        body: null,
        link: play,
      };
    case 'evening_feed_low':
      return {
        kind: 'evening_warning',
        title: `${plain(e.mob)} has about ${plural(e.days, 'day')} of feed left at ${plain(e.farm)}.`,
        body: null,
        link: play,
      };
    case 'new_follower':
      return social(`${plain(e.name, 30)} followed you.`);
    case 'new_comment':
      return social(`${plain(e.name, 30)} commented on your post.`);
    case 'likes':
      return social(
        e.count === 1 && e.name
          ? `${plain(e.name, 30)} liked your post.`
          : `${plural(e.count, 'person', 'people')} liked your post.`,
      );
    case 'group_invite':
      return social(`${plain(e.name, 30)} invited you to ${plain(e.group, 40)}.`);
    case 'challenge_started':
      return challenge(`${plain(e.challenge, 60)} has started.`);
    case 'challenge_finished':
      return challenge(`${plain(e.challenge, 60)} has finished.`);
    case 'league_started':
      return challenge(`${plain(e.league, 60)} has started.`);
    case 'league_finished':
      return challenge(`${plain(e.league, 60)} has finished.`);
    case 'purchase_confirmed':
      return system(`Your purchase of ${plain(e.product, 60)} is confirmed.`);
    case 'purchase_refunded':
      return system(`Your purchase of ${plain(e.product, 60)} was refunded.`);
    case 'community_opened':
      return system('The community is now open to your account.');
  }
}

const alert = (title: string): Described => ({
  kind: 'farm_alert',
  title,
  body: null,
  link: '/play',
});
const social = (title: string): Described => ({ kind: 'social', title, body: null, link: '/play' });
const challenge = (title: string): Described => ({
  kind: 'challenge',
  title,
  body: null,
  link: '/play',
});
const system = (title: string): Described => ({
  kind: 'system',
  title,
  body: null,
  link: '/account/notifications',
});

// ---------------------------------------------------------------- the wording rule

/**
 * Words and shapes a notification may never have. A check at the door of the queue, and the test
 * that runs it over every line this file can make. It is a net, not the rule itself: the rule is
 * to state the fact.
 */
const NEVER: { why: string; pattern: RegExp }[] = [
  { why: 'an exclamation mark', pattern: /!/ },
  { why: 'a streak', pattern: /\bstreaks?\b|\bin a row\b|\bconsecutive\b/i },
  {
    why: 'guilt or pressure',
    pattern:
      /\b(?:don'?t forget|forgot|forgotten|missed|miss out|missing out|we miss|hurry|last chance|act now|right now|asap|urgent(?:ly)?|overdue|neglect\w*|ignor\w+|abandon\w*|come back|too late|before it'?s|running out of time|waiting for you|need you|needs you|don'?t let|worried)\b/i,
  },
  {
    why: 'an instruction or a nag',
    pattern: /\b(?:you should|you must|you need to|make sure|remember to|be sure to)\b/i,
  },
  {
    why: 'praise',
    pattern:
      /\b(?:great job|good job|well done|congrat\w*|amazing|awesome|fantastic|brilliant|keep it up|nice work|you rock|proud)\b/i,
  },
  {
    why: 'a countdown',
    pattern:
      /\b\d+\s*(?:hours?|hrs?|minutes?|mins?|seconds?)\s*(?:left|remaining|to go)\b|\bcountdown\b|\bends? in\b|\bexpires?\b/i,
  },
  { why: 'money (a lock screen shows it)', pattern: /[$€£]/ },
];

/** What is wrong with this text, as short phrases. Empty when it is fine. */
export function wordingProblems(text: string): string[] {
  return NEVER.filter((n) => n.pattern.test(text)).map((n) => n.why);
}
