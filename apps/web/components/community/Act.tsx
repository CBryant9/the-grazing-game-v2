'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import styles from './community.module.css';
import { useSend } from './send';

/**
 * A button that sends one change and shows the answer right beside it. With `confirm` it asks first
 * in plain words (Yes / No), because it is hard to undo (block, delete, remove).
 * `after` is where to go once it worked (`refresh` stays on the page and reloads what it shows).
 */
export function Act({
  path,
  body,
  label,
  working,
  confirm,
  after = 'refresh',
  tone,
}: {
  path: string;
  body: Record<string, unknown>;
  label: string;
  working?: string;
  confirm?: string;
  after?: 'refresh' | string;
  tone?: 'danger' | 'ghost' | 'coral';
}) {
  const router = useRouter();
  const { busy, message, send } = useSend();
  const [asking, setAsking] = useState(false);
  const cls = `btn ${tone === 'coral' ? 'coral' : tone === 'danger' ? styles.danger : 'ghost'}`;

  const go = async (): Promise<void> => {
    setAsking(false);
    const r = await send(path, body);
    if (r.ok) {
      if (after === 'refresh') router.refresh();
      else router.push(after);
    }
  };

  if (asking) {
    return (
      <span className={styles.confirm} role="group" aria-label="Are you sure?">
        <span className={styles.confirmtext}>{confirm}</span>
        <button type="button" className={`btn ${styles.danger}`} onClick={() => void go()}>
          Yes
        </button>
        <button type="button" className="btn ghost" onClick={() => setAsking(false)}>
          No
        </button>
      </span>
    );
  }
  return (
    <span className={styles.actwrap}>
      <button
        type="button"
        className={cls}
        disabled={busy}
        onClick={() => (confirm ? setAsking(true) : void go())}
      >
        {busy ? (working ?? 'Working...') : label}
      </button>
      {message && (
        <span role="alert" className={styles.err}>
          {message}
        </span>
      )}
    </span>
  );
}
