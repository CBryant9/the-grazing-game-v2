import 'server-only';
import {
  DSE_PER_AE,
  EDGE,
  MAX_SHEEP_BUY,
  SHEEP_BUDGET_COSTS,
  SHEEP_FEEDS,
  areaIdOf,
  areaWatered,
  dateOn,
  getEdge,
  hash32,
  nettingEdges,
  sheepClassOf,
  sheepConditionFacts,
  sheepDistrict,
  sheepFeedCosts,
  sheepMarketRead,
  sheepMobsOf,
  sheepMobsRead,
  surveyOf,
  type FarmState,
  type SheepClass,
  type SheepLossReason,
  type SheepMob,
  type SheepMobRead,
  type SourceEnv,
  type Survey,
} from '@gg/engine';
import {
  FARM_GRID_H,
  FARM_GRID_W,
  VIEW_FENCE,
  type FarmView,
  type FarmViewFlock,
  type ViewSheepKind,
} from '@gg/shared';
import type {
  DateParts,
  MobClassWire,
  MobWire,
  PaddockWire,
  SheepMarketWire,
  SheepSellWire,
  SheepWire,
  TodoWire,
} from '../../lib/game/types';
import { gainWhy } from './mobwords';
import type { DateOf } from './labourwords';
import {
  SHEEP_CLASS_LABEL,
  SHEEP_FEED_LABEL,
  contractorText,
  fullDate,
  joiningLines,
  lossList,
  sellLabel,
  stageText,
  stageWord,
  woolText,
} from './sheepwords';

/**
 * Sheep for the screens (milestone 2.8): the sheep mob cards, the sheep on the map, the
 * paddocks' stocking with sheep, the sheep to-do lines and the sheep market. Built from the
 * engine's reads (`sheepMobsRead`, `sheepFeedCosts`, `sheepConditionFacts`, `sheepMarketRead`)
 * and rounded here. No chance, formula or table goes out: pregnancy shows only as the
 * scanning record, as the engine's read gives it.
 */

const round = (n: number, places = 0): number => {
  const k = 10 ** places;
  return Math.round(n * k) / k;
};

/** Sheep mobs read once for a snapshot. */
export interface SheepReads {
  survey: Survey;
  reads: SheepMobRead[];
  mobs: readonly SheepMob[];
  feed: Map<number, Record<'none' | 'lick' | 'grain' | 'hay', number>>;
  /** The newest losing-weight reasons for each mob from the last two weeks of the farm's messages. */
  loss: Map<number, SheepLossReason[]>;
}

export function sheepReads(farm: FarmState, env: SourceEnv): SheepReads | null {
  const mobs = sheepMobsOf(farm);
  if (!mobs.length) return null;
  const loss = new Map<number, SheepLossReason[]>();
  for (let i = farm.inbox.length - 1; i >= 0; i--) {
    const msg = farm.inbox[i]!;
    if (msg.day < farm.day - 14) break;
    const e = msg.event;
    if (e.type === 'sheep' && e.note.type === 'losingWeight' && !loss.has(e.mob)) {
      loss.set(e.mob, e.note.why);
    }
  }
  return {
    survey: surveyOf(farm),
    reads: sheepMobsRead(farm, dateOn(farm).month),
    mobs,
    feed: new Map(sheepFeedCosts(farm, env).map((c) => [c.mob, c.perDay])),
    loss,
  };
}

