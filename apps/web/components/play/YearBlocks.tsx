import type { YearView } from '@/lib/game/types';
import { money, num } from '@/lib/game/format';
import styles from './play.module.css';

/**
 * The five parts of a year score as bars. A bar's width is the part's share
 * of the largest part by size. A part that took points off keeps its minus
 * number, and its bar is muted.
 */
export function YearParts({ view }: { view: YearView }) {
  const biggest = Math.max(1, ...view.parts.map((p) => Math.abs(p.pts)));
  return (
    <ul className={styles.parts} aria-label={`${view.title} score parts`}>
      {view.parts.map((p) => (
        <li key={p.key} className={styles.part} data-negative={p.pts < 0}>
          <span className={styles.partname}>{p.label}</span>
          <span className={styles.parttrack} aria-hidden="true">
            <span
              className={styles.partbar}
              style={{
                width: `${Math.max(p.pts === 0 ? 0 : 2, (Math.abs(p.pts) / biggest) * 100)}%`,
              }}
            />
          </span>
          <span className={styles.partpts}>{num(p.pts)}</span>
        </li>
      ))}
    </ul>
  );
}

export function YearFacts({ view }: { view: YearView }) {
  return (
    <ul className={styles.sumfacts}>
      {view.facts.map((f) => (
        <li key={f}>{f}</li>
      ))}
    </ul>
  );
}

/** The year's money in and out. Nothing shows when every row was zero. */
export function YearMoney({ view }: { view: YearView }) {
  if (view.money.length === 0) return null;
  return (
    <dl className={styles.sumlist} aria-label={`${view.title} money`}>
      {view.money.map((m) => (
        <div key={m.label} className={styles.sumrow}>
          <dt>{m.label}</dt>
          <dd>{m.dollars < 0 ? `-${money(-m.dollars)}` : `+${money(m.dollars)}`}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A year's score, its parts and facts. Money rows are for the Scores panel. */
export function YearScore({ view, withMoney = false }: { view: YearView; withMoney?: boolean }) {
  return (
    <div className={styles.stack}>
      <p className={styles.yearscore}>
        <span>Year score</span>
        <b>{num(view.total)}</b>
      </p>
      <YearParts view={view} />
      <YearFacts view={view} />
      {withMoney && <YearMoney view={view} />}
    </div>
  );
}
