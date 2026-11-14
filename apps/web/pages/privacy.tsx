import type { PageConfig } from 'next';
import Link from '@/components/site/SiteLink';
import { MIN_ACCOUNT_AGE, MIN_COMMUNITY_AGE } from '@gg/shared';
import { DraftNotice } from '@/components/site/DraftNotice';
import { PageShell } from '@/components/site/PageShell';
import styles from '@/components/site/site.module.css';
import { DETAILS_TO_COME, contactEmail, ownerName, siteSwitchOn } from '@/lib/site';

// No JavaScript is sent to the browser for this page.
export const config: PageConfig = { unstable_runtimeJS: false };

export default function PrivacyPage() {
  const email = contactEmail();
  const owner = ownerName();
  const accounts = siteSwitchOn('signups_open');
  const community = siteSwitchOn('community');
  const analytics = siteSwitchOn('analytics');
  const ads = siteSwitchOn('ads');
  const purchases = siteSwitchOn('purchases');
  return (
    <PageShell
      path="/privacy"
      heading="Privacy"
      subtitle="What The Grazing Game keeps about you, and why."
    >
      <div className={styles.prose}>
        <DraftNotice />
        <h2>Who we are</h2>
        <p>
          In this page, &ldquo;we&rdquo; means {owner ?? 'the owner of The Grazing Game'}.{' '}
          {owner && email ? null : DETAILS_TO_COME}
        </p>

        <h2>The short version</h2>
        <p>
          We keep only what the game needs to work. We do not sell your information. Advertisers, if
          there are any, only ever get totals, never personal details about players.
        </p>

        <h2>What the game keeps today</h2>
        <ul>
          <li>
            <strong>Your farm.</strong> When you start a farm without an account, the farm is kept
            on our server and linked to your browser by a small cookie called{' '}
            <code>gg_session</code>. It is needed to keep your farm. It is not used to track you
            across other sites.
          </li>
          <li>
            <strong>Your theme choice.</strong> If you pick light or dark, your browser remembers it
            on your device. It is not sent to us.
          </li>
          <li>
            <strong>Your network address.</strong> The address your device connects from is used to
            limit how quickly farms can be started, so one place cannot flood the game.
          </li>
          <li>
            <strong>Ordinary server records.</strong> Our hosting keeps normal request records, such
            as the time and the page asked for, to keep the site running and secure.
          </li>
        </ul>
        <p>
          A farm started without an account is removed if it goes unused for a long time. Clearing
          your cookies means you can no longer reach that farm.
        </p>

        {accounts ? (
          <>
            <h2>If you make an account</h2>
            <p>
              You need to be {MIN_ACCOUNT_AGE} or older to make an account. We ask for your date of
              birth once, to apply the age rules. It is never shown to anyone else. We also keep
              your email address or sign-in details, a username, and your farms and scores. The
              farming questions we ask (if you farm, where, what and how big) are optional.
            </p>
          </>
        ) : null}

        {community ? (
          <>
            <h2>The community</h2>
            <p>
              Anything you post, and your profile, can be seen by other people according to the
              privacy settings you choose: Public, Followers only or Private. People under{' '}
              {MIN_COMMUNITY_AGE} do not see the community and do not have a public profile.
            </p>
          </>
        ) : null}

        {analytics ? (
          <>
            <h2>Analytics</h2>
            <p>
              With your consent, we use analytics to see which parts of the game are used. You can
              say no and still play. You can change your mind at any time.
            </p>
          </>
        ) : null}

        {ads ? (
          <>
            <h2>Ads</h2>
            <p>
              Ads are labelled. We count how many times each ad is shown and clicked. Advertisers
              only get those totals.
            </p>
          </>
        ) : null}

        {purchases ? (
          <>
            <h2>Payments</h2>
            <p>
              Payments are taken by Stripe. We do not see or keep your card number. We keep a record
              of what your account has bought.
            </p>
          </>
        ) : null}

        <h2>Who can see what</h2>
        <p>
          Our hosting and database providers handle information for us so the game can run. They may
          keep it outside Australia.
        </p>

        <h2>Your choices</h2>
        <p>
          You can ask to see what we keep about you, to correct it, or to have it deleted. We will
          help, and we will tell you if there is something we are required to keep.
        </p>
        <p>
          {email ? (
            <>
              To ask, <a href={`mailto:${email}`}>contact us</a>.
            </>
          ) : (
            DETAILS_TO_COME
          )}
        </p>

        <h2>If you are not happy</h2>
        <p>
          Tell us first, and we will try to put it right. If we do not, you can complain to the
          Office of the Australian Information Commissioner, the national privacy regulator. It
          explains how to complain on its page about{' '}
          <a href="https://www.oaic.gov.au/privacy/privacy-complaints">privacy complaints</a>.
        </p>

        <h2>Changes</h2>
        <p>
          If we change this page in a way that matters, we will say so on this page. See also the{' '}
          <Link href="/terms">terms of use</Link>.
        </p>
      </div>
    </PageShell>
  );
}
