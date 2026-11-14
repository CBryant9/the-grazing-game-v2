import styles from '@/components/admin/admin.module.css';
import { ConfirmAction } from '@/components/admin/ConfirmAction';
import { WordForm } from '@/components/admin/WordForm';
import { requireAdmin } from '@/server/admin/page';
import { listWords } from '@/server/admin/moderation';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const page = await requireAdmin();
  if (!page) return null;
  const words = await listWords(page.deps.sql);
  return (
    <>
      <h1 className={styles.h1}>Word filter</h1>
      <p className={styles.lede}>
        Words and phrases checked in usernames, names, bios, posts, comments and group text, as
        whole words. Block refuses the text. Flag lets it through and opens a report. A change
        affects new text only. Each change is recorded in the audit log, without the word itself.
      </p>
      <div className={styles.card}>
        <h2 className={styles.h2}>Add a word or phrase</h2>
        <WordForm />
      </div>
      <div className={styles.card}>
        <h2 className={styles.h2}>On the list ({words.length})</h2>
        {words.length === 0 ? (
          <p className={styles.muted}>Nothing is on the list.</p>
        ) : (
          <ul className={styles.list}>
            {words.map((w) => (
              <li key={w.id} className={styles.row}>
                <div className={styles.rowhead}>
                  <span className={styles.name}>{w.term}</span>
                  <span className={styles.chip}>{w.kind === 'block' ? 'Block' : 'Flag'}</span>
                </div>
                <ConfirmAction
                  label="Remove"
                  danger
                  endpoint="/api/admin/words"
                  body={{ action: 'remove', id: w.id }}
                  explain={`Remove "${w.term}" from the list? New text with it will no longer be ${w.kind === 'block' ? 'refused' : 'flagged'}. This is recorded in the audit log.`}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
