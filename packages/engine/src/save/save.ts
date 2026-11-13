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
import { GRID_N } from '../grid';
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

function pack(v: unknown, key = ''): unknown {
  if (ArrayBuffer.isView(v)) return packArray(v as Numbers);
  if (isAnimalList(key, v)) return packAnimals(v);
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

function unpack(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(unpack);
  if (v !== null && typeof v === 'object') {
    const tag = (v as { $?: unknown }).$;
    if (tag === 'animals') return unpackAnimals(v as PackedAnimals);
    if (typeof tag === 'string') return unpackArray(v as PackedArray);
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v)) out[k] = unpack((v as Record<string, unknown>)[k]);
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
  farm.ledger = { ...emptyLedger(), ...(farm.ledger ?? {}) };
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
    farm.layout.water.hubs ??= [];
    farm.layout.water.ports ??= [];
    farm.layout.water.nextPortId ??=
      farm.layout.water.ports.reduce((m, p) => Math.max(m, p.id), 0) + 1;
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
  const raw = unpack(saved) as Record<string, unknown>;
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
