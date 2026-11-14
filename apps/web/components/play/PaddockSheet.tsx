'use client';

import { PADDOCK_LABELS } from '@gg/shared';
import type { PaddockWire, Snapshot } from '@/lib/game/types';
import { num, plural } from '@/lib/game/format';
import { gatesOfPaddock } from '@/lib/game/build';
import { useGame } from '@/lib/game/store';
import { Sheet } from './Sheet';
import { Sward } from './Sward';
import styles from './play.module.css';

export const CHIP: Record<string, string> = { green: 'g', mixed: 'm', rank: 'r', short: 's' };

const WATER: Record<PaddockWire['water'], string> = {
  own: 'Water in this paddock',
  gate: 'Water through an open gate',
  none: 'No water',
};

/** Why water matters, said once, as a fact. */
const NO_WATER_WHY = 'Cattle in a paddock with no water die on the fourth day.';

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/**
 * The paddock sheet. Quick view first: name, hectares, the neutral label,
 * feed on offer, the side-view picture, water and the mob in it. Details
 * open with one tap. The one action is moving a mob here.
 */
export function PaddockSheet({
  snapshot,
  paddockId,
  onClose,
}: {
  snapshot: Snapshot;
  paddockId: number;
  onClose: () => void;
}) {
  const startMove = useGame((s) => s.startMove);
  const openGate = useGame((s) => s.openGate);
  const openMob = useGame((s) => s.openMob);
  const p = snapshot.paddocks.find((x) => x.id === paddockId);
  const vp = snapshot.view.paddocks.find((x) => x.id === paddockId);
  if (!p || !vp) return null;
  const label = PADDOCK_LABELS[p.label];
  const gates = gatesOfPaddock(snapshot.view, paddockId);
  const here = snapshot.mobs.filter((m) => p.mobs.includes(m.id));
  const others = snapshot.mobs.filter((m) => !p.mobs.includes(m.id));
  const moveReason =
    snapshot.mobs.length === 0
      ? 'There are no cattle on the farm.'
      : others.length === 0
        ? 'Every mob is already here.'
        : null;
  return (
    <Sheet title={p.name} onClose={onClose}>
      <p className={styles.padline}>
        <span className={`chip ${CHIP[p.label]}`}>{label.name}</span>
        <span>{num(p.ha, 1)} ha</span>
        <span className={styles.padfeed}>{num(p.massKgHa)} kg DM/ha</span>
      </p>
      <Sward paddock={vp} plantings={snapshot.view.plantings} />
      <p className={`${styles.waterline} ${p.water === 'none' ? styles.nowater : ''}`}>
        <b>{WATER[p.water]}.</b> {p.water === 'none' ? NO_WATER_WHY : ''}
      </p>
      <h3 className={`px ${styles.minihead}`}>{here.length > 1 ? 'Mobs here' : 'Mob here'}</h3>
      {here.length === 0 ? (
        <p className="muted">No cattle in this paddock.</p>
      ) : (
        <ul className={styles.mobs}>
          {here.map((m) => (
            <li key={m.id}>
              <button type="button" className={styles.mobbtn} onClick={() => openMob(m.id)}>
                <b>{m.name}</b>
                <span>
                  {plural(m.head, 'head', 'head')}
                  {m.calves > 0 ? `, ${plural(m.calves, 'calf', 'calves')}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {gates.length > 0 && (
        <>
          <h3 className={`px ${styles.minihead}`}>{gates.length > 1 ? 'Gates' : 'Gate'}</h3>
          <ul className={styles.gatelist}>
            {gates.map((g) => (
              <li key={`${g.edge.line}${g.edge.index}`}>
                <span>
                  To {g.to}: <b>{g.open ? 'open' : 'shut'}</b>
                </span>
                <button
                  type="button"
                  className="btn sm ghost"
                  onClick={() => void openGate(g.edge)}
                >
                  {g.open ? 'Shut it' : 'Open it'}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <details className={styles.details}>
        <summary>Details</summary>
        <dl className={styles.facts}>
          <Fact label="Green share" value={`${p.greenPct}%`} />
          <Fact label="Height" value={`${p.heightCm} cm`} />
          <Fact label="Green feed" value={`${num(p.greenKgHa)} kg DM/ha`} />
          <Fact label="Dry feed" value={`${num(p.deadKgHa)} kg DM/ha`} />
          <Fact label="Feed energy" value={`ME ${num(p.me, 1)} MJ/kg`} />
          <Fact label="Feed protein" value={`CP ${num(p.cp, 1)}%`} />
          <Fact label="Ground cover" value={`${p.coverPct}%`} />
          <Fact label="Growth, last day" value={`${num(p.growKgHaDay)} kg DM/ha`} />
          <Fact label="Stocking now" value={`${num(p.ae, 1)} AE, ${num(p.dse)} DSE`} />
          <Fact
            label="Per hectare"
            value={`${num(p.aePerHa, 2)} AE/ha, ${num(p.dsePerHa, 1)} DSE/ha`}
          />
          <Fact
            label="Days of feed"
            value={p.feedDays === null ? 'No stock on it' : `About ${num(p.feedDays)} days`}
          />
          <Fact label="Carries long term" value={`${num(p.carryingDsePerHa, 1)} DSE/ha`} />
        </dl>
      </details>
      <div className={styles.actions}>
        <button
          type="button"
          className="btn coral"
          disabled={moveReason !== null}
          aria-describedby={moveReason ? 'move-reason' : undefined}
          onClick={() => void startMove({ paddockId: p.id })}
        >
          Move a mob here
        </button>
        {moveReason && (
          <p id="move-reason" className="muted">
            {moveReason}
          </p>
        )}
      </div>
    </Sheet>
  );
}
