import type { Metadata } from 'next';
import Link from '@/components/site/SiteLink';
import { MIN_ACCOUNT_AGE } from '@gg/shared';
import { DraftNotice } from '@/components/site/DraftNotice';
import { PageShell } from '@/components/site/PageShell';
import styles from '@/components/site/site.module.css';
import { pageMetadata } from '@/lib/metadata';
import { contactEmail, siteSwitchOn } from '@/lib/site';

export const metadata: Metadata = pageMetadata('/terms');

export default function TermsPage() {
  const email = contactEmail();
  const accounts = siteSwitchOn('signups_open');
  const community = siteSwitchOn('community');
  const purchases = siteSwitchOn('purchases');
  return (
    <PageShell
      path="/terms"
      heading="Terms of use"
      subtitle="The rules for using The Grazing Game, in plain English."
    >
      <div className={styles.prose}>
        <DraftNotice />
        <h2>Using the game</h2>
        <p>
          The Grazing Game is a free game. By using it, you agree to these terms. If you do not
          agree, please do not use it.
        </p>
        <ul>
          <li>Play fairly. Do not try to break, overload or reverse-engineer the game.</li>
          <li>
            Do not copy the game, its rules, its figures or its data tables, or use automated tools
            to collect them.
          </li>
          <li>We may change, pause or stop any part of the game.</li>
        </ul>

        {accounts ? (
          <>
            <h2>Accounts</h2>
            <p>
              You need to be {MIN_ACCOUNT_AGE} or older to make an account. Anyone can play as a
              guest. Keep your sign-in details to yourself. You are responsible for what happens on
              your account. Tell us if you think someone else has used it.
            </p>
          </>
        ) : null}

        <h2>It is a game, not advice</h2>
        <p>
          The Grazing Game simulates grazing, and it simplifies a lot. Its weather, prices and
          results will not match your farm. Do not use it to make decisions about a real farm,
          business or animals. We give no promise that it is accurate or complete for any real
          purpose.
        </p>

        <h2>Who owns what</h2>
        <p>
          The game, its rules, its figures, its pictures and its data belong to its owner. You may
          play it. You do not get any right to copy it or sell it. Data from outside sources, such
          as Meat &amp; Livestock Australia prices and SILO climate data, belongs to those sources
          and is used under their terms.
        </p>

        {community ? (
          <>
            <h2>What you post</h2>
            <p>
              You keep ownership of what you post. By posting it, you let us show it in the game and
              on our pages. You must have the right to post it, and it must follow the{' '}
              <Link href="/community-rules">community rules</Link>. We may remove content and
              suspend or close accounts that break the rules.
            </p>
          </>
        ) : null}

        {purchases ? (
          <>
            <h2>Purchases</h2>
            <p>
              Prices are in Australian dollars and include GST. Purchases are one-off. Nothing that
              gives an edge in play is for sale. Your rights under Australian Consumer Law are not
              changed by these terms.
            </p>
          </>
        ) : null}

        <h2>When things go wrong</h2>
        <p>
          We work to keep the game running, but we cannot promise it will always be available or
          free of mistakes. To the extent the law allows, we are not responsible for losses that
          come from using it. Nothing here limits any right you have under law that cannot be
          limited.
        </p>

        <h2>Changes and contact</h2>
        <p>
          We may update these terms. The version on this page is the current one. See also the{' '}
          <Link href="/privacy">privacy page</Link>.
        </p>
        {email ? (
          <p>
            Questions? <a href={`mailto:${email}`}>Contact us</a>.
          </p>
        ) : null}
      </div>
    </PageShell>
  );
}
