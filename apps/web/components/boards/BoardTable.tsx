import { DISTRICTS, type DistrictId } from '@gg/shared';
import type { BoardRow } from '@/lib/boards/types';
import styles from './boards.module.css';

/**
 * A board as a list: rank, name, district, score and days, with the viewer's own row pinned at the
 * bottom (PRD 9.8). Server drawn, no script. A row links to a profile only when it may show its
 * owner (16 or over, not private) and the viewer is a community member.
 */
const fmt = (n: number, unit: string): string => {
  const v = n.toLocaleString('en-AU', { maximumFractionDigits: unit.startsWith('%') ? 0 : 2 });
  return unit.startsWith('$') ? `$${v}` : v;
};

function Row({
  r,
  unit,
  links,
  pinned,
}: {
  r: BoardRow;
  unit: string;
  links: boolean;
  pinned?: boolean;
}) {
  const district = DISTRICTS[r.district as DistrictId]?.name ?? '';
  return (
    <li
      className={`${styles.row} ${r.mine ? styles.mine : ''} ${pinned ? styles.pinned : ''}`}
      aria-label={pinned ? 'Your row' : undefined}
    >
      <span className={styles.rank}>{r.rank}</span>
      <span className={styles.who}>
        {links && r.userId ? (
          <a href={`/community/u/${r.username}`}>{r.username}</a>
        ) : (
          <span>{r.username}</span>
        )}
        <small>{[r.mine ? 'You' : null, r.farmName, district].filter(Boolean).join(' · ')}</small>
      </span>
      <span className={styles.score}>
        {fmt(r.score, unit)}
        <small>{r.days.toLocaleString('en-AU')} days</small>
      </span>
    </li>
  );
}

export function BoardTable({
  rows,
  mine,
  unit,
  links,
  empty = 'No farms on this board yet.',
}: {
  rows: BoardRow[];
  mine: BoardRow | null;
  unit: string;
  links: boolean;
  empty?: string;
}) {
  return (
    <div className={styles.wrap}>
      {rows.length === 0 ? (
        <p className={styles.note}>{empty}</p>
      ) : (
        <ol className={styles.list} aria-label="Board">
          {rows.map((r) => (
            <Row
              key={`${r.rank}-${r.username}-${r.farmName ?? ''}-${r.days}`}
              r={r}
              unit={unit}
              links={links}
            />
          ))}
        </ol>
      )}
      {mine && (
        <ul className={styles.list} aria-label="Your row">
          <Row r={mine} unit={unit} links={links} pinned />
        </ul>
      )}
    </div>
  );
}
