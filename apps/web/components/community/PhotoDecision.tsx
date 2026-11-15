'use client';

import { useRouter } from 'next/navigation';
import styles from './community.module.css';
import { useSend } from './send';

/**
 * Approve or reject one photo in the admin queue. It sends back the exact file the page showed (its
 * id, change time and version), so the database approves only that file and refuses if it changed.
 */
export function PhotoDecision({
  kind,
  row,
  objectId,
  updatedAt,
  version,
}: {
  kind: 'post_photo' | 'avatar';
  row: string;
  objectId: string;
  updatedAt: string;
  version: string | null;
}) {
  const router = useRouter();
  const { busy, message, send } = useSend();
  const go = async (decision: 'approve' | 'reject'): Promise<void> => {
    const r = await send('/api/admin/photos', {
      kind,
      row,
      objectId,
      updatedAt,
      version,
      decision,
    });
    if (r.ok) router.refresh();
  };
  return (
    <div className={styles.row}>
      <button
        type="button"
        className="btn coral"
        disabled={busy}
        onClick={() => void go('approve')}
      >
        Approve
      </button>
      <button type="button" className="btn ghost" disabled={busy} onClick={() => void go('reject')}>
        Reject
      </button>
      {message && (
        <span role="alert" className={styles.err}>
          {message}
        </span>
      )}
    </div>
  );
}
