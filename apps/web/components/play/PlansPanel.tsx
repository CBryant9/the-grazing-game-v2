'use client';

import { useId, useState } from 'react';
import { plural } from '@/lib/game/format';
import { mobsWithoutPlan } from '@/lib/game/plans';
import { useGame } from '@/lib/game/store';
import type { PlanMobWire, PlanWire, Snapshot } from '@/lib/game/types';
import { ActJob } from './ActJob';
import { EmptyState } from './EmptyState';
import styles from './play.module.css';

function status(m: PlanMobWire): { text: string; kind: 'run' | 'paused' | 'wait' } {
  if (m.paused) return { text: 'Paused', kind: 'paused' };
  if (m.waitingText) return { text: 'Waiting', kind: 'wait' };
  return { text: 'Running', kind: 'run' };
}

/** One mob on a plan: where it is, what happens next, and Pause, Resume, Change or Clear. */
function PlanMob({ plan, m }: { plan: PlanWire; m: PlanMobWire }) {
  const startAct = useGame((s) => s.startAct);
  const startPlan = useGame((s) => s.startPlan);
  const acts = useGame((s) => s.acts);
  const [step, setStep] = useState(m.step);
  const stepSel = useId();
  const stops = plan.legs.flatMap((l) => l.stops);
  const st = status(m);
  const pause = `plan:${m.mob}:pause`;
  const resume = `plan:${m.mob}:resume`;
  const clear = `plan:${m.mob}:clear`;
  const busyJob = acts[pause] ?? acts[resume] ?? acts[clear];
  return (
    <li className={styles.planmob}>
      <div className={styles.planhead}>
        <b>{m.mobName}</b>
        <span className={styles.statetag} data-kind={st.kind}>
          {st.text}
        </span>
      </div>
      <p>
        {plural(m.head, 'head', 'head')}, {m.area ? `in ${m.area}` : 'not on pasture'}. {m.stepText}
        . {m.roundText}.
      </p>
      {m.pausedText && <p className={styles.hreason}>{m.pausedText}</p>}
      {m.waitingText && <p className={styles.hreason}>{m.waitingText}</p>}
      <p className={styles.hhint}>Next: {m.nextText}</p>
      <details className={styles.details}>
        <summary>Report</summary>
        <ul className={styles.notes}>
          {m.report.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </details>
      {!busyJob && (
        <div className={styles.jobbtns}>
          {!m.paused && (
            <button
              type="button"
              className="btn sm"
              onClick={() => void startAct(pause, 'Pause', { type: 'pausePlan', mob: m.mob })}
            >
              Pause
            </button>
          )}
          {plan.editable && (
            <button
              type="button"
              className="btn sm ghost"
              onClick={() => startPlan({ mobId: m.mob, planId: plan.id })}
            >
              Change
            </button>
          )}
          <button
            type="button"
            className="btn sm ghost"
            onClick={() =>
              void startAct(clear, 'Take off the plan', { type: 'clearPlan', mob: m.mob })
            }
          >
            Clear
          </button>
        </div>
      )}
      {m.paused && !busyJob && (
        <div className={styles.picker}>
          <label htmlFor={stepSel}>Resume from</label>
          <select
            id={stepSel}
            className={styles.field}
            value={step}
            onChange={(e) => setStep(Number(e.target.value))}
          >
            {stops.map((s, i) => (
              <option key={`${s.cell}-${i}`} value={i}>
                Step {i + 1}: {s.name}
              </option>
            ))}
          </select>
          <div className={styles.jobbtns}>
            <button
              type="button"
              className="btn sm coral"
              onClick={() =>
                void startAct(resume, 'Resume', { type: 'resumePlan', mob: m.mob, step })
              }
            >
              Resume
            </button>
          </div>
        </div>
      )}
      <ActJob slot={pause} title={`Pause the plan for ${m.mobName}`} confirmLabel="Pause" />
      <ActJob slot={resume} title={`Resume the plan for ${m.mobName}`} confirmLabel="Resume" />
      <ActJob
        slot={clear}
        title={`Take ${m.mobName} off its plan`}
        confirmLabel="Take off the plan"
      />
    </li>
  );
}

function PlanCard({ plan }: { plan: PlanWire }) {
  return (
    <li className={styles.plancard}>
      <h3 className={`px ${styles.minihead}`}>{plan.name}</h3>
      {plan.legs.map((leg, i) => (
        <div key={i} className={styles.leg}>
          {plan.legs.length > 1 && <b>Leg {i + 1}</b>}
          <p className={styles.chain}>
            {leg.stops.map((s, j) => (
              <span key={`${s.cell}-${j}`}>
                {j > 0 && <span aria-hidden="true"> to </span>}
                <span className="sr-only">{j > 0 ? ', then ' : 'Starts in '}</span>
                {s.name}
                {!s.hasWater && <span className={styles.warntag}>No water</span>}
              </span>
            ))}
          </p>
          <p>
            {leg.ruleText} {leg.roundsText}.
          </p>
        </div>
      ))}
      <p className={styles.hhint}>{plan.afterText}</p>
      {plan.mobs.length === 0 ? (
        <p className="muted">No mob is on this plan.</p>
      ) : (
        <ul className={styles.hlist}>
          {plan.mobs.map((m) => (
            <PlanMob key={m.mob} plan={plan} m={m} />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * The Plans tab: the farm's grazing plans, each with its paddocks in order,
 * its rule, and the mobs on it. A plan moves a mob by itself each day.
 */
export function PlansPanel({ snapshot }: { snapshot: Snapshot }) {
  const startPlan = useGame((s) => s.startPlan);
  const setTab = useGame((s) => s.setTab);
  const free = mobsWithoutPlan(snapshot);
  return (
    <section className={styles.listpanel} aria-label="Plans">
      <h2 className={`px ${styles.soontitle}`}>Plans</h2>
      <p className="muted">
        A grazing plan moves a mob round the paddocks by itself each day. Moving the mob by hand
        pauses its plan.
      </p>
      {snapshot.plans.length > 0 && (
        <div className={styles.jobbtns}>
          <button
            type="button"
            className="btn coral"
            disabled={snapshot.mobs.length === 0 || snapshot.paddocks.length === 0}
            onClick={() => startPlan({})}
          >
            Make a plan
          </button>
        </div>
      )}
      {snapshot.plans.length === 0 ? (
        snapshot.mobs.length === 0 || snapshot.paddocks.length === 0 ? (
          <EmptyState action="Go to the Market" onAction={() => setTab('market')}>
            No grazing plans yet. A plan needs a mob to move, and there are no cattle on the farm.{' '}
            {snapshot.market.saleLine}
          </EmptyState>
        ) : (
          <EmptyState action="Make a plan" onAction={() => startPlan({})}>
            No grazing plans yet. A plan moves a mob round the paddocks by itself.
          </EmptyState>
        )
      ) : (
        <ul className={styles.rows}>
          {snapshot.plans.map((p) => (
            <PlanCard key={p.id} plan={p} />
          ))}
        </ul>
      )}
      {free.length > 0 && snapshot.plans.length > 0 && (
        <>
          <h3 className={`px ${styles.minihead}`}>Mobs with no plan</h3>
          <ul className={styles.hlist}>
            {free.map((m) => (
              <li key={m.id} className={styles.hrow}>
                <div className={styles.hbtn}>
                  <p className={styles.hhint}>
                    <b>{m.name}</b>, {plural(m.head, 'head', 'head')}
                  </p>
                  <button
                    type="button"
                    className="btn sm"
                    aria-label={`Make a plan for ${m.name}`}
                    onClick={() => startPlan({ mobId: m.id })}
                  >
                    Plan
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
