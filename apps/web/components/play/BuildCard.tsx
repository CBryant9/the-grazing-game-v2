'use client';

import { useEffect, useRef, type Ref } from 'react';
import { isLineTool } from '@/lib/game/build';
import { cardLines, num } from '@/lib/game/format';
import { lineFacts } from '@/lib/game/linecard';
import { useGame } from '@/lib/game/store';
import type { BuildWire } from '@/lib/game/types';
import styles from './play.module.css';

/**
 * The card beside the line or the thing picked: what it is, how long, what
 * it costs, and what does not fit today. Then Build and Cancel. After it is
 * done the result shows right here, and the tool is back to Look. On a PC it
 * floats beside the line; on a phone it sits above the tool bar. The part
 * that does not fit is red on the map, and said in words here, so colour is
 * never the only signal.
 */
export function BuildCard({
  build,
  innerRef,
  floating,
}: {
  build: BuildWire;
  innerRef: Ref<HTMLDivElement>;
  floating: boolean;
}) {
  const b = useGame((s) => s.build);
  const busy = useGame((s) => s.busy > 0);
  const snapshot = useGame((s) => s.snapshot);
  const confirm = useGame((s) => s.buildConfirm);
  const end = useGame((s) => s.buildEnd);
  const ok = useGame((s) => s.buildOk);
  const refill = useGame((s) => s.chooseRefill);
  const remove = useGame((s) => s.chooseRemove);
  const move = useGame((s) => s.chooseMove);
  const doneRef = useRef<HTMLButtonElement>(null);
  const phase = b?.phase;

  // A result takes focus, so a keyboard reader hears it and OK is one key away.
  useEffect(() => {
    if (phase === 'done') doneRef.current?.focus();
  }, [phase]);

  if (!b) return null;
  const sideM = snapshot?.view.scale.sideM ?? 100;
  const line = isLineTool(b.tool);
  const wrap = (children: React.ReactNode, label: string) => (
    <div
      ref={innerRef}
      className={`${styles.buildcard} ${floating ? styles.buildfloat : ''}`}
      role="group"
      aria-label={label}
    >
      {children}
    </div>
  );

  // ---- A trough was tapped: what to do with it.
  if (b.choice) {
    const portable = b.choice.kind === 'portable';
    return wrap(
      <>
        <h3 className={styles.cardhead}>{portable ? 'Portable trough' : 'Trough'}</h3>
        <div className={styles.jobbtns}>
          {portable && (
            <button type="button" className="btn sm" onClick={() => void refill()}>
              Refill
            </button>
          )}
          <button type="button" className="btn sm" onClick={move}>
            Move
          </button>
          <button type="button" className="btn sm" onClick={() => void remove()}>
            {portable ? 'Sell back' : 'Take out'}
          </button>
          <button type="button" className="btn sm ghost" onClick={end}>
            Cancel
          </button>
        </div>
      </>,
      'Trough choices',
    );
  }
  if (b.moving) {
    return wrap(
      <>
        <p>Tap the square to move it to.</p>
        <div className={styles.jobbtns}>
          <button type="button" className="btn sm ghost" onClick={end}>
            Cancel
          </button>
        </div>
      </>,
      'Move a trough',
    );
  }

  // ---- A line is drawn, or a thing is picked: nothing else to show before that.
  if (line && b.phase === 'pick') return null;
  if (!line && !b.picked) return null;

  const title = line
    ? b.tool === 'pipe'
      ? 'Pipe'
      : `${build.fences.find((f) => f.id === b.fence)?.name ?? 'Fence'} fence`
    : b.picked!.title;

  if (b.phase === 'previewing') {
    const metres = line
      ? `${num((b.tool === 'fence' ? Math.max(0, b.corners.length - 1) : b.cells.length) * sideM)} m. `
      : '';
    return wrap(
      <>
        <h3 className={styles.cardhead}>{title}</h3>
        <p role="status" className="muted">
          {metres}Checking
        </p>
        <div className={styles.jobbtns}>
          <button type="button" className="btn sm ghost" onClick={end}>
            Cancel
          </button>
        </div>
      </>,
      `${title}: job card`,
    );
  }

  if (b.phase === 'done') {
    return wrap(
      <>
        <h3 className={styles.cardhead}>Done</h3>
        <p role="status">{b.message}</p>
        <div className={styles.jobbtns}>
          <button ref={doneRef} type="button" className="btn sm" onClick={ok}>
            OK
          </button>
        </div>
      </>,
      `${title}: result`,
    );
  }

  if (b.phase === 'blocked') {
    return wrap(
      <>
        <h3 className={styles.cardhead}>{title}</h3>
        <p role="alert" className={styles.cardreason}>
          {b.message}
        </p>
        {line && <p className="muted">Draw it a different way to try again.</p>}
        <div className={styles.jobbtns}>
          <button type="button" className="btn sm coral" disabled>
            {line ? 'Build' : b.picked!.confirm}
          </button>
          {line ? (
            <button type="button" className="btn sm ghost" onClick={end}>
              Cancel
            </button>
          ) : (
            <button type="button" className="btn sm ghost" onClick={ok}>
              OK
            </button>
          )}
        </div>
      </>,
      `${title}: job card`,
    );
  }

  // ---- confirm or applying
  const card = b.card;
  const facts = card ? lineFacts(card) : null;
  const working = b.phase === 'applying';
  const canBuild = !working && !busy && (!facts || !facts.nothingFits);
  return wrap(
    <>
      <h3 className={styles.cardhead}>
        {title}
        {facts && <span className={styles.cardlength}>{facts.length}</span>}
      </h3>
      {card && facts ? (
        <ul className={styles.joblines}>
          <li>{facts.cost}</li>
          <li>{facts.time}</li>
          {facts.notFit.map((w) => (
            <li key={w} className={styles.cardlate}>
              {w}
            </li>
          ))}
          {facts.fullDay && <li>{facts.fullDay}</li>}
        </ul>
      ) : card ? (
        <ul className={styles.joblines}>
          {cardLines(card).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : null}
      <div className={styles.jobbtns}>
        <button
          type="button"
          className="btn sm coral"
          disabled={!canBuild}
          onClick={() => void confirm()}
        >
          {working ? 'Working' : line ? 'Build' : b.picked!.confirm}
        </button>
        <button type="button" className="btn sm ghost" disabled={working} onClick={end}>
          Cancel
        </button>
      </div>
    </>,
    `${title}: job card`,
  );
}
