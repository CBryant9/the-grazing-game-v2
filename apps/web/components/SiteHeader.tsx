import Link from '@/components/site/SiteLink';
import { SITE } from '@gg/shared';
import { SITE_PAGES } from '@/lib/site';
import { ThemeToggle } from './ThemeToggle';
import styles from './SiteHeader.module.css';

/** The website header. On the farm page the game header sits below it, on a different background (PRD 6.2). */
export function SiteHeader({ current }: { current?: string } = {}) {
  // The public pages pass `current` and get the page links on wide screens. The game page passes nothing and keeps its header as it was.
  const links = current === undefined ? [] : SITE_PAGES.filter((p) => p.header);
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
          {links.map((p) => (
            <Link
              key={p.path}
              href={p.path}
              className={styles.link}
              aria-current={p.path === current ? 'page' : undefined}
            >
              {p.title}
            </Link>
          ))}
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
