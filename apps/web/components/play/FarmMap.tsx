'use client';

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { FARM_GRID_W, type FarmView } from '@gg/shared';
// Types only: these lines load nothing. The renderer (and PixiJS with it) is
// loaded below, once the page is on screen, so it is not in the first load.
import type {
  ContractorFence,
  FarmMap as FarmMapHandle,
  MapDragEvent,
  MapDraft,
  MapFenceTapEvent,
  MapToolTapEvent,
  PickablePaddock,
} from '@gg/render';
import type { MapToolName } from '@/lib/game/build';
import type { ThemeName } from '@/lib/game/hooks';
import { insetsOf, revealMove, type Box, type CoverEdge } from '@/lib/game/covers';
import type { MapFocus } from './ui';
import styles from './play.module.css';

const NO_BADGES: readonly { cell: number; text: string }[] = [];

type Cover = RefObject<HTMLElement | null>;

/** What lies over each edge of the map. Top and bottom sit on those edges; left and right are columns. */
export interface MapCovers {
  top?: Cover;
  bottom?: Cover;
  left?: Cover;
  right?: Cover;
}

const NO_COVERS: MapCovers = {};

/**
 * The boxes each cover takes up on the map, in map pixels. A cover that only
 * lays out its children (a column of a chip and a tool bar) is measured by
 * its children, so the map between them counts as clear. The bottom tray is
 * measured by its layout height, not where it is drawn: sliding away while a
 * line is drawn must not move the map.
 */
function coverBoxes(wrap: HTMLElement, c: MapCovers): Partial<Record<CoverEdge, Box[]>> {
  const at = wrap.getBoundingClientRect();
  const W = wrap.clientWidth;
  const H = wrap.clientHeight;
  const boxes = (el: HTMLElement | null | undefined): Box[] => {
    if (!el) return [];
    const kids = [...el.children].map((k) => k.getBoundingClientRect());
    const list = kids.length ? kids : [el.getBoundingClientRect()];
    return list
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({
        x0: r.left - at.left,
        y0: r.top - at.top,
        x1: r.right - at.left,
        y1: r.bottom - at.top,
      }));
  };
  const bottom = c.bottom?.current;
  return {
    top: boxes(c.top?.current),
    bottom: bottom?.offsetHeight
      ? [{ x0: 0, y0: H - Math.min(bottom.offsetHeight, H), x1: W, y1: H }]
      : [],
    left: boxes(c.left?.current),
    right: boxes(c.right?.current),
  };
}

/** True if two lists hold the same elements in the same order. */
const sameList = (a: readonly Element[], b: readonly Element[]): boolean =>
  a.length === b.length && a.every((e, i) => e === b[i]);

/** How close the map comes when a button asks it to frame a spot: near enough to build there, screen pixels a square. */
export const FOCUS_PX_PER_SQUARE = 30;

/** Put the build card beside a point on the ground, inside the map. With no anchor it goes back to the stylesheet's place. */
function placeCard(
  el: HTMLElement,
  wrap: HTMLElement,
  map: FarmMapHandle,
  anchor: { gx: number; gy: number } | null,
): void {
  if (!anchor) {
    el.style.removeProperty('left');
    el.style.removeProperty('top');
    return;
  }
  const p = map.groundToScreen(anchor.gx, anchor.gy);
  el.style.removeProperty('max-height');
  const W = wrap.clientWidth;
  const H = wrap.clientHeight;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  let left = p.x + 18;
  if (left + w > W - 8) left = p.x - 18 - w;
  left = Math.min(Math.max(left, 8), Math.max(8, W - w - 8));
  let top = Math.min(Math.max(p.y - h / 2, 8), Math.max(8, H - h - 8));
  // Keep clear of the step chip over the map (19 Nov 2026): below it if the card fits there.
  const chip = wrap.parentElement?.querySelector<HTMLElement>('[data-guide]');
  if (chip) {
    const at = wrap.getBoundingClientRect();
    const c = chip.getBoundingClientRect();
    const cx0 = c.left - at.left;
    const cx1 = c.right - at.left;
    const cy1 = c.bottom - at.top;
    const overlaps = left < cx1 && left + w > cx0 && top < cy1;
    if (overlaps) {
      // Below the chip, shortened to fit if need be (the card scrolls).
      top = cy1 + 8;
      const room = H - 8 - top;
      if (h > room) el.style.maxHeight = `${Math.max(160, Math.round(room))}px`;
    }
  }
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
}

