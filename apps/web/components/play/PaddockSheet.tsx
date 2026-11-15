'use client';

import { useState } from 'react';
import { PADDOCK_LABELS } from '@gg/shared';
import type { PaddockWire, Snapshot } from '@/lib/game/types';
import { num, plural } from '@/lib/game/format';
import { gatesOfPaddock } from '@/lib/game/build';
import { useGame } from '@/lib/game/store';
import { CropSection } from './CropSection';
import { Sheet } from './Sheet';
import { Sward } from './Sward';
import { pendingPaddock } from './ui';
import styles from './play.module.css';

export const CHIP: Record<string, string> = { green: 'g', mixed: 'm', rank: 'r', short: 's' };

const WATER: Record<PaddockWire['water'], string> = {
  own: 'Water in this paddock',
  gate: 'Water through an open gate',
  none: 'No water',
};

/** One of the six number tiles in the quick view. */
function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/**
 * The paddock sheet, as the mockup. Quick view first: name, the neutral label,
 * hectares and water on the title row; six number tiles; the mob with its days
 * of feed; the side-view picture; the comment line when the server sends one.
 * Then Move cattle in here and Details. Details open with one tap.
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
  const [details, setDetails] = useState(false);
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
  const extra = pendingPaddock(p);
  // The feed line in words when the server sends it ("Under 800 kg DM/ha"), else the days.
  const feedLine = p.feedText ?? (p.feedDays === null ? null : `About ${num(p.feedDays)} days`);
  const stock = snapshot.market.sheep ? 'stock' : 'cattle';
  return (
    <Sheet
      title={p.name}
      onClose={onClose}
      aside={
        <>
          <span className={`chip ${CHIP[p.label]}`}>{label.name}</span>
          <span className={styles.padmeta}>
            {num(p.ha, p.ha < 10 ? 1 : 0)} ha · Water{' '}
            {p.water === 'none' ? (
              <b className="bad" aria-label="none">
                ✗
              </b>
            ) : (
              <b className="ok" aria-label={p.water === 'gate' ? 'through a gate' : 'yes'}>
                ✓
              </b>
            )}
          </span>
        </>
      }
    >
      <div className={styles.stat3}>
        <Tile value={num(p.massKgHa)} label="kg DM/ha" />
        <Tile value={`${num(p.heightCm)} cm`} label="height" />
        <Tile value={`${num(p.greenPct)}%`} label="green" />
        <Tile value={num(p.me, 1)} label="ME MJ/kg" />
        <Tile value={`${num(p.cp)}%`} label="CP" />
        <Tile value={num(p.aePerHa, 2)} label="AE/ha" />
      </div>
      {here.length > 0 && feedLine && (
        <p className={styles.mobline}>
          <b>{here.length > 1 ? 'Mobs:' : 'Mob:'}</b> {here.map((m) => m.name).join(', ')},{' '}
          {feedLine.charAt(0).toLowerCase() + feedLine.slice(1)}
          {p.feedText ? '.' : ' of feed at this rate.'}
        </p>
      )}
      <Sward paddock={vp} plantings={snapshot.view.plantings} />
      {/* The paddock's comment line: a neutral fact, shown when the server sends one. */}
      {extra.comment && <p className={styles.sayline}>{extra.comment}</p>}
      {p.water !== 'own' && (
        <p className={`${styles.waterline} ${p.water === 'none' ? styles.nowater : ''}`}>
          <b>{WATER[p.water]}.</b> {p.noWaterWhy ?? ''}
        </p>
      )}
      <div className={styles.padbtns}>
        <button
          type="button"
          className="btn coral"
          disabled={moveReason !== null}
          aria-describedby={moveReason ? 'move-reason' : undefined}
          onClick={() => void startMove({ paddockId: p.id })}
        >
          Move {stock} in here
        </button>
        <button
          type="button"
          className="btn ghost"
          aria-expanded={details}
          aria-controls="paddock-details"
          onClick={() => setDetails(!details)}
        >
          Details
        </button>
      </div>
      {moveReason && (
        <p id="move-reason" className="muted">
          {moveReason}
        </p>
      )}
      <h3 className={`px ${styles.minihead}`}>{here.length > 1 ? 'Mobs here' : 'Mob here'}</h3>
      {here.length === 0 ? (
        <p className="muted">
          {snapshot.market.sheep ? 'No stock in this paddock.' : 'No cattle in this paddock.'}
        </p>
      ) : (
        <ul className={styles.mobs}>
          {here.map((m) => (
            <li key={m.id}>
              <button type="button" className={styles.mobbtn} onClick={() => openMob(m.id)}>
                <b>{m.name}</b>
                <span>
                  {m.species === 'sheep'
                    ? `${plural(m.head, 'sheep', 'sheep')}${m.calves > 0 ? `, ${plural(m.calves, 'lamb')} at foot` : ''}, ${num(m.dse)} DSE`
                    : `${plural(m.head, 'head', 'head')}${m.calves > 0 ? `, ${plural(m.calves, 'calf', 'calves')}` : ''}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <CropSection snapshot={snapshot} paddock={p} />
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
      {details && (
        <dl id="paddock-details" className={styles.facts}>
          <Fact label="Green share" value={`${p.greenPct}%`} />
          <Fact label="Height" value={`${p.heightCm} cm`} />
          <Fact label="Green feed" value={`${num(p.greenKgHa)} kg DM/ha`} />
          <Fact label="Dry feed" value={`${num(p.deadKgHa)} kg DM/ha`} />
          <Fact label="Feed energy" value={`ME ${num(p.me, 1)} MJ/kg`} />
          <Fact label="Feed protein" value={`CP ${num(p.cp, 1)}%`} />
          <Fact label="Ground cover" value={`${p.coverPct}%`} />
          <Fact label="Growth, last day" value={`${num(p.growKgHaDay)} kg DM/ha a day`} />
          <Fact label="Stocking now" value={`${num(p.ae, 1)} AE, ${num(p.dse)} DSE`} />
          <Fact
            label="Per hectare"
            value={`${num(p.aePerHa, 2)} AE/ha, ${num(p.dsePerHa, 1)} DSE/ha`}
          />
          <Fact
            label="Days of feed"
            value={p.feedDays === null ? 'No stock on it' : (feedLine ?? '')}
          />
          <Fact label="Carries long term" value={`${num(p.carryingDsePerHa, 1)} DSE/ha`} />
        </dl>
      )}
    </Sheet>
  );
}
