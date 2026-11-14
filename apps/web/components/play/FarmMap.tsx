'use client';

import { useEffect, useRef, useState } from 'react';
import type { FarmView } from '@gg/shared';
// Types only: these lines load nothing. The renderer (and PixiJS with it) is
// loaded below, once the page is on screen, so it is not in the first load.
import type { FarmMap as FarmMapHandle, PickablePaddock } from '@gg/render';
import type { ThemeName } from '@/lib/game/hooks';
import styles from './play.module.css';

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
}: {
  view: FarmView;
  theme: ThemeName;
  /** The time of day to light the map for, minutes after midnight. */
  minutes: number;
  selected: number | null;
  /** Paddocks a tool can pick (the move tool), outlined lightly, red where there is no water. Null when none. */
  pickable: readonly PickablePaddock[] | null;
  reduceMotion: boolean;
  onTapPaddock: (paddock: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<FarmMapHandle | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const fitted = useRef(false);

  // Keep the newest values for the one-off setup below.
  const latest = useRef({ view, theme, onTapPaddock });
  useEffect(() => {
    latest.current = { view, theme, onTapPaddock };
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

  return (
    <div className={styles.mapwrap}>
      <div ref={hostRef} className={styles.maphost} data-testid="map-host" />
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
