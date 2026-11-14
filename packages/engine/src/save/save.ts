/**
 * Saving and loading a farm, and a hash of its whole state.
 *
 * A saved farm is plain data that survives JSON. The big arrays (pasture,
 * fences, crops) and the cattle are packed as base64 text, bit for bit, so
 * a farm that is saved, loaded and carried on is exactly the farm that ran
 * straight through. Every save records the save format and the engine
 * version. Old saves are upgraded with defaults when they are loaded.
 */

import type { Animal, AnimalKind, Sex } from '../cattle/types';
import { sheepJobDates } from '../sheep/farm';
import type { Sheep, SheepSex } from '../sheep/types';
import { GRID_N } from '../grid';
import { startDay } from '../sim/clock';
import { emptyLedger, type FarmState } from '../sim/state';
import { ENGINE_VERSION, SAVE_FORMAT_VERSION } from '../version';

// ---------------------------------------------------------------------------
// Base64, written out so the engine needs nothing from the browser or Node
// ---------------------------------------------------------------------------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_AT = new Uint8Array(128);
for (let i = 0; i < B64.length; i++) B64_AT[B64.charCodeAt(i)] = i;

export function toBase64(bytes: Uint8Array): string {
  let out = '';
  const n = bytes.length;
  let i = 0;
  for (; i + 2 < n; i += 3) {
    const v = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += B64[v >> 18]! + B64[(v >> 12) & 63]! + B64[(v >> 6) & 63]! + B64[v & 63]!;
  }
  if (i + 1 === n) {
    const v = bytes[i]! << 16;
    out += B64[v >> 18]! + B64[(v >> 12) & 63]! + '==';
  } else if (i + 2 === n) {
    const v = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += B64[v >> 18]! + B64[(v >> 12) & 63]! + B64[(v >> 6) & 63]! + '=';
  }
  return out;
}

