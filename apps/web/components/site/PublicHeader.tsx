import Link from '@/components/site/SiteLink';
import { SITE } from '@gg/shared';
import { GrassIcon } from '@/components/site/GrassIcon';
import { linkedPages } from '@/lib/site';
import styles from '@/components/SiteHeader.module.css';

/**
 * The header on the public website pages. Plain HTML: the light and dark button
 * is made to work by the small script in pages/_document.tsx, so these pages
 * need no React in the browser. The game page has its own (components/SiteHeader.tsx).
 */
export function PublicHeader({ current }: { current: string }) {
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
          {linkedPages('header').map((p) => (
            <Link
              key={p.path}
              href={p.path}
              className={styles.link}
              aria-current={p.path === current ? 'page' : undefined}
            >
              {p.title}
            </Link>
          ))}
          <button
            type="button"
            className="btn ghost"
            data-theme-toggle=""
            aria-label="Switch between light and dark"
          >
            Theme
          </button>
          <Link href="/play" className="btn coral">
            Play free
          </Link>
        </nav>
      </div>
    </header>
  );
}
