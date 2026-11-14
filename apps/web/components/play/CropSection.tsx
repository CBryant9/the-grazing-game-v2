'use client';

import { useId, useState } from 'react';
import { money, num, plural } from '@/lib/game/format';
import { newPick, paddockArable, sowCells } from '@/lib/game/sow';
import { useGame } from '@/lib/game/store';
import type { PaddockWire, SimpleAction, Snapshot } from '@/lib/game/types';
import { ActJob } from './ActJob';
import styles from './play.module.css';

/** Plantings in the paddock, with their stage in plain words and Harvest when one is ready. */
function Plantings({ snapshot, paddock }: { snapshot: Snapshot; paddock: PaddockWire }) {
  const startAct = useGame((s) => s.startAct);
  const acts = useGame((s) => s.acts);
  const fields = (snapshot.cropping?.fields ?? []).filter((f) => f.paddocks.includes(paddock.id));
  if (!fields.length) return null;
  return (
    <ul className={styles.hlist} aria-label="Plantings in this paddock">
      {fields.map((f) => {
        const slot = `harvest:${f.id}`;
        return (
          <li key={f.id} className={styles.hrow}>
            <p>
              <b>{f.name}</b>, {num(f.ha, 1)} ha
              {f.paddocks.length > 1 ? ', across more than one paddock' : ''}
            </p>
            <p className={styles.hhint}>{f.stage}</p>
            {f.ready && !acts[slot] && (
              <div className={styles.jobbtns}>
                <button
                  type="button"
                  className="btn sm coral"
                  onClick={() => void startAct(slot, 'Harvest', { type: 'harvest', field: f.id })}
                >
                  Harvest
                </button>
              </div>
            )}
            <ActJob slot={slot} title={`Harvest ${f.name.toLowerCase()}`} confirmLabel="Harvest" />
          </li>
        );
      })}
    </ul>
  );
}

/** Sow: pick the species, then the squares, then the card. Only on arable land. */
function Sow({ snapshot, paddock }: { snapshot: Snapshot; paddock: PaddockWire }) {
  const options = snapshot.cropping?.options ?? [];
  const slot = `sow:${paddock.id}`;
  const startAct = useGame((s) => s.startAct);
  const job = useGame((s) => s.acts[slot]);
  const sowState = useGame((s) => s.sow);
  const picking = useGame((s) => s.sowPicking);
  const clear = useGame((s) => s.sowClear);
  const [species, setSpecies] = useState<string | null>(null);
  const [mode, setMode] = useState<'all' | 'picked'>('all');
  const nameId = useId();
  const pick = sowState?.paddockId === paddock.id ? sowState : newPick(paddock.id);
  const all = paddockArable(snapshot.view, paddock.id);
  const cells = sowCells(pick, snapshot.view, mode);
  const chosen = options.find((o) => o.id === species) ?? null;
  const problem = !chosen
    ? 'Pick what to sow first.'
    : !chosen.open
      ? (chosen.reason ?? 'It can not be sown now.')
      : cells.length === 0
        ? 'Pick some squares on the map, or sow all the arable land.'
        : null;
  const action: SimpleAction | null = chosen ? { type: 'sow', species: chosen.id, cells } : null;
  const perSquare = all.length ? paddock.arableHa / all.length : 0;

  return (
    <div className={styles.stack}>
      <h3 className={`px ${styles.minihead}`} id={nameId}>
        Sow
      </h3>
      <p className={styles.hhint}>
        {num(paddock.arableHa, 1)} ha of arable land in this paddock. Sowing happens at once and
        takes none of the day.
      </p>
      {job ? (
        <ActJob slot={slot} title="Sow" confirmLabel="Confirm" />
      ) : (
        <>
          <ul className={styles.pickrows} aria-labelledby={nameId}>
            {options.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  className={styles.pickrow}
                  aria-pressed={species === o.id}
                  disabled={!o.open}
                  onClick={() => setSpecies(o.id)}
                >
                  <span className={styles.pickname}>
                    <b>{o.name}</b>
                    <span className="muted">{o.kindText}</span>
                  </span>
                  <span className={styles.pickfacts}>
                    {money(o.costPerHa)} a ha. Sown {o.window}.
                  </span>
                  <span className={styles.pickfacts}>{o.about}</span>
                  {!o.open && <span className={styles.hreason}>{o.reason}</span>}
                </button>
              </li>
            ))}
          </ul>
          <div className={styles.seg} role="group" aria-label="Where to sow">
            <button
              type="button"
              aria-pressed={mode === 'all'}
              onClick={() => {
                setMode('all');
                picking(paddock.id, false);
              }}
            >
              All the arable land
            </button>
            <button
              type="button"
              aria-pressed={mode === 'picked'}
              onClick={() => {
                setMode('picked');
                picking(paddock.id, true);
              }}
            >
              Pick squares
            </button>
          </div>
          {mode === 'all' ? (
            <p className={styles.hhint}>
              All {num(paddock.arableHa, 1)} ha of arable land in {paddock.name}.
            </p>
          ) : (
            <>
              <p className={styles.hhint}>
                Drag a box over the arable land on the map. Drag again to add more.{' '}
                {pick.cells.length > 0
                  ? `${plural(pick.cells.length, 'square')} picked, about ${num(pick.cells.length * perSquare, 1)} ha.`
                  : 'None picked yet.'}
              </p>
              <div className={styles.jobbtns}>
                <button
                  type="button"
                  className="btn sm ghost"
                  disabled={pick.cells.length === 0}
                  onClick={clear}
                >
                  Clear the squares
                </button>
              </div>
            </>
          )}
          <div className={styles.jobbtns}>
            <button
              type="button"
              className="btn coral"
              disabled={problem !== null}
              aria-describedby={problem ? `${nameId}-problem` : undefined}
              onClick={() => {
                if (!action) return;
                picking(paddock.id, false);
                void startAct(slot, 'Sow', action);
              }}
            >
              Check the sowing
            </button>
            {problem && (
              <p id={`${nameId}-problem`} className={styles.hhint}>
                {problem}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Crops on the paddock sheet, for a mixed farm: the plantings in the paddock
 * with their stage and Harvest, and Sow with the species this district can
 * grow. A farm that is not mixed never gets this.
 */
export function CropSection({ snapshot, paddock }: { snapshot: Snapshot; paddock: PaddockWire }) {
  if (!snapshot.cropping) return null;
  const hasFields = snapshot.cropping.fields.some((f) => f.paddocks.includes(paddock.id));
  if (!hasFields && paddock.arableHa <= 0) return null;
  return (
    <>
      <h3 className={`px ${styles.minihead}`}>Crops</h3>
      <Plantings snapshot={snapshot} paddock={paddock} />
      {paddock.arableHa > 0 && <Sow snapshot={snapshot} paddock={paddock} />}
    </>
  );
}