/** Grazing-area boundary segments that do not hold sheep (any cattle fence, up or down). */
export function leakyEdges(farm: FarmState, survey: Survey, areaId: number): number {
  const area = survey.topology.areas[areaId];
  if (!area) return 0;
  const holds = (code: number): boolean =>
    code === EDGE.netting || code === EDGE.boundary || code === EDGE.gateShut;
  const inArea = (cell: number): boolean => survey.topology.areaOf[cell] === areaId;
  let n = 0;
  for (const cell of area.cells) {
    const row = Math.floor(cell / FARM_GRID_W);
    const col = cell % FARM_GRID_W;
    const sides: [boolean, { line: 'h' | 'v'; index: number }][] = [
      [row > 0 && inArea(cell - FARM_GRID_W), { line: 'h', index: row * FARM_GRID_W + col }],
      [
        row < FARM_GRID_H - 1 && inArea(cell + FARM_GRID_W),
        { line: 'h', index: (row + 1) * FARM_GRID_W + col },
      ],
      [col > 0 && inArea(cell - 1), { line: 'v', index: row * (FARM_GRID_W + 1) + col }],
      [
        col < FARM_GRID_W - 1 && inArea(cell + 1),
        { line: 'v', index: row * (FARM_GRID_W + 1) + col + 1 },
      ],
    ];
    for (const [inside, edge] of sides) {
      if (!inside && !holds(getEdge(farm.layout.fences, edge))) n++;
    }
  }
  return n;
}

/** The fact for a paddock whose edge does not hold sheep. */
export const fenceFact = (area: string): string =>
  `${area} has cattle fence on part of its edge. A cattle fence does not hold sheep.`;

const NO_WATER_SHEEP = 'Sheep die on the fourth day without water.';

/** The groups of a sheep mob that can be sold: by class, and by sex where the class holds more than one. */
function sellGroups(m: SheepMob): SheepSellWire[] {
  const by = new Map<string, SheepSellWire>();
  for (const s of m.sheep) {
    if (!s.weaned || s.dead || s.n <= 0) continue;
    const cls = sheepClassOf(s);
    const id = `${cls}:${s.sex}`;
    const row = by.get(id) ?? { id, label: sellLabel(cls, s.sex), head: 0 };
    row.head += s.n;
    by.set(id, row);
  }
  return [...by.values()].sort((a, b) => b.head - a.head);
}

/** "ewe:F" back to the engine's class and sex, or null. */
export function parseSellPick(pick: unknown): { cls: SheepClass; sex: 'F' | 'W' | 'M' } | null {
  if (typeof pick !== 'string') return null;
  const m = /^(ewe|wether|ram|hogget|weaner):(F|W|M)$/.exec(pick);
  return m ? { cls: m[1] as SheepClass, sex: m[2] as 'F' | 'W' | 'M' } : null;
}

export const SHEEP_MOVE_CLASSES: readonly SheepClass[] = [
  'ewe',
  'wether',
  'ram',
  'hogget',
  'weaner',
];

/** Why a sheep mob is losing weight, or short of feed or water, as facts with their reasons. */
function whyLines(
  r: SheepMobRead,
  m: SheepMob,
  hasWater: boolean,
  area: string | null,
  loss: SheepLossReason[] | undefined,
): string[] {
  const out: string[] = [];
  if (m.where.kind === 'paddock' && (!hasWater || r.dryDays > 0)) {
    out.push(
      `${r.name} has no water${area ? ` in ${area}` : ''}.${r.dryDays > 0 ? ` ${r.dryDays} ${r.dryDays === 1 ? 'day' : 'days'} without so far.` : ''} ${NO_WATER_SHEEP}`,
    );
  }
  if (m.st && r.adg < -0.02) {
    out.push(
      `${r.name} is losing about ${Math.round(Math.abs(r.adg) * 1000)} g a head a day${loss?.length ? `: ${lossList(loss)}` : ''}.`,
    );
  }
  if (m.st && m.where.kind === 'paddock' && m.st.f < 0.9) {
    out.push(`The paddock gave the mob ${Math.round(m.st.f * 100)}% of the feed it wanted.`);
  }
  return out;
}

