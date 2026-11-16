'use client';

import type { ReactNode } from 'react';
import { useGame } from '@/lib/game/store';
import { JobBox } from './JobBox';

/**
 * The job card for a job that was checked from a form (a buy, a sale, a
 * plan, a sowing). It shows where the player pressed: the card, Confirm and
 * Cancel, then the result. Confirm sends the job exactly as it was checked.
 * Shows nothing until a job is under way in this slot.
 */
export function ActJob({
  slot,
  title,
  confirmLabel,
  cancelLabel,
  children,
}: {
  slot: string;
  title: string;
  confirmLabel: string;
  /** What the Cancel button says, when "Cancel" would be unclear. */
  cancelLabel?: string;
  /** Extra buttons beside Cancel. */
  children?: ReactNode;
}) {
  const job = useGame((s) => s.acts[slot]);
  const busy = useGame((s) => s.busy > 0);
  const confirmAct = useGame((s) => s.confirmAct);
  const dismissAct = useGame((s) => s.dismissAct);
  if (!job) return null;
  return (
    <JobBox
      title={title}
      job={job}
      confirmLabel={confirmLabel}
      {...(cancelLabel ? { cancelLabel } : {})}
      busy={busy}
      onConfirm={() => void confirmAct(slot)}
      onCancel={() => dismissAct(slot)}
      onDismiss={() => dismissAct(slot)}
    >
      {children}
    </JobBox>
  );
}
