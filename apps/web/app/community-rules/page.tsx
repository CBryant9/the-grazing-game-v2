import type { Metadata } from 'next';
import Link from '@/components/site/SiteLink';
import { MIN_COMMUNITY_AGE } from '@gg/shared';
import { DraftNotice } from '@/components/site/DraftNotice';
import { PageShell } from '@/components/site/PageShell';
import styles from '@/components/site/site.module.css';
import { pageMetadata } from '@/lib/metadata';
import { contactEmail, siteSwitchOn } from '@/lib/site';

export const metadata: Metadata = pageMetadata('/community-rules');

export default function CommunityRulesPage() {
  const email = contactEmail();
  const communityOn = siteSwitchOn('community');
  return (
    <PageShell
      path="/community-rules"
      heading="Community rules"
      subtitle="How people are expected to treat each other here."
    >
      <div className={styles.prose}>
        <DraftNotice />
        {communityOn ? null : (
          <p className={styles.note}>
            The game has no community features today. These rules are a draft for when it does.
          </p>
        )}

        <h2>Be decent</h2>
        <ul>
          <li>Be respectful. Disagree about grazing as much as you like, but not about people.</li>
          <li>No harassment, bullying, threats or hate.</li>
          <li>No sexual, violent or otherwise harmful content.</li>
        </ul>

        <h2>Look after people&rsquo;s privacy</h2>
        <ul>
          <li>
            Do not post anyone&rsquo;s address, phone number or other private details, including
            your own.
          </li>
          <li>Share photos of people only if they are happy for you to.</li>
          <li>Say where you are by town or district, never by street address.</li>
        </ul>

        <h2>Be honest</h2>
        <ul>
          <li>Do not pretend to be someone else.</li>
          <li>
            Do not post spam, scams or unrequested advertising. Sponsored posts are marked as
            sponsored.
          </li>
          <li>Do not cheat, or help others cheat, to get a higher place on a leaderboard.</li>
        </ul>

        <h2>Younger players</h2>
        <p>
          People under {MIN_COMMUNITY_AGE} can play the game but do not see the community, post, or
          have a public profile. Do not try to get around this, and do not contact anyone you think
          is under {MIN_COMMUNITY_AGE} through the game.
        </p>

        <h2>Reporting and what happens next</h2>
        <p>
          You can report a post, comment, profile or group, and say why. Moderators look at reports.
          Depending on what happened, they may remove content, give a warning, suspend an account
          for a number of days, or ban it. New accounts have limits on how fast they can post and
          comment.
        </p>
        {email ? (
          <p>
            If something is wrong and you cannot report it in the game,{' '}
            <a href={`mailto:${email}`}>contact us</a>.
          </p>
        ) : null}
        <p>
          These rules sit alongside the <Link href="/terms">terms of use</Link> and the{' '}
          <Link href="/privacy">privacy page</Link>.
        </p>
      </div>
    </PageShell>
  );
}
