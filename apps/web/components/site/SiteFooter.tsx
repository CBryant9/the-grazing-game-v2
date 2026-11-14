import Link from '@/components/site/SiteLink';
import { SITE } from '@gg/shared';
import { SITE_PAGES, contactEmail } from '@/lib/site';
import styles from './site.module.css';

/** The footer on every public page: the page links, and the contact link only when an address is set. */
export function SiteFooter() {
  const email = contactEmail();
  return (
    <footer className={styles.footer}>
      <div className="wrap">
        <nav aria-label="More about the game">
          <ul className={styles.footerlinks}>
            <li>
              <Link href="/">Home</Link>
            </li>
            {SITE_PAGES.filter((p) => p.footer).map((p) => (
              <li key={p.path}>
                <Link href={p.path}>{p.title}</Link>
              </li>
            ))}
            {email ? (
              <li>
                <a href={`mailto:${email}`}>Contact</a>
              </li>
            ) : null}
          </ul>
        </nav>
        <p className="muted">{SITE.name}. Built for Australian graziers.</p>
      </div>
    </footer>
  );
}
