import 'server-only';
import { COSTS, COST_PER_M, type FarmEvent, type JobCard, type MaterialsOnHand } from '@gg/engine';
import type { BuildWire, FenceOptionWire } from '../../lib/game/types';

/**
 * The words for the build tools: the tool bar's help lines and prices, what
 * a line job says on its card, and what a done job reports. Plain
 * Australian English, short sentences, facts only (CLAUDE.md, rules 2, 5
 * and 11). The prices come from the engine, so the browser holds no table.
 */

const money = (n: number): string => `$${Math.round(Math.abs(n)).toLocaleString('en-AU')}`;

/** A price a metre: whole dollars when it is whole, cents when it is not. */
export const perMetre = (n: number): string =>
  Number.isInteger(n) ? `$${n} a metre` : `$${n.toFixed(2)} a metre`;

const metres = (n: number): string => `${Math.round(n).toLocaleString('en-AU')} m`;

const FENCE_NAME = { permanent: 'Permanent', electric: 'Electric', tape: 'Tape' } as const;

const FENCE_TEXT = {
  permanent: 'Meant to stay up. It costs the most and takes the longest to build.',
  electric: 'Cheaper and quicker than permanent. It can be knocked down and put back up.',
  tape: 'Cheap and quick. Roll it up and use it again. Hungry or thirsty stock can push through.',
} as const;

/** The fences a player can draw, with the price a metre and what each does. */
export function fenceOptions(): FenceOptionWire[] {
  return (['permanent', 'electric', 'tape'] as const).map((id) => ({
    id,
    name: FENCE_NAME[id],
    perM: COST_PER_M[id],
    price: perMetre(COST_PER_M[id]),
    text: FENCE_TEXT[id],
  }));
}

/** The tool bar's content: one short help line and one price line for each tool. */
export function buildWire(onHand?: MaterialsOnHand): BuildWire {
  return {
    fences: fenceOptions(),
    onHand: onHand ? onHandWords(onHand) : null,
    noneFits: NONE_FITS,
    tools: [
      {
        id: 'fence',
        name: 'Fence',
        help: 'Drag along the paddock lines to draw a fence.',
        price: `${perMetre(COST_PER_M.tape)} to ${perMetre(COST_PER_M.permanent)}`,
      },
      {
        id: 'gate',
        name: 'Gate',
        help: 'Tap a fence to put a gate in it. Tap a gate to open or shut it.',
        price: `${money(COSTS.gate)} a gate`,
      },
      {
        id: 'pipe',
        name: 'Pipe',
        help: 'Drag across squares from the bore, a trough, a hub or pipe that is already there.',
        price: perMetre(COST_PER_M.pipe),
      },
      {
        id: 'trough',
        name: 'Trough',
        help: 'Tap a square that water reaches to put a trough on it.',
        price: `${money(COSTS.trough)} each`,
      },
      {
        id: 'portable',
        name: 'Portable trough',
        help: 'Tap a square to set down a portable trough. Tap one to move it, refill it or take it away.',
        price: `${money(COSTS.portable)} each, ${money(COSTS.portableFill)} to refill`,
      },
      {
        id: 'hub',
        name: 'Water hub',
        help: 'Tap a fence corner, or a square on water, to put a hub there. Tap a hub to move it or take it out.',
        price: `${money(COSTS.trough + COSTS.fenceHubExtra)} on a corner`,
      },
      {
        id: 'remove',
        name: 'Remove',
        help: 'Tap a fence, gate, trough, hub or portable trough to take it away. Tape is rolled up.',
        price: 'The card shows any cost',
      },
    ],
  };
}

/**
 * What a line card says about the part that does not fit today. Empty when
 * all of it fits. The first sentence is the owner's wording.
 */
export function lineWords(fitsM: number, lateM: number): string[] {
  if (lateM <= 0) return [];
  return [
    "You don't have enough time to do this today.",
    fitsM > 0
      ? `${metres(fitsM)} fits today. ${metres(lateM)} does not, so it is not built. Draw it again another day.`
      : `None of it fits today. ${metres(lateM)} is not built. Draw it again another day.`,
  ];
}

/**
 * What a gate does, in sentences: which paddocks it joins, and that the
 * mobs in them join if both hold stock. `kind` is what the job does.
 */
export function gateNotes(
  kind: 'place' | 'open' | 'shut' | 'none',
  a: string,
  b: string,
  bothHoldStock: boolean,
): string[] {
  if (kind === 'none' || a === b) return [];
  if (kind === 'place') {
    return [`A new gate is put in shut. When it is open it joins ${a} and ${b}.`];
  }
  if (kind === 'shut') return [`Shutting it keeps ${a} and ${b} apart.`];
  return [
    `Opening it joins ${a} and ${b} into one grazing area. The mobs in them will join if both hold stock.${bothHoldStock ? ' Both hold stock now.' : ''}`,
  ];
}

