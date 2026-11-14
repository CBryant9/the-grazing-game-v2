import type { ReactNode } from 'react';
import styles from './help.module.css';

/**
 * A list with nothing in it: one plain line and one clear next step.
 * The button always has a text label.
 */
export function EmptyState({
  children,
  action,
  onAction,
  disabled,
}: {
  children: ReactNode;
  action: string;
  onAction: () => void;
  disabled?: boolean;
}) {
  return (
    <div className={styles.empty}>
      <p>{children}</p>
      <button type="button" className="btn coral" disabled={disabled} onClick={onAction}>
        {action}
      </button>
    </div>
  );
}