/** Every sheep mob as a mob card, in the farm's order. */
export function sheepMobWires(farm: FarmState, sr: SheepReads, dateOf: DateOf): MobWire[] {
  const byId = new Map(sr.mobs.map((m) => [m.id, m]));
  return sr.reads.map((r) => {
    const m = byId.get(r.id)!;
    const areaId = areaIdOf(sr.survey, m);
    const onPasture = m.where.kind === 'paddock' && areaId >= 0;
    const hasWater = onPasture ? areaWatered(sr.survey.points, areaId) : true;
    const adults = r.classes.filter((c) => c.cls !== 'lamb');
    const headAdult = adults.reduce((t, c) => t + c.head, 0);
    const avgOf = (f: (c: (typeof adults)[number]) => number): number | null =>
      headAdult ? adults.reduce((t, c) => t + f(c) * c.head, 0) / headAdult : null;
    const st = m.st;
    const wt = st ? st.wt : avgOf((c) => c.avgKg);
    const cs = st ? st.cs : avgOf((c) => c.avgCs);
    const classes: MobClassWire[] = r.classes.map((c) => ({
      id: c.cls,
      label: SHEEP_CLASS_LABEL[c.cls],
      head: c.head,
      weightKg: round(c.avgKg),
      cs: round(c.avgCs, 1),
      calf: c.cls === 'lamb',
    }));
    const costs = sr.feed.get(r.id);
    const sell = sellGroups(m);
    const joiningNow =
      !!r.joining && farm.day >= r.joining.start && farm.day < r.joining.start + 35;
    const sheep: SheepWire = {
      stage: stageText(r, joiningNow),
      wool: woolText(r),
      shearing: contractorText('Shearing', r.shearOn, SHEEP_BUDGET_COSTS.shearPerHead),
      crutching: contractorText('Crutching', r.crutchOn, SHEEP_BUDGET_COSTS.crutchPerHead),
      shearOn: r.shearOn ? { month: r.shearOn.month, date: r.shearOn.date } : null,
      joining: joiningLines(r.joining, r.joinOn, dateOf),
      feed: r.feed,
      feedOptions:
        onPasture && costs
          ? SHEEP_FEEDS.map((id) => ({
              id,
              label: SHEEP_FEED_LABEL[id],
              perDay: round(costs[id], 2),
            }))
          : [],
      feedReason: onPasture
        ? null
        : 'Feeding is for mobs in a paddock. This mob is in the stock yards.',
      sell,
      sellReason: sell.length ? null : 'No sheep here to sell. Lambs at foot go with their ewes.',
      fence:
        onPasture && leakyEdges(farm, sr.survey, areaId) > 0
          ? fenceFact(sr.survey.topology.areas[areaId]!.name)
          : null,
    };
    return {
      id: r.id,
      species: 'sheep',
      sheep,
      name: r.name,
      where: m.where.kind,
      area: r.area,
      hasWater,
      head: r.head,
      calves: r.lambs,
      ae: round(r.ae, 1),
      dse: round(r.dse),
      dryDays: r.dryDays,
      weightKg: wt === null ? null : round(wt, 1),
      cs: cs === null ? null : round(cs, 1),
      adgKg: st ? round(st.adg, 2) : null,
      me: st ? round(st.me, 1) : null,
      cp: st ? round(st.cp, 1) : null,
      intakeKg: st ? round(st.intake, 2) : null,
      intakePct: st && st.wt > 0 ? round((st.intake / st.wt) * 100, 1) : null,
      classes,
      why: whyLines(r, m, hasWater, r.area, sr.loss.get(r.id)),
      details: [],
      // The sheep card's reasons are its own (why); the herd list's short line is the feed's figures.
      gainWhy: gainWhy({
        where: m.where.kind,
        hasWater,
        dryDays: r.dryDays,
        adg: st ? st.adg : null,
        me: st ? st.me : null,
        cp: st ? st.cp : null,
        forecasts: [],
      }),
      ptic: 0,
      pticText: null,
      breeding: [],
      supp: 'none',
      suppOptions: [],
      suppReason: null,
      booked: 0,
      bookedDate: null,
      markCount: 0,
      markReason: 'Lambs are marked by themselves at the marking count.',
      weanCount: 0,
      weanReason: 'Lambs are weaned by themselves at 14 weeks.',
      sellGroups: [],
      sellReason: null,
    } satisfies MobWire;
  });
}

