'use client';

import { useEffect, useState } from 'react';
import { forgetInstallId } from '@/lib/analytics/beacon';
import styles from '@/components/account/account.module.css';

interface State {
  granted: boolean;
  canChange: boolean;
  who: 'account' | 'guest';
  reason: 'under_16' | null;
}

/**
 * The analytics consent control (milestone 5.3). Off until the person ticks it. For an account the
 * choice is kept with the account; for a guest, in a cookie on this browser. Under 16: off, and
 * the box can not be ticked.
 */
export function Consent() {
  const [s, setS] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    void fetch('/api/consent', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<State>) : null))
      .then(setS)
      .catch(() => setS(null));
  }, []);

  const change = async (granted: boolean): Promise<void> => {
    setBusy(true);
    setError(false);
    try {
      const r = await fetch('/api/consent', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ granted }),
      });
      if (!r.ok) throw new Error();
      setS((await r.json()) as State);
      if (!granted) forgetInstallId();
    } catch {
      setError(true);
    }
    setBusy(false);
  };

  if (!s) return null;
  return (
    <div className={styles.card}>
      <h2 className={`px ${styles.label}`}>Analytics</h2>
      {s.canChange ? (
        <label className={styles.small}>
          <input
            type="checkbox"
            checked={s.granted}
            disabled={busy}
            onChange={(e) => void change(e.target.checked)}
          />{' '}
          Count which parts of the game I use and how fast pages load for me
        </label>
      ) : (
        <p className={styles.small}>Analytics stays off for accounts under 16.</p>
      )}
      <p className={styles.small}>
        Off unless you tick it. It counts events such as a page opened or a day played, never what
        you type, your email or your name.{' '}
        {s.who === 'guest'
          ? 'Your choice is kept on this browser only.'
          : 'Your choice is kept with your account.'}{' '}
        You can change it at any time.
      </p>
      {error && (
        <p className={styles.bad} role="alert">
          That did not save. Try again in a moment.
        </p>
      )}
    </div>
  );
}
