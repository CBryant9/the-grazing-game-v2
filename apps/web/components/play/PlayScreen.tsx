'use client';

import { useEffect } from 'react';
import { SiteHeader } from '@/components/SiteHeader';
import { useLayout, useReducedMotion, useTheme } from '@/lib/game/hooks';
import { useGame } from '@/lib/game/store';
import type { Snapshot } from '@/lib/game/types';
import { FarmMap } from './FarmMap';
import { ComingSoon, Nav } from './Nav';
import { PaddockSheet } from './PaddockSheet';
import { SummaryCard } from './SummaryCard';
import { PaddockChips, TodoBanner, TodoList } from './Todo';
import { TopBar } from './TopBar';
import styles from './play.module.css';

/** A little after last light the map is dusk: the farm goes dark and can still be looked at. */
const DUSK_AFTER_LAST_LIGHT = 25;

function NoticeBar() {
  const notice = useGame((s) => s.notice);
  const dismiss = useGame((s) => s.dismissNotice);
  if (!notice) return null;
  return (
    <div className={styles.notice} role="alert">
      <p>{notice.message}</p>
      <div className={styles.noticebtns}>
        {notice.retry && (
          <button type="button" className="btn sm coral" onClick={() => notice.retry?.()}>
            Try again
          </button>
        )}
        <button type="button" className="btn sm ghost" onClick={dismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

function GameOver() {
  const restart = useGame((s) => s.restart);
  const busy = useGame((s) => s.busy > 0);
  const over = useGame((s) => s.snapshot?.over);
  if (!over) return null;
  return (
    <div className={styles.gameover} role="status">
      <p>{over.text}</p>
      <button
        type="button"
        className="btn sm"
        disabled={busy}
        onClick={() => {
          if (window.confirm('Start a new farm? This farm will be gone.')) void restart();
        }}
      >
        Start a new farm
      </button>
    </div>
  );
}

/** The farm side panel on a PC: things to do, or the paddock that was tapped. */
function FarmPanel({ snapshot }: { snapshot: Snapshot }) {
  const paddockId = useGame((s) => s.paddockId);
  const close = useGame((s) => s.closePaddock);
  if (paddockId !== null)
    return <PaddockSheet snapshot={snapshot} paddockId={paddockId} onClose={close} />;
  return (
    <div className={styles.sidebody}>
      <h2 className={`px ${styles.minihead}`}>Things to do</h2>
      <TodoList snapshot={snapshot} />
      <h2 className={`px ${styles.minihead}`}>Paddocks</h2>
      <PaddockChips snapshot={snapshot} />
    </div>
  );
}

/**
 * The play screen: one set of components in three layouts (PRD 6.1, 6.1a,
 * 6.2). The map fills its area. The top bar, the things to do, the sheet and
 * the tabs are placed by the stylesheet for each layout.
 */
export function PlayScreen({ snapshot }: { snapshot: Snapshot }) {
  const layout = useLayout();
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const tab = useGame((s) => s.tab);
  const paddockId = useGame((s) => s.paddockId);
  const openPaddock = useGame((s) => s.openPaddock);
  const closePaddock = useGame((s) => s.closePaddock);
  const summary = useGame((s) => s.summary);

  const { clock } = snapshot;
  // Evening: nothing more can start today, so the farm is lit for dusk. It can still be looked at.
  const minutes = clock.evening
    ? Math.max(clock.now, clock.lastLight + DUSK_AFTER_LAST_LIGHT)
    : clock.now;

  // The page itself does not scroll: the map takes the room.
  useEffect(() => {
    document.documentElement.classList.add('play-lock');
    return () => document.documentElement.classList.remove('play-lock');
  }, []);

  const pc = layout === 'pc';
  const showPaddockSheet = paddockId !== null && tab === 'farm' && !pc;

  return (
    <div className={styles.screen} data-layout={layout} data-evening={clock.evening}>
      {pc && (
        <div className={styles.webhdr}>
          <SiteHeader />
        </div>
      )}
      <TopBar snapshot={snapshot} />
      <div className={styles.body}>
        {pc && (
          <aside className={styles.side} aria-label="Farm panel">
            <Nav />
            {tab === 'farm' ? <FarmPanel snapshot={snapshot} /> : <ComingSoon tab={tab} />}
          </aside>
        )}
        <main id="main" className={styles.stage} tabIndex={-1}>
          <FarmMap
            view={snapshot.view}
            theme={theme}
            minutes={minutes}
            selected={paddockId}
            reduceMotion={reduceMotion}
            onTapPaddock={openPaddock}
          />
          <NoticeBar />
          <GameOver />
          {!pc && tab === 'farm' && !showPaddockSheet && <TodoBanner snapshot={snapshot} />}
          {showPaddockSheet && (
            <PaddockSheet snapshot={snapshot} paddockId={paddockId} onClose={closePaddock} />
          )}
          {!pc && tab !== 'farm' && <ComingSoon tab={tab} />}
        </main>
        {!pc && <Nav />}
      </div>
      {summary && <SummaryCard summary={summary} />}
    </div>
  );
}
