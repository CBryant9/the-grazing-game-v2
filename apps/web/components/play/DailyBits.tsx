'use client';

import { useEffect, useRef, useState } from 'react';
import { durationText, plural, shortDate } from '@/lib/game/format';
import { useGame } from '@/lib/game/store';
import type { DailyWire, PlanDueWire, Snapshot } from '@/lib/game/types';
import styles from './daily.module.css';
import play from './play.module.css';

/*
 * What only a Daily Farm shows (PRD 5.2, 5.11, 5.15): the mode on the top bar, how long until
 * the day ends, the catch-up for days the player did not open the farm, the plan card, and the
 * plan strip. Every time comes from the server: the countdown starts from the server's clock
 * when the snapshot arrived, so a device clock that is wrong or wound forward changes nothing.
 */

/** Minutes until midnight on the farm's clock, counted down from the server's time. */
function useMinutesLeft(daily: DailyWire): number {
  const [left, setLeft] = useState(() => (daily.endsAt - daily.serverNow) / 60000);
  const stamp = useRef({ at: 0, serverNow: daily.serverNow });
  useEffect(() => {
    stamp.current = { at: performance.now(), serverNow: daily.serverNow };
    const update = (): void => {
      const now = stamp.current.serverNow + (performance.now() - stamp.current.at);
      setLeft((daily.endsAt - now) / 60000);
    };
    update();
    const id = window.setInterval(update, 20_000);
    return () => window.clearInterval(id);
  }, [daily.endsAt, daily.serverNow]);
  return left;
}

