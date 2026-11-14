import type { Metadata } from 'next';
import Link from '@/components/site/SiteLink';
import { DISTRICTS, DISTRICT_IDS, MODES, SITE } from '@gg/shared';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';
import { FarmScene } from '@/components/site/FarmScene';
import { JsonLd } from '@/components/site/JsonLd';
import site from '@/components/site/site.module.css';
import { pageMetadata } from '@/lib/metadata';
import { absoluteUrl, siteSwitchOn } from '@/lib/site';
import styles from './page.module.css';

export const metadata: Metadata = pageMetadata('/');

/** Questions and answers. They are shown on the page and sent to search engines as the same text. */
const FAQ: { q: string; a: string }[] = [
  {
    q: 'Is it free?',
    a: 'Yes. You can play Fast Farm for free, on your phone or PC, with nothing to download.',
  },
  {
    q: 'Do I need to sign up?',
    a: 'No. Press Play free and you start a farm straight away. A farm you start without an account stays with the browser you started it in, and is removed if it goes unused for a long time.',
  },
  {
    q: 'Does it work on a phone?',
    a: 'Yes. It is built for phones first, in portrait and landscape, and it works the same on a PC. You can add it to your home screen from your browser.',
  },
  {
    q: 'How real is it?',
    a: 'Grass grows in the seasons it grows in for each district. Stock eat and gain according to the feed in front of them. Years can be real ones, with that year’s weather and cattle prices. The game tells you what is happening and why, but it is a game, not farm advice. Your own country will differ.',
  },
  {
    q: 'Does the game tell me how to graze?',
    a: 'No. It shows you what your choices did to the pasture and the stock, and lets you decide.',
  },
];

