import Link from 'next/link';
import styles from '@/components/admin/admin.module.css';
import { ConfirmAction } from '@/components/admin/ConfirmAction';
import { AdminForm } from '@/components/ads/AdminForm';
import { requireAdmin } from '@/server/admin/page';
import { listSponsors } from '@/server/ads/adminStore';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const page = await requireAdmin();
  if (!page) return null;
  const sponsors = await listSponsors(page.deps.sql);
  return (
    <>
      <h1 className={styles.h1}>Sponsors</h1>
      <p className={styles.lede}>
        A sponsor is who pays for a campaign. The contact and notes are for you only and are never
        shown to players or put in a report.
      </p>
      <p>
        <Link href="/admin/ads">Back to ads</Link>
      </p>
      <section className={styles.card} aria-labelledby="new">
        <h2 id="new" className={styles.h2}>
          Add a sponsor
        </h2>
        <AdminForm
          action="sponsor_save"
          fields={[
            {
              kind: 'text',
              name: 'name',
              label: 'Name (shown on the ad)',
              max: 120,
              required: true,
            },
            { kind: 'text', name: 'contact', label: 'Contact (private)', max: 300 },
            { kind: 'textarea', name: 'notes', label: 'Notes (private)', max: 2000 },
          ]}
          submit="Add sponsor"
        />
      </section>
      <ul className={styles.list}>
        {sponsors.map((s) => (
          <li key={s.id} className={styles.card}>
            <h2 className={styles.h2}>{s.name}</h2>
            <p className={styles.muted}>
              {s.campaigns} campaign{s.campaigns === 1 ? '' : 's'}.
            </p>
            <details>
              <summary>Edit</summary>
              <AdminForm
                action="sponsor_save"
                fixed={{ id: s.id }}
                fields={[
                  {
                    kind: 'text',
                    name: 'name',
                    label: 'Name (shown on the ad)',
                    value: s.name,
                    max: 120,
                    required: true,
                  },
                  {
                    kind: 'text',
                    name: 'contact',
                    label: 'Contact (private)',
                    value: s.contact,
                    max: 300,
                  },
                  {
                    kind: 'textarea',
                    name: 'notes',
                    label: 'Notes (private)',
                    value: s.notes,
                    max: 2000,
                  },
                ]}
              />
            </details>
            <ConfirmAction
              label="Delete"
              danger
              endpoint="/api/ads/admin"
              body={{ action: 'sponsor_delete', id: s.id }}
              explain={`Delete ${s.name}? This can not be undone. A sponsor with campaigns can not be deleted.`}
              disabled={s.campaigns > 0}
            />
          </li>
        ))}
        {sponsors.length === 0 && <li className={styles.muted}>No sponsors yet.</li>}
      </ul>
    </>
  );
}