/** When the day has ended, or the farm is waiting for its weather, fetch the farm again now and then. The server moves it on. */
function useCatchingUp(on: boolean): void {
  const refresh = useGame((s) => s.refresh);
  useEffect(() => {
    if (!on) return;
    const first = window.setTimeout(() => void refresh(), 4_000);
    const id = window.setInterval(() => void refresh(), 60_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [on, refresh]);
}

/** "Daily Farm" beside the farm name, so the mode is always plain. */
export function ModeTag({ daily }: { daily: DailyWire | null }) {
  return (
    <span className={`${styles.mode} ${daily ? styles.modedaily : ''}`}>
      {daily ? 'Daily Farm' : 'Fast Farm'}
    </span>
  );
}

/** Where Next day and the skips are on a Fast Farm: how long until midnight, and "Done for today". */
export function DailyTime({ daily }: { daily: DailyWire }) {
  const busy = useGame((s) => s.busy > 0);
  const done = useGame((s) => s.dailyDone);
  const left = useMinutesLeft(daily);
  useCatchingUp(left <= 0 || daily.waiting !== null);
  const text = daily.waiting
    ? 'Waiting for yesterday’s weather and prices'
    : left > 1
      ? `Today ends at midnight, in ${durationText(left)}`
      : left > 0
        ? 'Today ends at midnight, in under a minute'
        : 'Today has ended. The farm moves to the next day as soon as the weather is in.';
  return (
    <div className={styles.time} role="group" aria-label="The day">
      <p className={styles.ends}>{text}</p>
      {daily.work === 'done' ? (
        <p className={styles.marked}>Today’s work is marked done.</p>
      ) : (
        <button type="button" className="btn sm" disabled={busy} onClick={() => void done()}>
          Done for today
        </button>
      )}
    </div>
  );
}

/** The days the player did not open the farm, as the diary has them, and what the hands did. Shown once. */
function CatchUp({ daily }: { daily: DailyWire }) {
  const ack = useGame((s) => s.dailyAck);
  const busy = useGame((s) => s.busy > 0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const c = daily.catchUp!;
  useEffect(() => {
    buttonRef.current?.focus();
  }, []);
  return (
    <div
      className={play.scrim}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !busy) void ack();
      }}
    >
      <div
        className={play.summary}
        role="dialog"
        aria-modal="true"
        aria-labelledby="catchup-title"
      >
        <h2 id="catchup-title" className={`px ${play.sumtitle}`}>
          While you were away
        </h2>
        {c.days.length > 0 && (
          <p className={play.sumwhen}>
            The farm ran on for {plural(c.days.length, 'day')} you did not open it.
          </p>
        )}
        {c.days.map((d) => (
          <section key={d.day} className={styles.awayday} aria-label={shortDate(d.date)}>
            <h3 className={`px ${play.minihead}`}>{shortDate(d.date)}</h3>
            {d.lines.length === 0 ? (
              <p className={play.sumwhen}>Nothing was recorded.</p>
            ) : (
              <ul className={play.sumfacts}>
                {d.lines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
        {c.report.length > 0 && (
          <section aria-label="Worker report" className={play.awaybox}>
            <h3 className={`px ${play.minihead}`}>What your hands did</h3>
            <ul className={play.awaylist}>
              {c.report.map((b) => (
                <li key={b.seq}>
                  <b>{b.who}:</b> {b.text}
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className={play.sumbtns}>
          <button
            ref={buttonRef}
            type="button"
            className="btn coral"
            disabled={busy}
            onClick={() => void ack()}
          >
            Start today
          </button>
        </div>
      </div>
    </div>
  );
}

/** Do one or all of the plan moves that are due, one after the other, each as an ordinary job the player has just confirmed. */
function useRunPlan(): (moves: PlanDueWire[]) => Promise<void> {
  const startAct = useGame((s) => s.startAct);
  const confirmAct = useGame((s) => s.confirmAct);
  return async (moves) => {
    for (const m of moves) {
      const slot = `plan-due-${m.mob}`;
      await startAct(slot, `Move ${m.mobName} to ${m.to}`, {
        type: 'resumePlan',
        mob: m.mob,
        step: m.step,
      });
      if (useGame.getState().acts[slot]?.phase !== 'confirm') return;
      await confirmAct(slot);
    }
  };
}

/** The plan card (PRD 5.15): what the plan said to do today, with Yes and Not yet. */
function PlanCard({ due, onLater }: { due: PlanDueWire[]; onLater: () => void }) {
  const busy = useGame((s) => s.busy > 0);
  const run = useRunPlan();
  return (
    <div className={styles.plancard} role="group" aria-label="Grazing plan">
      {due.map((m) => (
        <p key={m.mob}>{m.text}</p>
      ))}
      <p className={styles.ask}>
        {due.length === 1 ? 'Would you like to do that now?' : 'Would you like to do these now?'}
      </p>
      <div className={styles.cardbtns}>
        <button type="button" className="btn coral" disabled={busy} onClick={() => void run(due)}>
          {due.length === 1 ? 'Yes' : 'Yes, run today’s plan'}
        </button>
        <button type="button" className="btn ghost" onClick={onLater}>
          Not yet
        </button>
      </div>
    </div>
  );
}

/** What "Not yet" leaves: a strip along the bottom, with a Move button for each move still due. */
function PlanStrip({ due }: { due: PlanDueWire[] }) {
  const busy = useGame((s) => s.busy > 0);
  const run = useRunPlan();
  return (
    <div className={styles.planstrip} role="group" aria-label="Grazing plan moves due">
      {due.map((m) => (
        <div key={m.mob} className={styles.striprow}>
          <span>
            {m.mobName} to {m.to}
          </span>
          <button
            type="button"
            className="btn sm"
            disabled={busy}
            onClick={() => void run([m])}
          >
            Move
          </button>
        </div>
      ))}
      {due.length > 1 && (
        <button type="button" className="btn sm" disabled={busy} onClick={() => void run(due)}>
          Run today’s plan
        </button>
      )}
    </div>
  );
}

/** What a Daily Farm puts over the farm: the waiting note, the catch-up, and the plan card or strip. */
export function DailyOverlay({ snapshot }: { snapshot: Snapshot }) {
  const daily = snapshot.daily;
  const [later, setLater] = useState(false);
  if (!daily) return null;
  const due = daily.planDue;
  return (
    <>
      {daily.waiting && (
        <p className={styles.waiting} role="status">
          {daily.waiting}
        </p>
      )}
      {daily.catchUp && <CatchUp daily={daily} />}
      {!daily.catchUp && due.length > 0 && !later && (
        <PlanCard due={due} onLater={() => setLater(true)} />
      )}
      {!daily.catchUp && due.length > 0 && later && <PlanStrip due={due} />}
    </>
  );
}
