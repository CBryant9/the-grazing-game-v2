import { PADDOCK_LABELS } from '@gg/shared';
import type { MobWire, PaddockWire, SellGroupWire } from './types';

/**
 * The pure parts of the lists, the sell picker and the move picker. No
 * React here, so they can be tested on their own.
 */

export type SortDir = 'asc' | 'desc';

export type MobSortKey = 'name' | 'where' | 'head' | 'cs' | 'gain';
export type PaddockSortKey = 'name' | 'ha' | 'label' | 'feed' | 'mob';

const text = (a: string, b: string): number => a.localeCompare(b, 'en-AU', { numeric: true });

/** Missing numbers sort last whichever way the list runs. */
function byNumber(a: number | null, b: number | null, dir: SortDir): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return dir === 'asc' ? a - b : b - a;
}

export function sortMobs(mobs: readonly MobWire[], key: MobSortKey, dir: SortDir): MobWire[] {
  const sign = dir === 'asc' ? 1 : -1;
  const by = (a: MobWire, b: MobWire): number => {
    switch (key) {
      case 'name':
        return sign * text(a.name, b.name);
      case 'where':
        return sign * text(a.area ?? a.where, b.area ?? b.where);
      case 'head':
        return byNumber(a.head, b.head, dir);
      case 'cs':
        return byNumber(a.cs, b.cs, dir);
      case 'gain':
        return byNumber(a.adgKg, b.adgKg, dir);
    }
  };
  // Ties keep a steady order: by name, then id.
  return [...mobs].sort((a, b) => by(a, b) || text(a.name, b.name) || a.id - b.id);
}

export function sortPaddocks(
  paddocks: readonly PaddockWire[],
  mobs: readonly MobWire[],
  key: PaddockSortKey,
  dir: SortDir,
): PaddockWire[] {
  const sign = dir === 'asc' ? 1 : -1;
  const mobName = (p: PaddockWire): string | null =>
    mobs.find((m) => p.mobs.includes(m.id))?.name ?? null;
  const by = (a: PaddockWire, b: PaddockWire): number => {
    switch (key) {
      case 'name':
        return sign * text(a.name, b.name);
      case 'ha':
        return byNumber(a.ha, b.ha, dir);
      case 'label':
        return sign * text(PADDOCK_LABELS[a.label].name, PADDOCK_LABELS[b.label].name);
      case 'feed':
        return byNumber(a.massKgHa, b.massKgHa, dir);
      case 'mob': {
        const x = mobName(a);
        const y = mobName(b);
        if (x === null && y === null) return 0;
        if (x === null) return 1;
        if (y === null) return -1;
        return sign * text(x, y);
      }
    }
  };
  return [...paddocks].sort((a, b) => by(a, b) || text(a.name, b.name) || a.id - b.id);
}

/** Clamp a number of head to what the group holds: at least 1, at most the head free to sell. */
export function clampQty(qty: number, max: number): number {
  if (max < 1) return 0;
  if (!Number.isFinite(qty)) return 1;
  return Math.min(max, Math.max(1, Math.floor(qty)));
}

/** What the sell picker can do for a group and a number. */
export function sellLimits(
  groups: readonly SellGroupWire[],
  groupId: string,
  qty: number,
): { max: number; qty: number } {
  const g = groups.find((x) => x.id === groupId);
  const max = g ? g.head : 0;
  return { max, qty: clampQty(qty, max) };
}

/** The classes of a mob that can be picked for a part move: calves go with their mothers. */
export function movableClasses(mob: MobWire): MobWire['classes'] {
  return mob.classes.filter((c) => !c.calf && c.head > 0);
}

/**
 * The picks for moving part of a mob: only classes with a number above zero,
 * each held to the head in the class. Returns an empty list when nothing is
 * picked.
 */
export function movePicks(
  mob: MobWire,
  qtys: Readonly<Record<string, number>>,
): { mob: number; cls: string; qty: number }[] {
  const picks: { mob: number; cls: string; qty: number }[] = [];
  for (const c of movableClasses(mob)) {
    const q = Math.min(c.head, Math.max(0, Math.floor(qtys[c.id] ?? 0)));
    if (q > 0) picks.push({ mob: mob.id, cls: c.id, qty: q });
  }
  return picks;
}

/** What a paddock is on the move picker: pickable or not, why, and a dry mark. */
export interface PickableRow {
  paddock: PaddockWire;
  /** The mob already in it, if any: moving here joins the two. */
  holds: string | null;
  dry: boolean;
}

/** The paddocks a mob can be moved to: every paddock except the one it is in. */
export function pickable(
  paddocks: readonly PaddockWire[],
  mobs: readonly MobWire[],
  moving: MobWire | null,
): PickableRow[] {
  return paddocks
    .filter((p) => !moving || !p.mobs.includes(moving.id))
    .map((p) => ({
      paddock: p,
      holds: mobs.find((m) => m.id !== moving?.id && p.mobs.includes(m.id))?.name ?? null,
      dry: p.water === 'none',
    }));
}
