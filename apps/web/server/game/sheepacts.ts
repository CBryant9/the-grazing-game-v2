import 'server-only';
import {
  GRID_N,
  MAX_SHEEP_BUY,
  SHEEP_BUY_CLASSES,
  SHEEP_FEEDS,
  areaWatered,
  sheepFeedCosts,
  sheepMobsOf,
  surveyOf,
  type Action,
  type ActionRefusalReason,
  type FarmEvent,
  type FarmState,
  type SheepFeed,
  type SourceEnv,
} from '@gg/engine';
import { NOT_FOR_SHEEP } from './buildwords';
import { SHEEP_MOVE_CLASSES, fenceFact, leakyEdges, parseSellPick } from './sheepmobs';
import { classInText, sellLabel } from './sheepwords';

/**
 * The sheep jobs the browser may ask for (milestone 2.8), checked here and turned into the
 * engine's actions, and the words on their job cards. The engine checks the rest.
 */

const int = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null;

const money = (n: number): string => `$${Math.round(Math.abs(n)).toLocaleString('en-AU')}`;
const n0 = (n: number): string => Math.round(n).toLocaleString('en-AU');

export const isSheepMob = (farm: FarmState | undefined, id: number | null): boolean =>
  !!farm && id !== null && sheepMobsOf(farm).some((m) => m.id === id);

/** True for an action that only a farm showing sheep may take. */
export function isSheepAction(a: Action): boolean {
  return (
    a.type === 'setSheepFeed' ||
    a.type === 'setSheepDates' ||
    a.type === 'buySheep' ||
    a.type === 'sellSheep' ||
    a.type === 'moveSheep' ||
    a.type === 'moveSheepPart' ||
    a.type === 'setSheepPlan' ||
    a.type === 'clearSheepPlan' ||
    (a.type === 'buildFence' && a.fence === 'netting')
  );
}

/**
 * A sheep request, or a move named by a sheep mob, as the engine's action. Null when the body is
 * not a sheep request (the caller goes on to the others) or `false` when it is one and is wrong.
 */
export function parseSheepAction(
  a: Record<string, unknown>,
  farm: FarmState | undefined,
): Action | null | false {
  const mob = int(a.mob, 1, 1e6);
  switch (a.type) {
    case 'setSheepFeed':
      if (mob === null || !SHEEP_FEEDS.includes(a.feed as SheepFeed)) return false;
      return { type: 'setSheepFeed', mob, feed: a.feed as SheepFeed };
    case 'setShearing': {
      const month = int(a.month, 0, 11);
      const date = int(a.date, 1, 31);
      if (mob === null || month === null || date === null) return false;
      return { type: 'setSheepDates', mob, shear: { month, date } };
    }
    case 'buySheep': {
      const qty = int(a.qty, 1, MAX_SHEEP_BUY);
      if (qty === null || typeof a.cls !== 'string' || !Object.hasOwn(SHEEP_BUY_CLASSES, a.cls)) {
        return false;
      }
      // On the farm clock bought sheep land in the stock yards: the square is not used.
      return { type: 'buySheep', cls: a.cls, qty, to: { cell: 0 } };
    }
    case 'sellSheep': {
      const qty = int(a.qty, 1, 1e6);
      const pick = parseSellPick(a.pick);
      if (mob === null || qty === null || !pick) return false;
      return { type: 'sellSheep', mob, cls: pick.cls, sex: pick.sex, qty };
    }
    case 'moveMob': {
      if (!isSheepMob(farm, mob)) return null;
      const cell = int(a.cell, 0, GRID_N - 1);
      return cell === null ? false : { type: 'moveSheep', mob: mob!, to: { cell } };
    }
    case 'moveCattle': {
      // Part of a sheep mob: one class, from one sheep mob.
      if (!Array.isArray(a.picks) || a.picks.length !== 1) return null;
      const p = (a.picks[0] ?? {}) as Record<string, unknown>;
      const pm = int(p.mob, 1, 1e6);
      if (!isSheepMob(farm, pm)) return null;
      const cell = int(a.cell, 0, GRID_N - 1);
      const qty = int(p.qty, 1, 1e6);
      if (cell === null || qty === null) return false;
      if (!SHEEP_MOVE_CLASSES.includes(p.cls as never)) return false;
      return { type: 'moveSheepPart', mob: pm!, cls: p.cls as string, qty, to: { cell } };
    }
    default:
      return null;
  }
}

