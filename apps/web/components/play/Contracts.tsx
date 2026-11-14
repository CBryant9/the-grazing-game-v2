'use client';

import { useGame } from '@/lib/game/store';
import type { ContractWire, Snapshot } from '@/lib/game/types';
import { ActJob } from './ActJob';
import styles from './play.module.css';

/** The slot a run's cancel card lives in. */
const slotOf = (id: number): string => `contract:${id}`;

/** Does any contract card (or its result) need showing, so the list opens? */
export function useContractWork(): boolean {
  return useGame((s) => Object.keys(s.acts).some((k) => k.startsWith('contract:')));
}

function Run({ c }: { c: ContractWire }) {
  const slot = slotOf(c.id);
  const start = useGame((s) => s.startAct);
  const open = useGame((s) => s.acts[slot] !== undefined);
  return (
    <li className={styles.contractline}>
      <p>
        <span className={styles.contractswatch} aria-hidden="true" /> <b>{c.text}</b>
      </p>
      <p className="muted">
        {c.teamText}. {c.detail}
      </p>
      {!open && (
        <div className={styles.jobbtns}>
          <button
            type="button"
            className="btn sm ghost"
            onClick={() => void start(slot, 'Cancel', { type: 'cancelContractFence', run: c.id })}
          >
            Cancel
          </button>
        </div>
      )}
      <ActJob
        slot={slot}
        title="Cancel the contract fence"
        confirmLabel="Cancel the contract"
        cancelLabel="Keep it going"
      />
    </li>
  );
}

/**
 * Contract fencing under way, one fact line each ("Contract fence: 1,200 m
 * left, done on Tuesday 3 March") with Cancel. Cancel confirms first, saying
 * what is kept and what is owed. The pink swatch is the fence's colour on the
 * map while it is going up. After a run is cancelled, its result stays here
 * until the player dismisses it.
 */
export function ContractList({ snapshot }: { snapshot: Snapshot }) {
  const acts = useGame((s) => s.acts);
  const live = new Set(snapshot.contracts.map((c) => slotOf(c.id)));
  const gone = Object.keys(acts).filter((k) => k.startsWith('contract:') && !live.has(k));
  if (snapshot.contracts.length === 0 && gone.length === 0) return null;
  return (
    <section aria-label="Contract fencing" className={styles.stack}>
      <ul className={styles.todolist}>
        {snapshot.contracts.map((c) => (
          <Run key={c.id} c={c} />
        ))}
        {gone.map((k) => (
          <li key={k}>
            <ActJob slot={k} title="Cancel the contract fence" confirmLabel="OK" />
          </li>
        ))}
      </ul>
    </section>
  );
}
