'use client';

import type { Snapshot } from '@/lib/game/types';
import { clockText, dateText, lightNote, money, num } from '@/lib/game/format';
import { useGame } from '@/lib/game/store';
import { ThemeToggle } from '@/components/ThemeToggle';
import { HelpButton } from './HelpPanel';
import styles from './play.module.css';

/** The daylight bar: slim, with a short note. Light, not a countdown. */
export function DaylightBar({ clock }: { clock: Snapshot['clock'] }) {
  const span = Math.max(1, clock.lastLight - clock.firstLight);
  const pos = (minutes: number): number =>
    Math.min(100, Math.max(0, ((minutes - clock.firstLight) / span) * 100));
  const note = lightNote(clock.leftMin, clock.evening);
  return (
    <div className={styles.daylight}>
      <div
        className={styles.dltrack}
        role="img"
        aria-label={`Daylight from ${clockText(clock.firstLight)} to ${clockText(clock.lastLight)}. ${note}.`}
      >
        <span className={styles.dlused} style={{ width: `${pos(clock.now)}%` }} />
        <span className={styles.dlmark} style={{ left: `${pos(clock.now)}%` }} />
      </div>
      <p className={styles.dlnote}>{note}</p>
    </div>
  );
}

/** Next day, +1 week, +1 month, +1 year (PRD 5.3). */
export function TimeButtons() {
  const busy = useGame((s) => s.busy > 0);
  const over = useGame((s) => s.snapshot?.over != null);
  const evening = useGame((s) => s.snapshot?.clock.evening ?? false);
  const nextDay = useGame((s) => s.nextDay);
  const skip = useGame((s) => s.skip);
  const off = busy || over;
  return (
    <div className={styles.times} role="group" aria-label="Move time on">
      <button
        type="button"
        className={`btn sm ${evening && !over ? `coral ${styles.invite}` : ''}`}
        disabled={off}
        onClick={() => void nextDay()}
      >
        Next day
      </button>
      <button type="button" className="btn sm" disabled={off} onClick={() => void skip('week')}>
        +1 week
      </button>
      <button type="button" className="btn sm" disabled={off} onClick={() => void skip('month')}>
        +1 month
      </button>
      <button type="button" className="btn sm" disabled={off} onClick={() => void skip('year')}>
        +1 year
      </button>
    </div>
  );
}

/** The top of the game: farm, date, season, cash, the daylight bar and the time buttons. */
export function TopBar({ snapshot }: { snapshot: Snapshot }) {
  const busy = useGame((s) => s.busy > 0);
  const { farm, date, season, totals, clock } = snapshot;
  return (
    <header className={styles.top} aria-busy={busy}>
      <div className={styles.topname}>
        <h1 className={`px ${styles.fname}`}>{farm.name}</h1>
        <p className={styles.sub}>
          {dateText(date)}
          <span aria-hidden="true"> · </span>
          <span className={styles.season}>{season}</span>
          <span aria-hidden="true"> · </span>
          {num(totals.head)} head
        </p>
      </div>
      <p className={styles.cash} aria-label={`Cash ${money(totals.cash)}`}>
        <span className={styles.cashlabel}>Cash</span> {money(totals.cash)}
      </p>
      <div className={styles.topdl}>
        <DaylightBar clock={clock} />
      </div>
      <div className={styles.toptimes}>
        <TimeButtons />
      </div>
      <div className={styles.topextra}>
        <HelpButton />
        <span className={styles.themeslot}>
          <ThemeToggle />
        </span>
      </div>
      {busy && <span className={styles.busybar} role="status" aria-label="Working" />}
    </header>
  );
}
