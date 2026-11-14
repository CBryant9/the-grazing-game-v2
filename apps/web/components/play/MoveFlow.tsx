'use client';

import { useEffect, useRef } from 'react';
import { PADDOCK_LABELS } from '@gg/shared';
import { num, plural } from '@/lib/game/format';
import { movableClasses, pickable } from '@/lib/game/lists';
import { useGame } from '@/lib/game/store';
import type { MobWire, Snapshot } from '@/lib/game/types';
import { JobBox } from './JobBox';
import { CHIP } from './PaddockSheet';
import styles from './play.module.css';

function PaddockPicker({ snapshot, mob }: { snapshot: Snapshot; mob: MobWire }) {
  const pick = useGame((s) => s.moveTargetPicked);
  const rows = pickable(snapshot.paddocks, snapshot.mobs, mob);
  return (
    <ul className={styles.pickrows} aria-label="Paddocks to move into">
      {rows.map(({ paddock: p, holds, dry }) => (
        <li key={p.id}>
          <button type="button" className={styles.pickrow} onClick={() => void pick(p.id)}>
            <span className={styles.pickname}>
              <b>{p.name}</b>
              <span className={`chip ${CHIP[p.label]}`}>{PADDOCK_LABELS[p.label].name}</span>
            </span>
            <span className={styles.pickfacts}>
              {num(p.ha, 1)} ha, {num(p.massKgHa)} kg DM/ha
              {dry && <span className={styles.warntag}>No water</span>}
              {holds && <span className={styles.holdtag}>{holds} is here</span>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Whole mob, or part of it by class and number. */
function PartPicker({ mob }: { mob: MobWire }) {
  const move = useGame((s) => s.move);
  const setPart = useGame((s) => s.movePart);
  const setQty = useGame((s) => s.moveQty);
  const classes = movableClasses(mob);
  if (!move) return null;
  return (
    <fieldset className={styles.partset}>
      <legend className="sr-only">How much of the mob</legend>
      <div className={styles.seg} role="group" aria-label="How much of the mob">
        <button type="button" aria-pressed={!move.part} onClick={() => setPart(false)}>
          Whole mob
        </button>
        <button type="button" aria-pressed={move.part} onClick={() => setPart(true)}>
          Part of the mob
        </button>
      </div>
      {move.part && (
        <ul className={styles.partrows}>
          {classes.map((c) => {
            const id = `mv-${c.id}`;
            return (
              <li key={c.id}>
                <label htmlFor={id}>
                  {c.label} <span className="muted">({num(c.head)} head)</span>
                </label>
                <input
                  id={id}
                  className={styles.field}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={c.head}
                  value={move.qtys[c.id] ?? 0}
                  onChange={(e) =>
                    setQty(c.id, Math.min(c.head, Math.max(0, Math.floor(Number(e.target.value)))))
                  }
                />
              </li>
            );
          })}
          <li className="muted">Calves go with their mothers.</li>
        </ul>
      )}
    </fieldset>
  );
}

/**
 * Moving cattle: "pick the paddock, done". Pick the mob (if not picked), then
 * tap a paddock on the map or pick it from the list. The job card says what
 * the move takes and notes a paddock with no water, or a mob already there
 * (the two join). Confirm, and the tool snaps back to Look.
 */
export function MoveFlow({ snapshot }: { snapshot: Snapshot }) {
  const move = useGame((s) => s.move);
  const busy = useGame((s) => s.busy > 0);
  const pickMob = useGame((s) => s.moveMobPicked);
  const confirm = useGame((s) => s.moveConfirm);
  const back = useGame((s) => s.moveBack);
  const end = useGame((s) => s.moveEnd);
  const ref = useRef<HTMLElement>(null);

  // Take focus when the tool opens, so a keyboard follows it.
  useEffect(() => {
    ref.current?.focus();
  }, []);

  if (!move) return null;
  const mob = snapshot.mobs.find((m) => m.id === move.mobId) ?? null;
  const target = snapshot.paddocks.find((p) => p.id === move.target) ?? null;
  const name = mob?.name ?? move.mobName ?? 'The mob';

  let body;
  if (move.mobId === null) {
    // A paddock was picked first: which mob goes there?
    const candidates = snapshot.mobs.filter((m) => !target || !target.mobs.includes(m.id));
    body = (
      <>
        <p>Pick the mob to move{target ? ` to ${target.name}` : ''}.</p>
        {candidates.length === 0 ? (
          <p className="muted">Every mob is already there.</p>
        ) : (
          <ul className={styles.pickrows} aria-label="Mobs to move">
            {candidates.map((m) => (
              <li key={m.id}>
                <button type="button" className={styles.pickrow} onClick={() => void pickMob(m.id)}>
                  <span className={styles.pickname}>
                    <b>{m.name}</b>
                  </span>
                  <span className={styles.pickfacts}>
                    {plural(m.head, 'head', 'head')},{' '}
                    {m.where === 'yards' ? 'in the stock yards' : (m.area ?? 'on pasture')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  } else if (move.phase === 'pick') {
    body = mob ? (
      <>
        <p>Tap a paddock on the map, or pick one from the list.</p>
        <p className={styles.legend}>
          <span className={styles.keylight} aria-hidden="true" /> Paddocks you can pick.{' '}
          <span className={styles.keydry} aria-hidden="true" /> Red: no water.
        </p>
        <PartPicker mob={mob} />
        {move.message && (
          <p role="alert" className={styles.hreason}>
            {move.message}
          </p>
        )}
        <PaddockPicker snapshot={snapshot} mob={mob} />
      </>
    ) : null;
  } else {
    body = (
      <>
        <p>
          {target ? (
            <>
              {name} to <b>{target.name}</b>
            </>
          ) : (
            name
          )}
        </p>
        <JobBox
          title={`Move ${name}`}
          job={{
            phase: move.phase,
            card: move.card,
            message: move.message,
          }}
          confirmLabel="Move"
          busy={busy}
          onConfirm={() => void confirm()}
          onCancel={end}
          onDismiss={end}
          cancelLabel="Cancel"
        >
          {(move.phase === 'confirm' || move.phase === 'refused') && (
            <button type="button" className="btn sm ghost" onClick={back}>
              Pick another paddock
            </button>
          )}
        </JobBox>
      </>
    );
  }

  return (
    <section
      ref={ref}
      tabIndex={-1}
      className={styles.moveflow}
      aria-label="Move cattle"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && move.phase !== 'applying') end();
      }}
    >
      <header className={styles.sheethead}>
        <h2 className={`px ${styles.sheettitle}`}>Move cattle{mob ? `: ${mob.name}` : ''}</h2>
        {move.phase !== 'done' && (
          <button type="button" className="btn sm ghost" onClick={end}>
            Cancel
          </button>
        )}
      </header>
      <div className={styles.movebody}>{body}</div>
    </section>
  );
}
