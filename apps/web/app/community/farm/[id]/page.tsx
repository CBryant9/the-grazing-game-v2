import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Empty, SubNav } from '@/components/community/Parts';
import styles from '@/components/community/community.module.css';
import farm from '@/components/community/farmview.module.css';
import { loadFarmView } from '@/server/community/farmview';
import { requireMember } from '@/server/community/page';

export const dynamic = 'force-dynamic';

const num = (n: number): string => n.toLocaleString('en-AU');

/** Someone's farm as it is now, read-only (PRD 9.5). Every refusal is the same plain not found. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { me, deps } = await requireMember('farm_viewing');
  const { id } = await params;
  const view = await loadFarmView(deps, me.userId, id);
  if (!view) notFound();
  return (
    <>
      <SubNav here="feed" />
      <section className={styles.card} aria-labelledby="fname">
        <h1 id="fname" className={styles.pname}>
          {view.name}
        </h1>
        <p className={styles.hint}>
          <Link href={`/community/u/${view.owner}`}>@{view.owner}</Link>
          {' · '}
          {[view.district, view.mode].filter(Boolean).join(', ')}
        </p>
        <dl className={styles.kv}>
          <div>
            <dt>Day</dt>
            <dd>{view.day}</dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>{view.date}</dd>
          </div>
          <div>
            <dt>Season</dt>
            <dd>{view.season}</dd>
          </div>
          <div>
            <dt>Head</dt>
            <dd>{num(view.head)}</dd>
          </div>
          <div>
            <dt>Average pasture</dt>
            <dd>{num(view.massKgHa)} kg DM/ha</dd>
          </div>
          {view.aePerHa !== null && (
            <div>
              <dt>Stocking</dt>
              <dd>{view.aePerHa} AE/ha</dd>
            </div>
          )}
          <div>
            <dt>Ground cover</dt>
            <dd>{view.coverPct}%</dd>
          </div>
          <div>
            <dt>Net worth</dt>
            <dd>${num(view.netWorth)}</dd>
          </div>
          <div>
            <dt>Score (stand-in), year {view.score.year}</dt>
            <dd>{num(view.score.total)}</dd>
          </div>
        </dl>
        <p className={styles.hint}>This is a read-only look at the farm as it stands now.</p>
      </section>
      <section aria-labelledby="paddocks" className={styles.stack}>
        <h2 id="paddocks" className={`px ${styles.h2}`}>
          Paddocks
        </h2>
        {view.paddocks.length === 0 ? (
          <Empty>No paddocks yet.</Empty>
        ) : (
          <ul className={farm.grid}>
            {view.paddocks.map((p, i) => (
              <li key={i}>
                <details className={farm.paddock}>
                  <summary>
                    <span className={farm.pname}>{p.name}</span>
                    <span className={farm.plabel}>{p.label}</span>
                    <span className={farm.pfacts}>
                      {num(p.ha)} ha, {num(p.massKgHa)} kg DM/ha
                    </span>
                  </summary>
                  <div className={farm.pbody}>
                    {p.mobs.length === 0 ? (
                      <span>No mob in this paddock.</span>
                    ) : (
                      <ul>
                        {p.mobs.map((m, j) => (
                          <li key={j}>
                            {m.name}: {num(m.head)} head
                            {m.classes.length > 0 &&
                              ` (${m.classes.map((c) => `${num(c.head)} ${c.label}`).join(', ')})`}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
