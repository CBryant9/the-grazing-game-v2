'use client';

import { buildGuide } from '@/lib/game/buildguide';
import { useGame } from '@/lib/game/store';
import type { BuildWire } from '@/lib/game/types';
import { Icon } from './Icon';
import { useUi } from './ui';
import styles from './play.module.css';

/**
 * The step chip over the map while a build tool is picked: the three steps
 * of the job with the current one lit, one plain line on what to do next, and
 * a big Back to Look. It sits at the top of the map, clear of where the
 * player draws, and goes when the tool snaps back to Look.
 */
export function BuildGuide({ build }: { build: BuildWire }) {
  const b = useGame((s) => s.build);
  const select = useGame((s) => s.selectTool);
  const setTray = useUi((s) => s.setTray);
  const help = b ? (build.tools.find((t) => t.id === b.tool)?.help ?? '') : '';
  const guide = buildGuide(b, help);
  if (!b || !guide) return null;
  return (
    <section className={styles.guide} aria-label="Building: what to do next" data-guide>
      <div className={styles.guidetop}>
        <ol className={styles.guidesteps}>
          {guide.steps.map((s, i) => (
            <li
              key={s}
              aria-current={i === guide.at ? 'step' : undefined}
              data-done={i < guide.at || undefined}
            >
              <b aria-hidden="true">{i < guide.at ? '✓' : i + 1}</b>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        <button
          type="button"
          className={`btn sm ${styles.guideback}`}
          disabled={b.phase === 'applying'}
          onClick={() => {
            select('look');
            setTray(false);
          }}
        >
          <Icon name="look" size={14} /> Back to Look
        </button>
      </div>
      <p className={styles.guidetext} role="status">
        {guide.text}
      </p>
    </section>
  );
}
