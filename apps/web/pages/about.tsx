import type { PageConfig } from 'next';
import Link from '@/components/site/SiteLink';
import { DISTRICTS, DISTRICT_IDS, MIN_ACCOUNT_AGE } from '@gg/shared';
import { PageShell } from '@/components/site/PageShell';
import styles from '@/components/site/site.module.css';
import { siteSwitchOn } from '@/lib/site';

// No JavaScript is sent to the browser for this page.
export const config: PageConfig = { unstable_runtimeJS: false };

export default function AboutPage() {
  const signupsOn = siteSwitchOn('signups_open');
  return (
    <PageShell
      path="/about"
      heading="About"
      subtitle="A grazing game that tries to be right about the grass."
    >
      <div className={styles.prose}>
        <h2>What it is</h2>
        <p>
          The Grazing Game lets you run a grazing business on your phone or PC. You choose a
          district, set up paddocks, fences and water, buy and sell stock, and see what your
          decisions do to the pasture, the animals and the bank balance.
        </p>
        <p>
          It is free to play. Press Play free and you start a farm, with no sign-up.
          {signupsOn ? ` You need to be ${MIN_ACCOUNT_AGE} or older to make an account.` : ''}
        </p>

        <h2>Why it is built this way</h2>
        <p>
          The point is to show what real grazing decisions do. So the game uses real Australian
          figures: pasture in kg DM/ha, growth that follows each district&rsquo;s seasons, intake as
          a share of live weight, condition scores from 1 to 5, and stocking rate in AE and DSE
          against carrying capacity. If something looks wrong to a grazier, we count it as a bug.
        </p>
        <p>
          The game describes and does not judge. A paddock is labelled Green, Mixed, Dry &amp; rank
          or Short, and warnings say why stock are losing weight. What to do about it is your call.
        </p>

        <h2>Where the data comes from</h2>
        <p>
          A real-year farm plays on that year&rsquo;s real weather and cattle prices. The four
          districts are{' '}
          {DISTRICT_IDS.map((id, i) => (
            <span key={id}>
              {DISTRICTS[id].name}
              {i < DISTRICT_IDS.length - 2 ? ', ' : i === DISTRICT_IDS.length - 2 ? ' and ' : ''}
            </span>
          ))}
          .
        </p>
        <ul>
          <li>
            <strong>Prices:</strong> Meat &amp; Livestock Australia saleyard price indicators.
          </li>
          <li>
            <strong>Weather:</strong> rain and evaporation from the SILO climate database, which is
            built from Bureau of Meteorology observations.
          </li>
          <li>
            <strong>Past prices in today&rsquo;s dollars:</strong> the Australian Bureau of
            Statistics Consumer Price Index.
          </li>
        </ul>
        <p className={styles.credit}>
          Reproduced courtesy of Meat &amp; Livestock Australia Limited &ndash; www.mla.com.au.
        </p>
        <p className={styles.credit}>
          Climate data: SILO, Queensland Government (&copy; State of Queensland), CC BY 4.0, built
          from Bureau of Meteorology observations. The data has been reformatted, and soil water and
          pasture growth figures are worked out from it by The Grazing Game.
        </p>
        <p className={styles.credit}>
          Source: Australian Bureau of Statistics, Consumer Price Index, Australia. The table has
          been reformatted.
        </p>

        <h2>What it is not</h2>
        <p>
          It is a game. It simplifies a lot, and your own country, stock and season will differ.
          Please do not use it as advice for running a real farm.
        </p>

        <h2>Read more</h2>
        <ul>
          {siteSwitchOn('purchases') ? (
            <li>
              <Link href="/pricing">Pricing</Link>
            </li>
          ) : null}
          <li>
            <Link href="/privacy">Privacy</Link>, <Link href="/terms">terms of use</Link> and{' '}
            <Link href="/community-rules">community rules</Link>
          </li>
          <li>
            <Link href="/advertise">Advertise</Link>
          </li>
        </ul>
        <p style={{ marginTop: 24 }}>
          <Link href="/play" className="btn coral big">
            Play free
          </Link>
        </p>
      </div>
    </PageShell>
  );
}
