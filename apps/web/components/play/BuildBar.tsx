'use client';

import { useId } from 'react';
import { useGame } from '@/lib/game/store';
import type { BuildToolId, BuildWire } from '@/lib/game/types';
import { Icon, type IconName } from './Icon';
import { useUi } from './ui';
import styles from './play.module.css';

/** Each tool's pixel icon. The word always shows beside it. */
const TOOL_ICON: Record<BuildToolId, IconName> = {
  fence: 'fence',
  gate: 'gate',
  pipe: 'pipe',
  trough: 'trough',
  portable: 'portable',
  hub: 'hub',
  remove: 'remove',
};

/**
 * The tool bar: Look (the default) and the build tools, each an icon and a
 * word, the one in use filled in. On a phone it is the tray the Build tab
 * opens. On a PC it sits at the top of the side panel. What to do next is on
 * the step chip over the map (BuildGuide); the bar keeps the price. The
 * prices come from the server (the snapshot's `build`). Look, the chip's
 * Back to Look and Escape all go back to Look.
 */
export function BuildBar({ build, docked }: { build: BuildWire; docked: boolean }) {
  const state = useGame((s) => s.build);
  const select = useGame((s) => s.selectTool);
  const setFence = useGame((s) => s.setFence);
  const setHubOn = useGame((s) => s.setHubOn);
  const opened = useUi((s) => s.trayOpen);
  const setOpened = useUi((s) => s.setTray);
  const id = useId();

  // Once a job is done the tool is back to Look, while its result shows on the card.
  const tool = state && state.tool !== 'fix' && state.phase !== 'done' ? state.tool : null;
  // A phone's bar opens on a tap and stays open while a tool is in use. A PC's is always open.
  const open = docked || opened || tool !== null;
  const info = tool ? build.tools.find((t) => t.id === tool) : null;
  const fence = build.fences.find((f) => f.id === state?.fence);

  // On a phone the Build tab opens the tray.
  if (!open) return null;

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
          <Icon name="look" size={18} />
          <span>Look</span>
        </button>
        {build.tools.map((t) => (
          <button
            key={t.id}
            type="button"
            className={styles.tool}
            aria-pressed={tool === t.id}
            onClick={() => pick(t.id)}
          >
            <Icon name={TOOL_ICON[t.id]} size={18} />
            <span>{t.name}</span>
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
      <div className={styles.toolhelp}>
        {info ? (
          <>
            <p className="muted">
              {tool === 'fence' && fence ? `${fence.name}: ${fence.text}` : info.price}
            </p>
            {tool === 'fence' && build.onHand && <p className="muted">{build.onHand}</p>}
          </>
        ) : (
          <p className="muted">
            Pick a tool. The map then shows a grid of where it can go. In Look, drag to move the map
            and tap a paddock to open it.
          </p>
        )}
      </div>
    </section>
  );
}
