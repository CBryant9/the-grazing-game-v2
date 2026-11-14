'use client';

import { useState } from 'react';
import { PADDOCK_LABELS } from '@gg/shared';
import { num, plural } from '@/lib/game/format';
import {
  sortMobs,
  sortPaddocks,
  type MobSortKey,
  type PaddockSortKey,
  type SortDir,
} from '@/lib/game/lists';
import { useGame } from '@/lib/game/store';
import type { Snapshot } from '@/lib/game/types';
import { EmptyState } from './EmptyState';
import { CHIP } from './PaddockSheet';
import styles from './play.module.css';

function SortBar<K extends string>({
  label,
  keys,
  active,
  dir,
  onPick,
}: {
  label: string;
  keys: readonly { id: K; label: string }[];
  active: K;
  dir: SortDir;
  onPick: (key: K) => void;
}) {
  return (
    <div className={styles.sortbar} role="group" aria-label={label}>
      <span className={styles.sortlabel}>Sort by</span>
      {keys.map((k) => (
        <button
          key={k.id}
          type="button"
          className={styles.sortbtn}
          aria-pressed={active === k.id}
          onClick={() => onPick(k.id)}
        >
          {k.label}
          {active === k.id && <span aria-hidden="true">{dir === 'asc' ? ' ↑' : ' ↓'}</span>}
          {active === k.id && (
            <span className="sr-only">{dir === 'asc' ? ', lowest first' : ', highest first'}</span>
          )}
        </button>
      ))}
    </div>
  );
}

const MOB_KEYS = [
  { id: 'name', label: 'Name' },
  { id: 'head', label: 'Head' },
  { id: 'cs', label: 'CS' },
  { id: 'gain', label: 'Gain' },
] as const satisfies readonly { id: MobSortKey; label: string }[];

const PADDOCK_KEYS = [
  { id: 'name', label: 'Name' },
  { id: 'ha', label: 'Hectares' },
  { id: 'feed', label: 'Feed' },
] as const satisfies readonly { id: PaddockSortKey; label: string }[];

/** Sorting by one column: tap it again to turn the order round. */
function useSort<K extends string>(first: K): [K, SortDir, (k: K) => void] {
  const [key, setKey] = useState<K>(first);
  const [dir, setDir] = useState<SortDir>('asc');
  return [
    key,
    dir,
    (k: K) => {
      if (k === key) setDir(dir === 'asc' ? 'desc' : 'asc');
      else {
        setKey(k);
        // Numbers start with the biggest, names with A.
        setDir(k === 'name' ? 'asc' : 'desc');
      }
    },
  ];
}

const gainText = (g: number | null): string =>
  g === null
    ? 'no gain figure yet'
    : `${g > 0 ? '+' : g < 0 ? '-' : ''}${num(Math.abs(g), 2)} kg/head/day`;

/** The Herd tab: every mob, with where it is, head, CS and daily gain. Tap one to open its card. */
export function HerdList({ snapshot }: { snapshot: Snapshot }) {
  const openMob = useGame((s) => s.openMob);
  const setTab = useGame((s) => s.setTab);
  const [key, dir, pick] = useSort<MobSortKey>('name');
  const rows = sortMobs(snapshot.mobs, key, dir);
  return (
    <section className={styles.listpanel} aria-label="Herd">
      <h2 className={`px ${styles.soontitle}`}>Herd</h2>
      <p className="muted">
        {plural(snapshot.totals.head, 'head', 'head')} in {plural(snapshot.mobs.length, 'mob')}.
      </p>
      {rows.length === 0 ? (
        <EmptyState action="Go to the Market" onAction={() => setTab('market')}>
          There are no cattle on the farm. {snapshot.market.saleLine}
        </EmptyState>
      ) : (
        <>
          <SortBar label="Sort the herd" keys={MOB_KEYS} active={key} dir={dir} onPick={pick} />
          <ul className={styles.rows}>
            {rows.map((m) => (
              <li key={m.id}>
                <button type="button" className={styles.row} onClick={() => openMob(m.id)}>
                  <span className={styles.rowtop}>
                    <b>{m.name}</b>
                    <span>{plural(m.head, 'head', 'head')}</span>
                  </span>
                  <span className={styles.rowsub}>
                    {m.where === 'yards' ? 'Stock yards' : (m.area ?? 'Feedlot')}
                    {m.cs !== null ? `, CS ${num(m.cs, 1)}` : ''}, {gainText(m.adgKg)}
                    {m.pticText ? `. ${m.pticText}` : ''}
                    {!m.hasWater && m.where === 'paddock' && (
                      <span className={styles.warntag}>No water</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** The Paddocks tab: every paddock, with hectares, label, feed and the mob in it. Tap one to open its sheet. */
export function PaddockList({ snapshot }: { snapshot: Snapshot }) {
  const openPaddock = useGame((s) => s.openPaddock);
  const selectTool = useGame((s) => s.selectTool);
  const [key, dir, pick] = useSort<PaddockSortKey>('name');
  const rows = sortPaddocks(snapshot.paddocks, snapshot.mobs, key, dir);
  return (
    <section className={styles.listpanel} aria-label="Paddocks">
      <h2 className={`px ${styles.soontitle}`}>Paddocks</h2>
      <p className="muted">
        {plural(snapshot.paddocks.length, 'paddock')}, {num(snapshot.farm.setup.farmHa)} ha.
      </p>
      {rows.length === 0 ? (
        <EmptyState action="Build a fence" onAction={() => selectTool('fence')}>
          This farm has no paddocks yet. A fence round some land makes one.
        </EmptyState>
      ) : (
        <SortBar
          label="Sort the paddocks"
          keys={PADDOCK_KEYS}
          active={key}
          dir={dir}
          onPick={pick}
        />
      )}
      <ul className={styles.rows}>
        {rows.map((p) => {
          const mob = snapshot.mobs.find((m) => p.mobs.includes(m.id));
          return (
            <li key={p.id}>
              <button type="button" className={styles.row} onClick={() => openPaddock(p.id)}>
                <span className={styles.rowtop}>
                  <b>{p.name}</b>
                  <span className={`chip ${CHIP[p.label]}`}>{PADDOCK_LABELS[p.label].name}</span>
                </span>
                <span className={styles.rowsub}>
                  {num(p.ha, 1)} ha, {num(p.massKgHa)} kg DM/ha,{' '}
                  {mob ? `${mob.name}, ${plural(mob.head, 'head', 'head')}` : 'no mob'}
                  {p.water === 'none' && <span className={styles.warntag}>No water</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
