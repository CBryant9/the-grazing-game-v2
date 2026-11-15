'use client';

import { useEffect, useId, useRef } from 'react';
import { PADDOCK_LABELS } from '@gg/shared';
import { num } from '@/lib/game/format';
import {
  allStops,
  draftProblem,
  legsOf,
  MAX_LEGS,
  newDraft,
  newLeg,
  planMobs,
  withLeg,
  type LegDraft,
  type RuleKind,
} from '@/lib/game/plans';
import { useGame } from '@/lib/game/store';
import type { PlanFormWire, Snapshot } from '@/lib/game/types';
import { JobBox } from './JobBox';
import { CHIP } from './PaddockSheet';
import styles from './play.module.css';

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  disabled?: boolean;
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
        disabled={disabled}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
      />
      {hint && <span className={styles.hhint}>{hint}</span>}
    </div>
  );
}

/** The rule for a leg, as the mockup's switch (with moves a day as a third choice). */
const RULES: { id: RuleKind; label: string }[] = [
  { id: 'days', label: 'Move every N days' },
  { id: 'times', label: 'Times a day' },
  { id: 'kg', label: 'Move at kg DM/ha' },
];

/** One leg's card: its paddocks joined by arrows, then its rule and its rounds. */
function LegCard({
  snapshot,
  form,
  leg,
  index,
  count,
  active,
  locked,
  onEdit,
  onPick,
  onRemove,
}: {
  snapshot: Snapshot;
  form: PlanFormWire;
  leg: LegDraft;
  index: number;
  count: number;
  active: boolean;
  locked: boolean;
  onEdit: (patch: Partial<LegDraft>) => void;
  onPick: () => void;
  onRemove: () => void;
}) {
  const tap = useGame((s) => s.planTap);
  const moveStop = useGame((s) => s.planMoveStop);
  const timesId = useId();
  const last = index === count - 1;
  const stopName = (id: number): string =>
    snapshot.paddocks.find((p) => p.id === id)?.name ?? 'Paddock';
  return (
    <section className={styles.legcard} aria-label={`Leg ${index + 1}`}>
      <div className={styles.leghead}>
        <b>Leg {index + 1}</b>
        <span className="muted">
          {count === 1
            ? 'these paddocks, in order'
            : index === 0
              ? 'keep going in these until…'
              : 'then go to these ones'}
        </span>
        {index > 0 && !locked && (
          <button type="button" className={styles.linkbtn} onClick={onRemove}>
            Remove leg
          </button>
        )}
      </div>
      <div className={styles.chain} aria-label={`Leg ${index + 1} paddocks`}>
        {leg.stops.length === 0 && <span className="muted">No paddocks yet.</span>}
        {leg.stops.map((id, i) => (
          <span key={id} className={styles.chainitem}>
            {i > 0 && <span aria-hidden="true">→</span>}
            <span className={`${styles.fchip} ${i === 0 ? styles.fchipon : ''}`}>
              {stopName(id)}
            </span>
          </span>
        ))}
        {!locked && !active && (
          <button type="button" className={styles.fchip} onClick={onPick}>
            + add
          </button>
        )}
      </div>
      {active && !locked && (
        <>
          <p className={styles.hhint}>
            Tap paddocks on the map in order, or pick them here. They go into leg {index + 1}.
          </p>
          {leg.stops.length > 0 && (
            <ol className={styles.stoplist} aria-label={`Leg ${index + 1} in order`}>
              {leg.stops.map((id, i) => (
                <li key={id}>
                  <span className={styles.stopno} aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className={styles.stopname}>{stopName(id)}</span>
                  <button
                    type="button"
                    className="btn sm ghost"
                    aria-label={`Move ${stopName(id)} earlier`}
                    disabled={i === 0}
                    onClick={() => moveStop(i, -1)}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    className="btn sm ghost"
                    aria-label={`Move ${stopName(id)} later`}
                    disabled={i === leg.stops.length - 1}
                    onClick={() => moveStop(i, 1)}
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    className="btn sm ghost"
                    aria-label={`Take ${stopName(id)} out`}
                    onClick={() => tap(id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ol>
          )}
          <ul className={styles.pickrows} aria-label={`Paddocks to add to leg ${index + 1}`}>
            {snapshot.paddocks.map((p) => {
              const at = leg.stops.indexOf(p.id);
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
                      <span className={`chip ${CHIP[p.label]}`}>
                        {PADDOCK_LABELS[p.label].name}
                      </span>
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
        </>
      )}
      <div className={styles.seg} role="group" aria-label={`Leg ${index + 1}: when it moves`}>
        {RULES.map((r) => (
          <button
            key={r.id}
            type="button"
            aria-pressed={leg.kind === r.id}
            disabled={locked}
            onClick={() => onEdit({ kind: r.id })}
          >
            {r.label}
          </button>
        ))}
      </div>
      {leg.kind === 'days' && (
        <NumberField
          label="Move every (days)"
          value={leg.every}
          min={1}
          max={form.everyMax}
          disabled={locked}
          onChange={(n) => onEdit({ every: n })}
        />
      )}
      {leg.kind === 'times' && (
        <div className={styles.picker}>
          <label htmlFor={timesId}>Moves a day</label>
          <select
            id={timesId}
            className={styles.field}
            value={leg.times}
            disabled={locked}
            onChange={(e) => onEdit({ times: Number(e.target.value) })}
          >
            {Array.from({ length: form.timesADayMax - 1 }, (_, i) => i + 2).map((n) => (
              <option key={n} value={n}>
                {n} times a day
              </option>
            ))}
          </select>
        </div>
      )}
      {leg.kind === 'kg' && (
        <>
          <NumberField
            label="Move when grazed down to (kg DM/ha)"
            value={leg.kg}
            min={form.kgMin}
            max={form.kgMax}
            disabled={locked}
            onChange={(n) => onEdit({ kg: n })}
          />
          <NumberField
            label="Maximum days (0 for no limit)"
            value={leg.maxDays}
            min={0}
            max={form.maxDaysMax}
            disabled={locked}
            onChange={(n) => onEdit({ maxDays: n })}
          />
        </>
      )}
      {last && (
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={leg.keepGoing}
            disabled={locked}
            onChange={(e) => onEdit({ keepGoing: e.target.checked })}
          />
          Keep going round and round
        </label>
      )}
      {!(last && leg.keepGoing) && (
        <NumberField
          label="Rounds"
          value={leg.rounds}
          min={1}
          max={form.roundsMax}
          disabled={locked}
          onChange={(n) => onEdit({ rounds: n, keepGoing: false })}
        />
      )}
    </section>
  );
}

/**
 * Making or changing a grazing plan, as the mockup's plan form: the mob, then
 * Leg 1 with its paddocks joined by arrows, its rule and its rounds, then
 * "Add a leg" for more (up to eight), what happens after the last leg, the
 * water check and Save plan. Before Confirm the card shows what the server
 * says: the move it makes now, any stop with no water, and any stop that holds
 * another mob.
 */
export function PlanFlow({ snapshot }: { snapshot: Snapshot }) {
  const plan = useGame((s) => s.plan);
  const busy = useGame((s) => s.busy > 0);
  const edit = useGame((s) => s.planEdit);
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
  const legs = legsOf(draft);
  const stops = allStops(draft);
  const last = legs[legs.length - 1]!;
  const stopName = (id: number): string =>
    snapshot.paddocks.find((p) => p.id === id)?.name ?? 'Paddock';
  const dry = [...new Set(stops)].filter(
    (id) => snapshot.paddocks.find((p) => p.id === id)?.water === 'none',
  );
  const title = draft.planId === null ? 'Make a plan' : 'Change the plan';

  const body = (
    <>
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

      {legs.map((leg, i) => (
        <LegCard
          key={i}
          snapshot={snapshot}
          form={form}
          leg={leg}
          index={i}
          count={legs.length}
          active={draft.leg === i}
          locked={onCard}
          onEdit={(patch) => edit(withLeg(draft, i, patch))}
          onPick={() => edit({ leg: i })}
          onRemove={() =>
            edit({
              more: draft.more.filter((_, k) => k !== i - 1),
              leg: Math.min(draft.leg, legs.length - 2),
              step: 0,
            })
          }
        />
      ))}
      {!onCard && legs.length < MAX_LEGS && (
        <div>
          <button
            type="button"
            className="btn sm ghost"
            onClick={() => {
              // The leg before the new one needs a set number of rounds, or the new leg never starts.
              const patch = withLeg(draft, legs.length - 1, { keepGoing: false });
              edit({
                ...patch,
                more: [...(patch.more ?? draft.more), newLeg(form)],
                leg: legs.length,
              });
            }}
          >
            Add a leg
          </button>
        </div>
      )}

      <div className={styles.afterrow}>
        {!last.keepGoing && (
          <>
            <span className="muted">After the last leg</span>
            <div className={styles.seg} role="group" aria-label="After the last leg">
              <button
                type="button"
                aria-pressed={draft.after === 'repeat'}
                disabled={onCard}
                onClick={() => edit({ after: 'repeat' })}
              >
                Repeat
              </button>
              <button
                type="button"
                aria-pressed={draft.after === 'stay'}
                disabled={onCard}
                onClick={() => edit({ after: 'stay' })}
              >
                Stay
              </button>
            </div>
          </>
        )}
        {stops.length > 0 && (
          <span className={dry.length ? 'bad' : 'ok'}>
            {dry.length
              ? `✗ No water in ${dry.map(stopName).join(', ')}`
              : '✓ Water in every paddock'}
          </span>
        )}
      </div>

      {stops.length > 1 && (
        <div className={styles.picker}>
          <label htmlFor={stepSel}>Start from</label>
          <select
            id={stepSel}
            className={styles.field}
            value={Math.min(draft.step, stops.length - 1)}
            disabled={onCard}
            onChange={(e) => edit({ step: Number(e.target.value) })}
          >
            {legs.flatMap((leg, l) => {
              const before = legs.slice(0, l).reduce((n, x) => n + x.stops.length, 0);
              return leg.stops.map((id, i) => (
                <option key={`${l}-${id}`} value={before + i}>
                  {legs.length > 1 ? `Leg ${l + 1}, step ${i + 1}` : `Step ${i + 1}`}:{' '}
                  {stopName(id)}
                </option>
              ));
            })}
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
          <button type="button" className={`btn sm ghost ${styles.planclose}`} onClick={end}>
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
              Save plan
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => edit({ ...newDraft(form, draft.mobId), planId: draft.planId })}
            >
              New plan
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