export function fromBase64(text: string): Uint8Array {
  let len = text.length;
  while (len > 0 && text[len - 1] === '=') len--;
  const out = new Uint8Array(Math.floor((len * 3) / 4));
  let o = 0;
  for (let i = 0; i < len; i += 4) {
    const a = B64_AT[text.charCodeAt(i)]!;
    const b = B64_AT[text.charCodeAt(i + 1)]!;
    const c = i + 2 < len ? B64_AT[text.charCodeAt(i + 2)]! : 0;
    const d = i + 3 < len ? B64_AT[text.charCodeAt(i + 3)]! : 0;
    const v = (a << 18) | (b << 12) | (c << 6) | d;
    out[o++] = v >> 16;
    if (i + 2 < len) out[o++] = (v >> 8) & 255;
    if (i + 3 < len) out[o++] = v & 255;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Packing
// ---------------------------------------------------------------------------

type Numbers = Float32Array | Float64Array | Uint8Array | Int16Array | Int32Array;

const ARRAY_KINDS = {
  f32: Float32Array,
  f64: Float64Array,
  u8: Uint8Array,
  i16: Int16Array,
  i32: Int32Array,
} as const;
type ArrayKind = keyof typeof ARRAY_KINDS;

/** A typed array as text. The bytes are in the machine's order, which is little-endian everywhere the game runs. */
interface PackedArray {
  $: ArrayKind;
  b: string;
}

function packArray(a: Numbers): PackedArray {
  const kind = (Object.keys(ARRAY_KINDS) as ArrayKind[]).find((k) => a instanceof ARRAY_KINDS[k]);
  if (!kind) throw new Error('saveFarm: an array of a kind that cannot be saved');
  return {
    $: kind,
    b: toBase64(new Uint8Array(a.buffer as ArrayBuffer, a.byteOffset, a.byteLength)),
  };
}

/** The bytes in a buffer of their own, so a typed array can be laid over them from the start. */
const ownBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

function unpackArray(p: PackedArray): Numbers {
  const C = ARRAY_KINDS[p.$];
  if (!C) throw new Error('loadFarm: an array of an unknown kind');
  const bytes = fromBase64(p.b);
  return new C(ownBuffer(bytes));
}

const KINDS: readonly AnimalKind[] = ['steer', 'heifer', 'cow', 'bull', 'calf'];
const INTS = 7;
const NUMS = 7;

/**
 * A mob's cattle, in columns. Whole numbers (tag, age, days pregnant, days
 * milking, calves so far, dam, calf) are 32-bit. Weights, condition, money
 * and intake keep every bit.
 */
interface PackedAnimals {
  $: 'animals';
  n: number;
  /** One digit an animal: its kind. */
  kind: string;
  /** One letter an animal: F, M or S. */
  sex: string;
  /** One digit an animal: 1 barren, 2 young bull, 4 died today, 8 has had a day. */
  flags: string;
  ints: string;
  nums: string;
}

function packAnimals(list: readonly Animal[]): PackedAnimals {
  const n = list.length;
  const ints = new Int32Array(n * INTS);
  const nums = new Float64Array(n * NUMS);
  let kind = '';
  let sex = '';
  let flags = '';
  for (let i = 0; i < n; i++) {
    const a = list[i]!;
    kind += KINDS.indexOf(a.kind);
    sex += a.sex;
    const f =
      (a.barren ? 1 : 0) | (a.young ? 2 : 0) | (a.dead ? 4 : 0) | (a.di !== undefined ? 8 : 0);
    flags += f.toString(16);
    const whole = [a.id, a.age, a.preg, a.lact, a.parity, a.dam, a.calf];
    for (let k = 0; k < INTS; k++) {
      const v = whole[k]!;
      if (!Number.isInteger(v) || v < -2147483648 || v > 2147483647) {
        throw new Error(`saveFarm: animal ${a.id} has a figure that should be a whole number`);
      }
      ints[i * INTS + k] = v;
    }
    nums.set([a.wt, a.cond, a.paid, a.cost, a.milk, a.adg, a.di ?? 0], i * NUMS);
  }
  return {
    $: 'animals',
    n,
    kind,
    sex,
    flags,
    ints: toBase64(new Uint8Array(ints.buffer)),
    nums: toBase64(new Uint8Array(nums.buffer)),
  };
}

function unpackAnimals(p: PackedAnimals): Animal[] {
  const ib = fromBase64(p.ints);
  const nb = fromBase64(p.nums);
  const ints = new Int32Array(ownBuffer(ib));
  const nums = new Float64Array(ownBuffer(nb));
  const out: Animal[] = [];
  for (let i = 0; i < p.n; i++) {
    const f = parseInt(p.flags[i]!, 16);
    const I = i * INTS;
    const N = i * NUMS;
    out.push({
      id: ints[I]!,
      kind: KINDS[+p.kind[i]!]!,
      sex: p.sex[i] as Sex,
      wt: nums[N]!,
      age: ints[I + 1]!,
      cond: nums[N + 1]!,
      barren: !!(f & 1),
      paid: nums[N + 2]!,
      cost: nums[N + 3]!,
      preg: ints[I + 2]!,
      lact: ints[I + 3]!,
      parity: ints[I + 4]!,
      dam: ints[I + 5]!,
      calf: ints[I + 6]!,
      milk: nums[N + 4]!,
      adg: nums[N + 5]!,
      young: !!(f & 2),
      dead: !!(f & 4),
      di: f & 8 ? nums[N + 6]! : undefined,
    });
  }
  return out;
}

const isAnimalList = (key: string, v: unknown): v is Animal[] =>
  key === 'animals' && Array.isArray(v);

/** A sheep mob's sheep, in columns (format 10), like the cattle. */
interface PackedSheep {
  $: 'sheep';
  n: number;
  /** One letter a sheep: F, M or W. */
  sex: string;
  /** One letter a sheep: m Merino, x crossbred. */
  breed: string;
  /** One digit a sheep: 1 weaned, 2 died today, 4 has had a day. */
  flags: string;
  ints: string;
  nums: string;
}

const SHEEP_INTS = [
  'id',
  'n',
  'age',
  'dam',
  'preg',
  'litter',
  'lact',
  'reared',
  'parity',
  'oes',
  'wage',
  'woolDays',
  'flyCover',
  'struck',
  'doomed',
  'doomed2',
] as const satisfies readonly (keyof Sheep)[];
const SHEEP_NUMS = [
  'srw',
  'wt',
  'cond',
  'csJoin',
  'csScan',
  'milk',
  'adg',
  'wwt',
  'fleece',
  'micronKg',
  'lambRisk',
  'paid',
  'cost',
] as const satisfies readonly (keyof Sheep)[];

/** The sheep columns of a format 10 save (the first pass, before head counts). */
const SHEEP_INTS_FORMAT_10 = SHEEP_INTS.filter((k) => k !== 'n' && k !== 'doomed2');

const isSheepList = (key: string, v: unknown): v is Sheep[] => key === 'sheep' && Array.isArray(v);

function packSheep(list: readonly Sheep[]): PackedSheep {
  const n = list.length;
  const NI = SHEEP_INTS.length;
  const NN = SHEEP_NUMS.length + 1;
  const ints = new Int32Array(n * NI);
  const nums = new Float64Array(n * NN);
  let sex = '';
  let breed = '';
  let flags = '';
  for (let i = 0; i < n; i++) {
    const s = list[i]!;
    sex += s.sex;
    breed += s.breed === 'merino' ? 'm' : 'x';
    flags += ((s.weaned ? 1 : 0) | (s.dead ? 2 : 0) | (s.di !== undefined ? 4 : 0)).toString(16);
    for (let k = 0; k < NI; k++) {
      const v = s[SHEEP_INTS[k]!];
      if (!Number.isInteger(v) || v < -2147483648 || v > 2147483647) {
        throw new Error(`saveFarm: sheep ${s.id} has a figure that should be a whole number`);
      }
      ints[i * NI + k] = v;
    }
    for (let k = 0; k < NN - 1; k++) nums[i * NN + k] = s[SHEEP_NUMS[k]!];
    nums[i * NN + NN - 1] = s.di ?? 0;
  }
  return {
    $: 'sheep',
    n,
    sex,
    breed,
    flags,
    ints: toBase64(new Uint8Array(ints.buffer)),
    nums: toBase64(new Uint8Array(nums.buffer)),
  };
}

function unpackSheep(p: PackedSheep, format: number): Sheep[] {
  const ints = new Int32Array(ownBuffer(fromBase64(p.ints)));
  const nums = new Float64Array(ownBuffer(fromBase64(p.nums)));
  // A format 10 save (the first pass, a sheep each) has no head count or second-day column,
  // and its `doomed` was the days a doomed lamb had left (or -1). Read by the save's format.
  const old = format <= 10;
  const cols: readonly string[] = old ? SHEEP_INTS_FORMAT_10 : SHEEP_INTS;
  const NI = cols.length;
  const NN = SHEEP_NUMS.length + 1;
  const out: Sheep[] = [];
  for (let i = 0; i < p.n; i++) {
    const f = parseInt(p.flags[i]!, 16);
    const s = {
      sex: p.sex[i] as SheepSex,
      breed: p.breed[i] === 'm' ? 'merino' : 'xb',
      weaned: !!(f & 1),
      dead: !!(f & 2),
      di: f & 4 ? nums[i * NN + NN - 1]! : undefined,
    } as Record<string, unknown>;
    for (let k = 0; k < NI; k++) s[cols[k]!] = ints[i * NI + k]!;
    for (let k = 0; k < NN - 1; k++) s[SHEEP_NUMS[k]!] = nums[i * NN + k]!;
    if (old) {
      // A sheep each, and a doomed lamb's days left turned into the day of life it dies on.
      const left = s.doomed as number;
      const dieAt = left >= 0 ? (s.age as number) + left + 1 : -1;
      s.n = 1;
      s.doomed = dieAt === 1 ? 1 : 0;
      s.doomed2 = dieAt === 2 ? 1 : 0;
    }
    out.push(s as unknown as Sheep);
  }
  return out;
}

function pack(v: unknown, key = ''): unknown {
  if (ArrayBuffer.isView(v)) return packArray(v as Numbers);
  if (isAnimalList(key, v)) return packAnimals(v);
  if (isSheepList(key, v)) return packSheep(v);
  if (Array.isArray(v)) return v.map((x) => pack(x));
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v)) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = pack(x, k);
    }
    return out;
  }
  if (typeof v === 'number' && !Number.isFinite(v)) {
    throw new Error(`saveFarm: "${key}" is not a finite number`);
  }
  return v;
}

