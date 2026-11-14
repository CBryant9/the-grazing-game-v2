'use client';

import { useEffect, useState } from 'react';
import accountStyles from '../account/account.module.css';
import { billingApi, type MyPurchase } from './api';
import styles from './billing.module.css';

const STATE_WORDS: Record<MyPurchase['status'], string> = {
  pending: 'Waiting for payment',
  paid: 'Paid',
  refunded: 'Refunded',
  disputed: 'Held while a payment dispute is open',
};

const day = new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeZone: 'Australia/Sydney' });

/** "Your purchases" on the account page: what was bought, when, and Stripe's receipt if it has one. Nothing when there are none. */
export function YourPurchases() {
  const [list, setList] = useState<MyPurchase[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    billingApi.mine().then(
      (m) => setList(m.purchases),
      () => setList([]),
    );
  }, []);

  if (!list || list.length === 0) return null;

  const receipt = async (id: string): Promise<void> => {
    setNote(null);
    try {
      const r = await billingApi.receipt(id);
      if (r.url) window.open(r.url, '_blank', 'noopener,noreferrer');
      else setNote('Stripe has no receipt page for that one.');
    } catch {
      setNote('The receipt could not be fetched just now. Try again in a moment.');
    }
  };

  return (
    <div className={accountStyles.card}>
      <h2 className={`px ${accountStyles.label}`}>Your purchases</h2>
      <ul className={styles.history}>
        {list.map((p) => (
          <li key={p.id}>
            <span>
              <b>{p.product}</b>, A${(p.amountCents / 100).toFixed(2)}, GST included
            </span>
            <span className={styles.muted}>
              {STATE_WORDS[p.status]}
              {p.paidAt ? `, ${day.format(new Date(p.paidAt))}` : ''}
            </span>
            {p.canReceipt && (
              <span>
                <button type="button" className="btn ghost" onClick={() => void receipt(p.id)}>
                  Receipt
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {note && (
        <p className={styles.muted} role="status">
          {note}
        </p>
      )}
    </div>
  );
}
