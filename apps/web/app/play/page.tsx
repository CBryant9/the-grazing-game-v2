import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import styles from './play.module.css';

export const metadata: Metadata = {
  title: 'Play',
  description:
    'Play The Grazing Game in your browser. Set up a farm, move your stock, and see what your decisions do to the grass.',
  alternates: { canonical: '/play' },
};

// The game page shell. The map and panels load here from milestone 1.6 on.
// The website header and the game header are separate bars (PRD 6.2).
export default function PlayPage() {
  return (
    <div className={styles.page}>
      <div className={styles.webhdr}>
        <SiteHeader />
      </div>
      <header className={styles.gamehdr}>
        <div className={styles.farm}>
          <span className="px">Your farm</span>
          <span className="muted">No farm started yet</span>
        </div>
      </header>
      <main id="main" className={styles.stage}>
        <div className={`card ${styles.empty}`}>
          <h1 className={`px ${styles.h1}`}>The farm is being built</h1>
          <p className="muted">
            The game opens here. For now you can read about it on the home page.
          </p>
          <Link href="/" className="btn">
            Back to the home page
          </Link>
        </div>
      </main>
    </div>
  );
}
