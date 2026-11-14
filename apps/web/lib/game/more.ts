import type { InboxKind, InboxWire, SetupSummary } from './types';

/**
 * The pure parts of the More tab: the facts about the farm in words, the
 * name of each kind of message, and which messages are new. No React here.
 */

const YEARS: Record<SetupSummary['years'], string> = {
  'real-in-order': 'Real years, in order',
  'real-random': 'Real years, in a random order',
  random: 'Random seasons',
};

const START: Record<SetupSummary['startType'], string> = {
  running: 'A running farm',
  scratch: 'From scratch',
};

const DIFFICULTY: Record<SetupSummary['difficulty'], string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

export interface FarmFact {
  label: string;
  value: string;
}

/** The farm's setup as label and value pairs, for the Farm section. */
export function setupFacts(s: SetupSummary): FarmFact[] {
  const ha = Math.round(s.farmHa).toLocaleString('en-AU');
  const size = s.size.charAt(0).toUpperCase() + s.size.slice(1);
  return [
    { label: 'District', value: `${s.districtName}, around ${s.town}, ${s.state}` },
    { label: 'Size', value: `${size}, ${ha} ha` },
    {
      label: 'Enterprise',
      value:
        s.enterprise === 'mixed'
          ? `Cattle and crops, ${Math.round(s.arablePct)}% arable`
          : 'Cattle grazing',
    },
    { label: 'Seasons', value: YEARS[s.years] },
    { label: 'Start', value: START[s.startType] },
    { label: 'Difficulty', value: DIFFICULTY[s.difficulty] },
  ];
}

const KIND: Record<InboxKind, string> = {
  cattle: 'Cattle',
  sale: 'Market',
  crop: 'Crops',
  plan: 'Plan',
  water: 'Water',
  farm: 'Farm',
};

export const kindName = (k: InboxKind): string => KIND[k];

/** The tag numbers of the messages that are unread now, so they can keep their mark while the inbox is open. */
export const unreadSeqs = (messages: readonly InboxWire[]): Set<number> =>
  new Set(messages.filter((m) => m.unread).map((m) => m.seq));

/** The newest message number, or 0 with none. */
export const newestSeq = (messages: readonly InboxWire[]): number =>
  messages.reduce((m, x) => Math.max(m, x.seq), 0);

/** "3 unread messages", "1 unread message", or "" with none, for the tab's name. */
export function unreadWord(n: number): string {
  if (n <= 0) return '';
  return `${n.toLocaleString('en-AU')} unread ${n === 1 ? 'message' : 'messages'}`;
}

/** The count on the tab: the number up to 99, then 99+. */
export const badgeText = (n: number): string => (n > 99 ? '99+' : String(n));
