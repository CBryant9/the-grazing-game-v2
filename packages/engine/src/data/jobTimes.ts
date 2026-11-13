/**
 * How long jobs take: one table (PRD 5.4, and PRD 21 rows 4, 5, 13, 14,
 * 16 and 34; docs/DATA.md, "Job times").
 *
 * One person, a ute or quad bike, normal gear. Every figure carries the
 * mark the PRD gives it:
 *
 *   - `decided`: Claudia has decided it.
 *   - `proposed`: in the PRD's table, for Claudia to check.
 *   - `builder`: not in the PRD. Chosen in the build as the simplest
 *     reading, and listed as a question for Claudia.
 *
 * The figures are the PRD's own. None is a looked-up real-world figure.
 * A change to any of them is a change to the game: record it in
 * docs/DATA.md.
 *
 * The PRD has no figure for taking things out. The builder's rule, in
 * ../day/spec.ts and for Claudia to check: pulling a fence down, or taking
 * out a gate, a trough or a water hub, takes as long as putting it in.
 */

export type FigureStatus = 'decided' | 'proposed' | 'builder';

export interface JobFigure {
  value: number;
  /** What the value is measured in. */
  unit: string;
  status: FigureStatus;
  /** Where it comes from, or what the builder's rule is. */
  from: string;
  /** False for a figure that no action uses yet. It is here so the next milestone finds it. */
  used: boolean;
}

const fig = (
  value: number,
  unit: string,
  status: FigureStatus,
  from: string,
  used = true,
): JobFigure => ({ value, unit, status, from, used });

export const JOB_TIMES = {
  /** Driving on the farm. */
  travelKmH: fig(25, 'km/h', 'decided', 'PRD 5.4: travel on the farm'),

  // ---- Fence, pipe and tape, by the metre
  /** Permanent fence on your own. A whole day of light builds this much. */
  permanentFenceMPerDay: fig(
    500,
    'm a working day',
    'decided',
    'PRD 5.4: permanent fence, on your own',
  ),
  electricFenceMPerHour: fig(1000, 'm/h', 'proposed', 'PRD 5.4: electric fence, single wire'),
  tapeMPerHour: fig(3000, 'm/h', 'proposed', 'PRD 5.4: temporary tape, put out or roll up'),
  pipeMPerHour: fig(400, 'm/h', 'proposed', 'PRD 5.4: poly pipe with a pipe layer'),

  // ---- Gates, by kind. Today's one gate is the swing gate.
  gateMin: {
    swing: fig(60, 'min', 'proposed', 'PRD 5.4: proper swing gate'),
    wire: fig(30, 'min', 'proposed', 'PRD 5.4: wire gate', false),
    tapeHandle: fig(5, 'min', 'proposed', 'PRD 5.4: tape gate handle', false),
  },
  /** A wire gate costs this each time stock go through it. */
  wireGateUseMin: fig(5, 'min', 'proposed', 'PRD 5.4: wire gate, each use', false),
  /** Opening or shutting a gate: the drive there and nothing more. */
  gateOpenShutMin: fig(0, 'min', 'builder', 'Not in the PRD. Travel only'),

  // ---- Water
  troughMin: fig(180, 'min', 'proposed', 'PRD 5.4: trough with fittings'),
  portableTroughMin: fig(30, 'min', 'proposed', 'PRD 5.4: move or refill a portable trough'),

  // ---- Stock work
  moveMobSettleMin: fig(15, 'min', 'proposed', 'PRD 5.4: move a mob'),
  moveMobMinPer100Head: fig(1, 'min per 100 head', 'proposed', 'PRD 5.4: move a mob'),
  /** Walking a mob along its route through gates. Used from the next part of this milestone. */
  walkKmH: fig(1.5, 'km/h', 'decided', 'PRD 5.4: walking the route through gates', false),
  musterBaseMin: fig(30, 'min', 'proposed', 'PRD 5.4: muster a whole paddock'),
  musterMinPer200Ha: fig(60, 'min per 200 ha', 'proposed', 'PRD 5.4: muster a whole paddock'),
  feedOutMin: fig(30, 'min', 'proposed', 'PRD 5.4: feed lick or hay to a mob'),
  /** A lick run or feed run: this for each mob, after loading and driving. */
  feedRunMinPerMob: fig(5, 'min per mob', 'proposed', 'PRD 5.4: lick run or feed run', false),
  weanBaseMin: fig(30, 'min', 'proposed', 'PRD 5.4: wean'),
  weanMinPerHead: fig(0.5, 'min per head', 'proposed', 'PRD 5.4: wean'),
  markMinPerCalf: fig(2, 'min per calf', 'proposed', 'PRD 5.4: mark calves'),
  pregTestMinPerCow: fig(1, 'min per cow', 'proposed', 'PRD 5.4: preg test (vet)', false),
  sellBaseMin: fig(60, 'min', 'proposed', 'PRD 5.4: sell (muster, draft, load)'),
  sellMinPer10Head: fig(1, 'min per 10 head', 'proposed', 'PRD 5.4: sell (muster, draft, load)'),
  /** A day at the saleyard, travel included. */
  saleyardBuyMin: fig(360, 'min', 'proposed', 'PRD 5.4: go to the saleyard to buy'),
  buyOnlineMin: fig(30, 'min', 'proposed', 'PRD 5.4: buy online', false),

  // ---- Contractors
  /** Sowing and harvest are done by a contractor this many days after booking. */
  contractorDays: fig(
    3,
    'days',
    'builder',
    'PRD 5.4 says "within a few days of booking". The builder took 3',
  ),
} as const;

/** The gates a player can hang. Three kinds come in the next part of this milestone. */
export type GateKind = keyof typeof JOB_TIMES.gateMin;

/** How long a gate of a kind takes to hang, minutes. */
export const gateMinutes = (kind: GateKind): number => JOB_TIMES.gateMin[kind].value;

/** What sets the pace of a length of work. */
export type Pace = 'permanent' | 'electric' | 'tape' | 'pipe';

/**
 * Metres a minute at a pace, on a day with `dayMin` minutes of light.
 *
 * Permanent fence is 500 m "a working day". The builder's reading: a
 * working day is that day's light, first light to last light, whatever its
 * length. So a whole day on the fence builds 500 m in any season, half a
 * day builds 250 m, and time spent driving or on other jobs comes off it.
 * The other paces are by the hour.
 */
export function metresPerMinute(pace: Pace, dayMin: number): number {
  switch (pace) {
    case 'permanent':
      return JOB_TIMES.permanentFenceMPerDay.value / dayMin;
    case 'electric':
      return JOB_TIMES.electricFenceMPerHour.value / 60;
    case 'tape':
      return JOB_TIMES.tapeMPerHour.value / 60;
    case 'pipe':
      return JOB_TIMES.pipeMPerHour.value / 60;
  }
}

/** Minutes to muster a mob off an area of the given size. */
export const musterMinutes = (areaHa: number): number =>
  JOB_TIMES.musterBaseMin.value + (JOB_TIMES.musterMinPer200Ha.value * areaHa) / 200;

/** The default switches for the working day (PRD 21, row 4: travel is included). */
export const DEFAULT_WORK_RULES = {
  travel: true,
  driveHome: 'inside-daylight',
} as const;

/** How many days each skip runs (PRD 5.3). The MVP's month was 30 days. */
export const SKIP_DAYS = { week: 7, month: 30, year: 365 } as const;
export type SkipLength = keyof typeof SKIP_DAYS;
