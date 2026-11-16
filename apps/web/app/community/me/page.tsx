import Link from 'next/link';
import { Act } from '@/components/community/Act';
import { AvatarForm, ProfileForm, type ProfileInit } from '@/components/community/ProfileForm';
import { Empty, SubNav } from '@/components/community/Parts';
import styles from '@/components/community/community.module.css';
import { asUser } from '@/server/auth/accounts';
import { blockedBy, myProfile } from '@/server/community/data';
import { requireMember } from '@/server/community/page';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const { me, deps } = await requireMember();
  const p = await asUser(deps.sql, me.userId, (tx) => myProfile(tx, me.userId));
  if (!p) return <Empty>Your profile could not be found.</Empty>;
  const blocked = await blockedBy(deps.sql, me.userId);
  const links: Record<string, string> = {};
  for (const l of p.extras.links) links[l.kind] = l.url;
  const init: ProfileInit = {
    displayName: p.displayName ?? '',
    bio: p.bio ?? '',
    town: p.town ?? '',
    district: p.district ?? '',
    farms: p.farms === null ? '' : p.farms ? 'yes' : 'no',
    enterprise: p.enterprise ?? '',
    sizeBand: p.sizeBand ?? '',
    yearsFarming: p.yearsFarming === null ? '' : String(p.yearsFarming),
    farmRole: p.farmRole ?? '',
    realFarmName: p.realFarmName ?? '',
    privacy: p.privacy,
    farmView: p.farmView,
    tickerOptIn: p.tickerOptIn,
    hideTicker: p.hideTicker,
    links,
    experience: p.extras.experience.map((e) => ({
      role: e.role,
      enterprise: e.enterprise ?? '',
      place: e.place ?? '',
      from: e.from === null ? '' : String(e.from),
      to: e.to === null ? '' : String(e.to),
    })),
    education: p.extras.education.map((e) => ({
      course: e.course,
      provider: e.provider ?? '',
      year: e.year === null ? '' : String(e.year),
    })),
  };
  return (
    <>
      <h1 className={`px ${styles.title}`}>Your profile</h1>
      <SubNav here="me" />
      <p className={styles.row}>
        <Link href={`/community/u/${p.username}`} className="btn ghost">
          View your profile
        </Link>
        <Link href={`/community/u/${p.username}?view=public`} className="btn ghost">
          See it as others see it
        </Link>
      </p>
      <AvatarForm status={p.avatarStatus} has={p.hasAvatar} />
      <ProfileForm init={init} />
      <section className={styles.card} aria-labelledby="blocked-title">
        <h2 id="blocked-title" className={`px ${styles.h2}`}>
          People you blocked
        </h2>
        {blocked.length === 0 ? (
          <p className={styles.hint}>You have not blocked anyone.</p>
        ) : (
          <ul className={styles.people}>
            {blocked.map((b) => (
              <li key={b.id} className={styles.person}>
                <span className={styles.pwho}>@{b.username}</span>
                <Act
                  path="/api/community/block"
                  body={{ action: 'unblock', userId: b.id }}
                  label="Unblock"
                  confirm={`Unblock @${b.username}? You will be able to see each other again.`}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
