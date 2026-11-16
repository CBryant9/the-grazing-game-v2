'use client';

import { useRef, useState } from 'react';
import { PADDOCK_LABELS } from '@gg/shared';
import { dateText, num } from '@/lib/game/format';
import { useReducedMotion, useTheme } from '@/lib/game/hooks';
import { usePast } from '@/lib/game/pastStore';
import { FarmMap } from './FarmMap';
import { CHIP } from './PaddockSheet';
import styles from './accounts.module.css';

const NOON = 12 * 60;
const NO_CONTRACTOR = { built: [], left: [] };
const nothing = (): void => undefined;

/**
 * The farm on a past day: the map and the paddock figures as they were, read only. A strip says
 * which day it is and gives the way back. Nothing here can change the farm: there is no tool,
 * a tap on the map only picks a paddock to read its figures.
 */
export function PastDay() {
  const viewing = usePast((s) => s.viewing);
  const back = usePast((s) => s.back);
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const [picked, setPicked] = useState<number | null>(null);
  const cardRef = useRef<HTMLElement>(null);
  if (!viewing) return null;
  return (
    <div className={styles.past} role="dialog" aria-label={`The farm on day ${viewing.day + 1}`}>
      <div className={styles.paststrip}>
        <p role="status">
          <b>You are looking at Day {(viewing.day + 1).toLocaleString('en-AU')}</b>,{' '}
          {dateText(viewing.date)}. This is the farm as it was. You can not change anything here.
        </p>
        <button type="button" className="btn coral" onClick={back}>
          Back to today
        </button>
      </div>
      <div className={styles.pastmap}>
        <FarmMap
          view={viewing.view}
          theme={theme}
          minutes={NOON}
          selected={picked}
          pickable={null}
          reduceMotion={reduceMotion}
          onTapPaddock={(id) => setPicked(id)}
          tool="look"
          draft={null}
          contractor={NO_CONTRACTOR}
          anchor={null}
          anchorEl={cardRef}
          floating={false}
          onDrag={nothing}
          onToolTap={nothing}
          onFenceTap={nothing}
        />
      </div>
      <ul className={styles.pastlist} aria-label="Paddocks on that day">
        {viewing.paddocks.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className={styles.pastpad}
              aria-pressed={picked === p.id}
              onClick={() => setPicked(p.id)}
            >
              <b>{p.name}</b>{' '}
              <span className={`chip ${CHIP[p.label]}`}>{PADDOCK_LABELS[p.label].name}</span>
              <span className={styles.pastfacts}>
                <span>{num(p.ha)} ha</span>
                <span>{num(p.massKgHa)} kg DM/ha</span>
                <span>{num(p.heightCm)} cm</span>
                <span>{num(p.coverPct)}% cover</span>
                <span>{p.head > 0 ? `${num(p.head)} head` : 'No stock'}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
