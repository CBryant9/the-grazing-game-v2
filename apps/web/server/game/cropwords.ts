import 'server-only';
import type { FieldProgress, Species } from '@gg/engine';

/**
 * The words for crops and sowing: what each species is, when it can be
 * sown, where a planting is up to, and the lines on the sow and harvest
 * cards. Plain Australian English, short sentences, facts only (CLAUDE.md,
 * rules 2, 5 and 11).
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const money = (n: number): string => `$${Math.round(Math.abs(n)).toLocaleString('en-AU')}`;
const signed = (n: number): string => (n < 0 ? `-${money(n)}` : money(n));
const tonnes = (n: number): string =>
  (Math.round(n * 10) / 10).toLocaleString('en-AU', { minimumFractionDigits: 1 });
const hectares = (n: number): string =>
  `${(Math.round(n * 10) / 10).toLocaleString('en-AU', { minimumFractionDigits: 1 })} ha`;

/** "Apr to Jun", or "Nov to Jan" across the new year, or each month where they are not in a run. */
export function monthRange(months: readonly number[]): string {
  const set = new Set(months);
  if (!set.size) return 'no month';
  const runs: number[][] = [];
  // Start each run at a month whose previous month is not in the set.
  const starts = [...set].filter((m) => !set.has((m + 11) % 12));
  if (!starts.length) return 'any month';
  for (const s of starts.sort((a, b) => a - b)) {
    const run = [s];
    while (set.has((run[run.length - 1]! + 1) % 12)) run.push((run[run.length - 1]! + 1) % 12);
    runs.push(run);
  }
  return runs
    .map((r) =>
      r.length === 1 ? MONTHS[r[0]!]! : `${MONTHS[r[0]!]!} to ${MONTHS[r[r.length - 1]!]!}`,
    )
    .join(' and ');
}

export const monthName = (m: number): string => MONTHS_LONG[m] ?? '';

/** The kind of planting, in two or three words. */
export function kindText(sp: Pick<Species, 'type' | 'graze'>): string {
  if (sp.type === 'pasture') return 'Pasture';
  if (sp.type === 'annual') return 'Forage crop';
  return sp.graze === false ? 'Grain crop' : 'Grain crop, can be grazed early';
}

/** What each species is for, in a line. Facts about the plant, from docs/DATA.md. */
const ABOUT: Record<string, string> = {
  buffel: 'A tough perennial summer grass with a legume. Lasts for decades.',
  leucaena: 'Rows of a high-protein tree legume with grass between. Takes a year to establish.',
  stylo: 'A legume sown into the native pasture. Adds protein, most in the dry season.',
  phal: 'A perennial grass with clover. Winter and spring feed. Thins out after about 6 years.',
  rye: 'Perennial ryegrass with clover. Winter and spring feed. Goes quiet in a dry summer.',
  lucerne: 'A deep-rooted perennial legume. Green and high in protein through summer.',
  multi: 'A mix of herbs, clovers and grasses. Something is growing most of the year.',
  oats: 'Grain crop. Can be grazed early in winter, then locked up for grain.',
  wheat: 'Grain crop. Can be grazed early in winter, then locked up for grain.',
  barley: 'Grain crop. Grazing before harvest costs yield.',
  grsorg: 'Summer grain crop. Grazing before harvest costs yield.',
  forsorg: 'Summer forage with a lot of bulk. Regrows after grazing until frost.',
  millet: 'Quick summer forage. Ready about 6 weeks after sowing.',
  annrye: 'High-quality winter forage. Dies off in early summer.',
  brass: 'Very high-quality forage for the dry summer gap.',
};

export const aboutLine = (id: string): string => ABOUT[id] ?? '';

/** Why a species can not be sown now: its window, and the month it is. */
export function outOfWindow(name: string, months: readonly number[], month: number): string {
  return `The sowing window for ${name.toLowerCase()} is ${monthRange(months)}. It is ${monthName(month)} now.`;
}

/** Where a planting is up to. Stated as a fact, with no countdown. */
export function stageWord(p: FieldProgress): string {
  switch (p.code) {
    case 'not-sown':
      return 'Not sown.';
    case 'pasture-establishing':
      return 'Establishing.';
    case 'pasture-established':
      return p.thinning ? 'Established, and thinning with age.' : 'Established.';
    case 'establishing-keep-off':
      return 'Establishing. Grazing it now costs grain yield.';
    case 'establishing':
      return 'Establishing.';
    case 'growing-keep-off':
      return 'Growing. Grazing it now costs grain yield.';
    case 'vegetative':
      return 'Growing leaf. It can be grazed before it locks up.';
    case 'locked-up':
      return 'Locked up for grain. Grazing it now eats the heads.';
    case 'heading':
      return 'Heading and filling grain.';
    case 'ready-to-harvest':
      return 'Ready to harvest.';
    case 'finished':
      return 'The grain is gone. It is stubble.';
    case 'grazing':
      return 'In leaf. It can be grazed.';
    case 'going-to-head':
      return 'Going to head.';
    case 'finished-for-season':
      return 'Finished for the season.';
  }
}

export interface SowLines {
  name: string;
  ha: number;
  cost: number;
  /** Pasture turned into cropping country first, ha, and what that part costs. */
  convHa: number;
  convCost: number;
  /** Squares asked for that can not take it. */
  skipped: number;
  /** A forage or grain crop, which only goes on arable land. Pasture goes anywhere with no crop in the ground. */
  crop: boolean;
  cashBefore: number;
}

/** The lines on the Sow card. The money is the engine's job card; these only say it. */
export function sowLines(s: SowLines): string[] {
  const out = [`Sow ${s.name.toLowerCase()} on ${hectares(s.ha)}.`];
  out.push(`Costs ${money(s.cost)} for seed, fertiliser, spraying and sowing.`);
  if (s.convHa > 0) {
    out.push(
      `That includes ${money(s.convCost)} to turn ${hectares(s.convHa)} of pasture into cropping country.`,
    );
  }
  if (s.skipped > 0) {
    const squares = s.skipped === 1 ? '1 square' : `${s.skipped} squares`;
    out.push(
      s.crop
        ? `${squares} can not take it. A crop only goes on arable land with no crop in the ground.`
        : `${squares} can not take it, because a crop is in the ground there.`,
    );
  }
  out.push('Sowing happens at once and takes none of the day.');
  out.push(`That leaves ${signed(s.cashBefore - s.cost)} in the bank.`);
  return out;
}

export interface HarvestLines {
  name: string;
  ha: number;
  t: number;
  tha: number;
  value: number;
  cost: number;
  cashBefore: number;
}

/** The lines on the Harvest card: the tonnes and money the crop looks like making. */
export function harvestLines(h: HarvestLines): string[] {
  return [
    `Harvest ${h.name.toLowerCase()} on ${hectares(h.ha)}: about ${tonnes(h.t)} t of grain, ${tonnes(h.tha)} t/ha.`,
    `Worth about ${money(h.value)}. Harvesting costs ${money(h.cost)}.`,
    `That brings the bank to ${signed(h.cashBefore + h.value - h.cost)}.`,
    'Harvest happens at once and takes none of the day. The land is left in stubble.',
  ];
}
