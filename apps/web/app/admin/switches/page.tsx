import styles from '@/components/admin/admin.module.css';
import { ConfirmAction } from '@/components/admin/ConfirmAction';
import { WordingForm } from '@/components/admin/SettingForms';
import { when } from '@/components/admin/format';
import { MAINTENANCE_WORDINGS, SWITCH_INFO } from '@/server/admin/info';
import { requireAdmin } from '@/server/admin/page';
import { listSettings, listSwitches } from '@/server/admin/store';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const page = await requireAdmin();
  if (!page) return null;
  const [rows, settings] = await Promise.all([
    listSwitches(page.deps.sql),
    listSettings(page.deps.sql),
  ]);
  const wording =
    (settings.find((s) => s.key === 'maintenance_wording')?.value as { id?: string } | undefined)
      ?.id ?? MAINTENANCE_WORDINGS[0].id;
  const maintenance = rows.find((r) => r.key === 'maintenance_mode')!;
  return (
    <>
      <h1 className={styles.h1}>Feature switches</h1>
      <p className={styles.lede}>
        Each switch takes effect without a new release. The game and account routes read a switch
        from the database and keep it for up to 30 seconds on each server, so a change shows within
        half a minute (at once on the server you used). Switches marked &ldquo;needs a
        rebuild&rdquo; are also read by the public website pages when the site is built, so those
        pages only change at the next build.
      </p>

      <section className={styles.card} aria-labelledby="maint">
        <h2 id="maint" className={styles.h2}>
          Maintenance mode is {maintenance.enabled ? 'ON' : 'off'}
        </h2>
        <p className={styles.muted}>
          While it is on, players and guests see the message below and can not play. Their farms are
          safe. Anything already being saved finishes. Admins can still play. Choose the wording
          before you turn it on.
        </p>
        <WordingForm initial={wording} wordings={MAINTENANCE_WORDINGS} />
      </section>

      <ul className={styles.list}>
        {rows.map((r) => {
          const info = SWITCH_INFO[r.key];
          return (
            <li key={r.key} className={styles.card}>
              <div className={styles.rowhead}>
                <span className={styles.name}>{info.label}</span>
                <span className={`${styles.chip} ${r.enabled ? styles.on : ''}`}>
                  {r.enabled ? 'On' : 'Off'}
                </span>
                {info.rebuild && <span className={styles.chip}>Website needs a rebuild</span>}
              </div>
              <p className={styles.muted}>{info.what}</p>
              <p className={styles.muted}>
                {r.changedBy
                  ? `Last changed by ${r.changedBy}, ${when(r.changedAt)}.`
                  : r.isDefault
                    ? 'Never changed. This is the launch default.'
                    : 'Never changed by an admin. This is the launch setting.'}
              </p>
              <ConfirmAction
                label={r.enabled ? 'Turn off' : 'Turn on'}
                endpoint="/api/admin/switches"
                body={{ key: r.key, enabled: !r.enabled }}
                danger={r.key === 'maintenance_mode' && !r.enabled}
                explain={`${r.enabled ? 'Turn off' : 'Turn on'} ${info.label}? ${
                  r.enabled ? info.whenOff : info.whenOn
                }${info.rebuild ? ' The public website pages only change at the next build.' : ''} This is recorded in the audit log.`}
              />
            </li>
          );
        })}
      </ul>
    </>
  );
}
