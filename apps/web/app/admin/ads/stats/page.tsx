import Link from 'next/link';
import styles from '@/components/admin/admin.module.css';
import { SLOTS } from '@/lib/ads/registry';
import { isSlotId } from '@/lib/ads/registry';
import { requireAdmin } from '@/server/admin/page';
import { dailyCounts } from '@/server/ads/adminStore';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const page = await requireAdmin();
  if (!page) return null;
  const rows = await dailyCounts(page.deps.sql, { days: 30 });
  const totalViews = rows.reduce((n, r) => n + r.views, 0);
  const totalClicks = rows.reduce((n, r) => n + r.clicks, 0);
  return (
    <>
      <h1 className={styles.h1}>Views and clicks</h1>
      <p className={styles.lede}>
        The last 30 days, by day and slot, counted from the database. A view is counted only after
        an ad was on screen for a second. A click is counted when someone follows the ad&rsquo;s
        link. Yesterday and earlier come from the nightly roll-up; today is counted from the events
        so far. Days are Sydney days. These are totals only: nothing here says who saw an ad.
      </p>
      <p>
        <Link href="/admin/ads">Back to ads</Link>
      </p>
      <p>
        <b>{totalViews}</b> views and <b>{totalClicks}</b> clicks in these 30 days.
      </p>
      <div className={styles.tablewrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Day</th>
              <th>Slot</th>
              <th>Views</th>
              <th>Clicks</th>
              <th>Videos finished</th>
              <th>Videos skipped</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.day}|${r.slot}`}>
                <td>{r.day}</td>
                <td>{isSlotId(r.slot) ? SLOTS[r.slot].label : r.slot}</td>
                <td>{r.views}</td>
                <td>{r.clicks}</td>
                <td>{r.videoCompletes}</td>
                <td>{r.videoSkips}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className={styles.muted}>
                  Nothing counted yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
