'use client';

import { useEffect, useId, useRef } from 'react';
import { PADDOCK_LABELS } from '@gg/shared';
import { num } from '@/lib/game/format';
import { draftProblem, planMobs, type RuleKind } from '@/lib/game/plans';
import { useGame } from '@/lib/game/store';
import type { Snapshot } from '@/lib/game/types';
import { JobBox } from './JobBox';
import { CHIP } from './PaddockSheet';
import styles from './play.module.css';

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className={styles.picker}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className={styles.field}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
      />
      {hint && <span className={styles.hhint}>{hint}</span>}
    </div>
  );
}

const RULES: { id: RuleKind; label: string }[] = [
  { id: 'days', label: 'Every few days' },
  { id: 'times', label: 'Times a day' },
  { id: 'kg', label: 'When feed is down' },
];

/**
 * Making or changing a grazing plan: pick the mob, the paddocks in order (tap
 * them on the map, or from the list), the rule, the rounds and the step to
 * start from. Before Confirm the card shows what the server says: the move
 * it makes now, any stop with no water, and any stop that holds another mob.
 */
export function PlanFlow({ snapshot }: { snapshot: Snapshot }) {
  const plan = useGame((s) => s.plan);
  const busy = useGame((s) => s.busy > 0);
  const edit = useGame((s) => s.planEdit);
  const tap = useGame((s) => s.planTap);
  const moveStop = useGame((s) => s.planMoveStop);
  const check = useGame((s) => s.planCheck);
  const confirm = useGame((s) => s.planConfirm);
  const back = useGame((s) => s.planBack);
  const end = useGame((s) => s.planEnd);
  const setTab = useGame((s) => s.setTab);
  const ref = useRef<HTMLElement>(null);
  const mobSel = useId();
  const stepSel = useId();

  useEffect(() => {
    ref.current?.focus();
  }, []);

  if (!plan) return null;
  const { draft, phase } = plan;
  const form = snapshot.planForm;
  const problem = draftProblem(draft, form);
  const mobs = planMobs(snapshot);
  const editing = phase === 'edit' || phase === 'refused';
  const onCard =
    phase === 'previewing' || phase === 'confirm' || phase === 'applying' || phase === 'done';
  const stopName = (id: number): string =>
    snapshot.paddocks.find((p) => p.id === id)?.name ?? 'Paddock';
  const title = draft.planId === null ? 'Make a plan' : 'Change the plan';

  const body = (
    <>
      {phase === 'done' ? null : (
        <p>
          Tap paddocks on the map in the order the mob will visit them, or pick them from the list.
        </p>
      )}
      <div className={styles.picker}>
        <label htmlFor={mobSel}>Mob</label>
        <select
          id={mobSel}
          className={styles.field}
          value={draft.mobId ?? ''}
          disabled={onCard}
          onChange={(e) => edit({ mobId: e.target.value === '' ? null : Number(e.target.value) })}
        >
          <option value="">Pick a mob</option>
          {mobs.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}, {m.head} head, {m.where === 'yards' ? 'stock yards' : (m.area ?? 'feedlot')}
            </option>
          ))}
        </select>
      </div>

      <h3 className={`px ${styles.minihead}`}>Paddocks, in order</h3>
      {draft.stops.length === 0 ? (
        <p className="muted">None picked yet.</p>
      ) : (
        <ol className={styles.stoplist} aria-label="Paddocks in order">
          {draft.stops.map((id, i) => (
            <li key={id}>
              <span className={styles.stopno} aria-hidden="true">
                {i + 1}
              </span>
              <span className={styles.stopname}>{stopName(id)}</span>
              <button
                type="button"
                className="btn sm ghost"
                aria-label={`Move ${stopName(id)} earlier`}
                disabled={onCard || i === 0}
                onClick={() => moveStop(i, -1)}
              >
                Up
              </button>
              <button
                type="button"
                className="btn sm ghost"
                aria-label={`Move ${stopName(id)} later`}
                disabled={onCard || i === draft.stops.length - 1}
                onClick={() => moveStop(i, 1)}
              >
                Down
              </button>
              <button
                type="button"
                className="btn sm ghost"
                aria-label={`Take ${stopName(id)} out`}
                disabled={onCard}
                onClick={() => tap(id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
      )}
      {!onCard && (
        <ul className={styles.pickrows} aria-label="Paddocks to add">
          {snapshot.paddocks.map((p) => {
            const at = draft.stops.indexOf(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className={styles.pickrow}
                  aria-pressed={at >= 0}
                  onClick={() => tap(p.id)}
                >
                  <span className={styles.pickname}>
                    {at >= 0 && (
                      <span className={styles.stopno} aria-hidden="true">
                        {at + 1}
                      </span>
                    )}
                    <b>{p.name}</b>
                    <span className={`chip ${CHIP[p.label]}`}>{PADDOCK_LABELS[p.label].name}</span>
                  </span>
                  <span className={styles.pickfacts}>
                    {num(p.ha, 1)} ha
                    {p.water === 'none' && <span className={styles.warntag}>No water</span>}
                    {at >= 0 && <span className="sr-only">, stop {at + 1}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <h3 className={`px ${styles.minihead}`}>When it moves</h3>
      <div className={styles.seg3} role="group" aria-label="Rule">
        {RULES.map((r) => (
          <button
            key={r.id}
            type="button"
            aria-pressed={draft.kind === r.id}
            disabled={onCard}
            onClick={() => edit({ kind: r.id })}
          >
            {r.label}
          </button>
        ))}
      </div>
      {draft.kind === 'days' && (
        <NumberField
          label="Move every (days)"
          value={draft.every}
          min={1}
          max={form.everyMax}
          onChange={(n) => edit({ every: n })}
        />
      )}
      {draft.kind === 'times' && (
        <div className={styles.picker}>
          <label htmlFor="plan-times">Moves a day</label>
          <select
            id="plan-times"
            className={styles.field}
            value={draft.times}
            disabled={onCard}
            onChange={(e) => edit({ times: Number(e.target.value) })}
          >
            {Array.from({ length: form.timesADayMax - 1 }, (_, i) => i + 2).map((n) => (
              <option key={n} value={n}>
                {n} times a day
              </option>
            ))}
          </select>
        </div>
      )}
      {draft.kind === 'kg' && (
        <>
          <NumberField
            label="Move when feed is down to (kg DM/ha)"
            value={draft.kg}
            min={form.kgMin}
            max={form.kgMax}
            onChange={(n) => edit({ kg: n })}
          />
          <NumberField
            label="Or after this many days (0 for no limit)"
            value={draft.maxDays}
            min={0}
            max={form.maxDaysMax}
            onChange={(n) => edit({ maxDays: n })}
          />
        </>
      )}

      <h3 className={`px ${styles.minihead}`}>Rounds</h3>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={draft.keepGoing}
          disabled={onCard}
          onChange={(e) => edit({ keepGoing: e.target.checked })}
        />
        Keep going round and round
      </label>
      {!draft.keepGoing && (
        <>
          <NumberField
            label="Rounds of the paddocks"
            value={draft.rounds}
            min={1}
            max={form.roundsMax}
            onChange={(n) => edit({ rounds: n })}
          />
          <div className={styles.seg} role="group" aria-label="After the last round">
            <button
              type="button"
              aria-pressed={draft.after === 'repeat'}
              disabled={onCard}
              onClick={() => edit({ after: 'repeat' })}
            >
              Start again
            </button>
            <button
              type="button"
              aria-pressed={draft.after === 'stay'}
              disabled={onCard}
              onClick={() => edit({ after: 'stay' })}
            >
              Stay put
            </button>
          </div>
        </>
      )}

      {draft.stops.length > 1 && (
        <div className={styles.picker}>
          <label htmlFor={stepSel}>Start from</label>
          <select
            id={stepSel}
            className={styles.field}
            value={draft.step}
            disabled={onCard}
            onChange={(e) => edit({ step: Number(e.target.value) })}
          >
            {draft.stops.map((id, i) => (
              <option key={id} value={i}>
                Step {i + 1}: {stopName(id)}
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  );

  return (
    <section
      ref={ref}
      tabIndex={-1}
      className={styles.moveflow}
      aria-label="Grazing plan"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && phase !== 'applying') end();
      }}
    >
      <header className={styles.sheethead}>
        <h2 className={`px ${styles.sheettitle}`}>{title}</h2>
        {phase !== 'done' && (
          <button type="button" className="btn sm ghost" onClick={end}>
            Cancel
          </button>
        )}
      </header>
      <div className={styles.movebody}>
        {body}
        {editing && plan.message && (
          <p role="alert" className={styles.hreason}>
            {plan.message}
          </p>
        )}
        {editing && (
          <div className={styles.jobbtns}>
            <button
              type="button"
              className="btn coral"
              disabled={problem !== null || busy}
              aria-describedby={problem ? 'plan-problem' : undefined}
              onClick={() => void check()}
            >
              Check the plan
            </button>
            {problem && (
              <p id="plan-problem" className={styles.hhint}>
                {problem}
              </p>
            )}
          </div>
        )}
        {onCard && (
          <JobBox
            title="Grazing plan"
            job={{
              phase: phase as 'previewing' | 'confirm' | 'applying' | 'done',
              card: plan.card,
              message: plan.message,
            }}
            confirmLabel={draft.planId === null ? 'Set the plan' : 'Save the plan'}
            busy={busy}
            onConfirm={() => void confirm()}
            onCancel={back}
            cancelLabel="Back to the form"
            onDismiss={() => {
              end();
              setTab('plans');
            }}
          />
        )}
      </div>
    </section>
  );
}
