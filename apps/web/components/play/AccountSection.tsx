'use client';

import Link from 'next/link';
import { useState } from 'react';
import { authApi } from '@/lib/auth/api';
import { goTo } from '@/lib/auth/nav';
import { useMe } from '@/lib/auth/store';
import { clearAllLastFarms } from '@/lib/game/offline';
import { useGame } from '@/lib/game/store';
import styles from './play.module.css';

/**
 * The account part of the More tab. Nothing at all when sign-in is not set up (the sign-in page
 * says so in a plain line). A guest is told, once and plainly, that the farm is kept on this
 * device only, with the way to make an account.
 */
export function AccountSection() {
  const me = useMe((s) => s.me);
  const showPicker = useGame((s) => s.showPicker);
  const busy = useGame((s) => s.busy > 0);
  const [out, setOut] = useState<'idle' | 'working' | 'failed'>('idle');
  if (!me || !me.accounts) return null;

  const signOut = async (): Promise<void> => {
    setOut('working');
    try {
      await authApi.signOut(false);
      // This browser forgets the farm it kept for this player.
      clearAllLastFarms();
      goTo('/');
    } catch {
      setOut('failed');
    }
  };

  return (
    <section aria-labelledby="account-title" className={styles.stack}>
      <h3 id="account-title" className={`px ${styles.minihead}`}>
        Account
      </h3>
      {me.signedIn && !me.needsSignUp ? (
        <>
          <p>
            Signed in as <b>{me.username}</b>.
          </p>
          <div className={styles.jobbtns}>
            <button type="button" className="btn" disabled={busy} onClick={() => void showPicker()}>
              Your farms
            </button>
            <Link href="/account" className="btn ghost">
              Your account
            </Link>
            <button
              type="button"
              className="btn ghost"
              disabled={out === 'working'}
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </div>
          {out === 'failed' && (
            <p className="muted" role="alert">
              Could not sign you out just now. Try again in a moment.
            </p>
          )}
        </>
      ) : me.signedIn ? (
        <>
          <p>Your sign-in is not finished yet.</p>
          <div className={styles.jobbtns}>
            <Link href="/sign-up/finish" className="btn coral">
              Finish setting up
            </Link>
          </div>
        </>
      ) : (
        <>
          <p>
            You are playing as a guest. Your farm is kept on this device only. Make an account to
            keep it safe and play on any device.
          </p>
          <div className={styles.jobbtns}>
            <Link href="/sign-in" className="btn coral">
              Sign in or make an account
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
