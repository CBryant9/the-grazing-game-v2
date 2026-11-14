import styles from '@/components/admin/admin.module.css';
import { when } from '@/components/admin/format';
import { requireAdmin } from '@/server/admin/page';
import { dashboard } from '@/server/admin/store';

export const dynamic = 'force-dynamic';

const LATER = [
  [
    'Daily, weekly and monthly active users, minutes a day, return rates',
    'Needs analytics (milestone 5.3).',
  ],
  ['Audience mix and the advertiser snapshot', 'Needs the community and analytics.'],
  ['Subscribers and income', 'Needs purchases (a later milestone).'],
  ['Ad views, clicks and click rate', 'Needs ads (a later milestone).'],
  ['Game overs and their causes, replay check failures', 'Needs the ranked-run replay check.'],
  ['Daily Farm rollover job status', 'Built with the Daily Farm rollover (milestone 3.3).'],
] as const;

export default async function Page() {
  const page = await requireAdmin();
  if (!page) return null;
  const d = await dashboard(page.deps.sql);
  return (
    <>
      <h1 className={styles.h1}>Dashboard</h1>
      <p className={styles.asat}>Counts read from the database. As at {when(d.asAt)}.</p>
      <section aria-labelledby="now" className={styles.list}>
        <h2 id="now" className={styles.h2}>
          Right now
        </h2>
        <div className={styles.kpis}>
          <div className={styles.kpi}>
            <span>Accounts</span>
            <b>{d.accounts}</b>
            <small>Signed up and finished</small>
          </div>
          <div className={styles.kpi}>
            <span>Guests</span>
            <b>{d.guests}</b>
            <small>Playing with no account yet</small>
          </div>
          <div className={styles.kpi}>
            <span>Daily Farms</span>
            <b>{d.farms.daily.active}</b>
            <small>going, {d.farms.daily.ended} ended</small>
          </div>
          <div className={styles.kpi}>
            <span>Fast Farms</span>
            <b>{d.farms.fast.active}</b>
            <small>going, {d.farms.fast.ended} ended</small>
          </div>
          <div className={styles.kpi}>
            <span>Farms played today</span>
            <b>{d.playedToday}</b>
            <small>Saved since midnight, Sydney time</small>
          </div>
          <div className={styles.kpi}>
            <span>Farms played this week</span>
            <b>{d.playedWeek}</b>
            <small>Saved in the last 7 days</small>
          </div>
          <div className={styles.kpi}>
            <span>Saves failing</span>
            <b>{d.brokenSaves}</b>
            <small>Saves that could not be opened and were kept aside</small>
          </div>
        </div>
      </section>
      <section aria-labelledby="later" className={styles.card}>
        <h2 id="later" className={styles.h2}>
          Built in a later milestone
        </h2>
        <ul className={styles.list}>
          {LATER.map(([what, why]) => (
            <li key={what}>
              {what}
              <p className={styles.muted}>{why}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