/** Add each sheep mob's stocking to the paddocks it grazes (shared by area as the cattle's is). */
export function addSheepStocking(
  paddocks: PaddockWire[],
  areaOfPaddock: ReadonlyMap<number, number>,
  sr: SheepReads,
): void {
  const byArea = new Map<number, { dse: number; head: number; ids: number[] }>();
  const reads = new Map(sr.reads.map((r) => [r.id, r]));
  for (const m of sr.mobs) {
    const a = areaIdOf(sr.survey, m);
    if (a < 0) continue;
    const r = reads.get(m.id);
    if (!r) continue;
    const x = byArea.get(a) ?? { dse: 0, head: 0, ids: [] };
    x.dse += r.dse;
    x.head += r.head;
    x.ids.push(m.id);
    byArea.set(a, x);
  }
  for (const p of paddocks) {
    const areaId = areaOfPaddock.get(p.id) ?? -1;
    const x = byArea.get(areaId);
    if (!x) continue;
    const share = p.ha / (sr.survey.topology.areas[areaId]?.ha || p.ha || 1);
    const dse = p.dse + x.dse * share;
    p.head += Math.round(x.head * share);
    p.dse = round(dse);
    p.ae = round(dse / DSE_PER_AE, 1);
    p.dsePerHa = p.ha > 0 ? round(dse / p.ha, 1) : 0;
    p.aePerHa = p.ha > 0 ? round(dse / DSE_PER_AE / p.ha, 2) : 0;
    p.mobs = [...p.mobs, ...x.ids];
  }
}

const KIND: Record<SheepClass, ViewSheepKind> = {
  ewe: 'ewe',
  wether: 'wether',
  ram: 'ram',
  hogget: 'young',
  weaner: 'young',
  lamb: 'lamb',
};

/** The map's view with the sheep on it and the netting drawn as netting. A copy: the engine's view is not changed. */
export function viewWithSheep(view: FarmView, farm: FarmState, sr: SheepReads | null): FarmView {
  const netting = nettingEdges(farm);
  if (!sr && !netting.length) return view;
  const fences = { h: view.fences.h.slice(), v: view.fences.v.slice() };
  for (const e of netting) (e.line === 'h' ? fences.h : fences.v)[e.index] = VIEW_FENCE.netting;
  const flocks: FarmViewFlock[] = [];
  for (const m of sr?.mobs ?? []) {
    if (m.where.kind === 'lot') continue;
    const kinds = new Map<ViewSheepKind, { n: number; thin: number }>();
    let head = 0;
    let lambs = 0;
    for (const s of m.sheep) {
      if (s.n <= 0 || s.dead) continue;
      const k = KIND[sheepClassOf(s)];
      const row = kinds.get(k) ?? { n: 0, thin: 0 };
      row.n += s.n;
      if (s.cond < 2) row.thin += s.n;
      kinds.set(k, row);
      if (s.weaned) head += s.n;
      else lambs += s.n;
    }
    const areaId = areaIdOf(sr!.survey, m);
    flocks.push({
      id: m.id,
      name: m.name,
      where: m.where.kind === 'yards' ? 'yards' : 'paddock',
      area: areaId,
      anchor: m.where.kind === 'paddock' ? m.where.anchor : -1,
      head,
      lambs,
      sheep: [...kinds].map(([kind, x]) => ({ kind, n: x.n, thin: x.thin })),
      seed: hash32('map-flock:' + m.id),
      status: {
        noWater: areaId >= 0 && !areaWatered(sr!.survey.points, areaId),
        dryDays: m.dry,
      },
    });
  }
  return { ...view, fences, ...(flocks.length ? { flocks } : {}) };
}

