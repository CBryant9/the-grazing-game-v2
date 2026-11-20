'use client';

import { useCallback, useId, useState } from 'react';
import type { SimpleAction, Snapshot } from '@/lib/game/types';
import { cardLines, doneLines, plural } from '@/lib/game/format';
import {
  FIRST_OFF_KEY,
  edgeSquare,
  firstSteps,
  parseFirstOff,
  todoGo,
  type NextGo,
  type NextStep,
} from '@/lib/game/nextsteps';
import { useGame, type JobState } from '@/lib/game/store';
import { ContractList, useContractWork } from './Contracts';
import { Icon } from './Icon';
import { useUi } from './ui';
import styles from './play.module.css';

/** Take the player straight there: the tool picked and the map on the spot, or the tab opened. */
export function useGoTo(): (go: NextGo) => void {
  const select = useGame((s) => s.selectTool);
  const setTab = useGame((s) => s.setTab);
  const focusOn = useUi((s) => s.focusOn);
  return useCallback(
    (go: NextGo) => {
      if (go.kind === 'tab') {
        setTab(go.tab);
        return;
      }
      select(go.tool);
      if (go.square !== null) focusOn(go.square);
    },
    [select, setTab, focusOn],
  );
}

const firstOffKey = (farm: string): string => `${FIRST_OFF_KEY}:${farm}`;

function readFirstOff(farm: string): string[] {
  try {
    return parseFirstOff(window.localStorage.getItem(firstOffKey(farm)));
  } catch {
    return [];
  }
}

/** The first steps this farm shows, and a way to put one away (kept in this browser). */
export function useFirstSteps(snapshot: Snapshot): {
  steps: NextStep[];
  putAway: (key: string) => void;
} {
  // Kept per farm by its id, so two farms with the same name never share them. An old
  // snapshot from before the id was sent falls back to the name.
  const farm = snapshot.farm.id ?? snapshot.farm.name;
  const stored = useUi((s) => s.firstOff[farm]);
  const setFirstOff = useUi((s) => s.setFirstOff);
  const keys = stored ?? readFirstOff(farm);
  const putAway = (key: string): void => {
    const next = [...keys, key];
    setFirstOff(farm, next);
    try {
      window.localStorage.setItem(firstOffKey(farm), JSON.stringify(next));
    } catch {
      // Storage is off: it stays put away until the page is opened again.
    }
  };
  return { steps: firstSteps(snapshot, keys), putAway };
}

/** A first step: one fact, a button that goes straight there, and Put away. */
function FirstStepRow({ step, onPutAway }: { step: NextStep; onPutAway: () => void }) {
  const goTo = useGoTo();
  return (
    <li className={`${styles.todo} ${styles.todofirst}`}>
      <div className={styles.todohead}>
        <p className={styles.todotext}>{step.text}</p>
        <button
          type="button"
          className={styles.putaway}
          aria-label={`Put away: ${step.text}`}
          onClick={onPutAway}
        >
          Put away
        </button>
      </div>
      <div className={styles.jobbtns}>
        <button type="button" className="btn sm coral" onClick={() => goTo(step.go)}>
          {step.button}
        </button>
      </div>
    </li>
  );
}

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
  const snapshot = useGame((s) => s.snapshot);
  const focusOn = useUi((s) => s.focusOn);
  const goTo = useGoTo();
  const extra = snapshot ? todoGo(snapshot, item) : null;
  const slot = `todo:away:${item.key}`;
  const away = useGame((s) => s.acts[slot]);
  const phase = job?.phase;
  // Put a thing to do away (m8 playability). It takes none of the day and costs nothing, so
  // there is no card to confirm: the server is asked, and the list comes back without it.
  const putAway = async (): Promise<void> => {
    const action: SimpleAction = { type: 'dismissTodo', key: item.key };
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
      {!phase && (item.button || item.mob != null || extra) && (
        <div className={styles.jobbtns}>
          {item.button && (
            <button
              type="button"
              className="btn sm"
              onClick={() => {
                if (item.opens === 'move' && item.mob != null) void startMove({ mobId: item.mob });
                else if (item.opens === 'fix' && item.edge) {
                  // The card opens beside the fence, and the map comes to it.
                  void startFix(item.edge);
                  const sq = edgeSquare(item.edge);
                  if (sq !== null) focusOn(sq);
                } else if (item.opens === 'workforce') openWorkforce();
                else void startJob(item.key);
              }}
            >
              {item.button}
            </button>
          )}
          {extra && (
            <button type="button" className="btn sm coral" onClick={() => goTo(extra.go)}>
              {extra.button}
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
  const first = useFirstSteps(snapshot);
  if (!items.length && !first.steps.length) {
    return <p className="muted">Nothing needs doing right now.</p>;
  }
  return (
    <ul className={styles.todolist}>
      {first.steps.map((s) => (
        <FirstStepRow key={s.key} step={s} onPutAway={() => first.putAway(s.key)} />
      ))}
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
const BULLET = { urgent: '#ec6a48', rest: '#f0b43a', first: '#7fe05a' };

/**
 * The banner under the top bar: "N things to check", open with the first three as short
 * lines with square bullets. "See all" opens the full list with its buttons, the contract
 * fencing and the paddocks as buttons. It opens fully by itself while a job is being done.
 */
export function TodoBanner({ snapshot }: { snapshot: Snapshot }) {
  const [view, setView] = useState<'peek' | 'closed' | 'full'>('peek');
  const jobs = useGame((s) => s.jobs);
  const id = useId();
  const first = useFirstSteps(snapshot).steps;
  const count = snapshot.todo.length + first.length;
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
            {first.map((s) => (
              <li key={s.key}>
                <i style={{ background: BULLET.first }} aria-hidden="true" />
                {s.text}
              </li>
            ))}
            {snapshot.todo.slice(0, Math.max(0, 3 - first.length)).map((t) => (
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