export default function LandingPage() {
  const dailyOn = siteSwitchOn('daily_farm');
  const sheepOn = siteSwitchOn('sheep');
  const communityOn = siteSwitchOn('community');
  const leaderboardsOn = siteSwitchOn('leaderboards');

  return (
    <>
      <SiteHeader current="/" />
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
              <a href="#how" className="btn ghost big">
                How a day works
              </a>
            </div>
            <p className={`muted ${styles.note}`}>
              Free to play on your phone or PC. Nothing to download. No sign-up.
            </p>
          </div>
        </section>
        <FarmScene className={styles.scene} />

        <section className="wrap" aria-labelledby="ways">
          <div className={site.section}>
            <h2 id="ways" className={`px ${site.h2}`}>
              What you can play
            </h2>
            <ul className={site.cards}>
              <li className={`card ${site.card}`}>
                <h3 className="px">{MODES.fast.name}</h3>
                <p className="muted">
                  Play at your own pace through a run of seasons. Skip ahead and see what your plan
                  did to the grass and the stock.
                </p>
              </li>
              <li className={`card ${site.card}`}>
                <h3 className="px">Real country</h3>
                <p className="muted">
                  Grass that grows in its season, stock that gain on green feed, and years with
                  their real weather and cattle prices.
                </p>
              </li>
              <li className={`card ${site.card}`}>
                <h3 className="px">Paddocks, fences and water</h3>
                <p className="muted">
                  Draw fences, run pipe, place troughs, set a grazing plan, grow a crop or let a
                  paddock fallow. Buy and sell at the saleyard on sale days.
                </p>
              </li>
              {dailyOn ? (
                <li className={`card ${site.card}`}>
                  <h3 className="px">{MODES.daily.name}</h3>
                  <p className="muted">
                    One day a day. Check in at first light and make your moves before dark.
                  </p>
                </li>
              ) : null}
              {sheepOn ? (
                <li className={`card ${site.card}`}>
                  <h3 className="px">Sheep and wool</h3>
                  <p className="muted">Run sheep as well as cattle, where they suit the country.</p>
                </li>
              ) : null}
              {leaderboardsOn ? (
                <li className={`card ${site.card}`}>
                  <h3 className="px">Leaderboards</h3>
                  <p className="muted">See how your farm compares with other graziers.</p>
                </li>
              ) : null}
              {communityOn ? (
                <li className={`card ${site.card}`}>
                  <h3 className="px">Community</h3>
                  <p className="muted">
                    Follow graziers, start a group with your mates and share your farm.
                  </p>
                </li>
              ) : null}
            </ul>
          </div>
        </section>

        <section className="wrap" aria-labelledby="how">
          <div className={site.section}>
            <h2 id="how" className={`px ${site.h2}`}>
              How a day works
            </h2>
            <ol className={site.steps}>
              <li className="card">
                <h3 className="px">Look</h3>
                <p className="muted">
                  Open any paddock, mob, price or map layer. Looking is free and takes no time. If
                  you only look, it stays first light.
                </p>
              </li>
              <li className="card">
                <h3 className="px">Decide</h3>
                <p className="muted">
                  Move a mob, fix a fence, run water, buy or sell, change a plan. Each job takes
                  part of the daylight and the game tells you what it costs before you confirm.
                </p>
              </li>
              <li className="card">
                <h3 className="px">Next day</h3>
                <p className="muted">
                  At last light the farm goes dark. Press Next day, or skip ahead, and read what
                  happened to the grass, the stock and the money.
                </p>
              </li>
            </ol>
          </div>
        </section>

        <section className="wrap" aria-labelledby="districts">
          <div className={site.section}>
            <h2 id="districts" className={`px ${site.h2}`}>
              Four districts
            </h2>
            <p className={`${site.lead} muted`} style={{ marginBottom: 14 }}>
              Each district has its own growing seasons, so the same plan gives different results in
              different country.
            </p>
            <ul className={site.pills}>
              {DISTRICT_IDS.map((id) => (
                <li key={id} className="badge">
                  {DISTRICTS[id].name}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="wrap" aria-labelledby="real">
          <div className={site.section}>
            <h2 id="real" className={`px ${site.h2}`}>
              What makes it realistic
            </h2>
            <ul className={site.cards}>
              <li className={`card ${site.card}`}>
                <h3 className="px">Real weather</h3>
                <p className="muted">
                  A real-year farm grows its grass on that district&rsquo;s real rain and
                  evaporation, from the SILO climate database.
                </p>
              </li>
              <li className={`card ${site.card}`}>
                <h3 className="px">Real prices</h3>
                <p className="muted">
                  Cattle prices come from Meat &amp; Livestock Australia saleyard indicators, so a
                  good year and a poor year look like they did.
                </p>
              </li>
              <li className={`card ${site.card}`}>
                <h3 className="px">Feed and stock</h3>
                <p className="muted">
                  Pasture is in kg DM/ha, with green and dry feed told apart. Intake and gain follow
                  the feed, the class of stock and the season. Stocking rate is shown in AE and DSE.
                </p>
              </li>
              <li className={`card ${site.card}`}>
                <h3 className="px">Reasons, not scolding</h3>
                <p className="muted">
                  When stock lose weight, the game says why: not enough feed, low energy, low
                  protein, milking or late pregnancy. Paddocks are labelled by what they look like:
                  Green, Mixed, Dry &amp; rank or Short.
                </p>
              </li>
            </ul>
            <p className={site.credit}>
              Reproduced courtesy of Meat &amp; Livestock Australia Limited &ndash; www.mla.com.au.
              Climate data: SILO, Queensland Government (&copy; State of Queensland), CC BY 4.0,
              built from Bureau of Meteorology observations. The data has been reformatted, and soil
              water and pasture growth figures are worked out from it by The Grazing Game.
            </p>
          </div>
        </section>

        <section className="wrap" aria-labelledby="faq">
          <div className={site.section}>
            <h2 id="faq" className={`px ${site.h2}`}>
              Questions
            </h2>
            <div className={site.faq}>
              {FAQ.map((item) => (
                <details key={item.q}>
                  <summary>{item.q}</summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="wrap" aria-labelledby="start">
          <div className={`${site.section} ${site.closing}`}>
            <h2 id="start" className={`px ${site.h2}`}>
              Ready?
            </h2>
            <p className={site.lead} style={{ marginBottom: 16 }}>
              Pick a district, start a farm and look around. It takes a minute.
            </p>
            <Link href="/play" className="btn coral big">
              Play free
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'WebSite',
              '@id': `${absoluteUrl('/')}#website`,
              name: SITE.name,
              url: absoluteUrl('/'),
              inLanguage: 'en-AU',
              description: SITE.description,
            },
            {
              '@type': 'VideoGame',
              name: SITE.name,
              url: absoluteUrl('/play'),
              description: SITE.description,
              genre: ['Simulation', 'Strategy'],
              applicationCategory: 'Game',
              gamePlatform: 'Web browser',
              operatingSystem: 'Any',
              playMode: 'SinglePlayer',
              inLanguage: 'en-AU',
              isAccessibleForFree: true,
              offers: { '@type': 'Offer', price: '0', priceCurrency: 'AUD' },
            },
            {
              '@type': 'FAQPage',
              mainEntity: FAQ.map((item) => ({
                '@type': 'Question',
                name: item.q,
                acceptedAnswer: { '@type': 'Answer', text: item.a },
              })),
            },
          ],
        }}
      />
    </>
  );
}