const FENCE_WORD = {
  permanent: 'permanent fence',
  electric: 'electric fence',
  tape: 'tape',
} as const;

const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

/** What a done fence, gate, pipe or water job did, and what it cost. Null for any other event. */
export function layoutWord(e: Extract<FarmEvent, { type: 'layout-job' }>): string | null {
  const d = e.detail;
  const cost = e.cost > 0 ? ` It cost ${money(e.cost)}.` : '';
  switch (e.job) {
    case 'buildFence': {
      const kind =
        typeof d.fence === 'string' && d.fence in FENCE_WORD
          ? (d.fence as keyof typeof FENCE_WORD)
          : null;
      const what = kind ? FENCE_WORD[kind] : 'fence';
      const roll =
        kind === 'tape' && num(d.tapeFromRollM) > 0
          ? ` ${metres(num(d.tapeFromRollM))} came off the roll.`
          : '';
      const energiser = d.energiserBought === true ? ' That includes the solar energiser.' : '';
      return `Built ${metres(num(d.metres))} of ${what}.${cost}${roll}${energiser}`;
    }
    case 'removeFence':
      return `Took down ${metres(num(d.metres))} of fence.${cost}`;
    case 'rollUpTape':
      return `Rolled up ${metres(num(d.tapeToRollM))} of tape.${cost}`;
    case 'placeGate':
      return `Put in a gate.${cost}`;
    case 'removeGate':
      return 'Took out the gate.';
    case 'setGate':
      return d.open === true ? 'The gate is open.' : 'The gate is shut.';
    case 'fixFence':
      return `Put the fence back up.${cost}`;
    case 'layPipe': {
      const dry = d.connected === false ? ' It is not joined to water yet.' : '';
      return `Laid ${metres(num(d.metres))} of pipe.${cost}${dry}`;
    }
    case 'placeTrough':
      return `Put in a trough.${cost}`;
    case 'moveTrough':
      return `Moved the trough.${cost}`;
    case 'removeTrough':
      return 'Took out the trough.';
    case 'placeFenceHub':
      return `Put in a water hub on the fence corner.${cost}`;
    case 'placeSquareHub':
      return `Put in a water hub.${cost}`;
    case 'removeHub':
      return 'Took out the water hub.';
    case 'placePortable':
      return `Set down a portable trough.${cost}`;
    case 'movePortable':
      return `Moved the portable trough.${cost}`;
    case 'refillPortable':
      return `Refilled the portable trough.${cost}`;
    case 'removePortable':
      // The refund is the job's own figure: it comes in as a negative cost.
      return `Sold the portable trough back for ${money(Math.max(0, -e.cost))}.`;
    default:
      return null;
  }
}

/** The note on the card for selling a portable trough back: the engine's refund. */
export const refundNote = (dollars: number): string => `You get ${money(dollars)} back for it.`;

/** What a line card says when none of the line fits in today's light. */
export const NONE_FITS = "You don't have enough time to do this today. Draw it again another day.";

/** Fence materials on hand, in one sentence, or null when there are none. */
export function onHandWords(m: MaterialsOnHand): string | null {
  const parts: string[] = [];
  if (m.permanentM > 0) parts.push(`${metres(m.permanentM)} of permanent fence`);
  if (m.electricM > 0) parts.push(`${metres(m.electricM)} of electric fence`);
  if (m.tapeM > 0) parts.push(`${metres(m.tapeM)} of tape on the roll`);
  if (!parts.length) return null;
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `On hand: ${list}. Fence built from it is half price.`;
}

/**
 * What a fence card says about materials on hand: how many metres come from
 * them and what that saves, for the part built today. The figures are the
 * engine's job card (`fenceMaterials`).
 */
export function fenceMaterialsNotes(f: NonNullable<JobCard['fenceMaterials']>): string[] {
  if (f.fromStockTodayM <= 0) {
    return f.onHandM > 0
      ? [`${metres(f.onHandM)} of ${FENCE_WORD[f.fence]} on hand. None of it is used today.`]
      : [];
  }
  return [
    `${metres(f.fromStockTodayM)} comes from the ${FENCE_WORD[f.fence]} on hand, at half price. That saves ${money(f.savingToday)}.`,
  ];
}

/** What a take-down card says about the materials kept (`materialsKept` on the job card). */
export function materialsKeptNotes(k: NonNullable<JobCard['materialsKept']>): string[] {
  const parts: string[] = [];
  if (k.permanentM > 0) parts.push(`${metres(k.permanentM)} of permanent fence`);
  if (k.electricM > 0) parts.push(`${metres(k.electricM)} of electric fence`);
  if (!parts.length) return [];
  return [`You keep the materials: ${parts.join(' and ')}. Fence built from them is half price.`];
}
