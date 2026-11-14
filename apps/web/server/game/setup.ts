import 'server-only';
import { ARABLE_SHARES, DIFFICULTY, FARM_SIZES, FIRST_REAL_YEAR } from '@gg/engine';
import { DISTRICTS, DISTRICT_IDS } from '@gg/shared';
import type {
  SetupChoices,
  SetupDifficulty,
  SetupEnterprise,
  SetupOptions,
  SetupSize,
  SetupStart,
  SetupYears,
} from '../../lib/game/types';

export const NAME_MAX = 40;
const SIZES: readonly SetupSize[] = ['small', 'medium', 'large'];
const YEARS: readonly SetupYears[] = ['real-in-order', 'real-random', 'random'];
const STARTS: readonly SetupStart[] = ['running', 'scratch'];
const DIFFICULTIES: readonly SetupDifficulty[] = ['easy', 'medium', 'hard'];
const ENTERPRISES: readonly SetupEnterprise[] = ['grazing', 'mixed'];

/** Shares of the arable land that can be in the cropping rotation at the start, %. */
const CROPPED = [25, 50, 75, 100];

const DIFFICULTY_TEXT: Record<SetupDifficulty, string> = {
  easy: 'More money in the bank to start, and the bank lends further before the game ends.',
  medium: 'A fair amount of money to start, and a fair overdraft.',
  hard: 'Less money to start, and the bank stops lending sooner.',
};

/**
 * The choices the setup flow offers, with the real hectares for each
 * district. The figures come from the engine's tables here, on the server,
 * so the browser holds no tables. No dollar figures: they are shown once
 * the farm is taken.
 */
export function setupOptions(): SetupOptions {
  // The difficulty table is read so the list can never name a level the engine lacks.
  const levels = DIFFICULTIES.filter((d) => d in DIFFICULTY);
  return {
    districts: DISTRICT_IDS.map((id) => ({
      id,
      name: DISTRICTS[id].name,
      town: DISTRICTS[id].town,
      state: DISTRICTS[id].state,
      sizes: SIZES.map((size, i) => ({
        id: size,
        label: size[0]!.toUpperCase() + size.slice(1),
        ha: FARM_SIZES[id][i]!,
      })),
      mixed: { arablePcts: [...ARABLE_SHARES[id].mixed], croppedPcts: CROPPED },
    })),
    enterprises: [
      {
        id: 'grazing',
        label: 'Grazing',
        text: 'Cattle on pasture. A little arable country, and no cropping at the start.',
      },
      {
        id: 'mixed',
        label: 'Mixed farming',
        text: 'Cattle and crops. You choose how much of the farm is arable and how much of that is cropped.',
      },
    ],
    years: [
      {
        id: 'real-in-order',
        label: 'Real years, in order',
        text: `Each year has its real weather and real prices, starting from ${FIRST_REAL_YEAR}.`,
      },
      {
        id: 'real-random',
        label: 'Real years, at random',
        text: 'The same real years, in an order you can not predict.',
      },
      {
        id: 'random',
        label: 'Random seasons',
        text: 'Made-up seasons and prices, different every game.',
      },
    ],
    starts: [
      {
        id: 'running',
        label: 'Take over a running business',
        text: 'Paddocks, fences and water are in place, and there is a herd.',
      },
      {
        id: 'scratch',
        label: 'Start from scratch',
        text: 'A little fencing, one water point and no cattle.',
      },
    ],
    difficulties: levels.map((id) => ({
      id,
      label: id[0]!.toUpperCase() + id.slice(1),
      text: DIFFICULTY_TEXT[id],
    })),
    nameMax: NAME_MAX,
  };
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

const bad = (message: string): { ok: false; message: string } => ({ ok: false, message });

function pick<T extends string>(value: unknown, allowed: readonly T[], what: string): Parsed<T> {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? { ok: true, value: value as T }
    : bad(`Choose ${what}.`);
}

/** Letters, numbers, spaces and a little punctuation. Control characters and markup are dropped. */
export function cleanName(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} '.,&-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX)
    .trim();
}

/** Check the setup choices a browser sent. Anything wrong gets a plain message. */
export function parseSetup(body: unknown): Parsed<SetupChoices> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return bad('The farm choices were not sent properly.');
  }
  const b = body as Record<string, unknown>;
  const district = pick(b.district, DISTRICT_IDS, 'a district');
  if (!district.ok) return district;
  const size = pick(b.size, SIZES, 'a farm size');
  if (!size.ok) return size;
  const enterprise = pick(b.enterprise, ENTERPRISES, 'grazing or mixed farming');
  if (!enterprise.ok) return enterprise;
  const years = pick(b.years, YEARS, 'how the years play');
  if (!years.ok) return years;
  const startType = pick(b.startType, STARTS, 'how the farm starts');
  if (!startType.ok) return startType;
  const difficulty = pick(b.difficulty, DIFFICULTIES, 'a difficulty');
  if (!difficulty.ok) return difficulty;
  if (typeof b.name !== 'string') return bad('Give the farm a name.');
  const name = cleanName(b.name);
  if (!name) return bad('Give the farm a name, using letters or numbers.');

  const out: SetupChoices = {
    district: district.value,
    size: size.value,
    enterprise: enterprise.value,
    years: years.value,
    startType: startType.value,
    difficulty: difficulty.value,
    name,
  };
  if (enterprise.value === 'mixed') {
    const allowed = ARABLE_SHARES[district.value].mixed;
    if (typeof b.arablePct !== 'number' || !allowed.includes(b.arablePct)) {
      return bad('Choose how much of the farm is arable.');
    }
    if (typeof b.croppedPct !== 'number' || !CROPPED.includes(b.croppedPct)) {
      return bad('Choose how much of the arable land is cropped.');
    }
    out.arablePct = b.arablePct;
    out.croppedPct = b.croppedPct;
  }
  return { ok: true, value: out };
}
