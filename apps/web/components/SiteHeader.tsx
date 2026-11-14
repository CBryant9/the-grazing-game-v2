import Link from '@/components/site/SiteLink';
import { SITE } from '@gg/shared';
import { GrassIcon } from '@/components/site/GrassIcon';
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
