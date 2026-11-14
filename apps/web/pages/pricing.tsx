import type { PageConfig } from 'next';
import Link from '@/components/site/SiteLink';
import { FARM_LIMITS } from '@gg/shared';
import { PageShell } from '@/components/site/PageShell';
import styles from '@/components/site/site.module.css';
import { PACK_PERKS, PRICES, priceText } from '@/lib/pricing';
import { siteSwitchOn } from '@/lib/site';

// No JavaScript is sent to the browser for this page.
export const config: PageConfig = { unstable_runtimeJS: false };

/** How many farms a plan holds, naming Daily Farm only when that mode is switched on. */
function farms(limits: { daily: number; fast: number }, dailyOn: boolean): string {
  return dailyOn
    ? `${limits.daily} Daily Farms and ${limits.fast} Fast Farms`
    : `${limits.fast} Fast Farms`;
}

export default function PricingPage() {
  const purchasesOn = siteSwitchOn('purchases');
  const dailyOn = siteSwitchOn('daily_farm');
  return (
    <PageShell
      path="/pricing"
      heading="Pricing"
      subtitle="The game is free to play. Here is what that means today."
    >
      <section aria-labelledby="free" className={styles.section} style={{ paddingTop: 0 }}>
        <h2 id="free" className={`px ${styles.h2}`}>
          Free
        </h2>
        <div className={`card ${styles.card}`} style={{ maxWidth: 520 }}>
          <p className={styles.price}>A$0</p>
          <ul className={styles.ticks}>
            <li>Fast Farm, in all four districts</li>
            <li>Play on your phone or PC, with nothing to download</li>
            <li>No sign-up. Press Play free and start a farm</li>
          </ul>
        </div>
        <p className={`${styles.lead} muted`} style={{ marginTop: 16 }}>
          {purchasesOn
            ? 'The game is free to play. The packs below are optional, and nothing that gives an edge in play is sold.'
            : 'Nothing in the game is for sale today. If that changes, nothing that gives an edge in play will be sold.'}
        </p>
      </section>

      {purchasesOn ? (
        <section aria-labelledby="packs" className={styles.section}>
          <h2 id="packs" className={`px ${styles.h2}`}>
            Packs
          </h2>
          <p className={`${styles.lead} muted`} style={{ marginBottom: 16 }}>
            One-off purchases, not subscriptions. Prices are in Australian dollars with GST
            included.
          </p>
          <ul className={styles.cards}>
            <li className={`card ${styles.card}`}>
              <h3 className="px">Free account</h3>
              <p className={styles.price}>A$0</p>
              <ul className={styles.ticks}>
                <li>{farms(FARM_LIMITS.free, dailyOn)}</li>
              </ul>
            </li>
            <li className={`card ${styles.card}`}>
              <h3 className="px">Farm pack</h3>
              <p className={styles.price}>{priceText(PRICES.farmPack)}</p>
              <ul className={styles.ticks}>
                <li>{farms(FARM_LIMITS.pack, dailyOn)}</li>
                {PACK_PERKS.map((perk) => (
                  <li key={perk}>{perk}</li>
                ))}
              </ul>
            </li>
            <li className={`card ${styles.card}`}>
              <h3 className="px">Farm pack, no ads</h3>
              <p className={styles.price}>{priceText(PRICES.farmPackNoAds)}</p>
              <ul className={styles.ticks}>
                <li>Everything in the Farm pack</li>
                <li>No banners or videos</li>
                <li>{priceText(PRICES.upgradeToNoAds)} to upgrade from the Farm pack</li>
              </ul>
            </li>
          </ul>
          <p className={`${styles.note} muted`} style={{ marginTop: 16 }}>
            Nothing that gives an edge in play is for sale. Packs add farms and extras around the
            game.
          </p>
        </section>
      ) : null}

      {purchasesOn ? (
        <section aria-labelledby="keepgoing" className={styles.section}>
          <h2 id="keepgoing" className={`px ${styles.h2}`}>
            Paying to keep going
          </h2>
          <div className={styles.prose}>
            <p>
              If a farm reaches game over, you can pay to keep it going. Stock are sold to clear the
              debt first, then the farm goes back to modest funds. The offer shows exactly what you
              keep and what you get before you pay.
            </p>
          </div>
          <div className={styles.tablewrap} style={{ marginTop: 16, maxWidth: 520 }}>
            <table className={styles.table} style={{ minWidth: 0 }}>
              <caption>Price to keep a farm going</caption>
              <thead>
                <tr>
                  <th scope="col">Farm</th>
                  <th scope="col">Price</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Fast Farm</th>
                  <td>{priceText(PRICES.keepGoingFast)}</td>
                </tr>
                {(dailyOn ? PRICES.keepGoingDaily : []).map((row) => (
                  <tr key={row.label}>
                    <th scope="row">Daily Farm, {row.label.toLowerCase()}</th>
                    <td>{priceText(row.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section aria-labelledby="start" className={styles.section}>
        <h2 id="start" className="sr-only">
          Start
        </h2>
        <Link href="/play" className="btn coral big">
          Play free
        </Link>
      </section>
    </PageShell>
  );
}
