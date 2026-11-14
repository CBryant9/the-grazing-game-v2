import styles from '@/components/admin/admin.module.css';
import { ConfirmAction } from '@/components/admin/ConfirmAction';
import { KIND_INFO } from '@/lib/notify/kinds';
import { requireAdmin } from '@/server/admin/page';
import { capabilities, notifyDepsFor } from '@/server/notify/deps';
import { overview } from '@/server/notify/admin';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const page = await requireAdmin();
  if (!page) return null;
  const nd = notifyDepsFor(page.deps);
  const [o, caps] = await Promise.all([overview(page.deps.sql, 7), capabilities(nd)]);
  return (
    <>
      <h1 className={styles.h1}>Notifications</h1>
      <p className={styles.lede}>
        What was sent, what failed and what was held in the last {o.days} days, by type. These are
        counts only: no names, no addresses and no message text.
      </p>

      <section className={styles.card} aria-labelledby="state">
        <h2 id="state" className={styles.h2}>
          Sending is {o.paused ? 'PAUSED' : 'running'}
        </h2>
        <p className={styles.muted}>
          Web push is {caps.push ? 'set up' : 'not set up (needs the VAPID keys)'}. Email is{' '}
          {caps.email ? 'set up' : 'not set up (needs the Resend key, the sender address and the token secret)'}
          . The Push notifications feature switch is {caps.switchOn ? 'on' : 'off'}.
        </p>
        <p className={styles.muted}>
          Pausing stops everything that goes to a phone or by email, and stops the reminders being
          made. Players still see their inbox. What is waiting stays waiting, and anything older than
          12 hours is dropped when sending starts again.
        </p>
        <ConfirmAction
          label={o.paused ? 'Resume sending' : 'Pause all sending'}
          endpoint="/api/admin/notifications"
          body={{ paused: !o.paused }}
          danger={!o.paused}
          explain={
            o.paused
              ? 'Resume sending? Waiting notifications go out within a few minutes, and reminders start being made again. This is recorded in the audit log.'
              : 'Pause all sending? Nothing goes to phones or email until you resume. Players still see their inbox. This is recorded in the audit log.'
          }
        />
      </section>

      <section className={styles.card} aria-labelledby="counts">
        <h2 id="counts" className={styles.h2}>
          By type
        </h2>
        <div className={styles.tablewrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">Sent</th>
                <th scope="col">Failed</th>
                <th scope="col">Held</th>
                <th scope="col">Dropped</th>
                <th scope="col">Waiting</th>
              </tr>
            </thead>
            <tbody>
              {o.byKind.map((k) => (
                <tr key={k.kind}>
                  <th scope="row">{KIND_INFO[k.kind].label}</th>
                  <td>{k.sent}</td>
                  <td>{k.failed}</td>
                  <td>{k.held}</td>
                  <td>{k.dropped}</td>
                  <td>{k.waiting}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.muted}>
          Each count is one push or one email. A notification that goes by push and by email counts
          twice.
        </p>
      </section>

      <section className={styles.card} aria-labelledby="why">
        <h2 id="why" className={styles.h2}>
          Why some did not go
        </h2>
        {o.reasons.length === 0 ? (
          <p className={styles.muted}>Nothing failed or was dropped.</p>
        ) : (
          <ul className={styles.list}>
            {o.reasons.map((r) => (
              <li key={r.reason}>
                <span className={styles.mono}>{r.reason}</span>: {r.count}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
