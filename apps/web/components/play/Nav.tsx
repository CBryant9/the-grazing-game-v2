'use client';

import { useLayout } from '@/lib/game/hooks';
import { badgeText, unreadWord } from '@/lib/game/more';
import { useGame, type MorePage, type Tab } from '@/lib/game/store';
import { Icon, type IconName } from './Icon';
import { useUi } from './ui';
import styles from './play.module.css';

/** The tabs on a phone, in the mockup's order. Plans keeps its own tab (REQUIREMENTS). */
export const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'farm', label: 'Build', icon: 'hammer' },
  { id: 'herd', label: 'Herd', icon: 'cow' },
  { id: 'paddocks', label: 'Paddocks', icon: 'grass' },
  { id: 'market', label: 'Market', icon: 'tag' },
  { id: 'plans', label: 'Plans', icon: 'plan' },
  { id: 'more', label: 'More', icon: 'dots' },
];

type PcTab = { key: string; label: string; tab: Tab; page?: MorePage };

/**
 * The side panel's tabs on a PC, as the mockup: Herd, Plans, Paddocks, Market, Scores · Diary.
 * Build comes first (the build tools and things to do live there) and More last (the inbox,
 * workforce, help, farm and settings). Feed is added when its panel exists.
 */
const PC_TABS: PcTab[] = [
  { key: 'farm', label: 'Build', tab: 'farm' },
  { key: 'herd', label: 'Herd', tab: 'herd' },
  { key: 'plans', label: 'Plans', tab: 'plans' },
  { key: 'paddocks', label: 'Paddocks', tab: 'paddocks' },
  { key: 'market', label: 'Market', tab: 'market' },
  { key: 'scores', label: 'Scores · Diary', tab: 'more', page: 'scores' },
  { key: 'more', label: 'More', tab: 'more', page: 'menu' },
];

const isRecord = (p: MorePage): boolean => p === 'scores' || p === 'diary';

/** The row of tabs at the top of the side panel on a PC. */
function PcNav() {
  const tab = useGame((s) => s.tab);
  const page = useGame((s) => s.morePage);
  const setTab = useGame((s) => s.setTab);
  const openMore = useGame((s) => s.openMore);
  const setMoreExtra = useUi((s) => s.setMoreExtra);
  const unread = useGame((s) => s.snapshot?.inboxUnread ?? 0);
  const on = (t: PcTab): boolean =>
    t.tab !== tab
      ? false
      : t.key === 'scores'
        ? isRecord(page)
        : t.key === 'more'
          ? !isRecord(page)
          : true;
  return (
    <nav className={styles.ptabs} aria-label="Game sections">
      {PC_TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          className={`${styles.ptab} ${on(t) ? styles.ptabon : ''}`}
          aria-current={on(t) ? 'page' : undefined}
          onClick={() => {
            setTab(t.tab);
            setMoreExtra(null);
            if (t.page) openMore(t.page);
          }}
        >
          {t.label}
          {t.key === 'more' && unread > 0 && (
            <>
              <span className={styles.ptabbadge} aria-hidden="true">
                {badgeText(unread)}
              </span>
              <span className="sr-only">, {unreadWord(unread)}</span>
            </>
          )}
        </button>
      ))}
    </nav>
  );
}

/**
 * The tabs. A bar along the bottom on a phone held upright, a rail down the
 * side on a phone on its side (the stylesheet places it), and a row at the
 * top of the side panel on a PC. On a phone, Build opens the build tray over
 * the map; tapping it again closes the tray and goes back to Look.
 */
export function Nav() {
  const layout = useLayout();
  const tab = useGame((s) => s.tab);
  const setTab = useGame((s) => s.setTab);
  const building = useGame((s) => s.build !== null);
  const selectTool = useGame((s) => s.selectTool);
  const trayOpen = useUi((s) => s.trayOpen);
  const setTray = useUi((s) => s.setTray);
  const setMoreExtra = useUi((s) => s.setMoreExtra);
  const unread = useGame((s) => s.snapshot?.inboxUnread ?? 0);
  if (layout === 'pc') return <PcNav />;
  const on = (id: Tab): boolean =>
    id === 'farm' ? tab === 'farm' && (trayOpen || building) : tab === id;
  const pick = (id: Tab): void => {
    setMoreExtra(null);
    if (id !== 'farm') {
      setTray(false);
      setTab(id);
      return;
    }
    if (tab === 'farm' && (trayOpen || building)) {
      setTray(false);
      selectTool('look');
    } else {
      setTab('farm');
      setTray(true);
    }
  };
  return (
    <nav className={styles.nav} aria-label="Game sections">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`${styles.navbtn} ${on(t.id) ? styles.navon : ''}`}
          aria-current={on(t.id) && t.id !== 'farm' ? 'page' : undefined}
          aria-expanded={t.id === 'farm' ? on('farm') : undefined}
          onClick={() => pick(t.id)}
        >
          <span className={styles.navicon}>
            <Icon name={t.icon} size={24} />
            {t.id === 'more' && unread > 0 && (
              <span className={styles.navbadge} aria-hidden="true">
                {badgeText(unread)}
              </span>
            )}
          </span>
          <span>{t.label}</span>
          {t.id === 'more' && unread > 0 && <span className="sr-only">, {unreadWord(unread)}</span>}
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
