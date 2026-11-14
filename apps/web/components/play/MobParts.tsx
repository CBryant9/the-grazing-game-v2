'use client';

import { useId, type ReactNode } from 'react';
import { num } from '@/lib/game/format';
import { useGame } from '@/lib/game/store';
import type { MobWire, Snapshot } from '@/lib/game/types';
import { JobBox } from './JobBox';
import styles from './play.module.css';

/** The parts the cattle and sheep mob cards share. */

export const signed = (n: number, places: number): string =>
  `${n > 0 ? '+' : n < 0 ? '-' : ''}${num(Math.abs(n), places)}`;

export function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** One husbandry button, with its reason beside it when it is off, and its job card under it. */
export function Job({
  slot,
  label,
  reason,
  hint,
  onStart,
  confirmLabel,
  children,
}: {
  slot: string;
  label: string;
  /** Why the button is off, or null. */
  reason: string | null;
  hint?: string | null;
  onStart: () => void;
  confirmLabel: string;
  children?: ReactNode;
}) {
  const job = useGame((s) => s.acts[slot]);
  const busy = useGame((s) => s.busy > 0);
  const confirmAct = useGame((s) => s.confirmAct);
  const dismissAct = useGame((s) => s.dismissAct);
  const reasonId = useId();
  return (
    <li className={styles.hrow}>
      {!job && (
        <div className={styles.hbtn}>
          <button
            type="button"
            className="btn sm"
            disabled={reason !== null}
            aria-describedby={reason ? reasonId : undefined}
            onClick={onStart}
          >
            {label}
          </button>
          {reason ? (
            <p id={reasonId} className={styles.hreason}>
              {reason}
            </p>
          ) : (
            hint && <p className={styles.hhint}>{hint}</p>
          )}
        </div>
      )}
      {!job && children}
      {job && (
        <JobBox
          title={label}
          job={job}
          confirmLabel={confirmLabel}
          busy={busy}
          onConfirm={() => void confirmAct(slot)}
          onCancel={() => dismissAct(slot)}
          onDismiss={() => dismissAct(slot)}
        />
      )}
    </li>
  );
}

/** Where the mob is, as words. */
export function WhereLine({ mob, snapshot }: { mob: MobWire; snapshot: Snapshot }) {
  const openPaddock = useGame((s) => s.openPaddock);
  if (mob.where === 'yards') return <span>In the stock yards</span>;
  if (mob.where === 'lot') return <span>In the feedlot</span>;
  const p = snapshot.paddocks.find((x) => x.mobs.includes(mob.id));
  if (!p) return <span>{mob.area ?? 'On pasture'}</span>;
  return (
    <button type="button" className={styles.linkbtn} onClick={() => openPaddock(p.id)}>
      {p.name}
    </button>
  );
}
