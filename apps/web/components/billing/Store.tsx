'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import accountStyles from '../account/account.module.css';
import { billingApi, goToCheckout, type StoreAnswer } from './api';
import styles from './billing.module.css';

/**
 * The store. Nothing is shown to buy unless the server says it is selling (the purchases switch
 * is on, Stripe is connected and the product is on). Pressing Buy asks first, saying exactly what
 * is bought and the price; only Yes goes to Stripe's own page. No card detail is ever typed here.
 */
export function Store() {
  const [store, setStore] = useState<StoreAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    billingApi.store().then(setStore, (e: unknown) => {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setStore({ selling: false, signedIn: false, cannotBuy: null, items: [] });
    });
  }, []);

  if (!store) {
    return (
      <p className="muted" role="status">
        Loading
      </p>
    );
  }
  if (!store.selling) {
    return (
      <div className={accountStyles.card}>
        <p>Nothing is for sale today. The game is free to play.</p>
        {error && (
          <p className={styles.bad} role="alert">
            {error}
          </p>
        )}
        <Link href="/play" className={`btn coral ${accountStyles.linkbtn}`}>
          Back to the game
        </Link>
      </div>
    );
  }

  const buy = async (id: string): Promise<void> => {
    setWorking(true);
    setError(null);
    try {
      const out = await billingApi.buy(id);
      goToCheckout(out.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Nothing was charged.');
      setWorking(false);
      setAsking(null);
    }
  };

  return (
    <>
      <p className={styles.muted}>
        One-off payments in Australian dollars, GST included. Nothing here is a subscription, and
        nothing here gives an edge in play. You pay on Stripe&apos;s own page, so your card details
        never come to the game.
      </p>
      {store.cannotBuy && (
        <div className={accountStyles.card}>
          <p>{store.cannotBuy}</p>
          {!store.signedIn && (
            <Link href="/sign-in?next=%2Fstore" className={`btn coral ${accountStyles.linkbtn}`}>
              Sign in
            </Link>
          )}
        </div>
      )}
      {store.items.length === 0 && !store.cannotBuy && (
        <div className={accountStyles.card}>
          <p>You have everything that is for sale.</p>
        </div>
      )}
      <ul className={styles.list}>
        {store.items.map((item) => (
          <li key={item.id} className={styles.item}>
            <h2 className={`px ${styles.name}`}>{item.name}</h2>
            <p className={styles.price}>{item.priceText}</p>
            <ul className={styles.gives}>
              {item.gives.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
            {asking === item.id ? (
              <div role="alertdialog" aria-label={`Buy ${item.name}`}>
                <p className={styles.confirm}>{item.confirm}</p>
                <div className={styles.row}>
                  <button
                    type="button"
                    className="btn coral"
                    disabled={working}
                    onClick={() => void buy(item.id)}
                  >
                    {working ? 'Going to Stripe' : 'Yes, go to Stripe'}
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={working}
                    onClick={() => setAsking(null)}
                  >
                    Not now
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.row}>
                <button
                  type="button"
                  className="btn"
                  disabled={Boolean(store.cannotBuy) || working}
                  onClick={() => setAsking(item.id)}
                >
                  Buy
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p className={styles.bad} role="alert">
          {error}
        </p>
      )}
      <Link href="/play" className={`btn ghost ${accountStyles.linkbtn}`}>
        Back to the game
      </Link>
    </>
  );
}
