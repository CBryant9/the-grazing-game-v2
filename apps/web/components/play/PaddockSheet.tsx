'use client';

import { PADDOCK_LABELS } from '@gg/shared';
import type { PaddockWire, Snapshot } from '@/lib/game/types';
import { num, plural } from '@/lib/game/format';
import { Sheet } from './Sheet';
import styles from './play.module.css';

const CHIP: Record<string, string> = { green: 'g', mixed: 'm', rank: 'r', short: 's' };
const WATER: Record<PaddockWire['water'], string> = {
  own: 'Water in this paddock',
  gate: 'Water through an open gate',
  none: 'No water',
};

/**
 * The simple paddock sheet: its name, hectares, label, feed and the mobs in
 * it. It is a start. The full sheet comes in the next piece of work.
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
  const p = snapshot.paddocks.find((x) => x.id === paddockId);
  if (!p) return null;
  const label = PADDOCK_LABELS[p.label];
  const mobs = snapshot.mobs.filter((m) => p.mobs.includes(m.id));
  return (
    <Sheet title={p.name} onClose={onClose}>
      <p className={styles.padline}>
        <span className={`chip ${CHIP[p.label]}`}>{label.name}</span>
        <span>{num(p.ha, 1)} ha</span>
      </p>
      <dl className={styles.facts}>
        <div>
          <dt>Feed</dt>
          <dd>{num(p.massKgHa)} kg DM/ha</dd>
        </div>
        <div>
          <dt>Green</dt>
          <dd>{p.greenPct}%</dd>
        </div>
        <div>
          <dt>Height</dt>
          <dd>{p.heightCm} cm</dd>
        </div>
        <div>
          <dt>Water</dt>
          <dd>{WATER[p.water]}</dd>
        </div>
      </dl>
      <h3 className={`px ${styles.minihead}`}>Mobs here</h3>
      {mobs.length === 0 ? (
        <p className="muted">No cattle in this paddock.</p>
      ) : (
        <ul className={styles.mobs}>
          {mobs.map((m) => (
            <li key={m.id}>
              <b>{m.name}</b>
              <span>
                {plural(m.head, 'head', 'head')}
                {m.calves > 0 ? `, ${plural(m.calves, 'calf', 'calves')}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
