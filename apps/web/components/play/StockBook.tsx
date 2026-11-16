'use client';

import { useMemo, useState } from 'react';
import { money, num } from '@/lib/game/format';
import type { StockBookWire, StockRowWire } from '@/lib/game/types';
import styles from './StockBook.module.css';

/**
 * The stock book in Herd (mockups 8 and D): every head of cattle with what it
 * cost and what it would fetch today, sortable, filtered by mob. A list of
 * the key columns on a phone, the full table on a PC (the panel's own width
 * decides, so it fits wherever it is mounted). Self-contained: it takes the
 * record's `stockBook` and keeps its own sort, filter and page.
 *
 * Mount: `<StockBook book={record.stockBook} />` with the record the Scores
 * and Diary panels already load (`GET /api/game/record`, `RecordResponse`),
 * for example under a "Mobs | Stock book" switch in Herd. The stock book is
 * not in the snapshot: a big herd would pass its size limit. `mob` starts it
 * filtered to one mob.
 */

export type StockSortKey = 'profit' | 'tag' | 'kg' | 'value' | 'age';
type Dir = 'asc' | 'desc';

/** Rows shown at first, and added by "Show more". */
export const STOCK_PAGE = 50;

const SORTS: { key: StockSortKey; label: string }[] = [
  { key: 'profit', label: 'Profit' },
  { key: 'value', label: 'Value now' },
  { key: 'kg', label: 'Weight' },
  { key: 'age', label: 'Age' },
  { key: 'tag', label: 'Tag' },
];

/** The rows for a mob (or all), sorted. Ties keep tag order so the list never jumps. */
export function sortStock(
  rows: readonly StockRowWire[],
  key: StockSortKey,
  dir: Dir,
  mob: number | null,
): StockRowWire[] {
  const pick = (r: StockRowWire): number =>
    key === 'profit'
      ? r.profit
      : key === 'value'
        ? r.value
        : key === 'kg'
          ? r.kg
          : key === 'age'
            ? r.ageDays
            : r.id;
  const sign = dir === 'asc' ? 1 : -1;
  return rows
    .filter((r) => mob === null || r.mob === mob)
    .sort((a, b) => sign * (pick(a) - pick(b)) || a.id - b.id);
}

/** "40 days", "18 mo", "6 yr". */
export function ageText(days: number): string {
  if (days < 90) return `${days} days`;
  const months = Math.floor(days / 30.4);
  if (months < 24) return `${months} mo`;
  return `${Math.floor(days / 365.25)} yr`;
}

/** "+$402", "−$64", "$0". */
export function profitText(n: number): string {
  if (n === 0) return '$0';
  return n > 0 ? `+${money(n)}` : `−${money(-n)}`;
}

const tone = (n: number): string => (n > 0 ? styles.up! : n < 0 ? styles.down! : '');

