'use client';

import { useEffect, useRef, useState } from 'react';
import type { FarmViewPaddock, FarmViewPlanting } from '@gg/shared';
// The side-view picture is plain canvas. It loads without PixiJS.
import { drawSward, swardCaption, swardParts } from '@gg/render/sward';
import { num } from '@/lib/game/format';
import { useTheme } from '@/lib/game/hooks';
import styles from './play.module.css';

const HEIGHT = 120;
const GAP = 8;

function Picture({
  sward,
  seed,
  width,
  label,
}: {
  sward: Parameters<typeof drawSward>[1];
  seed: number;
  width: number;
  label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const theme = useTheme();
  useEffect(() => {
    const el = ref.current;
    if (!el || width < 40) return;
    drawSward(el, sward, {
      width,
      height: HEIGHT,
      pixelRatio: window.devicePixelRatio || 1,
      seed,
      fontFamily: getComputedStyle(document.body).fontFamily,
    });
  }, [sward, seed, width, theme]);
  return <canvas ref={ref} role="img" aria-label={label} className={styles.swardcanvas} />;
}

/**
 * The paddock's side-view picture with its caption. A paddock that is part
 * crop and part pasture shows two pictures side by side, each with its area
 * (docs/VISUALS.md). The picture is drawn from the same figures as the
 * sheet, so it says what the sheet says.
 */
export function Sward({
  paddock,
  plantings,
}: {
  paddock: FarmViewPaddock;
  plantings: readonly FarmViewPlanting[];
}) {
  const parts = swardParts(paddock, plantings);
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const measure = (): void => setWidth(Math.floor(el.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const each = parts.length > 1 ? Math.floor((width - GAP) / parts.length) : width;
  return (
    <div ref={host} className={styles.swardwrap}>
      <div className={styles.swardrow}>
        {parts.map((part) => (
          <figure key={part.title} className={styles.sward}>
            <Picture
              sward={part.sward}
              seed={paddock.id + part.title.length}
              width={each}
              label={`Side view of ${parts.length > 1 ? part.title : paddock.name}`}
            />
            <figcaption>
              {parts.length > 1 && (
                <b>
                  {part.title}, {num(part.ha, 1)} ha.{' '}
                </b>
              )}
              {swardCaption(part.sward)}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
