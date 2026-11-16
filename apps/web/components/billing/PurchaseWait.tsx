'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import accountStyles from '../account/account.module.css';
import { billingApi } from './api';
import styles from './billing.module.css';

type View =
  | { state: 'waiting'; product: string | null }
  | { state: 'paid'; product: string }
  | { state: 'held'; product: string }
  | { state: 'unknown' };

/**
 * The page Stripe sends the buyer back to. It does not decide anything: it shows what the server
 * holds, which is what the webhook wrote. Until the webhook arrives it says the purchase is being
 * confirmed, and asks the server again every few seconds for about a minute.
 */
export function PurchaseWait() {
  const [view, setView] = useState<View>({ state: 'waiting', product: null });
  const [giveUp, setGiveUp] = useState(false);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('purchase') ?? '';
    let stop = false;
    let tries = 0;
    const look = async (): Promise<void> => {
      if (stop) return;
      tries++;
      try {
        const s = await billingApi.status(id);
        if (stop) return;
        if (s.status === 'paid') return setView({ state: 'paid', product: s.product });
        if (s.status === 'refunded' || s.status === 'disputed' || s.status === 'failed') {
          return setView({ state: 'held', product: s.product });
        }
        setView({ state: 'waiting', product: s.product });
      } catch {
        if (stop) return;
        setView({ state: 'unknown' });
        return;
      }
      if (tries >= 20) setGiveUp(true);
      else setTimeout(() => void look(), 3000);
    };
    void look();
    return () => {
      stop = true;
    };
  }, []);

  return (
    <div className={accountStyles.card} role="status" aria-live="polite">
      {view.state === 'waiting' && (
        <>
          <p>Thanks. Your purchase is being confirmed.</p>
          <p className={styles.muted}>
            This can take a minute.{' '}
            {giveUp
              ? 'It is taking longer than usual. Nothing is lost: it will show on your account page when it comes through.'
              : 'This page checks again by itself.'}
          </p>
        </>
      )}
      {view.state === 'paid' && (
        <p>
          Your purchase is confirmed: <b>{view.product}</b>. It is on your account now.
        </p>
      )}
      {view.state === 'held' && (
        <p>
          This purchase ({view.product}) is not active on your account. If you think that is wrong,
          check your purchases on the account page.
        </p>
      )}
      {view.state === 'unknown' && (
        <p>
          We could not find that purchase. If you were charged, it will show on your account page
          when it comes through.
        </p>
      )}
      <div className={styles.row}>
        <Link href="/play" className={`btn coral ${accountStyles.linkbtn}`}>
          Back to the game
        </Link>
        <Link href="/account" className={`btn ghost ${accountStyles.linkbtn}`}>
          Your account
        </Link>
      </div>
    </div>
  );
}
