'use client';

import { useEffect, useRef, useState } from 'react';
import type { BubbleWire, ChangeWire, SummaryWire } from '@/lib/game/types';
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

/** A worker, drawn plainly: a hat, a head and shoulders. */
function Worker() {
  return (
    <svg className={styles.worker} viewBox="0 0 56 64" aria-hidden="true" focusable="false">
      <ellipse cx="28" cy="22" rx="20" ry="4" fill="currentColor" />
      <path d="M14 21 Q14 6 28 6 Q42 6 42 21 Z" fill="currentColor" />
      <circle cx="28" cy="32" r="10" fill="none" stroke="currentColor" strokeWidth="3" />
      <path
        d="M8 62 Q8 44 28 44 Q48 44 48 62 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
    </svg>
  );
}

/**
 * The worker report: a worker with a speech bubble for each thing done while
 * the player was away, in the worker's own plain words. One tap for the next,
 * or skip all. Each is also in the inbox.
 */
function Report({
  bubbles,
  at,
  onNext,
  onSkip,
  nextRef,
  closing,
}: {
  closing: string;
  bubbles: BubbleWire[];
  at: number;
  onNext: () => void;
  onSkip: () => void;
  nextRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const b = bubbles[at]!;
  const last = at === bubbles.length - 1;
  return (
    <>
      <h2 id="summary-title" className={`px ${styles.sumtitle}`}>
        While you were away
      </h2>
      <div className={styles.report} role="group" aria-label="Worker report">
        <Worker />
        <blockquote className={styles.bubble} aria-live="polite">
          <span className={styles.bubblewho}>{b.who}</span>
          <p>{b.text}</p>
        </blockquote>
        <p className={styles.reportcount}>
          {at + 1} of {bubbles.length}. {shortDate(b.date)}.
        </p>
      </div>
      <div className={styles.sumbtns}>
        {!last && (
          <button type="button" className="btn ghost" onClick={onSkip}>
            Skip all
          </button>
        )}
        <button ref={nextRef} type="button" className="btn coral" onClick={onNext}>
          {last ? closing : 'Next'}
        </button>
      </div>
    </>
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
  const nextRef = useRef<HTMLButtonElement>(null);
  // The worker report comes first, one bubble at a time. It is over once the last is read or skipped.
  const [at, setAt] = useState(0);
  // After a skip of days, or when something needs the eye, the report is stepped through first. Otherwise it sits in the summary.
  const reporting = summary.reportFirst && at < summary.report.length;

  useEffect(() => {
    (reporting ? nextRef : closeRef).current?.focus();
  }, [reporting, at]);

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
  // A day with sheep in it names the cattle's figures as the cattle's.
  const sheepy = summary.sheepLines.length > 0 || m.wool > 0;

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
        {reporting ? (
          <Report
            bubbles={summary.report}
            at={at}
            onNext={() => setAt(at + 1)}
            onSkip={() => setAt(summary.report.length)}
            nextRef={nextRef}
            closing={summary.kind === 'skip' ? 'Show the summary' : 'Show the day'}
          />
        ) : (
          <>
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
            {!summary.reportFirst && summary.report.length > 0 && (
              <section aria-labelledby="away-title" className={styles.awaybox}>
                <h3 id="away-title" className={`px ${styles.minihead}`}>
                  While you were away
                </h3>
                <ul className={styles.awaylist}>
                  {summary.report.map((b) => (
                    <li key={b.seq}>
                      <b>{b.who}:</b> {b.text}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <ul className={styles.sumfacts}>
              {summary.planMoves.map((line) => (
                <li key={line}>{line}</li>
              ))}
              {summary.growth && <li>{summary.growth}</li>}
              {summary.births > 0 && <li>{plural(summary.births, 'calf', 'calves')} born.</li>}
              <li>
                {summary.deaths === 0
                  ? sheepy
                    ? 'No cattle deaths.'
                    : 'No deaths.'
                  : `${plural(summary.deaths, 'head', 'head')} ${sheepy ? 'of cattle ' : ''}died: ${causes}.`}
              </li>
              {summary.sheepLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
              {m.wool > 0 && <li>Wool: {money(m.wool)}, sold at shearing.</li>}
              {m.sales > 0 && <li>Sales: {money(m.sales)}.</li>}
              {m.buys > 0 && <li>Cattle bought: {money(m.buys)}.</li>}
              {m.feed > 0 && <li>Feed: {money(m.feed)}.</li>}
              {m.grain > 0 && <li>Grain sold: {money(m.grain)}.</li>}
              {m.running > 0 && <li>Running costs: {money(m.running)}.</li>}
              {m.wages > 0 && (
                <li>Wages and super paid: {money(m.wages)}, in the running costs.</li>
              )}
              {m.contract > 0 && <li>Contract fencing: {money(m.contract)}.</li>}
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
                      summary.daysAsked === 7
                        ? 'week'
                        : summary.daysAsked === 30
                          ? 'month'
                          : 'year',
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
          </>
        )}
      </div>
    </div>
  );
}