/** The sheep lines for Things to do: stock yards, no water, under the CS floor, a fence that does not hold them. */
export function sheepTodo(farm: FarmState, sr: SheepReads): TodoWire[] {
  const out: TodoWire[] = [];
  const base = { opens: null, edge: null } as const;
  const facts = new Map(sheepConditionFacts(farm).map((f) => [f.mob, f]));
  const reads = new Map(sr.reads.map((r) => [r.id, r]));
  for (const m of sr.mobs) {
    const r = reads.get(m.id);
    if (!r) continue;
    const areaId = areaIdOf(sr.survey, m);
    const area = areaId >= 0 ? sr.survey.topology.areas[areaId]!.name : null;
    if (m.where.kind === 'yards') {
      out.push({
        ...base,
        key: `sheep-yards:${m.id}`,
        mob: m.id,
        text: `${m.name} (${r.head.toLocaleString('en-AU')} head) is in the stock yards. The yards have water and almost no feed.`,
        button: 'Move out',
        opens: 'move',
        urgent: false,
      });
    }
    if (areaId >= 0 && (!areaWatered(sr.survey.points, areaId) || m.dry > 0)) {
      out.push({
        ...base,
        key: `sheep-water:${m.id}`,
        mob: m.id,
        text: `${m.name} has no water${area ? ` in ${area}` : ''}. ${m.dry} ${m.dry === 1 ? 'day' : 'days'} without so far. ${NO_WATER_SHEEP}`,
        button: null,
        urgent: true,
      });
    }
    const f = facts.get(m.id);
    if (f) {
      const why = sr.loss.get(m.id);
      out.push({
        ...base,
        key: `sheep-cs:${m.id}`,
        mob: m.id,
        text: `${m.name} is at CS ${f.cs.toFixed(1)}, under CS ${f.floor.toFixed(1)} for ${stageWord(f.stage)}.${why?.length ? ` Losing condition: ${lossList(why)}.` : ''}`,
        button: null,
        urgent: false,
      });
    }
    if (areaId >= 0 && area && leakyEdges(farm, sr.survey, areaId) > 0) {
      out.push({
        ...base,
        key: `sheep-fence:${m.id}`,
        mob: m.id,
        text: `${m.name} is in ${area}. ${fenceFact(area)}`,
        button: null,
        urgent: false,
      });
    }
  }
  return out;
}

const INDICATOR_LABEL: Record<string, string> = {
  lightLamb: 'Light lamb',
  tradeLamb: 'Trade lamb',
  heavyLamb: 'Heavy lamb',
  merinoLamb: 'Merino lamb',
  restockerLamb: 'Restocker lamb',
  mutton: 'Mutton',
};

/** The sheep side of the Market tab, or null where sheep are not shown. */
export function sheepMarketWire(farm: FarmState, buyReason: string | null): SheepMarketWire | null {
  if (!sheepDistrict(farm.district)) return null;
  const r = sheepMarketRead(farm);
  const [y, mo, d] = r.date.split('-').map(Number) as [number, number, number];
  const dated: DateParts = { year: y, month: mo - 1, date: d };
  return {
    buy: r.buy.map((b) => ({ id: b.cls, label: b.name, perHead: Math.round(b.perHead) })),
    maxQty: MAX_SHEEP_BUY,
    reason: buyReason,
    prices: Object.entries(r.indicators).map(([id, c]) => ({
      id,
      label: INDICATOR_LABEL[id] ?? id,
      cKg: Math.round(c),
    })),
    dated: `MLA indicators, c/kg carcase weight, ${fullDate(dated)}.`,
    wool: r.wool.map((w) => ({ micron: w.micron, cKg: Math.round(w.cKg) })),
    notes: [
      'Sheep are bought and sold on a sale day, at the day’s indicators less selling costs.',
      'Bought sheep arrive in the stock yards at first light the next day.',
      'Wool is sold by itself at shearing. It shows as its own money line.',
    ],
  };
}
