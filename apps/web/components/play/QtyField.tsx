'use client';

import { useId } from 'react';
import { clampQty } from '@/lib/game/lists';
import { num } from '@/lib/game/format';
import styles from './play.module.css';

/**
 * A number of head: a labelled box with a minus and a plus beside it. Held
 * to at least 1 and at most `max`. Every control is 44 px and has a name.
 */
export function QtyField({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (qty: number) => void;
}) {
  const id = useId();
  const set = (n: number): void => onChange(clampQty(n, max));
  return (
    <div className={styles.qty}>
      <label htmlFor={id}>
        {label} <span className="muted">(up to {num(max)})</span>
      </label>
      <div className={styles.qtyrow}>
        <button
          type="button"
          className="btn sm ghost"
          aria-label="One fewer"
          disabled={value <= 1}
          onClick={() => set(value - 1)}
        >
          -
        </button>
        <input
          id={id}
          className={styles.field}
          type="number"
          inputMode="numeric"
          min={1}
          max={max}
          value={value}
          onChange={(e) => set(Number(e.target.value))}
        />
        <button
          type="button"
          className="btn sm ghost"
          aria-label="One more"
          disabled={value >= max}
          onClick={() => set(value + 1)}
        >
          +
        </button>
      </div>
    </div>
  );
}
