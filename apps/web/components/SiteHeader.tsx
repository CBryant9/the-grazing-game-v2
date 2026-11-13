import Link from 'next/link';
import { SITE } from '@gg/shared';
import { ThemeToggle } from './ThemeToggle';
import styles from './SiteHeader.module.css';

/** The website header. On the farm page the game header sits below it, on a different background (PRD 6.2). */
export function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.logo} aria-label={`${SITE.name}, home`}>
          <span className={styles.mark} aria-hidden="true">
            <GrassIcon />
          </span>
          <span className="px">THE GRAZING GAME</span>
        </Link>
        <nav className={styles.nav} aria-label="Main">
          <ThemeToggle />
          <Link href="/play" className="btn coral">
            Play free
          </Link>
        </nav>
      </div>
    </header>
  );
}

/** The 8 by 8 pixel grass mark from the mockups. */
function GrassIcon() {
  const rows = [
    '........',
    '..X..X..',
    'X.X.XX.X',
    'XXX.X.XX',
    '.XXXXXX.',
    'XXXXXXXX',
    'XXXXXXXX',
    '........',
  ];
  return (
    <svg viewBox="0 0 8 8" width="18" height="18" shapeRendering="crispEdges" fill="currentColor">
      {rows.flatMap((row, y) =>
        [...row].map((c, x) =>
          c === 'X' ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" /> : null,
        ),
      )}
    </svg>
  );
}