function unpack(v: unknown, format: number): unknown {
  if (Array.isArray(v)) return v.map((x) => unpack(x, format));
  if (v !== null && typeof v === 'object') {
    const tag = (v as { $?: unknown }).$;
    if (tag === 'animals') return unpackAnimals(v as PackedAnimals);
    if (tag === 'sheep') return unpackSheep(v as PackedSheep, format);
    if (typeof tag === 'string') return unpackArray(v as PackedArray);
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v)) out[k] = unpack((v as Record<string, unknown>)[k], format);
    return out;
  }
  return v;
}

/** A farm in its saved form: plain data that survives JSON. */
export interface SavedFarm {
  saveFormat: number;
  engineVersion: string;
  [key: string]: unknown;
}

/** Pack a farm for saving. The farm is not changed. */
export function saveFarm(farm: FarmState): SavedFarm {
  const out = pack(farm) as SavedFarm;
  out.saveFormat = SAVE_FORMAT_VERSION;
  return out;
}

/**
 * Fill in anything an older save does not have. Each line is a field that
 * was added after the first saves were made, with the value it had before
 * it existed.
 */
function upgrade(f: Record<string, unknown>): void {
  const farm = f as unknown as Partial<FarmState> & Record<string, unknown>;
  farm.inbox ??= [];
  farm.inboxSeq ??= farm.inbox.reduce((m, x) => Math.max(m, x.seq), 0) + 1;
  farm.actionLog ??= [];
  farm.noFeedDays ??= 0;
  farm.over ??= null;
  farm.priceHistory ??= [];
  farm.years ??= [];
  farm.energiser ??= false;
  // Sale days and the yards (format 5): a farm saved before it had nothing on the way and nothing booked.
  farm.arrivals ??= [];
  farm.saleBookings ??= [];
  // Grazing plans (format 6): a farm saved before it had none, and no mob on one.
  farm.plans ??= [];
  farm.nextPlanId ??= farm.plans.reduce((m, p) => Math.max(m, p.id), 0) + 1;
  farm.ledger = { ...emptyLedger(), ...(farm.ledger ?? {}) };
  // Format 8: the herd record is worked out from the cattle (PTIC from PTIC_DAYS in calf),
  // so what format 7 kept of preg tests and reports is dropped.
  delete (farm as { knownInCalf?: unknown }).knownInCalf;
  for (const m of farm.mobs ?? []) delete (m as { reports?: unknown }).reports;
  for (const m of farm.mobs ?? []) {
    m.lastBreak ??= null;
    m.join ??= null;
    m.st ??= null;
    m.markNote ??= null;
    m.calvNote ??= null;
    m.openNote ??= null;
  }
  if (farm.pasture) farm.pasture.grown ??= new Float32Array(GRID_N);
  if (farm.crops) {
    farm.crops.regen ??= [];
    farm.crops.rotBlocks ??= [];
  }
  if (farm.layout) {
    farm.layout.tapeOnRoll ??= 0;
    // Fence materials kept (format 7): a farm saved before had none on hand.
    farm.layout.fenceOnHand ??= { permanent: 0, electric: 0 };
    farm.layout.water.hubs ??= [];
    farm.layout.water.ports ??= [];
    farm.layout.water.nextPortId ??=
      farm.layout.water.ports.reduce((m, p) => Math.max(m, p.id), 0) + 1;
  }
  // The working day (format 4). A farm saved before it had no clock: it
  // loads at first light.
  if (!farm.clock) startDay(farm as FarmState);
  // What the first cut of the working day kept and Claudia took out on
  // 14 Nov 2026: the homestead, the player's place, the travel switches,
  // jobs in progress and contractors' bookings. A save that has any of
  // them loads without them. The stock yards stay, and a mob in the yards
  // stays there.
  if (farm.buildings) delete (farm.buildings as unknown as Record<string, unknown>).homestead;
  delete (farm.clock as unknown as Record<string, unknown>).at;
  for (const key of ['workRules', 'jobs', 'nextJobId', 'bookings', 'nextBookingId']) delete f[key];
  for (const entry of farm.actionLog) delete (entry as unknown as Record<string, unknown>).job;
  // Farm hands and contract fencing (format 9): a farm saved before had none. `labour` is
  // left out until the first hire or order, so there is nothing to fill in.
  if (farm.labour === null) delete farm.labour;
  // Within format 9 (not yet released): wages owed and plan moves credited to a hand came later.
  if (farm.labour) {
    farm.labour.wagesOwed ??= 0;
    farm.labour.planMoves ??= [];
  }
  // Sheep (format 10): a farm saved before had none. `sheep` is left out until the first
  // sheep come, so there is nothing to fill in.
  if (farm.sheep === null) delete farm.sheep;
  // Format 11: a format 10 sheep is a record of one; mobs get no feed, the district's
  // shearing and crutching days, and no fence got through yet.
  for (const m of farm.sheep?.mobs ?? []) {
    m.feed ??= 'none';
    m.lastBreak ??= null;
    if (m.shearOn === undefined || m.crutchOn === undefined) {
      const d = sheepJobDates(m.joinOn);
      m.shearOn ??= d.shearOn;
      m.crutchOn ??= d.crutchOn;
    }
    for (const x of m.sheep) {
      x.n ??= 1;
      x.doomed2 ??= 0;
    }
  }
}