/**
 * The farm map. It draws the snapshot's view and follows the theme and the
 * time of day. A tap opens the paddock under it, never a cow. Pan and zoom
 * work by touch and mouse (the renderer handles both).
 */
export function FarmMap({
  view,
  theme,
  minutes,
  liveClock,
  cattlePace = 1,
  selected,
  pickable,
  reduceMotion,
  onTapPaddock,
  tool,
  draft,
  contractor,
  anchor,
  anchorEl,
  floating,
  onDrag,
  onToolTap,
  onFenceTap,
  badges = NO_BADGES,
  focus = null,
  focusLiftPx = 0,
  covers = NO_COVERS,
  reveal = false,
}: {
  /**
   * What the page lays over the map: on a phone, the top bar and the build
   * tray; on its side, the tool column and the card. The farm can be dragged
   * out from under them, and a line's end is moved clear when its card comes up.
   */
  covers?: MapCovers;
  /** True when the card has come up: move the map so the end of the line is not under a cover. */
  reveal?: boolean;
  /** A spot to frame (from a Things to do button or a first step). Each new ask moves the map once. */
  focus?: MapFocus | null;
  /** Put the framed spot this many pixels above the middle, clear of a tray at the bottom. */
  focusLiftPx?: number;
  /** Numbers to show on paddocks, such as the order of a grazing plan. */
  badges?: readonly { cell: number; text: string }[];
  view: FarmView;
  theme: ThemeName;
  /** The time of day to light the map for, minutes after midnight. */
  minutes: number;
  /**
   * Fast Farm's moving day: the light follows this every frame instead of `minutes`, straight
   * to the renderer, with no React redraw. Null for the farm's own clock (Daily Farm).
   */
  liveClock?: {
    now: number | null;
    subscribe: (fn: (minutes: number | null) => void) => () => void;
  } | null;
  /** How fast the cattle walk and graze: 1 normal, 2 or 4 with a faster day, 0 standing still. */
  cattlePace?: number;
  selected: number | null;
  /** Paddocks a tool can pick (the move tool), outlined lightly, purple where there is no water. Null when none. */
  pickable: readonly PickablePaddock[] | null;
  reduceMotion: boolean;
  onTapPaddock: (paddock: number) => void;
  /** What the pointer does: Look, or a build tool. */
  tool: MapToolName;
  /** The line about to be built, drawn on top. Null for none. */
  draft: MapDraft | null;
  /** The contractor's fence under way: built and still to build, drawn in its own colour. */
  contractor: ContractorFence;
  /** The point on the ground the build card sits beside. */
  anchor: { gx: number; gy: number } | null;
  /** The card to place beside it (on a PC). */
  anchorEl: RefObject<HTMLElement | null>;
  /** True when the card floats beside the line, false when it sits above the tool bar. */
  floating: boolean;
  onDrag: (e: MapDragEvent) => void;
  onToolTap: (e: MapToolTapEvent) => void;
  onFenceTap: (e: MapFenceTapEvent) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<FarmMapHandle | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const fitted = useRef(false);

  // Keep the newest values for the one-off setup below.
  const latest = useRef({ view, theme, onTapPaddock, onDrag, onToolTap, onFenceTap });
  useEffect(() => {
    latest.current = { view, theme, onTapPaddock, onDrag, onToolTap, onFenceTap };
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let dead = false;
    let map: FarmMapHandle | null = null;
    setFailed(false);
    (async () => {
      try {
        const render = await import('@gg/render');
        if (dead) return;
        const made = await render.createFarmMap(host, {
          theme: latest.current.theme,
          fontFamily: getComputedStyle(document.body).fontFamily,
          label: 'Map of your farm. Tap a paddock to open it.',
        });
        if (dead) {
          made.destroy();
          return;
        }
        map = made;
        mapRef.current = made;
        made.on('tap', (e) => {
          if (e.paddock >= 0) latest.current.onTapPaddock(e.paddock);
        });
        made.on('drag', (e) => latest.current.onDrag(e));
        made.on('toolTap', (e) => latest.current.onToolTap(e));
        made.on('fenceTap', (e) => latest.current.onFenceTap(e));
        made.setView(latest.current.view);
        made.fitFarm();
        fitted.current = true;
        setReady(true);
      } catch {
        if (!dead) setFailed(true);
      }
    })();
    return () => {
      dead = true;
      fitted.current = false;
      setReady(false);
      map?.destroy();
      mapRef.current = null;
    };
  }, [attempt]);

  useEffect(() => {
    if (ready) mapRef.current?.setView(view);
  }, [ready, view]);
  useEffect(() => {
    if (ready) mapRef.current?.setTheme(theme);
  }, [ready, theme]);
  useEffect(() => {
    if (ready && !liveClock) mapRef.current?.setTimeOfDay(minutes);
  }, [ready, minutes, liveClock]);
  useEffect(() => {
    if (!ready || !liveClock) return;
    mapRef.current?.setTimeOfDay(liveClock.now ?? minutes);
    return liveClock.subscribe((m) => mapRef.current?.setTimeOfDay(m));
    // `minutes` is only the first light until the clock publishes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, liveClock]);
  useEffect(() => {
    if (ready) mapRef.current?.setHighlight(selected);
  }, [ready, selected]);
  useEffect(() => {
    if (ready) mapRef.current?.setPickable(pickable);
  }, [ready, pickable]);
  useEffect(() => {
    if (ready) mapRef.current?.setReduceMotion(reduceMotion);
  }, [ready, reduceMotion]);
  useEffect(() => {
    if (ready) mapRef.current?.setCattlePace(cattlePace);
  }, [ready, cattlePace]);
  useEffect(() => {
    if (ready) mapRef.current?.setTool(tool);
  }, [ready, tool]);
  useEffect(() => {
    if (ready) mapRef.current?.setDraft(draft);
  }, [ready, draft]);
  useEffect(() => {
    if (ready) mapRef.current?.setContractor(contractor);
  }, [ready, contractor]);
  // Frame the spot a button asked for: closer if need be, never further out than the player had it.
  const lift = useRef(focusLiftPx);
  useEffect(() => {
    lift.current = focusLiftPx;
  }, [focusLiftPx]);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !focus) return;
    map.zoomTo(Math.max(map.getCamera().zoom, FOCUS_PX_PER_SQUARE), focus.square);
    if (lift.current) map.panBy(0, -lift.current);
  }, [ready, focus]);

  // Numbers on paddocks follow the map as it moves. They never take a tap.
  const [badgePos, setBadgePos] = useState<{ text: string; x: number; y: number }[]>([]);
  const badgesRef = useRef(badges);
  const placeBadges = (): void => {
    const map = mapRef.current;
    const list = badgesRef.current;
    if (!map || (list.length === 0 && badgePos.length === 0)) return;
    setBadgePos(
      list.map((b) => {
        const p = map.groundToScreen(
          (b.cell % FARM_GRID_W) + 0.5,
          Math.floor(b.cell / FARM_GRID_W) + 0.5,
        );
        return { text: b.text, x: Math.round(p.x), y: Math.round(p.y) };
      }),
    );
  };
  useLayoutEffect(() => {
    badgesRef.current = badges;
    placeBadges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, badges]);
  useEffect(() => {
    if (!ready) return;
    return mapRef.current?.on('camera', placeBadges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Keep the build card beside the line, inside the map, as the map moves.
  const wrapRef = useRef<HTMLDivElement>(null);
  const placing = useRef({ anchor, floating });
  const placeNow = (): void => {
    const el = anchorEl.current;
    const wrap = wrapRef.current;
    const map = mapRef.current;
    if (el && wrap && map) {
      placeCard(el, wrap, map, placing.current.floating ? placing.current.anchor : null);
    }
  };
  // When the anchor moves or the card shows, place it. Not on every render: placing reads
  // the page's layout, and a drag re-renders on every step.
  const ax = anchor?.gx;
  const ay = anchor?.gy;
  useLayoutEffect(() => {
    placing.current = { anchor, floating };
    placeNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, ax, ay, floating]);
  useEffect(() => {
    if (!ready) return;
    return mapRef.current?.on('camera', placeNow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  // The card's size changes with what it says: place it again when its contents change size.
  // Its children are watched, not the card itself, whose height the placing may cap.
  const cardWatch = useRef<{ ro: ResizeObserver | null; els: Element[] }>({ ro: null, els: [] });
  useLayoutEffect(() => {
    const el = anchorEl.current;
    const els = el ? [...el.children] : [];
    const w = cardWatch.current;
    if (sameList(els, w.els)) return;
    w.ro?.disconnect();
    w.ro = null;
    w.els = els;
    if (!els.length || typeof ResizeObserver !== 'function') return;
    w.ro = new ResizeObserver(() => placeNow());
    for (const e of els) w.ro.observe(e);
  });

  // The page's bars and columns cover parts of the map: tell the map, so the farm can be
  // pulled clear of them. Measured when one of them, or one of the pieces in them, changes
  // size (a ResizeObserver), not on every render: a drag re-renders on every step.
  const coverWatch = useRef<{ ro: ResizeObserver | null; els: Element[] }>({ ro: null, els: [] });
  const placeInsets = (): void => {
    const map = mapRef.current;
    const wrap = wrapRef.current;
    if (!map || !wrap) return;
    const i = insetsOf(coverBoxes(wrap, covers), wrap.clientWidth, wrap.clientHeight);
    map.setInsets(i.top, i.bottom, i.left, i.right);
  };
  // After each render only the list of elements is compared (no layout is read). A new
  // element (a card or chip that came up) is watched, and the insets measured at once.
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!ready || !wrap) return;
    const els: Element[] = [wrap];
    for (const c of [covers.top, covers.bottom, covers.left, covers.right]) {
      const el = c?.current;
      if (el) els.push(el, ...el.children);
    }
    const w = coverWatch.current;
    if (w.ro && sameList(els, w.els)) return;
    w.ro?.disconnect();
    w.els = els;
    placeInsets();
    w.ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => placeInsets()) : null;
    for (const e of els) w.ro?.observe(e);
  });
  useEffect(
    () => () => {
      coverWatch.current.ro?.disconnect();
      cardWatch.current.ro?.disconnect();
    },
    [],
  );

  // When the card comes up, the end of the line is moved out from under the tray, column or card.
  useEffect(() => {
    const map = mapRef.current;
    const wrap = wrapRef.current;
    if (!ready || !reveal || !anchor || !map || !wrap) return;
    const all = Object.values(coverBoxes(wrap, covers)).flat();
    const p = map.groundToScreen(anchor.gx, anchor.gy);
    const [dx, dy] = revealMove(p, all, wrap.clientWidth, wrap.clientHeight);
    if (dx || dy) map.panBy(dx, dy);
  }, [ready, reveal, anchor, covers]);

  return (
    <div ref={wrapRef} className={styles.mapwrap}>
      <div ref={hostRef} className={styles.maphost} data-testid="map-host" />
      {badgePos.length > 0 && (
        <div className={styles.badges} aria-hidden="true">
          {badgePos.map((b, i) => (
            <span key={`${b.text}-${i}`} className={styles.badge} style={{ left: b.x, top: b.y }}>
              {b.text}
            </span>
          ))}
        </div>
      )}
      {!ready && !failed && (
        <p className={styles.maploading} role="status">
          Loading the map
        </p>
      )}
      {failed && (
        <div className={styles.mapfail} role="alert">
          <p>The map could not load.</p>
          <button type="button" className="btn" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
