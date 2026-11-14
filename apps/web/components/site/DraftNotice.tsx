import styles from './site.module.css';

/** The line at the head of every legal page until a lawyer has read it (PRD 18). */
export function DraftNotice() {
  return (
    <p className={styles.draft} role="note">
      Draft. Not yet reviewed.
    </p>
  );
}