/**
 * Load a saved farm. A save from an older format is upgraded with defaults.
 * A save from a newer format than this engine knows is refused. The farm is
 * stamped with this engine's version and save format.
 */
export function loadFarm(saved: SavedFarm): FarmState {
  const format = typeof saved.saveFormat === 'number' ? saved.saveFormat : 0;
  if (format > SAVE_FORMAT_VERSION) {
    throw new Error('This farm was saved by a newer version of the game.');
  }
  const raw = unpack(saved, format) as Record<string, unknown>;
  upgrade(raw);
  const farm = raw as unknown as FarmState;
  farm.saveFormat = SAVE_FORMAT_VERSION;
  farm.engineVersion = ENGINE_VERSION;
  return farm;
}

/** JSON with every object's keys in order, so the same data always gives the same text. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return (
      '{' +
      Object.keys(o)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical(o[k]))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(v);
}

function fnv1a(text: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * A hash of the whole farm: 16 hex digits. Two farms with the same hash are
 * the same farm, down to the last bit of every figure. The same seed and
 * the same actions always give the same hash.
 */
export function farmHash(farm: FarmState): string {
  const text = canonical(saveFarm(farm));
  const hex = (n: number): string => n.toString(16).padStart(8, '0');
  return hex(fnv1a(text, 0x811c9dc5)) + hex(fnv1a(text, 0x9747b28c));
}
