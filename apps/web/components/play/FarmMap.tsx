'use client';

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { FARM_GRID_W, type FarmView } from '@gg/shared';
// Types only: these lines load nothing. The renderer (and PixiJS with it) is
// loaded below, once the page is on screen, so it is not in the first load.
import type {
  FarmMap as FarmMapHandle,
  MapDragEvent,
  MapDraft,
  MapFenceTapEvent,
  MapToolTapEvent,
  PickablePaddock,
} from '@gg/render';
import type { MapToolName } from '@/lib/game/build';
import type { ThemeName } from '@/lib/game/hooks';
import styles from './play.module.css';

const NO_BADGES: readonly { cell: number; text: string }[] = [];

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
  const W = wrap.clientWidth;
  const H = wrap.clientHeight;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  let left = p.x + 18;
  if (left + w > W - 8) left = p.x - 18 - w;
  left = Math.min(Math.max(left, 8), Math.max(8, W - w - 8));
  const top = Math.min(Math.max(p.y - h / 2, 8), Math.max(8, H - h - 8));
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
  selected,
  pickable,
  reduceMotion,
  onTapPaddock,
  tool,
  draft,
  anchor,
  anchorEl,
  floating,
  onDrag,
  onToolTap,
  onFenceTap,
  badges = NO_BADGES,
}: {
  /** Numbers to show on paddocks, such as the order of a grazing plan. */
  badges?: readonly { cell: number; text: string }[];
  view: FarmView;
  theme: ThemeName;
  /** The time of day to light the map for, minutes after midnight. */
  minutes: number;
  selected: number | null;
  /** Paddocks a tool can pick (the move tool), outlined lightly, purple where there is no water. Null when none. */
  pickable: readonly PickablePaddock[] | null;
  reduceMotion: boolean;
  onTapPaddock: (paddock: number) => void;
  /** What the pointer does: Look, or a build tool. */
  tool: MapToolName;
  /** The line about to be built, drawn on top. Null for none. */
  draft: MapDraft | null;
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
    if (ready) mapRef.current?.setTimeOfDay(minutes);
  }, [ready, minutes]);
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
    if (ready) mapRef.current?.setTool(tool);
  }, [ready, tool]);
  useEffect(() => {
    if (ready) mapRef.current?.setDraft(draft);
  }, [ready, draft]);

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
  // After every render: the card's size can change with what it says.
  useLayoutEffect(() => {
    placing.current = { anchor, floating };
    placeNow();
  });
  useEffect(() => {
    if (!ready) return;
    return mapRef.current?.on('camera', placeNow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

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