/** The area a move or a buy names, by its square, for the plain refusals. */
function areaNameAt(farm: FarmState, cell: number): string | null {
  const s = surveyOf(farm);
  const id = s.topology.areaOf[cell];
  return id === undefined || id < 0 ? null : (s.topology.areas[id]?.name ?? null);
}

const targetCell = (a: Action): number | null => {
  if ((a.type === 'moveMob' || a.type === 'moveCattle') && typeof a.to === 'object') {
    return a.to.cell;
  }
  if (a.type === 'moveSheep' || a.type === 'moveSheepPart') return a.to.cell;
  return null;
};

/** The species refusals in plain words: "Paddock 4 holds cattle." Other refusals keep the engine's words. */
export function refusalWords(
  farm: FarmState,
  a: Action,
  reason: ActionRefusalReason,
  message: string,
): string {
  if (reason !== 'cattle-there' && reason !== 'sheep-there') return message;
  const cell = targetCell(a);
  const area = cell === null ? null : areaNameAt(farm, cell);
  const who = reason === 'cattle-there' ? 'cattle' : 'sheep';
  return `${area ?? 'That paddock'} holds ${who}. Cattle and sheep run in separate paddocks.`;
}

/** The notes on a sheep move's card: no water, a fence that does not hold sheep, a mob there to join. */
export function sheepMoveNotes(farm: FarmState, a: Action): string[] {
  if (a.type !== 'moveSheep' && a.type !== 'moveSheepPart') return [];
  const s = surveyOf(farm);
  const areaId = s.topology.areaOf[a.to.cell];
  const area = areaId === undefined ? undefined : s.topology.areas[areaId];
  if (areaId === undefined || !area) return [];
  const notes: string[] = [];
  if (!areaWatered(s.points, areaId)) {
    notes.push(`${area.name} has no water. Sheep die on the fourth day without water.`);
  }
  if (leakyEdges(farm, s, areaId) > 0) notes.push(fenceFact(area.name));
  for (const m of sheepMobsOf(farm)) {
    if (m.id === a.mob || m.where.kind !== 'paddock') continue;
    if (s.topology.areaOf[m.where.anchor] !== areaId) continue;
    notes.push(`${m.name} is in ${area.name}. The two mobs will join.`);
  }
  return notes;
}

/** A cattle fence drawn on a farm with sheep: the rule, said once on the card. */
export function fenceRuleNotes(farm: FarmState, a: Action): string[] {
  if (a.type !== 'buildFence' || a.fence === 'netting') return [];
  return sheepMobsOf(farm).length ? [NOT_FOR_SHEEP] : [];
}

/** What a feed costs this mob a day, dollars, or null off pasture. */
export function sheepFeedPerDay(
  farm: FarmState,
  env: SourceEnv,
  mob: number,
  feed: SheepFeed,
): number | null {
  const c = sheepFeedCosts(farm, env).find((x) => x.mob === mob);
  return c ? Math.round(c.perDay[feed] * 100) / 100 : null;
}

/** The ready-made lines on a sheep buy or sell card, from a trial run of the job. */
export function sheepMarketLines(
  farm: FarmState,
  a: Action,
  events: readonly FarmEvent[] | null,
): string[] {
  if (a.type === 'buySheep') {
    const e = events?.find((x) => x.type === 'sheep-on-the-way');
    if (e?.type !== 'sheep-on-the-way') return [];
    return [
      `Buy ${n0(e.qty)} ${classInText(e.cls)} for ${money(e.total)}, the head fee included.`,
      'They arrive in the stock yards at first light tomorrow.',
      `In the bank after: ${farm.cash - e.total < 0 ? '-' : ''}${money(farm.cash - e.total)}.`,
    ];
  }
  if (a.type === 'sellSheep') {
    const e = events?.find((x) => x.type === 'sheep-sold');
    if (e?.type !== 'sheep-sold') return [];
    const what = a.sex ? sellLabel(a.cls as never, a.sex) : a.cls;
    return [
      `Sell ${n0(e.head)} head (${what.toLowerCase()}) from ${e.mobName}${e.lambsAtFoot ? `, with ${n0(e.lambsAtFoot)} lambs at foot` : ''}, averaging ${n0(e.avgKg)} kg.`,
      `About ${money(e.net)} into the bank today, after selling costs.`,
      `In the bank after: ${money(farm.cash + e.net)}.`,
    ];
  }
  return [];
}
