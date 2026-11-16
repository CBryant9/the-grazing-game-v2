import Link from 'next/link';
import styles from '@/components/admin/admin.module.css';
import { campaignFields } from '@/components/ads/CampaignFields';
import { AdminForm } from '@/components/ads/AdminForm';
import { requireAdmin } from '@/server/admin/page';
import { listCampaigns, listSponsors } from '@/server/ads/adminStore';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const page = await requireAdmin();
  if (!page) return null;
  const [campaigns, sponsors] = await Promise.all([
    listCampaigns(page.deps.sql),
    listSponsors(page.deps.sql),
  ]);
  return (
    <>
      <h1 className={styles.h1}>Campaigns and house ads</h1>
      <p className={styles.lede}>
        A campaign is a sponsor&rsquo;s ads (or your own, as a house ad) with the slots it runs in,
        its dates, and its limits. House ads fill a slot only when no sponsor campaign is running
        there.
      </p>
      <p>
        <Link href="/admin/ads">Back to ads</Link>
      </p>
      <section className={styles.card} aria-labelledby="new">
        <h2 id="new" className={styles.h2}>
          New campaign
        </h2>
        <AdminForm
          action="campaign_save"
          fields={campaignFields({ sponsors })}
          submit="Make campaign"
          goTo="/admin/ads/campaigns/{id}"
        />
        <p className={styles.muted}>
          A new campaign is off until you tick &ldquo;Running&rdquo; on its page, after you add an
          ad to it.
        </p>
      </section>
      <div className={styles.tablewrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Who</th>
              <th>Dates</th>
              <th>State</th>
              <th>Views</th>
              <th>Clicks</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/admin/ads/campaigns/${c.id}`}>{c.name}</Link>
                </td>
                <td>{c.isHouse ? 'House ad' : c.sponsorName}</td>
                <td>
                  {c.startDay} to {c.endDay ?? 'no end'}
                </td>
                <td>{c.active ? 'Running' : 'Off'}</td>
                <td>{c.views}</td>
                <td>{c.clicks}</td>
              </tr>
            ))}
            {campaigns.length === 0 && (
              <tr>
                <td colSpan={6} className={styles.muted}>
                  No campaigns yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
