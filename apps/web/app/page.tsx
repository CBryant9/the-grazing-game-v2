import Link from 'next/link';
import { DISTRICTS, DISTRICT_IDS, MODES, SITE } from '@gg/shared';
import { SiteHeader } from '@/components/SiteHeader';
import styles from './page.module.css';

// The landing page shell. The full sales page is built in Stage 5 (BUILD_PLAN 5.4).
export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main id="main">
        <section className={styles.hero}>
          <div className="wrap">
            <h1 className={`display ${styles.title}`}>
              The Grazing <span className={styles.coral}>Game</span>
            </h1>
            <p className={styles.tagline}>{SITE.tagline}</p>
            <div className={styles.cta}>
              <Link href="/play" className="btn coral big">
                Play free
              </Link>
            </div>
            <p className={`muted ${styles.note}`}>
              Free to play on your phone or PC. Nothing to download.
            </p>
          </div>
        </section>

        <section className="wrap" aria-labelledby="ways">
          <h2 id="ways" className={`px ${styles.h2}`}>
            Two ways to play
          </h2>
          <ul className={styles.cards}>
            <li className={`card ${styles.cardItem}`}>
              <h3 className="px">{MODES.daily.name}</h3>
              <p className="muted">
                One day a day. Check in at first light and make your moves before dark.
              </p>
            </li>
            <li className={`card ${styles.cardItem}`}>
              <h3 className="px">{MODES.fast.name}</h3>
              <p className="muted">
                Play at your own pace through real years. Skip a season and see what your plan did.
              </p>
            </li>
            <li className={`card ${styles.cardItem}`}>
              <h3 className="px">Real country</h3>
              <p className="muted">
                Grass that grows in its season, stock that gain on green feed, real prices and real
                weather.
              </p>
            </li>
          </ul>
        </section>

        <section className="wrap" aria-labelledby="districts">
          <h2 id="districts" className={`px ${styles.h2}`}>
            Four districts
          </h2>
          <ul className={styles.districts}>
            {DISTRICT_IDS.map((id) => (
              <li key={id} className="badge">
                {DISTRICTS[id].name}
              </li>
            ))}
          </ul>
        </section>
      </main>
      <footer className={styles.footer}>
        <div className="wrap">
          <p className="muted">{SITE.name}. Built for Australian graziers.</p>
        </div>
      </footer>
    </>
  );
}
