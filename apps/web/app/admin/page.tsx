import styles from '@/components/admin/admin.module.css';
import { when } from '@/components/admin/format';
import { requireAdmin } from '@/server/admin/page';
import {
  parseRange,
  readDashboard,
  type DashTable,
  type Dashboard,
} from '@/server/admin/dashboard';
import { logFailure } from '@/server/logging';

export const dynamic = 'force-dynamic';

const LATER = [
  ['Average minutes a day and return rates', 'Needs a record of each visit, not kept yet.'],
  ['Daily Farm streaks', 'Needs the streak count on the farm.'],
  ['Game overs by cause, ranked runs failing the replay check', 'Needs the replay check.'],
  ['Charts over time', 'The tables below give the same figures by day.'],
] as const;

type Search = { from?: string | string[]; to?: string | string[] };
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

const KPIS = [
  ['players', 'Players'],
  ['signups', 'New sign-ups'],
  ['active_week', 'Active in 7 days'],
  ['days_played', 'Days played'],
  ['income_aud', 'Income AUD'],
  ['ad_views', 'Ad views'],
  ['moderation_queue', 'Moderation queue'],
] as const;

function Table({ t, range }: { t: DashTable; range: Dashboard['range'] }) {
  const href = `/api/admin/dashboard?table=${t.id}&from=${range.from}&to=${range.to}`;
  return (
    <section aria-labelledby={`t-${t.id}`} className={styles.list}>
      <h2 id={`t-${t.id}`} className={styles.h2}>
        {t.title}
      </h2>
      <p className={styles.muted}>{t.note}</p>
      <div className={styles.tablewrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {t.columns.map((c) => (
                <th key={c.key} scope="col">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.rows.map((row, i) => (
              <tr key={i}>
                {t.columns.map((c) => (
                  <td key={c.key}>{row[c.key]}</td>
                ))}
              </tr>
            ))}
            {t.rows.length === 0 && (
              <tr>
                <td colSpan={t.columns.length} className={styles.muted}>
                  Nothing counted in this range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p>
        <a href={href} download>
          Download {t.title.toLowerCase()} as CSV
        </a>
      </p>
    </section>
  );
}

export default async function Page({ searchParams }: { searchParams?: Promise<Search> } = {}) {
  const page = await requireAdmin();
  if (!page) return null;
  const sp = (await searchParams) ?? {};
  const range = parseRange(one(sp.from), one(sp.to));
  let d: Dashboard | null = null;
  try {
    d = await readDashboard(page.deps.sql, range);
  } catch (e) {
    logFailure({ route: 'admin-dashboard', reason: 'read_failed' }, e);
  }
  const summary = new Map(d?.tables.summary.rows.map((r) => [String(r.key), r.value]) ?? []);
  return (
    <>
      <h1 className={styles.h1}>Dashboard</h1>
      <form method="get" className={styles.inline} aria-label="Date range">
        <div className={styles.field}>
          <label htmlFor="from">From</label>
          <input id="from" name="from" type="date" defaultValue={range.from} />
        </div>
        <div className={styles.field}>
          <label htmlFor="to">To</label>
          <input id="to" name="to" type="date" defaultValue={range.to} />
        </div>
        <div className={styles.btnrow}>
          <button type="submit" className="primary">
            Show
          </button>
        </div>
      </form>
      {!d ? (
        <p role="alert" className={styles.card}>
          The counts could not be read from the database just now. Try again in a moment.
        </p>
      ) : (
        <>
          <p className={styles.asat}>
            Counts read from the database for {range.from} to {range.to} (Sydney days). As at{' '}
            {when(d.asAt)}. Downloads are written to the audit log.
          </p>
          <div className={styles.kpis}>
            {KPIS.map(([key, label]) => (
              <div key={key} className={styles.kpi}>
                <span>{label}</span>
                <b>{summary.get(key) ?? 0}</b>
              </div>
            ))}
          </div>
          {Object.values(d.tables).map((t) => (
            <Table key={t.id} t={t} range={range} />
          ))}
        </>
      )}
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
