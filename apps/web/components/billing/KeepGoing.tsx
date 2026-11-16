'use client';

import { useEffect, useState } from 'react';
import { billingApi, goToCheckout, type OfferAnswer } from './api';
import styles from './billing.module.css';

/**
 * The keep-going offer on the game-over card. It shows only when the server has an offer for this
 * farm, which needs purchases on, the product on and the game able to apply it. It states the
 * charge and every change the rescue makes, and asks before leaving for Stripe. The words come from
 * the server, so the card can only ever say what the rescue does.
 */
export function KeepGoing() {
  const [offer, setOffer] = useState<OfferAnswer['offer']>(null);
  const [asking, setAsking] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    // The farm that is open is the one the picker marks as current. A guest has none, and no offer.
    // Nothing is asked of the game unless the store is open at all.
    billingApi
      .store()
      .then((st) =>
        st.selling && st.signedIn
          ? fetch('/api/game/farms', { cache: 'no-store', credentials: 'same-origin' })
          : null,
      )
      .then((r) => (r && r.ok ? r.json() : null))
      .then((f: { farms?: { id: string; current: boolean }[] } | null) => {
        const id = f?.farms?.find((x) => x.current)?.id;
        return id ? billingApi.offer(id) : null;
      })
      .then(
        (o) => {
          if (live && o) setOffer(o.offer);
        },
        () => undefined,
      );
    return () => {
      live = false;
    };
  }, []);

  if (!offer) return null;

  const pay = async (): Promise<void> => {
    setWorking(true);
    setError(null);
    try {
      const out = await billingApi.buy(offer.productId, offer.farmId);
      goToCheckout(out.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Nothing was charged.');
      setWorking(false);
      setAsking(false);
    }
  };

  return (
    <section className={styles.item} aria-label="Keep this farm going">
      <h3 className={`px ${styles.name}`}>Keep this farm going</h3>
      <p className={styles.price}>{offer.priceText}</p>
      <ul className={styles.gives}>
        {offer.does.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {!asking ? (
        <div className={styles.row}>
          <button type="button" className="btn" onClick={() => setAsking(true)}>
            Keep going for {offer.priceText.split(',')[0]}
          </button>
        </div>
      ) : (
        <div role="alertdialog" aria-label="Keep this farm going">
          <p className={styles.confirm}>
            Pay {offer.priceText} to keep {offer.farmName} going, with exactly the changes above?
            You pay on Stripe&apos;s own page.
          </p>
          <div className={styles.row}>
            <button
              type="button"
              className="btn coral"
              disabled={working}
              onClick={() => void pay()}
            >
              {working ? 'Going to Stripe' : 'Yes, go to Stripe'}
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={working}
              onClick={() => setAsking(false)}
            >
              Not now
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className={styles.bad} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
