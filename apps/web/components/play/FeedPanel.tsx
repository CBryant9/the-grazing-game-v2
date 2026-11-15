'use client';

import { useId, type ReactNode } from 'react';
import { money, num } from '@/lib/game/format';
import type { FeedPointWire, FeedWire, SimpleAction, SuppId } from '@/lib/game/types';
import styles from './FeedPanel.module.css';

/**
 * The Feed panel (mockup E; More, Feed on a phone): the average-season feed
 * forecast drawn in SVG, against the ground cover floor, with crops as
 * spikes, then each cattle mob's supplement at its daily price with what it
 * adds. Self-contained: it takes the snapshot's `feed`.
 *
 * Mount: `<FeedPanel feed={snapshot.feed} onPick={(a) => checkAct(`${a.mob}:supp`, a)}
 * job={(mob) => <ActJob slot={`${mob}:supp`} title="Supplement" confirmLabel="Confirm" />} />`.
 * `onPick` gets the same `setSupplement` action the mob card sends; the parent runs it through
 * its job card, and `job` draws that card under the mob's row, where the player pressed.
 */

/** The action the supplement buttons send: the mob card's own. */
export const suppAction = (mob: number, supp: SuppId): SimpleAction => ({
  type: 'setSupplement',
  mob,
  supp,
});

export const FEED_BOX = { width: 340, height: 190, left: 40, right: 8, top: 8, bottom: 20 };

/** A round top for the chart's scale: 1, 2 or 5 times a power of ten. */
export function niceTop(max: number): number {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 5, 10]) if (m * p >= max) return m * p;
  return 10 * p;
}

