'use client';

import { useId, useState } from 'react';
import type { SimpleAction, Snapshot } from '@/lib/game/types';
import { cardLines, doneLines, plural } from '@/lib/game/format';
import { useGame, type JobState } from '@/lib/game/store';
import { ContractList, useContractWork } from './Contracts';
import { Icon } from './Icon';
import styles from './play.module.css';

function Row({
  item,
  job,
  live = true,
}: {
  live?: boolean;
  item: {
    key: string;
    text: string;
    button: string | null;
    urgent: boolean;
    mob?: number | null;
    opens?: 'move' | 'fix' | 'workforce' | null;
    edge?: { line: 'h' | 'v'; index: number } | null;
  };
  job?: JobState;
}) {
  const startJob = useGame((s) => s.startJob);
  const confirmJob = useGame((s) => s.confirmJob);
  const dismissJob = useGame((s) => s.dismissJob);
  const openMob = useGame((s) => s.openMob);
  const startMove = useGame((s) => s.startMove);
  const startFix = useGame((s) => s.startFix);
  const openWorkforce = useGame((s) => s.openWorkforce);
  const busy = useGame((s) => s.busy > 0);
  const startAct = useGame((s) => s.startAct);
  const confirmAct = useGame((s) => s.confirmAct);
  const dismissAct = useGame((s) => s.dismissAct);
  const slot = `todo:away:${item.key}`;
  const away = useGame((s) => s.acts[slot]);
  const phase = job?.phase;
  // Put a thing to do away (m8 playability). It takes none of the day and costs nothing, so
  // there is no card to confirm: the server is asked, and the list comes back without it.
  const putAway = async (): Promise<void> => {
    const action = { type: 'dismissTodo', key: item.key } as unknown as SimpleAction;
    await startAct(slot, 'Put away', action);
    if (useGame.getState().acts[slot]?.phase === 'confirm') await confirmAct(slot);
    if (useGame.getState().acts[slot]?.phase === 'done') dismissAct(slot);
  };
  return (
    <li className={`${styles.todo} ${item.urgent ? styles.todourgent : ''}`}>
      <div className={styles.todohead}>
        <p className={styles.todotext}>{item.text}</p>
        {!phase && live && (
          <button
            type="button"
            className={styles.putaway}
            disabled={busy || (away !== undefined && away.phase !== 'refused')}
            aria-label={`Put away: ${item.text}`}
            onClick={() => void putAway()}
          >
            Put away
          </button>
        )}
      </div>
      {away?.phase === 'refused' && (
        <p className={styles.todostatus} role="alert">
          {away.message}{' '}
          <button type="button" className={styles.linkbtn} onClick={() => dismissAct(slot)}>
            OK
          </button>
        </p>
      )}
      {!phase && (item.button || item.mob != null) && (
        <div className={styles.jobbtns}>
          {item.button && (
            <button
              type="button"
              className="btn sm"
              onClick={() =>
                item.opens === 'move' && item.mob != null
                  ? void startMove({ mobId: item.mob })
                  : item.opens === 'fix' && item.edge
                    ? void startFix(item.edge)
                    : item.opens === 'workforce'
                      ? openWorkforce()
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
          {job?.card && doneLines(job.card).length > 0 && (
            <p className="muted">{doneLines(job.card).join(' ')}</p>
          )}
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
        <Row key={t.key} item={t} job={jobs[t.key]} live={live.has(t.key)} />
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

/** The square bullet's colour on the banner: coral for urgent, amber for the rest (the mockup). */
const BULLET = { urgent: '#ec6a48', rest: '#f0b43a' };

/**
 * The banner under the top bar: "N things to check", open with the first three as short
 * lines with square bullets. "See all" opens the full list with its buttons, the contract
 * fencing and the paddocks as buttons. It opens fully by itself while a job is being done.
 */
export function TodoBanner({ snapshot }: { snapshot: Snapshot }) {
  const [view, setView] = useState<'peek' | 'closed' | 'full'>('peek');
  const jobs = useGame((s) => s.jobs);
  const id = useId();
  const count = snapshot.todo.length;
  const contractWork = useContractWork();
  const working = Object.keys(jobs).length > 0 || contractWork;
  const shown = working ? 'full' : count === 0 && view === 'peek' ? 'closed' : view;
  const run = snapshot.contracts[0];
  return (
    <section className={styles.banner} aria-label="Things to check">
      <button
        type="button"
        className={styles.bannerhead}
        aria-expanded={shown !== 'closed'}
        aria-controls={id}
        onClick={() => setView(shown === 'closed' ? (count === 0 ? 'full' : 'peek') : 'closed')}
      >
        <span className={styles.bannertitle}>
          {count === 0 ? 'Nothing to check now' : `${plural(count, 'thing', 'things')} to check`}
        </span>
        {shown === 'closed' && run && (
          <span className={styles.bannerpeek}>
            <span className={styles.contractswatch} aria-hidden="true" /> {run.text}
          </span>
        )}
        <span className={shown !== 'closed' ? styles.flip : undefined}>
          <Icon name="chevron" size={16} />
        </span>
      </button>
      {shown === 'peek' && (
        <div id={id} className={styles.bannerbody}>
          <ul className={styles.peeklist}>
            {snapshot.todo.slice(0, 3).map((t) => (
              <li key={t.key}>
                <i
                  style={{ background: t.urgent ? BULLET.urgent : BULLET.rest }}
                  aria-hidden="true"
                />
                {t.text}
              </li>
            ))}
          </ul>
          <button type="button" className={styles.linkbtn} onClick={() => setView('full')}>
            {count > 3 ? `See all ${count}` : 'See all'}
          </button>
        </div>
      )}
      {shown === 'full' && (
        <div id={id} className={styles.bannerbody}>
          <TodoList snapshot={snapshot} />
          <ContractList snapshot={snapshot} />
          <h2 className={`px ${styles.minihead}`}>Paddocks</h2>
          <PaddockChips snapshot={snapshot} />
        </div>
      )}
    </section>
  );
}
