'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cardLines, doneLines } from '@/lib/game/format';
import type { JobCardWire } from '@/lib/game/types';
import styles from './play.module.css';

export interface JobBoxState {
  phase: 'previewing' | 'confirm' | 'applying' | 'done' | 'refused';
  card?: JobCardWire | undefined;
  message?: string | undefined;
}

interface JobBoxProps {
  title: string;
  job: JobBoxState;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onDismiss: () => void;
  cancelLabel?: string;
  /** Extra buttons beside Cancel, such as picking another paddock. */
  children?: ReactNode;
}

/**
 * The job card, shown right where the button was: the time it takes
 * (lightly), the cost or the money coming in, and the light left. Then
 * Confirm or Cancel. Then the result, right there. A refusal shows its plain
 * reason (CLAUDE.md, rule 6).
 */
export function JobBox(props: JobBoxProps) {
  const ref = useRef<HTMLDivElement>(null);
  const phase = props.job.phase;
  // Keep the job card in view where the button was: the sheet can shift when the card opens.
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest' });
  }, [phase]);
  return (
    <div ref={ref}>
      <Inner {...props} />
    </div>
  );
}

function Inner({
  title,
  job,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
  onDismiss,
  cancelLabel = 'Cancel',
  children,
}: JobBoxProps) {
  if (job.phase === 'previewing') {
    return (
      <p className={styles.todostatus} role="status">
        Checking
      </p>
    );
  }
  if (job.phase === 'confirm' || job.phase === 'applying') {
    return (
      <div className={styles.jobcard} role="group" aria-label={`${title}: job card`}>
        {job.card && (
          <ul className={styles.joblines}>
            {cardLines(job.card).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        )}
        <div className={styles.jobbtns}>
          <button
            type="button"
            className="btn sm coral"
            disabled={job.phase === 'applying' || busy}
            onClick={onConfirm}
          >
            {job.phase === 'applying' ? 'Working' : confirmLabel}
          </button>
          {children}
          <button
            type="button"
            className="btn sm ghost"
            disabled={job.phase === 'applying'}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    );
  }
  if (job.phase === 'done') {
    return (
      <div className={styles.jobresult} role="status">
        <p>{job.message}</p>
        {job.card && doneLines(job.card).length > 0 && (
          <p className="muted">{doneLines(job.card).join(' ')}</p>
        )}
        <button type="button" className="btn sm ghost" onClick={onDismiss}>
          OK
        </button>
      </div>
    );
  }
  return (
    <div className={styles.jobresult} role="alert">
      <p>{job.message}</p>
      {children}
      <button type="button" className="btn sm ghost" onClick={onDismiss}>
        OK
      </button>
    </div>
  );
}