/** Where everything on the chart goes, from the forecast's tonnes. Exported for the tests. */
export function feedGeometry(points: readonly FeedPointWire[], floorT: number, box = FEED_BOX) {
  const w = box.width - box.left - box.right;
  const h = box.height - box.top - box.bottom;
  const max = Math.max(floorT, ...points.map((p) => p.pastureT + p.cropT));
  const top = niceTop(max * 1.05);
  const x = (i: number): number =>
    box.left + (points.length > 1 ? (i * w) / (points.length - 1) : w / 2);
  const y = (t: number): number => box.top + (1 - t / top) * h;
  const base = y(0);
  const area = points.length
    ? `M${x(0).toFixed(1)},${base.toFixed(1)}` +
      points.map((p, i) => `L${x(i).toFixed(1)},${y(p.pastureT).toFixed(1)}`).join('') +
      `L${x(points.length - 1).toFixed(1)},${base.toFixed(1)}Z`
    : '';
  const line = points
    .map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.pastureT).toFixed(1)}`)
    .join('');
  const bars = points
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.cropT > 0)
    .map(({ p, i }) => ({
      x: x(i) - 5,
      y: y(p.pastureT + p.cropT),
      h: Math.max(1, y(p.pastureT) - y(p.pastureT + p.cropT)),
      label: p.label,
    }));
  const ticks = [0, top / 2, top].map((t) => ({ t, y: y(t) }));
  return { x, y, area, line, bars, ticks, floorY: y(floorT), base };
}

const t = (n: number): string => (n >= 100 ? num(n) : num(n, n < 10 ? 1 : 0));

function FeedChart({ feed }: { feed: FeedWire }) {
  const g = feedGeometry(feed.points, feed.floorT);
  const box = FEED_BOX;
  const hasCrops = g.bars.length > 0;
  return (
    <figure className={styles.figure}>
      <svg
        className={styles.chart}
        viewBox={`0 0 ${box.width} ${box.height}`}
        role="img"
        aria-label={feed.summary}
      >
        {g.ticks.map((k) => (
          <g key={k.t}>
            <line
              x1={box.left}
              x2={box.width - box.right}
              y1={k.y}
              y2={k.y}
              className={styles.grid}
            />
            <text x={box.left - 4} y={k.y + 3} textAnchor="end" className={styles.axis}>
              {t(k.t)} t
            </text>
          </g>
        ))}
        <path d={g.area} className={styles.area} />
        <path d={g.line} className={styles.line} />
        {g.bars.map((b) => (
          <rect
            key={b.label + b.x}
            x={b.x}
            y={b.y}
            width={10}
            height={b.h}
            className={styles.crop}
          />
        ))}
        <line
          x1={box.left}
          x2={box.width - box.right}
          y1={g.floorY}
          y2={g.floorY}
          className={styles.floor}
        />
        {feed.points.map((p, i) => (
          <text
            key={`${p.label}${i}`}
            x={g.x(i)}
            y={box.height - 6}
            textAnchor="middle"
            className={styles.axis}
          >
            {i === 0 ? 'Now' : p.label}
          </text>
        ))}
      </svg>
      <figcaption className={styles.legend}>
        <span>
          <i className={styles.keyArea} aria-hidden="true" /> Feed on offer
        </span>
        <span>
          <i className={styles.keyFloor} aria-hidden="true" /> Ground cover floor (
          {num(feed.floorKgHa)} kg DM/ha)
        </span>
        {hasCrops ? (
          <span>
            <i className={styles.keyCrop} aria-hidden="true" /> Crops
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}

export function FeedPanel({
  feed,
  onPick,
  job,
}: {
  feed: FeedWire;
  /** Called with the mob card's `setSupplement` action when a supplement button is pressed. */
  onPick?: (action: Extract<SimpleAction, { type: 'setSupplement' }>) => void;
  /** The job card for a mob's supplement, drawn under its row. */
  job?: (mob: number) => ReactNode;
}) {
  const tableId = useId();
  return (
    <div className={styles.panel}>
      <h3 className={styles.title}>Feed forecast, the year ahead</h3>
      <FeedChart feed={feed} />
      <div className={styles.card}>
        {feed.lines.map((l) => (
          <p key={l}>{l}</p>
        ))}
        <p className={styles.note}>{feed.note}</p>
      </div>
      <details className={styles.figures}>
        <summary>Forecast figures</summary>
        <table className={styles.tbl} aria-describedby={tableId}>
          <caption id={tableId} className={styles.srOnly}>
            Feed on offer and crops by month, tonnes of dry matter
          </caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col" className={styles.r}>
                Feed on offer
              </th>
              <th scope="col" className={styles.r}>
                Crops
              </th>
            </tr>
          </thead>
          <tbody>
            {feed.points.map((p, i) => (
              <tr key={`${p.label}${i}`}>
                <td>{i === 0 ? `${p.label} (now)` : p.label}</td>
                <td className={styles.r}>{t(p.pastureT)} t</td>
                <td className={styles.r}>{p.cropT > 0 ? `${t(p.cropT)} t` : '·'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <h3 className={styles.title}>Supplements</h3>
      {feed.supplements.length === 0 ? (
        <p className={styles.muted}>No cattle on the farm to feed.</p>
      ) : (
        <ul className={styles.mobs}>
          {feed.supplements.map((m) => (
            <li key={m.mob} className={styles.mob}>
              <div className={styles.mobhead}>
                <b>{m.mobName}</b>
                <span className={styles.muted}>
                  {m.area ?? ''}
                  {m.area ? ' · ' : ''}
                  {num(m.head)} head
                </span>
              </div>
              <p className={styles.on}>
                {m.supp === 'none' ? (
                  'No supplement.'
                ) : (
                  <>
                    On {m.suppLabel.toLowerCase()}: <b>{money(m.perDay)} a day</b>.
                  </>
                )}
                {m.adds ? <span className={styles.adds}> {m.adds}</span> : null}
              </p>
              {m.reason ? (
                <p className={styles.muted}>{m.reason}</p>
              ) : (
                <div
                  className={styles.opts}
                  role="group"
                  aria-label={`Supplement for ${m.mobName}`}
                >
                  {m.options.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      className={styles.opt}
                      aria-pressed={o.id === m.supp}
                      disabled={!onPick || o.id === m.supp}
                      onClick={() => onPick?.({ type: 'setSupplement', mob: m.mob, supp: o.id })}
                      title={o.adds || undefined}
                    >
                      <span>{o.label}</span>
                      <span className={styles.price}>
                        {o.id === 'none' ? '$0' : `${money(o.perDay)}/day`}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {job ? job(m.mob) : null}
            </li>
          ))}
        </ul>
      )}
      {feed.suppNotes.map((n) => (
        <p key={n} className={styles.note}>
          {n}
        </p>
      ))}
    </div>
  );
}
