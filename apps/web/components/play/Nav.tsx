'use client';

import { useGame, type Tab } from '@/lib/game/store';
import { Icon, type IconName } from './Icon';
import styles from './play.module.css';

export const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'farm', label: 'Farm', icon: 'farm' },
  { id: 'market', label: 'Market', icon: 'market' },
  { id: 'herd', label: 'Herd', icon: 'herd' },
  { id: 'paddocks', label: 'Paddocks', icon: 'paddocks' },
  { id: 'plans', label: 'Plans', icon: 'plans' },
  { id: 'more', label: 'More', icon: 'more' },
];

/**
 * The tabs. A bar along the bottom on a phone held upright, a rail down the
 * side on a phone on its side, and a row at the top of the side panel on a
 * PC (the stylesheet places it). Only Farm works in this piece.
 */
export function Nav() {
  const tab = useGame((s) => s.tab);
  const setTab = useGame((s) => s.setTab);
  return (
    <nav className={styles.nav} aria-label="Game sections">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`${styles.navbtn} ${tab === t.id ? styles.navon : ''}`}
          aria-current={tab === t.id ? 'page' : undefined}
          onClick={() => setTab(t.id)}
        >
          <Icon name={t.icon} size={20} />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

/** A plain panel for the tabs that are not built yet. The farm can still be looked at. */
export function ComingSoon({ tab }: { tab: Tab }) {
  const setTab = useGame((s) => s.setTab);
  const name = TABS.find((t) => t.id === tab)?.label ?? 'This part';
  return (
    <section className={styles.soon} aria-label={name}>
      <h2 className={`px ${styles.soontitle}`}>{name}</h2>
      <p>Coming soon.</p>
      <p className="muted">The farm is still here. You can look at it and move time on.</p>
      <button type="button" className="btn" onClick={() => setTab('farm')}>
        Back to the farm
      </button>
    </section>
  );
}
