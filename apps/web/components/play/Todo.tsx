'use client';

import { useId, useState } from 'react';
import type { Snapshot } from '@/lib/game/types';
import { cardLines, plural } from '@/lib/game/format';
import { useGame, type JobState } from '@/lib/game/store';
import { Icon } from './Icon';
import styles from './play.module.css';

function Row({
  item,
  job,
}: {
  item: {
    key: string;
    text: string;
    button: string | null;
    urgent: boolean;
    mob?: number | null;
    opens?: 'move' | null;
  };
  job?: JobState;
}) {
  const startJob = useGame((s) => s.startJob);
  const confirmJob = useGame((s) => s.confirmJob);
  const dismissJob = useGame((s) => s.dismissJob);
  const openMob = useGame((s) => s.openMob);
  const startMove = useGame((s) => s.startMove);
  const busy = useGame((s) => s.busy > 0);
  const phase = job?.phase;
  return (
    <li className={`${styles.todo} ${item.urgent ? styles.todourgent : ''}`}>
      <p className={styles.todotext}>{item.text}</p>
      {!phase && (item.button || item.mob != null) && (
        <div className={styles.jobbtns}>
          {item.button && (
            <button
              type="button"
              className="btn sm"
              onClick={() =>
                item.opens === 'move' && item.mob != null
                  ? void startMove({ mobId: item.mob })
                  : void startJob(item.key)
              }
            >
              {item.button}
            </button>
          )}
          {item.mob != null && (
            <button type="button" className="btn sm ghost" onClick={() => openMob(item.mob!)}>
              Open mob
            </button>
          )}
        </div>
      )}
      {phase === 'previewing' && (
        <p className={styles.todostatus} role="status">
          Checking
        </p>
      )}
      {(phase === 'confirm' || phase === 'applying') && job?.card && (
        <div className={styles.jobcard} role="group" aria-label={`${job.button}: job card`}>
          <ul className={styles.joblines}>
            {cardLines(job.card).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <div className={styles.jobbtns}>
            <button
              type="button"
              className="btn sm coral"
              disabled={phase === 'applying' || busy}
              onClick={() => void confirmJob(item.key)}
            >
              {phase === 'applying' ? 'Working' : job.button}
            </button>
            <button
              type="button"
              className="btn sm ghost"
              disabled={phase === 'applying'}
              onClick={() => dismissJob(item.key)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {phase === 'done' && (
        <div className={styles.jobresult} role="status">
          <p>{job?.message}</p>
          {job?.card && <p className="muted">{cardLines(job.card).slice(0, 2).join(' ')}</p>}
          <button type="button" className="btn sm ghost" onClick={() => dismissJob(item.key)}>
            OK
          </button>
        </div>
      )}
      {phase === 'refused' && (
        <div className={styles.jobresult} role="alert">
          <p>{job?.message}</p>
          <button type="button" className="btn sm ghost" onClick={() => dismissJob(item.key)}>
            OK
          </button>
        </div>
      )}
    </li>
  );
}

/**
 * Things to do: each a fact, with one button that does it. The button asks
 * the server for the job card, shows it right here, and on confirm does the
 * job and shows the result right here (CLAUDE.md, rule 6).
 */
export function TodoList({ snapshot }: { snapshot: Snapshot }) {
  const jobs = useGame((s) => s.jobs);
  // A job that is done is gone from the farm's list, but its result stays here until dismissed.
  const live = new Set(snapshot.todo.map((t) => t.key));
  const ghosts = Object.values(jobs)
    .filter((j) => !live.has(j.key))
    .map((j) => ({ key: j.key, text: j.text, button: j.button, urgent: false, mob: null }));
  const items = [...snapshot.todo, ...ghosts];
  if (!items.length) return <p className="muted">Nothing needs doing right now.</p>;
  return (
    <ul className={styles.todolist}>
      {items.map((t) => (
        <Row key={t.key} item={t} job={jobs[t.key]} />
      ))}
    </ul>
  );
}

/** The paddocks as a list of buttons: a way to open a paddock without the map, for keyboards and screen readers. */
export function PaddockChips({ snapshot }: { snapshot: Snapshot }) {
  const open = useGame((s) => s.openPaddock);
  return (
    <ul className={styles.chips} aria-label="Open a paddock">
      {snapshot.paddocks.map((p) => (
        <li key={p.id}>
          <button type="button" className={styles.padchip} onClick={() => open(p.id)}>
            {p.name}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The banner on the map: a count that opens the list. It opens by itself while a job is being done. */
export function TodoBanner({ snapshot }: { snapshot: Snapshot }) {
  const [open, setOpen] = useState(false);
  const jobs = useGame((s) => s.jobs);
  const id = useId();
  const count = snapshot.todo.length;
  const working = Object.keys(jobs).length > 0;
  const shown = open || working;
  const first = snapshot.todo[0];
  return (
    <section className={styles.banner} aria-label="Things to do">
      <button
        type="button"
        className={styles.bannerhead}
        aria-expanded={shown}
        aria-controls={id}
        onClick={() => setOpen(!shown)}
      >
        <span className={styles.bannertitle}>
          {count === 0 ? 'Nothing to do now' : plural(count, 'thing', 'things') + ' to do'}
        </span>
        {!shown && first && <span className={styles.bannerpeek}>{first.text}</span>}
        <span className={shown ? styles.flip : undefined}>
          <Icon name="chevron" size={18} />
        </span>
      </button>
      {shown && (
        <div id={id} className={styles.bannerbody}>
          <TodoList snapshot={snapshot} />
          <h2 className={`px ${styles.minihead}`}>Paddocks</h2>
          <PaddockChips snapshot={snapshot} />
        </div>
      )}
    </section>
  );
}
