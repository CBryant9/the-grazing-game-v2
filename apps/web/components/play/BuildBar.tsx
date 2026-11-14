'use client';

import { useId, useState } from 'react';
import { useGame } from '@/lib/game/store';
import type { BuildToolId, BuildWire } from '@/lib/game/types';
import styles from './play.module.css';

/**
 * The tool bar: Look (the default) and the build tools. On a phone it is a
 * compact bar that opens. On a PC it sits at the top of the side panel.
 * Each tool shows one short line of help and its price when picked. The
 * prices and the help lines come from the server (the snapshot's `build`).
 * Cancel, Look and Escape all go back to Look.
 */
export function BuildBar({ build, docked }: { build: BuildWire; docked: boolean }) {
  const state = useGame((s) => s.build);
  const select = useGame((s) => s.selectTool);
  const setFence = useGame((s) => s.setFence);
  const setHubOn = useGame((s) => s.setHubOn);
  const [opened, setOpened] = useState(false);
  const id = useId();

  // Once a job is done the tool is back to Look, while its result shows on the card.
  const tool = state && state.tool !== 'fix' && state.phase !== 'done' ? state.tool : null;
  // A phone's bar opens on a tap and stays open while a tool is in use. A PC's is always open.
  const open = docked || opened || tool !== null;
  const info = tool ? build.tools.find((t) => t.id === tool) : null;
  const fence = build.fences.find((f) => f.id === state?.fence);

  if (!open) {
    return (
      <div className={styles.toolclosed}>
        <button
          type="button"
          className="btn sm"
          aria-expanded={false}
          aria-controls={id}
          onClick={() => setOpened(true)}
        >
          Build
        </button>
      </div>
    );
  }

  const pick = (t: BuildToolId): void => select(tool === t ? 'look' : t);

  return (
    <section id={id} className={styles.toolbar} aria-label="Build tools">
      <div className={styles.toolrow} role="group" aria-label="Tools">
        <button
          type="button"
          className={styles.tool}
          aria-pressed={tool === null}
          onClick={() => {
            select('look');
            if (!docked) setOpened(false);
          }}
        >
          Look
        </button>
        {build.tools.map((t) => (
          <button
            key={t.id}
            type="button"
            className={styles.tool}
            aria-pressed={tool === t.id}
            onClick={() => pick(t.id)}
          >
            {t.name}
          </button>
        ))}
      </div>
      {tool === 'fence' && (
        <div className={styles.fencechoice} role="group" aria-label="Kind of fence">
          {build.fences.map((f) => (
            <button
              key={f.id}
              type="button"
              className={styles.fencebtn}
              aria-pressed={state?.fence === f.id}
              onClick={() => setFence(f.id)}
            >
              <b>{f.name}</b>
              <small>{f.price}</small>
            </button>
          ))}
        </div>
      )}
      {tool === 'hub' && (
        <div className={styles.seg} role="group" aria-label="Where the hub goes">
          <button
            type="button"
            aria-pressed={state?.hubOn === 'corner'}
            onClick={() => setHubOn('corner')}
          >
            On a fence corner
          </button>
          <button
            type="button"
            aria-pressed={state?.hubOn === 'square'}
            onClick={() => setHubOn('square')}
          >
            On a square
          </button>
        </div>
      )}
      <div className={styles.toolhelp} aria-live="polite">
        {info ? (
          <>
            <p>{state?.message && state.phase === 'pick' ? state.message : info.help}</p>
            <p className="muted">
              {tool === 'fence' && fence ? `${fence.name}: ${fence.text}` : info.price}
            </p>
          </>
        ) : (
          <p className="muted">Look: drag to move the map. Tap a paddock to open it.</p>
        )}
      </div>
      {tool !== null && (
        <button type="button" className="btn sm ghost" onClick={() => select('look')}>
          Cancel
        </button>
      )}
    </section>
  );
}
