'use client';

import { useEffect, useMemo, useRef } from 'react';
import { SiteHeader } from '@/components/SiteHeader';
import { buildAnchor, buildDraft, mapToolFor } from '@/lib/game/build';
import { pickable } from '@/lib/game/lists';
import { mapBadges } from '@/lib/game/plans';
import { pickDraft } from '@/lib/game/sow';
import { useLayout, useReducedMotion, useTheme } from '@/lib/game/hooks';
import { useGame, type Tab } from '@/lib/game/store';
import type { Snapshot } from '@/lib/game/types';
import { BuildBar } from './BuildBar';
import { BuildCard } from './BuildCard';
import { FarmMap } from './FarmMap';
import { HerdList, PaddockList } from './Lists';
import { MarketPanel } from './MarketPanel';
import { MobCard } from './MobCard';
import { MorePanel } from './MorePanel';
import { MoveFlow } from './MoveFlow';
import { ComingSoon, Nav } from './Nav';
import { PaddockSheet } from './PaddockSheet';
import { PlanFlow } from './PlanFlow';
import { PlansPanel } from './PlansPanel';
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

/** What opens from the farm: the move tool, a mob card, or a paddock sheet. Null when nothing is open. */
function Opened({ snapshot }: { snapshot: Snapshot }) {
  const paddockId = useGame((s) => s.paddockId);
  const mobId = useGame((s) => s.mobId);
  const move = useGame((s) => s.move);
  const plan = useGame((s) => s.plan);
  const closePaddock = useGame((s) => s.closePaddock);
  const closeMob = useGame((s) => s.closeMob);
  if (move) return <MoveFlow snapshot={snapshot} />;
  if (plan) return <PlanFlow snapshot={snapshot} />;
  if (mobId !== null) {
    return <MobCard key={`mob-${mobId}`} snapshot={snapshot} mobId={mobId} onClose={closeMob} />;
  }
  if (paddockId !== null) {
    return (
      <PaddockSheet
        key={`paddock-${paddockId}`}
        snapshot={snapshot}
        paddockId={paddockId}
        onClose={closePaddock}
      />
    );
  }
  return null;
}

/** The farm side panel on a PC: what is open, or things to do. */
function FarmPanel({ snapshot }: { snapshot: Snapshot }) {
  const open = useGame(
    (s) => s.move !== null || s.plan !== null || s.mobId !== null || s.paddockId !== null,
  );
  if (open) return <Opened snapshot={snapshot} />;
  return (
    <div className={styles.sidebody}>
      <BuildBar build={snapshot.build} docked />
      <h2 className={`px ${styles.minihead}`}>Things to do</h2>
      <TodoList snapshot={snapshot} />
      <h2 className={`px ${styles.minihead}`}>Paddocks</h2>
      <PaddockChips snapshot={snapshot} />
    </div>
  );
}

