import Link from 'next/link';
import { notFound } from 'next/navigation';
import styles from '@/components/admin/admin.module.css';
import { SLOTS, isSlotId } from '@/lib/ads/registry';
import { requireAdmin } from '@/server/admin/page';
import { isUuid } from '@/server/admin/store';
import { campaignReport } from '@/server/ads/adminStore';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const page = await requireAdmin();
  if (!page) return null;
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const report = await campaignReport(page.deps.sql, id).catch(() => null);
  if (!report) notFound();
  const { campaign: c, rows, totals } = report;
  return (
    <>
      <p>
        <Link href={`/admin/ads/campaigns/${id}`}>Back to the campaign</Link>
      </p>
      <h1 className={styles.h1}>Sponsor report: {c.name}</h1>
      <p className={styles.lede}>
        {c.isHouse ? 'House ad' : `For ${c.sponsorName}`}. {c.startDay} to {c.endDay ?? 'no end'}.
        Totals only: how many times the ad was seen and followed, by day and slot. Nothing here says
        who saw it.
      </p>
      <p>
        <a href={`/api/ads/admin/report?campaign=${id}`} download>
          Download as CSV
        </a>
      </p>
      <p>
        <b>{totals.views}</b> views, <b>{totals.clicks}</b> clicks
        {totals.views > 0
          ? ` (click rate ${((totals.clicks / totals.views) * 100).toFixed(1)}%)`
          : ''}
        .
        {totals.videoCompletes + totals.videoSkips > 0
          ? ` Videos: ${totals.videoCompletes} finished, ${totals.videoSkips} skipped.`
          : ''}
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
