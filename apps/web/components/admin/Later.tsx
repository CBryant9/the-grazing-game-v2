import styles from './admin.module.css';

/** A part of the admin that is not built yet. It says so plainly and does nothing. */
export function Later({ title, what }: { title: string; what: string }) {
  return (
    <>
      <h1 className={styles.h1}>{title}</h1>
      <div className={styles.card}>
        <p>
          <b>Built in a later milestone.</b>
        </p>
        <p className={styles.muted}>{what}</p>
      </div>
    </>
  );
}
