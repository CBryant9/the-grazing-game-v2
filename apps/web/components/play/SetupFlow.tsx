'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/game/api';
import { num } from '@/lib/game/format';
import { useGame } from '@/lib/game/store';
import type {
  SetupChoices,
  SetupDifficulty,
  SetupEnterprise,
  SetupOptions,
  SetupSize,
  SetupStart,
  SetupYears,
} from '@/lib/game/types';
import type { DistrictId } from '@gg/shared';
import { Icon } from './Icon';
import styles from './setup.module.css';

type StepId =
  | 'district'
  | 'size'
  | 'enterprise'
  | 'arable'
  | 'years'
  | 'start'
  | 'difficulty'
  | 'name'
  | 'summary';

interface Draft {
  district?: DistrictId;
  size?: SetupSize;
  enterprise?: SetupEnterprise;
  arablePct?: number;
  croppedPct?: number;
  years?: SetupYears;
  startType?: SetupStart;
  difficulty?: SetupDifficulty;
  name: string;
}

interface Card {
  value: string;
  title: string;
  text?: string;
}

/** A group of cards, one chosen. They are real radio buttons, so arrow keys and screen readers work. */
function Cards({
  name,
  legend,
  cards,
  value,
  onChange,
}: {
  name: string;
  legend: string;
  cards: Card[];
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className={styles.cards}>
      <legend className="sr-only">{legend}</legend>
      {cards.map((c) => (
        <label key={c.value} className={`${styles.card} ${value === c.value ? styles.cardon : ''}`}>
          <input
            type="radio"
            name={name}
            value={c.value}
            checked={value === c.value}
            onChange={() => onChange(c.value)}
          />
          <span className={`px ${styles.cardtitle}`}>{c.title}</span>
          {c.text && <span className={styles.cardtext}>{c.text}</span>}
        </label>
      ))}
    </fieldset>
  );
}

const TITLES: Record<StepId, string> = {
  district: 'Where is your farm?',
  size: 'How big is it?',
  enterprise: 'What do you farm?',
  arable: 'How much is arable?',
  years: 'How do the years play?',
  start: 'How does the farm start?',
  difficulty: 'How hard should it be?',
  name: 'Name your farm',
  summary: 'Take the farm',
};

/**
 * The setup flow (PRD 5.6): game-like steps with cards, one choice a step.
 * The choices and their real figures come from the server. No dollar
 * figures are shown until the farm is taken.
 */
