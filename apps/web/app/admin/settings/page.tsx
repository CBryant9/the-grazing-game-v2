import styles from '@/components/admin/admin.module.css';
import { AnnouncementForm, DistrictsForm, RulesForm } from '@/components/admin/SettingForms';
import { when } from '@/components/admin/format';
import { requireAdmin } from '@/server/admin/page';
import { listSettings } from '@/server/admin/store';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const page = await requireAdmin();
  if (!page) return null;
  const all = await listSettings(page.deps.sql);
  const get = (key: string) => all.find((s) => s.key === key)!;
  const ann = get('announcement').value as { text: string | null; link: string | null };
  const districts = get('districts_available').value as string[];
  const rules = (get('community_rules').value as { text: string | null }).text ?? '';
  const sections = [
    {
      key: 'announcement',
      form: <AnnouncementForm initial={ann} />,
    },
    { key: 'districts_available', form: <DistrictsForm initial={districts} /> },
    { key: 'community_rules', form: <RulesForm initial={rules} /> },
  ];
  return (
    <>
      <h1 className={styles.h1}>Site settings</h1>
      <p className={styles.lede}>
        Each setting is checked on the server before it is saved, and each change goes in the audit
        log. The log keeps only the length or the count, never the words.
      </p>
      {sections.map((s) => {
        const row = get(s.key);
        return (
          <section key={s.key} className={styles.card} aria-labelledby={`h-${s.key}`}>
            <h2 id={`h-${s.key}`} className={styles.h2}>
              {row.label}
            </h2>
            <p className={styles.muted}>{row.help}</p>
            <p className={styles.muted}>
              {row.changedBy
                ? `Last changed by ${row.changedBy}, ${when(row.changedAt)}.`
                : 'Never changed.'}
            </p>
            {s.form}
          </section>
        );
      })}
      <section className={styles.card}>
        <h2 className={styles.h2}>Maintenance wording</h2>
        <p className={styles.muted}>Chosen on the Feature switches page, next to the switch.</p>
      </section>
    </>
  );
}