export function StockBook({ book, mob = null }: { book: StockBookWire; mob?: number | null }) {
  const [filter, setFilter] = useState<number | null>(mob);
  const [key, setKey] = useState<StockSortKey>('profit');
  const [dir, setDir] = useState<Dir>('desc');
  const [shown, setShown] = useState(STOCK_PAGE);
  const label = useMemo(() => new Map(book.classes.map((c) => [c.id, c.label])), [book.classes]);
  const rows = useMemo(() => sortStock(book.rows, key, dir, filter), [book.rows, key, dir, filter]);

  if (!book.rows.length) {
    return (
      <div className={styles.book}>
        <p className={styles.empty}>
          No cattle on the farm. The stock book lists each head once there are some.
        </p>
      </div>
    );
  }

  const sortBy = (k: StockSortKey): void => {
    if (k === key) setDir(dir === 'asc' ? 'desc' : 'asc');
    else {
      setKey(k);
      setDir(k === 'tag' ? 'asc' : 'desc');
    }
    setShown(STOCK_PAGE);
  };
  const ariaSort = (k: StockSortKey): 'ascending' | 'descending' | 'none' =>
    k === key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none';
  const head = (k: StockSortKey, text: string, cls = '') => (
    <th scope="col" aria-sort={ariaSort(k)} className={cls}>
      <button type="button" className={styles.sortbtn} onClick={() => sortBy(k)}>
        {text}
        <span aria-hidden="true" className={styles.arrow}>
          {k === key ? (dir === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
      </button>
    </th>
  );
  const sum = rows.reduce((t, r) => t + r.profit, 0);
  // The head here counts calves at foot (the herd's own head total leaves them out), so say how many.
  const calves =
    filter === null ? book.totals.calves : (book.mobs.find((m) => m.id === filter)?.calves ?? 0);
  const calfText =
    calves > 0 ? `, including ${num(calves)} ${calves === 1 ? 'calf' : 'calves'} at foot` : '';

  return (
    <div className={styles.book}>
      <div className={styles.bar}>
        <div className={styles.chips} role="group" aria-label="Which mob">
          <button
            type="button"
            className={styles.chip}
            aria-pressed={filter === null}
            onClick={() => {
              setFilter(null);
              setShown(STOCK_PAGE);
            }}
          >
            All
          </button>
          {book.mobs.map((m) => (
            <button
              key={m.id}
              type="button"
              className={styles.chip}
              aria-pressed={filter === m.id}
              onClick={() => {
                setFilter(m.id);
                setShown(STOCK_PAGE);
              }}
            >
              {m.name}
            </button>
          ))}
        </div>
        <label className={styles.sortpick}>
          <span className={styles.muted}>Sort</span>
          <select
            value={`${key}:${dir}`}
            onChange={(e) => {
              const [k, d] = e.target.value.split(':') as [StockSortKey, Dir];
              setKey(k);
              setDir(d);
              setShown(STOCK_PAGE);
            }}
          >
            {SORTS.flatMap((s) => [
              <option key={`${s.key}:desc`} value={`${s.key}:desc`}>
                {s.label}, high to low
              </option>,
              <option key={`${s.key}:asc`} value={`${s.key}:asc`}>
                {s.label}, low to high
              </option>,
            ])}
          </select>
        </label>
      </div>
      <p className={styles.total}>
        {num(rows.length)} head{calfText}. Profit if sold today:{' '}
        <b className={tone(sum)}>{profitText(sum)}</b>
      </p>
      <div className={styles.scroll}>
        <table className={styles.tbl}>
          <caption className={styles.srOnly}>
            Stock book: each head with what it cost and what it would fetch today
          </caption>
          <thead>
            <tr>
              {head('tag', 'Tag')}
              <th scope="col">Class</th>
              {head('age', 'Age', styles.wide)}
              {head('kg', 'kg', styles.r)}
              <th scope="col">CS</th>
              <th scope="col" className={styles.wide}>
                PTIC
              </th>
              <th scope="col" className={`${styles.r} ${styles.wide}`}>
                Bought
              </th>
              <th scope="col" className={`${styles.r} ${styles.wide}`}>
                Spent
              </th>
              {head('value', 'Value now', `${styles.r} ${styles.wide}`)}
              {head('profit', 'Profit', styles.r)}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, shown).map((r) => (
              <tr key={r.id}>
                <td>
                  {r.id}
                  {r.booked ? <span className={styles.tag}> booked</span> : null}
                </td>
                <td>{label.get(r.cls) ?? r.cls}</td>
                <td className={styles.wide}>{ageText(r.ageDays)}</td>
                <td className={styles.r}>{num(r.kg)}</td>
                <td>{r.cs.toFixed(1)}</td>
                <td className={styles.wide}>{r.ptic ? 'Yes' : '·'}</td>
                <td className={`${styles.r} ${styles.wide}`}>
                  {r.origin === 'bred' ? (
                    <span className={styles.muted}>{book.originText.bred}</span>
                  ) : (
                    <>
                      {money(r.paid)}
                      {r.origin !== 'bought' ? (
                        <span className={styles.sub}>{book.originText[r.origin]}</span>
                      ) : null}
                    </>
                  )}
                </td>
                <td className={`${styles.r} ${styles.wide}`}>{money(r.spent)}</td>
                <td className={`${styles.r} ${styles.wide}`}>{money(r.value)}</td>
                <td className={`${styles.r} ${tone(r.profit)}`}>{profitText(r.profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > shown ? (
        <button type="button" className={styles.more} onClick={() => setShown(shown + STOCK_PAGE)}>
          Show more ({num(rows.length - shown)} left)
        </button>
      ) : null}
      <details className={styles.notes}>
        <summary>How the figures are worked out</summary>
        <ul>
          {book.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
