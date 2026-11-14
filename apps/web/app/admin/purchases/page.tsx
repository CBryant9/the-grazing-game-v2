import Link from 'next/link';
import styles from '@/components/admin/admin.module.css';
import { ConfirmAction } from '@/components/admin/ConfirmAction';
import { when } from '@/components/admin/format';
import { requireAdmin } from '@/server/admin/page';
import { featureSwitches } from '@/server/auth/accounts';
import { purchasesOverview } from '@/server/billing/admin';
import { paymentsProvider } from '@/server/billing/payments';
import { OPEN_PRICE_PRODUCTS, dollars } from '@/server/billing/products';
import { rescueReady } from '@/server/billing/rescue';

export const dynamic = 'force-dynamic';

const STATUS_WORDS: Record<string, string> = {
  pending: 'Waiting for payment',
  paid: 'Paid',
  refunded: 'Refunded',
  disputed: 'Disputed',
  failed: 'Failed or expired',
};

export default async function Page() {
  const page = await requireAdmin();
  if (!page) return null;
  const [o, switches] = await Promise.all([
    purchasesOverview(page.deps.sql),
    featureSwitches(page.deps.sql),
  ]);
  const payments = paymentsProvider();
  const site = process.env.GG_SITE_URL?.trim().replace(/\/+$/, '');
  return (
    <>
      <h1 className={styles.h1}>Purchases</h1>
      <p className={styles.lede}>
        One-off purchases through Stripe Checkout. What an account owns is set only by Stripe&apos;s
        signed webhook events (or the Check with Stripe button below), never by the browser coming
        back from Checkout. Nothing personal is shown here: ids, products, amounts, states and
        times. Counts were read at {when(o.asAt)}.
      </p>

      <section className={styles.card} aria-labelledby="conn">
        <h2 id="conn" className={styles.h2}>
          Stripe is {payments ? `connected (${payments.mode} mode)` : 'not connected'}
        </h2>
        <p className={styles.muted}>
          {payments
            ? 'Both Stripe keys are set as environment variables. They are never shown or typed here.'
            : 'Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in the host settings (Vercel), starting with test mode keys. Until both are set nothing is for sale.'}
        </p>
        <p className={styles.muted}>
          Purchases switch: <b>{switches.purchases ? 'on' : 'off'}</b> (on the{' '}
          <Link href="/admin/switches">Feature switches</Link> page). Webhook address to give
          Stripe: <b>{site ? `${site}/api/billing/webhook` : 'set GG_SITE_URL first'}</b>
        </p>
        <p className={styles.muted}>
          Webhook events received: {o.events.total}, the last {when(o.events.lastAt)}. Waiting for
          their purchase: {o.events.waiting}. Refused or flagged: {o.events.failed}.
        </p>
      </section>

      <div className={styles.kpis}>
        {(['paid', 'pending', 'refunded', 'disputed', 'failed'] as const).map((s) => (
          <div key={s} className={styles.kpi}>
            <span>{STATUS_WORDS[s]}</span>
            <b>{o.counts[s]}</b>
          </div>
        ))}
        <div className={styles.kpi}>
          <span>Paid in total</span>
          <b>{dollars(o.paidCents)}</b>
          <small>GST included</small>
        </div>
        <div className={styles.kpi}>
          <span>Rescues paid, not applied</span>
          <b>{o.rescuesWaiting}</b>
        </div>
      </div>

      <h2 className={styles.h2}>Products</h2>
      <ul className={styles.list}>
        {o.products.map((p) => {
          const open = OPEN_PRICE_PRODUCTS.includes(p.id);
          const blocked = p.kind === 'keep_going' && !rescueReady();
          return (
            <li key={p.id} className={styles.card}>
              <div className={styles.rowhead}>
                <span className={styles.name}>{p.name}</span>
                <span className={`${styles.chip} ${p.active ? styles.on : ''}`}>
                  {p.active ? 'For sale' : 'Off'}
                </span>
              </div>
              <p className={styles.muted}>
                {open
                  ? 'Price to be set (PRD 10.3 marks it open).'
                  : `${dollars(p.priceCents)}, GST included.`}{' '}
                {p.kind === 'keep_going'
                  ? blocked
                    ? 'Waiting for the rescue step in the game, so it can not be switched on yet.'
                    : 'Paying to keep going.'
                  : `Gives: ${p.grants.join(', ').replace(/_/g, ' ')}.`}
              </p>
              <ConfirmAction
                label={p.active ? 'Switch off' : 'Switch on'}
                endpoint="/api/admin/purchases"
                body={{ action: 'product', product: p.id, active: !p.active }}
                disabled={!p.active && (open || blocked)}
                explain={`${p.active ? 'Switch off' : 'Switch on'} ${p.name}? ${
                  p.active
                    ? 'It stops being offered. What people already bought stays theirs.'
                    : `It is offered at ${dollars(p.priceCents)}, GST included, once the purchases switch is on.`
                } This is recorded in the audit log.`}
              />
            </li>
          );
        })}
      </ul>

      <h2 className={styles.h2}>Recent purchases</h2>
      {o.recent.length === 0 ? (
        <p className={styles.muted}>No purchases yet.</p>
      ) : (
        <div className={styles.tablewrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Id</th>
                <th>Product</th>
                <th>Amount</th>
                <th>State</th>
                <th>Made</th>
                <th>What you can do</th>
              </tr>
            </thead>
            <tbody>
              {o.recent.map((r) => (
                <tr key={r.id}>
                  <td>{r.id.slice(0, 8)}</td>
                  <td>{r.product}</td>
                  <td>{dollars(r.amountCents)}</td>
                  <td>
                    {STATUS_WORDS[r.status] ?? r.status}
                    {r.rescueWaiting ? ', rescue not applied' : ''}
                  </td>
                  <td>{when(r.createdAt)}</td>
                  <td>
                    {(r.status === 'pending' || r.rescueWaiting || r.status === 'paid') && (
                      <ConfirmAction
                        label="Check with Stripe"
                        endpoint="/api/admin/purchases"
                        body={{ action: 'reconcile', id: r.id }}
                        disabled={!payments}
                        explain="Ask Stripe what really happened to this purchase and settle it the way the webhook would have. It also retries a rescue that did not reach its farm. This is recorded in the audit log."
                      />
                    )}
                    {r.status === 'paid' && r.hasPayment && (
                      <ConfirmAction
                        label="Refund"
                        endpoint="/api/admin/purchases"
                        body={{ action: 'refund', id: r.id }}
                        danger
                        disabled={!payments}
                        explain={`Refund ${dollars(r.amountCents)} for ${r.product} through Stripe, in full? What it gave is taken away from the account. This is recorded in the audit log.`}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