export function SetupFlow() {
  const created = useGame((s) => s.created);
  const [options, setOptions] = useState<SetupOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ name: '' });
  const [index, setIndex] = useState(0);
  const [taking, setTaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headRef = useRef<HTMLHeadingElement>(null);

  const load = useCallback(() => {
    api
      .setup()
      .then(setOptions)
      .catch((e: unknown) =>
        setLoadError(e instanceof ApiError ? e.message : 'The choices could not be loaded.'),
      );
  }, []);
  useEffect(load, [load]);
  const retry = (): void => {
    setLoadError(null);
    load();
  };

  const steps = useMemo<StepId[]>(
    () => [
      'district',
      'size',
      'enterprise',
      ...(draft.enterprise === 'mixed' ? (['arable'] as StepId[]) : []),
      'years',
      'start',
      'difficulty',
      'name',
      'summary',
    ],
    [draft.enterprise],
  );
  const step = steps[Math.min(index, steps.length - 1)]!;

  // Each step moves focus to its heading, so a keyboard or screen reader user lands on the new question.
  useEffect(() => {
    headRef.current?.focus();
  }, [step]);

  if (loadError) {
    return (
      <div className={styles.wrap}>
        <div className={`card ${styles.panel}`} role="alert">
          <p>{loadError}</p>
          <button type="button" className="btn" onClick={retry}>
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (!options) {
    return (
      <div className={styles.wrap}>
        <p className="muted" role="status">
          Loading the choices
        </p>
      </div>
    );
  }

  const district = options.districts.find((d) => d.id === draft.district);
  const size = district?.sizes.find((s) => s.id === draft.size);
  const set = (patch: Partial<Draft>): void => {
    setError(null);
    setDraft((d) => ({ ...d, ...patch }));
  };

  const ready: Record<StepId, boolean> = {
    district: !!draft.district,
    size: !!draft.size,
    enterprise: !!draft.enterprise,
    arable: draft.arablePct !== undefined && draft.croppedPct !== undefined,
    years: !!draft.years,
    start: !!draft.startType,
    difficulty: !!draft.difficulty,
    name: draft.name.trim().length > 0,
    summary: true,
  };
  const label = <T extends { id: string; label: string }>(list: T[], id?: string): string =>
    list.find((x) => x.id === id)?.label ?? '';

  const take = async (): Promise<void> => {
    if (
      !draft.district ||
      !draft.size ||
      !draft.enterprise ||
      !draft.years ||
      !draft.startType ||
      !draft.difficulty
    ) {
      return;
    }
    const choices: SetupChoices = {
      district: draft.district,
      size: draft.size,
      enterprise: draft.enterprise,
      arablePct: draft.enterprise === 'mixed' ? draft.arablePct : undefined,
      croppedPct: draft.enterprise === 'mixed' ? draft.croppedPct : undefined,
      years: draft.years,
      startType: draft.startType,
      difficulty: draft.difficulty,
      name: draft.name,
    };
    setTaking(true);
    setError(null);
    try {
      await created(choices);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The farm could not be started. Try again.');
      setTaking(false);
    }
  };

  const next = (): void => {
    if (step === 'summary') void take();
    else if (ready[step]) setIndex(index + 1);
  };

  return (
    <div className={styles.wrap}>
      <form
        className={styles.flow}
        onSubmit={(e) => {
          e.preventDefault();
          next();
        }}
        noValidate
      >
        <div className={styles.progress}>
          <p className={styles.count}>
            Step {index + 1} of {steps.length}
          </p>
          <div
            className={styles.bar}
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={1}
            aria-valuemax={steps.length}
            aria-valuenow={index + 1}
          >
            <span style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
          </div>
        </div>

        <h1 ref={headRef} tabIndex={-1} className={`px ${styles.title}`}>
          {TITLES[step]}
        </h1>

        {step === 'district' && (
          <Cards
            name="district"
            legend="District"
            value={draft.district}
            onChange={(v) =>
              set({
                district: v as DistrictId,
                size: undefined,
                arablePct: undefined,
                croppedPct: undefined,
              })
            }
            cards={options.districts.map((d) => ({
              value: d.id,
              title: d.name,
              text: `${d.town}, ${d.state}`,
            }))}
          />
        )}
        {step === 'size' && district && (
          <Cards
            name="size"
            legend="Farm size"
            value={draft.size}
            onChange={(v) => set({ size: v as SetupSize })}
            cards={district.sizes.map((s) => ({
              value: s.id,
              title: s.label,
              text: `${num(s.ha)} ha`,
            }))}
          />
        )}
        {step === 'enterprise' && (
          <Cards
            name="enterprise"
            legend="Enterprise"
            value={draft.enterprise}
            onChange={(v) => set({ enterprise: v as SetupEnterprise })}
            cards={options.enterprises.map((e) => ({ value: e.id, title: e.label, text: e.text }))}
          />
        )}
        {step === 'arable' && district && (
          <div className={styles.pair}>
            <Cards
              name="arable"
              legend="Arable share of the farm"
              value={draft.arablePct?.toString()}
              onChange={(v) => set({ arablePct: Number(v) })}
              cards={district.mixed.arablePcts.map((p) => ({
                value: String(p),
                title: `${p}%`,
                text: 'of the farm is arable',
              }))}
            />
            <h2 className={`px ${styles.subtitle}`}>How much of the arable is cropped now?</h2>
            <Cards
              name="cropped"
              legend="Share of the arable land in the cropping rotation"
              value={draft.croppedPct?.toString()}
              onChange={(v) => set({ croppedPct: Number(v) })}
              cards={district.mixed.croppedPcts.map((p) => ({
                value: String(p),
                title: `${p}%`,
                text: 'of the arable is in the rotation',
              }))}
            />
          </div>
        )}
        {step === 'years' && (
          <Cards
            name="years"
            legend="Years"
            value={draft.years}
            onChange={(v) => set({ years: v as SetupYears })}
            cards={options.years.map((y) => ({ value: y.id, title: y.label, text: y.text }))}
          />
        )}
        {step === 'start' && (
          <Cards
            name="start"
            legend="Start"
            value={draft.startType}
            onChange={(v) => set({ startType: v as SetupStart })}
            cards={options.starts.map((s) => ({ value: s.id, title: s.label, text: s.text }))}
          />
        )}
        {step === 'difficulty' && (
          <>
            <Cards
              name="difficulty"
              legend="Difficulty"
              value={draft.difficulty}
              onChange={(v) => set({ difficulty: v as SetupDifficulty })}
              cards={options.difficulties.map((d) => ({
                value: d.id,
                title: d.label,
                text: d.text,
              }))}
            />
            <p className="muted">Money is shown once you take the farm.</p>
          </>
        )}
        {step === 'name' && (
          <div className={styles.field}>
            <label htmlFor="farm-name" className={styles.fieldlabel}>
              Farm name
            </label>
            <input
              id="farm-name"
              className={styles.input}
              type="text"
              value={draft.name}
              maxLength={options.nameMax}
              autoComplete="off"
              placeholder="For example, Wattle Flat"
              onChange={(e) => set({ name: e.target.value })}
            />
            <p className="muted">
              Letters, numbers and spaces. Up to {options.nameMax} characters.
            </p>
          </div>
        )}
        {step === 'summary' && district && size && (
          <dl className={styles.summary}>
            <div>
              <dt>Farm</dt>
              <dd>{draft.name.trim()}</dd>
            </div>
            <div>
              <dt>District</dt>
              <dd>
                {district.name}, {district.town}
              </dd>
            </div>
            <div>
              <dt>Size</dt>
              <dd>
                {size.label}, {num(size.ha)} ha
              </dd>
            </div>
            <div>
              <dt>Enterprise</dt>
              <dd>
                {label(options.enterprises, draft.enterprise)}
                {draft.enterprise === 'mixed' &&
                  `: ${draft.arablePct}% arable, ${draft.croppedPct}% of it cropped`}
              </dd>
            </div>
            <div>
              <dt>Years</dt>
              <dd>{label(options.years, draft.years)}</dd>
            </div>
            <div>
              <dt>Start</dt>
              <dd>{label(options.starts, draft.startType)}</dd>
            </div>
            <div>
              <dt>Difficulty</dt>
              <dd>{label(options.difficulties, draft.difficulty)}</dd>
            </div>
          </dl>
        )}

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.buttons}>
          {index === 0 ? (
            <Link href="/" className="btn ghost">
              <Icon name="back" size={16} />
              Home page
            </Link>
          ) : (
            <button
              type="button"
              className="btn ghost"
              disabled={taking}
              onClick={() => {
                setError(null);
                setIndex(index - 1);
              }}
            >
              <Icon name="back" size={16} />
              Back
            </button>
          )}
          <button type="submit" className="btn coral" disabled={!ready[step] || taking}>
            {step === 'summary'
              ? taking
                ? 'Setting up the farm'
                : error
                  ? 'Try again'
                  : 'Take the farm'
              : 'Next'}
          </button>
        </div>
      </form>
    </div>
  );
}
