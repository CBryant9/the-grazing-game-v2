'use client';

import { useEffect, useRef } from 'react';
import type { ChangeWire, SummaryWire } from '@/lib/game/types';
import { dateText, delta, money, num, plural, shortDate } from '@/lib/game/format';
import { useGame } from '@/lib/game/store';
import styles from './play.module.css';

function Change({
  label,
  c,
  unit = '',
  places = 0,
  dollars = false,
}: {
  label: string;
  c: ChangeWire;
  unit?: string;
  places?: number;
  dollars?: boolean;
}) {
  const fmt = (n: number): string => (dollars ? money(n) : `${num(n, places)}${unit}`);
  return (
    <div className={styles.sumrow}>
      <dt>{label}</dt>
      <dd>
        {fmt(c.before)} to {fmt(c.after)}
        <span className={styles.sumdelta}>
          {' '}
          ({dollars ? deltaMoney(c) : delta(c.before, c.after, places)})
        </span>
      </dd>
    </div>
  );
}

function deltaMoney(c: ChangeWire): string {
  const d = c.after - c.before;
  if (d === 0) return 'no change';
  return `${d > 0 ? '+' : '-'}${money(Math.abs(d))}`;
}

/**
 * What happened over a day or a skip: facts and figures, no praise and no
 * criticism. The player dismisses it. It takes focus when it opens, keeps
 * focus inside, and closes on Escape.
 */
export function SummaryCard({ summary }: { summary: SummaryWire }) {
  const dismiss = useGame((s) => s.dismissSummary);
  const skip = useGame((s) => s.skip);
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const title =
    summary.kind === 'day' && summary.daysRun === 1
      ? 'Overnight'
      : summary.daysRun === 0
        ? 'Nothing ran'
        : plural(summary.daysRun, 'day') + ' passed';
  const when =
    summary.daysRun === 0
      ? dateText(summary.from)
      : summary.from.year === summary.to.year
        ? `${shortDate(summary.from)} to ${dateText(summary.to)}`
        : `${dateText(summary.from)} to ${dateText(summary.to)}`;
  const causes = Object.entries(summary.deathsByCause)
    .map(([cause, n]) => `${n} from ${cause}`)
    .join(', ');
  const m = summary.money;

  return (
    <div
      className={styles.scrim}
      onKeyDown={(e) => {
        if (e.key === 'Escape') dismiss();
        if (e.key === 'Tab') {
          // Keep focus in the card.
          const items = ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled)');
          if (!items?.length) return;
          const first = items[0]!;
          const last = items[items.length - 1]!;
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }}
    >
      <div
        ref={ref}
        className={styles.summary}
        role="dialog"
        aria-modal="true"
        aria-labelledby="summary-title"
      >
        <h2 id="summary-title" className={`px ${styles.sumtitle}`}>
          {title}
        </h2>
        <p className={styles.sumwhen}>{when}</p>
        {summary.stops.length > 0 && (
          <ul className={styles.sumstops}>
            {summary.stops.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        )}
        {summary.daysRun > 0 && summary.daysRun < summary.daysAsked && (
          <p className={styles.sumwhen}>
            Stopped after {plural(summary.daysRun, 'day')} of {summary.daysAsked}.
          </p>
        )}
        <dl className={styles.sumlist}>
          <Change label="Cash" c={summary.cash} dollars />
          <Change label="Head" c={summary.head} />
          {(summary.calves.before > 0 || summary.calves.after > 0) && (
            <Change label="Calves" c={summary.calves} />
          )}
          <Change label="Feed" c={summary.massKgHa} unit=" kg DM/ha" />
          <Change label="Green feed" c={summary.greenKgHa} unit=" kg DM/ha" />
          <Change label="Ground cover" c={summary.coverPct} unit="%" />
          <Change label="Live weight" c={summary.liveWeightKg} unit=" kg" />
        </dl>
        <ul className={styles.sumfacts}>
          {summary.planMoves.map((line) => (
            <li key={line}>{line}</li>
          ))}
          {summary.births > 0 && <li>{plural(summary.births, 'calf', 'calves')} born.</li>}
          <li>
            {summary.deaths === 0
              ? 'No deaths.'
              : `${plural(summary.deaths, 'head', 'head')} died: ${causes}.`}
          </li>
          {m.sales > 0 && <li>Sales: {money(m.sales)}.</li>}
          {m.buys > 0 && <li>Cattle bought: {money(m.buys)}.</li>}
          {m.feed > 0 && <li>Feed: {money(m.feed)}.</li>}
          {m.running > 0 && <li>Running costs: {money(m.running)}.</li>}
          {m.interest > 0 && <li>Interest: {money(m.interest)}.</li>}
          {summary.arrived.head > 0 && (
            <li>{plural(summary.arrived.head, 'head', 'head')} arrived in the stock yards.</li>
          )}
          {summary.bookedSold.head > 0 && (
            <li>
              {plural(summary.bookedSold.head, 'head', 'head')} sold from the booking,{' '}
              {money(summary.bookedSold.net)} banked.
            </li>
          )}
        </ul>
        <div className={styles.sumbtns}>
          {summary.canRunAnyway && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                dismiss();
                void skip(
                  summary.daysAsked === 7 ? 'week' : summary.daysAsked === 30 ? 'month' : 'year',
                  true,
                );
              }}
            >
              Run it anyway
            </button>
          )}
          <button ref={closeRef} type="button" className="btn coral" onClick={dismiss}>
            Back to the farm
          </button>
        </div>
      </div>
    </div>
  );
}
