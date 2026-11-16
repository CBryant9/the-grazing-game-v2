'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
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
import { useLayout } from '@/lib/game/hooks';
import type { MobWire, PaddockWire, Snapshot } from '@/lib/game/types';
import { EmptyState } from './EmptyState';
import { CHIP } from './PaddockSheet';
import { PanelHead } from './PanelHead';
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
      <span className="sr-only">Sort by</span>
      {keys.map((k) => (
        <button
          key={k.id}
          type="button"
          className={styles.sortbtn}
          aria-pressed={active === k.id}
          onClick={() => onPick(k.id)}
        >
          {active === k.id && k.id === 'name' ? `Sort: ${k.label.toLowerCase()}` : k.label}
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

type PadKey = PaddockSortKey | 'water' | 'rest';

const PADDOCK_KEYS: { id: PadKey; label: string }[] = [
  { id: 'name', label: 'Name' },
  { id: 'feed', label: 'kg DM/ha' },
  { id: 'water', label: 'Water' },
];

/** Rest days sort, once the server sends a paddock's rest days. */
const REST_KEY: { id: PadKey; label: string } = { id: 'rest', label: 'Rest days' };

const WATER_ORDER: Record<PaddockWire['water'], number> = { own: 0, gate: 1, none: 2 };

/** The Paddocks list's order: the shared sorts, plus water and rest days. */
function padRows(snapshot: Snapshot, key: PadKey, dir: 'asc' | 'desc'): PaddockWire[] {
  if (key !== 'water' && key !== 'rest')
    return sortPaddocks(snapshot.paddocks, snapshot.mobs, key, dir);
  const byName = sortPaddocks(snapshot.paddocks, snapshot.mobs, 'name', 'asc');
  const val = (p: PaddockWire): number =>
    key === 'water' ? WATER_ORDER[p.water] : (p.restDays ?? -1);
  const sign = dir === 'asc' ? 1 : -1;
  return [...byName].sort((a, b) => sign * (val(a) - val(b)));
}

/** "180 steers · 21 calves": the mob's classes in words. */
function classLine(m: MobWire): string {
  if (m.species === 'sheep' || m.classes.length === 0) {
    return m.species === 'sheep'
      ? plural(m.head, 'sheep', 'sheep')
      : plural(m.head, 'head', 'head');
  }
  return m.classes
    .map((c) => `${num(c.head)} ${c.label.toLowerCase().replace(/\bptic\b/g, 'PTIC')}`)
    .join(' · ');
}

/** The stock book loads only when it is opened, so the first load of /play stays small. */
const StockBook = dynamic(() => import('./StockBook').then((m) => m.StockBook), {
  loading: () => (
    <p className="muted" role="status">
      Loading the stock book
    </p>
  ),
});

/** The stock book comes with the farm record (the same fetch as Scores and the Diary). */
function BookView() {
  const record = useGame((s) => s.record);
  const load = useGame((s) => s.loadRecord);
  const has = !!record?.data;
  useEffect(() => {
    if (!has) void load();
  }, [has, load]);
  if (record?.status === 'failed' && !record.data) {
    return (
      <div className={styles.jobcard} role="alert">
        <p>{record.message ?? 'The stock book could not be loaded.'}</p>
        <div className={styles.jobbtns}>
          <button type="button" className="btn coral" onClick={() => void load()}>
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (!record?.data) {
    return (
      <p className="muted" role="status">
        Loading the stock book
      </p>
    );
  }
  return <StockBook book={record.data.stockBook} />;
}

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
    : `${g > 0 ? '+' : g < 0 ? '-' : ''}${num(Math.abs(g), 2)} kg/day`;

/** Gain in green, loss in the site's coral: a plain sign, not a judgement of the figure. */
const gainClass = (g: number | null): string =>
  g === null || Math.round(g * 100) === 0 ? '' : g > 0 ? 'ok' : 'bad';

/** The Herd tab: every mob, with where it is, what is in it and its daily gain with the reason. */
export function HerdList({ snapshot }: { snapshot: Snapshot }) {
  const openMob = useGame((s) => s.openMob);
  const setTab = useGame((s) => s.setTab);
  const [key, dir, pick] = useSort<MobSortKey>('name');
  const [view, setView] = useState<'mobs' | 'book'>('mobs');
  const rows = sortMobs(snapshot.mobs, key, dir);
  return (
    <section className={styles.listpanel} aria-label="Herd">
      <PanelHead
        title="Herd"
        sub={`${plural(snapshot.totals.head, 'head', 'head')} in ${plural(snapshot.mobs.length, 'mob')}`}
      />
      <div className={styles.seg} role="group" aria-label="Herd view">
        <button type="button" aria-pressed={view === 'mobs'} onClick={() => setView('mobs')}>
          Mobs
        </button>
        <button type="button" aria-pressed={view === 'book'} onClick={() => setView('book')}>
          Stock book
        </button>
      </div>
      {view === 'book' ? (
        <BookView />
      ) : rows.length === 0 ? (
        <EmptyState action="Go to the Market" onAction={() => setTab('market')}>
          There are no cattle on the farm. {snapshot.market.saleLine}
        </EmptyState>
      ) : (
        <>
          <SortBar label="Sort the herd" keys={MOB_KEYS} active={key} dir={dir} onPick={pick} />
          <ul className={styles.rows}>
            {rows.map((m) => {
              const reason = m.gainWhy;
              return (
                <li key={m.id}>
                  <button type="button" className={styles.row} onClick={() => openMob(m.id)}>
                    <span className={styles.rowtop}>
                      <b>{m.name}</b>
                      <span className="muted">
                        {m.where === 'yards' ? 'Stock yards' : (m.area ?? 'Feedlot')}
                      </span>
                    </span>
                    <span className={styles.rowsub}>
                      {classLine(m)}
                      {m.weightKg !== null ? ` · avg ${num(m.weightKg)} kg` : ''}
                      {m.cs !== null ? ` · CS ${num(m.cs, 1)}` : ''}
                      {m.species === 'sheep' ? ` · ${num(m.dse)} DSE` : ''}
                    </span>
                    <span className={styles.rowgain}>
                      <span className={gainClass(m.adgKg)}>{gainText(m.adgKg)}</span>
                      {reason ? ` · ${reason}` : ''}
                      {m.pticText ? `. ${m.pticText}` : ''}
                      {m.sheep?.shearing ? ` ${m.sheep.shearing.split('.')[0]}.` : ''}
                      {!m.hasWater && m.where === 'paddock' && (
                        <span className={styles.warntag}>No water</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

/** Water as the mockup: ✓ in the paddock or through a gate, ✗ with none. */
function WaterMark({ p }: { p: PaddockWire }) {
  return p.water === 'none' ? (
    <span className="bad" aria-label="No water">
      ✗
    </span>
  ) : (
    <span className="ok" aria-label={p.water === 'gate' ? 'Water through a gate' : 'Water'}>
      ✓
    </span>
  );
}

/**
 * The Paddocks tab: every paddock with its label, hectares, kg DM/ha and water. One line each on
 * a phone; a table on a PC with the open paddock marked. Tap one to open its sheet.
 */
export function PaddockList({ snapshot }: { snapshot: Snapshot }) {
  const openPaddock = useGame((s) => s.openPaddock);
  const selected = useGame((s) => s.paddockId);
  const selectTool = useGame((s) => s.selectTool);
  const setTab = useGame((s) => s.setTab);
  const layout = useLayout();
  const [key, dir, pick] = useSort<PadKey>('name');
  const rows = padRows(snapshot, key, dir);
  const hasRest = snapshot.paddocks.some((p) => p.restDays !== null);
  const keys = hasRest ? [...PADDOCK_KEYS, REST_KEY] : PADDOCK_KEYS;
  return (
    <section className={styles.listpanel} aria-label="Paddocks">
      <PanelHead
        title="Paddocks"
        sub={`${plural(snapshot.paddocks.length, 'paddock')} · ${num(snapshot.farm.setup.farmHa)} ha`}
      />
      {rows.length === 0 ? (
        <EmptyState
          action="Build a fence"
          onAction={() => {
            setTab('farm');
            selectTool('fence');
          }}
        >
          This farm has no paddocks yet. A fence round some land makes one.
        </EmptyState>
      ) : (
        <SortBar label="Sort the paddocks" keys={keys} active={key} dir={dir} onPick={pick} />
      )}
      {layout === 'pc' && rows.length > 0 ? (
        <table className={styles.padtable}>
          <caption className="sr-only">Paddocks</caption>
          <thead>
            <tr>
              <th scope="col">Paddock</th>
              <th scope="col">Label</th>
              <th scope="col" className={styles.r}>
                ha
              </th>
              <th scope="col" className={styles.r}>
                kg DM/ha
              </th>
              <th scope="col">Water</th>
              {hasRest && (
                <th scope="col" className={styles.r}>
                  Rest days
                </th>
              )}
              <th scope="col">Mob</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const mob = snapshot.mobs.find((m) => p.mobs.includes(m.id));
              return (
                <tr key={p.id} className={selected === p.id ? styles.selrow : undefined}>
                  <th scope="row">
                    <button
                      type="button"
                      className={styles.cellbtn}
                      aria-current={selected === p.id ? 'true' : undefined}
                      onClick={() => openPaddock(p.id)}
                    >
                      {p.name}
                    </button>
                  </th>
                  <td>
                    <span className={`chip ${CHIP[p.label]}`}>{PADDOCK_LABELS[p.label].name}</span>
                  </td>
                  <td className={styles.r}>{num(p.ha, 1)}</td>
                  <td className={styles.r}>{num(p.massKgHa)}</td>
                  <td>
                    <WaterMark p={p} />
                  </td>
                  {hasRest && (
                    <td className={styles.r}>{p.restDays === null ? '·' : num(p.restDays)}</td>
                  )}
                  <td>{mob ? `${mob.name} ${num(mob.head)}` : '·'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <ul className={styles.padrows}>
          {rows.map((p) => {
            const mob = snapshot.mobs.find((m) => p.mobs.includes(m.id));
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className={styles.padrow}
                  aria-label={`${p.name}, ${PADDOCK_LABELS[p.label].name}, ${num(p.ha, 1)} ha, ${num(p.massKgHa)} kg DM/ha${p.water === 'none' ? ', no water' : ''}${mob ? `, ${mob.name}` : ''}`}
                  onClick={() => openPaddock(p.id)}
                >
                  <b className={styles.padname}>{p.name}</b>
                  <span className={`chip ${CHIP[p.label]}`}>{PADDOCK_LABELS[p.label].name}</span>
                  <span className={styles.padha}>{num(p.ha, 1)} ha</span>
                  <span className={styles.padkg}>{num(p.massKgHa)}</span>
                  <WaterMark p={p} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
