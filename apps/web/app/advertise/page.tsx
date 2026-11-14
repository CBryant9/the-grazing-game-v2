import type { Metadata } from 'next';
import { AD_SLOTS } from '@gg/shared';
import { PageShell } from '@/components/site/PageShell';
import styles from '@/components/site/site.module.css';
import { AD_SLOT_INFO } from '@/lib/adSlotInfo';
import { pageMetadata } from '@/lib/metadata';
import { contactEmail, siteSwitchOn } from '@/lib/site';

export const metadata: Metadata = pageMetadata('/advertise');

export default function AdvertisePage() {
  const email = contactEmail();
  // Only the places that exist are listed (see lib/adSlotInfo.ts).
  const slots = AD_SLOTS.filter((id) => {
    const needs = AD_SLOT_INFO[id].needs;
    return needs === null || siteSwitchOn(needs);
  });
  return (
    <PageShell
      path="/advertise"
      heading="Advertise"
      subtitle="Put your business in front of people who play a grazing game."
    >
      <section aria-labelledby="who" className={styles.section} style={{ paddingTop: 0 }}>
        <h2 id="who" className={`px ${styles.h2}`}>
          Who plays
        </h2>
        <div className={styles.prose}>
          <p>
            The Grazing Game is a free browser game for Australian graziers and anyone who wants to
            see what grazing decisions do to pasture, stock and money.
          </p>
          <p>
            No ads are running today. When the game has players, audience totals will be published
            on this page. Advertisers only ever get totals, never personal details about players.
          </p>
        </div>
      </section>

      <section aria-labelledby="slots" className={styles.section}>
        <h2 id="slots" className={`px ${styles.h2}`}>
          Where ads go
        </h2>
        <div className={styles.prose} style={{ marginBottom: 16 }}>
          <p>
            Ad slots are run in-house, so each one sits in a set place and can be switched on or
            off. A slot can show a direct sponsor&rsquo;s campaign. When a slot is on, each view and
            click is counted for that slot, and sponsors are given those totals.
          </p>
        </div>
        <div className={styles.tablewrap} tabIndex={0} role="region" aria-label="Ad slots">
          <table className={`${styles.table} ${styles.stackrows}`}>
            <caption>Ad slots</caption>
            <thead>
              <tr>
                <th scope="col">Slot</th>
                <th scope="col">Where</th>
                <th scope="col">Format</th>
                <th scope="col">How it behaves</th>
              </tr>
            </thead>
            <tbody>
              {slots.map((id) => (
                <tr key={id}>
                  <th scope="row">
                    <code>{id}</code>
                  </th>
                  <td data-label="Where">{AD_SLOT_INFO[id].where}</td>
                  <td data-label="Format">{AD_SLOT_INFO[id].format}</td>
                  <td data-label="How it behaves">{AD_SLOT_INFO[id].behaviour}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="rules" className={styles.section}>
        <h2 id="rules" className={`px ${styles.h2}`}>
          How ads are run
        </h2>
        <ul className={`${styles.ticks} ${styles.prose}`}>
          <li>Sponsored content is always labelled as sponsored.</li>
          <li>A different spot on each page, so no page feels crowded.</li>
          <li>Never two ad units on one phone screen, and none over the map in landscape.</li>
          <li>
            No ad appears while a player is making a decision, over a confirm button or while a job
            card is open.
          </li>
          <li>Each slot keeps its size before it loads, so the page does not jump.</li>
          <li>Clicks open in a new tab.</li>
        </ul>
      </section>

      <section aria-labelledby="contact" className={styles.section}>
        <h2 id="contact" className={`px ${styles.h2}`}>
          Get in touch
        </h2>
        {email ? (
          <div className={styles.prose}>
            <p>
              Tell us who you are, which slots interest you and when you would like to start.{' '}
              <a href={`mailto:${email}?subject=${encodeURIComponent('Advertising enquiry')}`}>
                Send an enquiry
              </a>
              .
            </p>
          </div>
        ) : (
          <div className={styles.prose}>
            <p>We are not taking enquiries through this page yet.</p>
          </div>
        )}
      </section>
    </PageShell>
  );
}
