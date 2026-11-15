'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/game/api';
import { num } from '@/lib/game/format';
import { useGame } from '@/lib/game/store';
import type {
  FarmMode,
  SetupChoices,
  SetupDifficulty,
  SetupEnterprise,
  SetupOptions,
  SetupSize,
  SetupStart,
  SetupStock,
  SetupYears,
} from '@/lib/game/types';
import type { DistrictId } from '@gg/shared';
import { Icon } from './Icon';
import styles from './setup.module.css';

type StepId =
  | 'mode'
  | 'district'
  | 'size'
  | 'enterprise'
  | 'arable'
  | 'years'
  | 'start'
  | 'stock'
  | 'difficulty'
  | 'name'
  | 'summary';

interface Draft {
  mode?: FarmMode;
  district?: DistrictId;
  size?: SetupSize;
  enterprise?: SetupEnterprise;
  stock?: SetupStock;
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
  /** Shown, but not chosen: a plain reason is in `text`. */
  disabled?: boolean;
  /** A link under the text, for the one thing that would open it (signing in). */
  link?: { href: string; label: string };
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
        <label
          key={c.value}
          className={`${styles.card} ${value === c.value ? styles.cardon : ''} ${c.disabled ? styles.carddisabled : ''}`}
        >
          <input
            type="radio"
            name={name}
            value={c.value}
            checked={value === c.value}
            disabled={c.disabled}
            onChange={() => onChange(c.value)}
          />
          <span className={`px ${styles.cardtitle}`}>{c.title}</span>
          {c.text && <span className={styles.cardtext}>{c.text}</span>}
          {c.link && (
            <Link href={c.link.href} className={styles.cardlink}>
              {c.link.label}
            </Link>
          )}
        </label>
      ))}
    </fieldset>
  );
}

const TITLES: Record<StepId, string> = {
  mode: 'How do you want to play?',
  district: 'Where is your farm?',
  size: 'How big is it?',
  enterprise: 'What do you farm?',
  arable: 'How much is arable?',
  years: 'How do the years play?',
  start: 'How does the farm start?',
  stock: 'Cattle, sheep or both?',
  difficulty: 'How hard should it be?',
  name: 'Name your farm',
  summary: 'Take the farm',
};

/**
 * The setup flow (PRD 5.6): game-like steps with cards, one choice a step.
 * The choices and their real figures come from the server. No dollar
 * figures are shown until the farm is taken.
 */
export function SetupFlow({ initial = null }: { initial?: SetupOptions | null }) {
  const created = useGame((s) => s.created);
  // The choices sent with the page (a visitor with no cookies), or null to ask the server for them.
  const [options, setOptions] = useState<SetupOptions | null>(initial);
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
  const sentWithPage = initial !== null;
  useEffect(() => {
    if (!sentWithPage) load();
  }, [load, sentWithPage]);
  const retry = (): void => {
    setLoadError(null);
    load();
  };

  // The stock step shows only where the server offers sheep (the switch on, a sheep district)
  // and on a running farm: a farm from scratch starts with no stock.
  const offersSheep =
    !!options?.districts.find((d) => d.id === draft.district)?.sheep &&
    draft.startType === 'running';
  const steps = useMemo<StepId[]>(
    () => [
      'mode',
      'district',
      'size',
      'enterprise',
      ...(draft.enterprise === 'mixed' ? (['arable'] as StepId[]) : []),
      // A Daily Farm plays the real date, so there is no choice of years.
      ...(draft.mode === 'daily' ? [] : (['years'] as StepId[])),
      'start',
      ...(offersSheep ? (['stock'] as StepId[]) : []),
      'difficulty',
      'name',
      'summary',
    ],
    [draft.enterprise, draft.mode, offersSheep],
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
    mode: !!draft.mode,
    district: !!draft.district,
    size: !!draft.size,
    enterprise: !!draft.enterprise,
    arable: draft.arablePct !== undefined && draft.croppedPct !== undefined,
    years: !!draft.years,
    start: !!draft.startType,
    stock: !!draft.stock,
    difficulty: !!draft.difficulty,
    name: draft.name.trim().length > 0,
    summary: true,
  };
  const label = <T extends { id: string; label: string }>(list: T[], id?: string): string =>
    list.find((x) => x.id === id)?.label ?? '';

  const take = async (): Promise<void> => {
    const daily = draft.mode === 'daily';
    if (
      !draft.mode ||
      !draft.district ||
      !draft.size ||
      !draft.enterprise ||
      (!daily && !draft.years) ||
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
      years: daily ? 'real-in-order' : draft.years!,
      startType: draft.startType,
      difficulty: draft.difficulty,
      name: draft.name,
      ...(offersSheep && draft.stock && draft.stock !== 'cattle' ? { stock: draft.stock } : {}),
      mode: draft.mode,
      // A Daily Farm's time zone is the device's, locked when the farm starts (PRD 5.2).
      ...(daily ? { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } : {}),
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

        {step === 'mode' && (
          <>
            <Cards
              name="mode"
              legend="How to play"
              value={draft.mode}
              onChange={(v) => set({ mode: v as FarmMode })}
              cards={[
                {
                  value: 'daily',
                  title: 'Daily Farm',
                  text:
                    options.daily.state === 'open'
                      ? 'One game day for each real day. Each day starts at first light when you log in. Every job uses daylight. The farm keeps running overnight.'
                      : options.daily.text,
                  disabled: options.daily.state !== 'open',
                  link:
                    options.daily.state === 'guest'
                      ? { href: '/sign-in', label: 'Sign in to play it' }
                      : undefined,
                },
                {
                  value: 'fast',
                  title: 'Fast Farm',
                  text: 'Play at your own pace. Jobs still use daylight, then tap Next day. Skip a week, month or year with plans running.',
                },
              ]}
            />
            {options.daily.state === 'open' && <p className="muted">{options.daily.text}</p>}
          </>
        )}
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
        {step === 'stock' && district && (
          <>
            <Cards
              name="stock"
              legend="Stock"
              value={draft.stock}
              onChange={(v) => set({ stock: v as SetupStock })}
              cards={options.stocks.map((s) => ({ value: s.id, title: s.label, text: s.text }))}
            />
            {draft.stock && draft.stock !== 'cattle' && (
              <p className="muted">
                {district.flock.find((f) => f.stock === draft.stock)?.text ?? ''}
              </p>
            )}
          </>
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
              <dt>Mode</dt>
              <dd>
                {draft.mode === 'daily'
                  ? 'Daily Farm. It starts today, in your time zone, and the day ends at midnight there.'
                  : 'Fast Farm'}
              </dd>
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
            {draft.mode !== 'daily' && (
              <div>
                <dt>Years</dt>
                <dd>{label(options.years, draft.years)}</dd>
              </div>
            )}
            <div>
              <dt>Start</dt>
              <dd>{label(options.starts, draft.startType)}</dd>
            </div>
            {offersSheep && draft.stock && (
              <div>
                <dt>Stock</dt>
                <dd>{label(options.stocks, draft.stock)}</dd>
              </div>
            )}
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
