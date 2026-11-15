import type { ReactNode } from 'react';
import Link from '@/components/site/SiteLink';
import { SITE } from '@gg/shared';
import { GrassIcon } from '@/components/site/GrassIcon';
import { ThemeToggle } from './ThemeToggle';
import styles from './SiteHeader.module.css';

/**
 * The website header. On the farm page the game header sits below it, on a different background (PRD 6.2).
 *
 * On /play (`nav` given) it is the header of the mockup's PC game screen: the logo, the game's
 * own links (Farm, and Community, Leaderboard and Groups when their switches are on), and the
 * bell and the account when signed in. There is no "Play free" there: the player is playing.
 * `theme` keeps the light and dark switch in it (the setup screen, which has no More tab).
 */
export function SiteHeader({ nav, theme = true }: { nav?: ReactNode; theme?: boolean } = {}) {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.logo} aria-label={`${SITE.name}, home`}>
          <span className={styles.mark} aria-hidden="true">
            <GrassIcon />
          </span>
          <span className="px">THE GRAZING GAME</span>
        </Link>
        {nav ? (
          <>
            {nav}
            {theme && (
              <div className={styles.nav}>
                <ThemeToggle />
              </div>
            )}
          </>
        ) : (
          <nav className={styles.nav} aria-label="Main">
            <ThemeToggle />
            <Link href="/play" className="btn coral">
              Play free
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