/** A tab other than Farm: the lists for Herd and Paddocks, and Coming soon for the rest. */
function TabPanel({ tab, snapshot }: { tab: Tab; snapshot: Snapshot }) {
  if (tab === 'herd') return <HerdList snapshot={snapshot} />;
  if (tab === 'paddocks') return <PaddockList snapshot={snapshot} />;
  if (tab === 'market') return <MarketPanel snapshot={snapshot} />;
  if (tab === 'plans') return <PlansPanel snapshot={snapshot} />;
  if (tab === 'more') return <MorePanel snapshot={snapshot} />;
  return <ComingSoon tab={tab} />;
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
  const mobId = useGame((s) => s.mobId);
  const move = useGame((s) => s.move);
  const plan = useGame((s) => s.plan);
  const sow = useGame((s) => s.sow);
  const planTap = useGame((s) => s.planTap);
  const sowDrag = useGame((s) => s.sowDrag);
  const openPaddock = useGame((s) => s.openPaddock);
  const moveTargetPicked = useGame((s) => s.moveTargetPicked);
  const summary = useGame((s) => s.summary);
  const build = useGame((s) => s.build);
  const buildDrag = useGame((s) => s.buildDrag);
  const buildTap = useGame((s) => s.buildTap);
  const buildEnd = useGame((s) => s.buildEnd);
  const startFix = useGame((s) => s.startFix);
  const cardRef = useRef<HTMLDivElement>(null);

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

  // Escape goes back to Look from any tool, as long as no job is being done.
  useEffect(() => {
    if (!build || build.phase === 'applying') return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') buildEnd();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [build, buildEnd]);

  const pc = layout === 'pc';
  const sheetOpen =
    tab === 'farm' &&
    !pc &&
    (move !== null || plan !== null || mobId !== null || paddockId !== null);

  // While the move tool asks for a paddock, a tap picks it. Otherwise a tap opens it.
  const picking = move !== null && move.mobId !== null && move.phase !== 'done';
  const mover = move && move.mobId !== null ? snapshot.mobs.find((m) => m.id === move.mobId) : null;
  const pickables = useMemo(
    () =>
      picking &&
      move &&
      (move.phase === 'pick' || move.phase === 'refused' || move.phase === 'confirm')
        ? pickable(snapshot.paddocks, snapshot.mobs, mover ?? null).map((r) => ({
            paddock: r.paddock.id,
            dry: r.dry,
          }))
        : null,
    [picking, move, snapshot.paddocks, snapshot.mobs, mover],
  );

  // The build tools: what the map's pointer does, and the line about to be built.
  // Picking squares to sow takes the same squares tool; the numbers of a plan sit over the map.
  const sowing = sow?.picking === true;
  const mapTool = sowing ? 'squares' : mapToolFor(build);
  const draft = useMemo(
    () => (sowing ? pickDraft(sow) : buildDraft(build, snapshot.view)),
    [sowing, sow, build, snapshot.view],
  );
  const badges = useMemo(
    () => mapBadges(plan?.draft ?? null, snapshot.paddocks),
    [plan?.draft, snapshot.paddocks],
  );
  const planning =
    plan !== null &&
    (plan.phase === 'edit' || plan.phase === 'refused' || plan.phase === 'confirm');
  const anchor = useMemo(() => buildAnchor(build), [build]);
  // The tool bar and the card show on the farm tab, when no sheet is open.
  const showBuild = tab === 'farm' && !sheetOpen;

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
            {tab === 'farm' ? (
              <FarmPanel snapshot={snapshot} />
            ) : (
              <TabPanel tab={tab} snapshot={snapshot} />
            )}
          </aside>
        )}
        <main id="main" className={styles.stage} tabIndex={-1}>
          <FarmMap
            view={snapshot.view}
            theme={theme}
            minutes={minutes}
            selected={move ? move.target : paddockId}
            pickable={pickables}
            reduceMotion={reduceMotion}
            onTapPaddock={
              picking
                ? (id) => void moveTargetPicked(id)
                : move
                  ? () => {}
                  : planning
                    ? planTap
                    : plan
                      ? () => {}
                      : openPaddock
            }
            tool={mapTool}
            draft={draft}
            badges={badges}
            anchor={anchor}
            anchorEl={cardRef}
            floating={pc}
            onDrag={(e) =>
              sowing
                ? sowDrag({ phase: e.phase, square: e.square })
                : buildDrag({ phase: e.phase, corner: e.corner, square: e.square })
            }
            onToolTap={(e) =>
              void buildTap({
                square: e.square,
                edge: e.edge,
                edgeCode: e.edgeCode,
                edgeDistPx: e.edgeDistPx,
                corner: e.corner,
                hub: e.hub,
              })
            }
            onFenceTap={(e) => void startFix(e.edge)}
          />
          <NoticeBar />
          <GameOver />
          {!pc && tab === 'farm' && !sheetOpen && !build && <TodoBanner snapshot={snapshot} />}
          {sheetOpen && <Opened snapshot={snapshot} />}
          {pc && showBuild && <BuildCard build={snapshot.build} innerRef={cardRef} floating />}
          {!pc && showBuild && (
            <div className={styles.buildstack}>
              <BuildCard build={snapshot.build} innerRef={cardRef} floating={false} />
              <BuildBar build={snapshot.build} docked={false} />
            </div>
          )}
          {!pc && tab !== 'farm' && <TabPanel tab={tab} snapshot={snapshot} />}
        </main>
        {!pc && <Nav />}
      </div>
      {summary && <SummaryCard summary={summary} />}
    </div>
  );
}
