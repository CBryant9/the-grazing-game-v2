import 'server-only';
import type { AuthDeps } from '../auth/accounts';
import { featureSwitches } from '../auth/accounts';
import type { SqlClient } from '../db/sql';
import { resendMail, type MailSender } from './mail';
import { TOKEN_SECRET_MIN } from './token';
import { vapidPushSender, vapidUsable, type PushSender } from './webpush';

/**
 * What notifications need from outside: a push sender, a mail sender, the secrets, and a clock.
 * Each is null when its keys are not set, and the rest still works (the inbox, the settings page
 * saying what is not set up). Tests give fakes with `setNotifyIntegrations`.
 *
 * Environment (all server only, none in the repo; .env.example lists each):
 *  VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY  web push keys (a command in .env.example makes them)
 *  VAPID_SUBJECT                        `mailto:` an address, or the site's https address
 *  RESEND_API_KEY, NOTIFY_FROM_ADDRESS  email
 *  NOTIFY_TOKEN_SECRET                  32+ characters, for unsubscribe links
 *  CRON_SECRET                          the sender route's secret
 *  GG_SITE_URL                          the site's address, for links in email
 */
export interface Integrations {
  push: PushSender | null;
  /** Shown to the browser so it can subscribe. */
  vapidPublicKey: string | null;
  mail: MailSender | null;
  from: string | null;
  /** The site's origin, for links in email. Null when not set. */
  site: string | null;
  tokenSecret: string | null;
  cronSecret: string | null;
  now: () => number;
}

export interface NotifyDeps {
  sql: SqlClient;
  emailOf(userId: string): Promise<string | null>;
  integrations: Integrations;
  /** Is the `push_notifications` switch on? */
  switchOn(): Promise<boolean>;
}

let override: Integrations | undefined;

/** For tests: use these integrations. `undefined` goes back to the environment. */
export function setNotifyIntegrations(i: Integrations | undefined): void {
  override = i;
}

const ORIGIN = /^https?:\/\/[^/?#\s]+$/;

export function integrationsFromEnv(
  env: Record<string, string | undefined> = process.env,
): Integrations {
  const vapidPublic = env.VAPID_PUBLIC_KEY?.trim();
  const vapidPrivate = env.VAPID_PRIVATE_KEY?.trim();
  const site = env.GG_SITE_URL?.trim().replace(/\/+$/, '');
  const subject = env.VAPID_SUBJECT?.trim() || site || '';
  const vapidOk =
    Boolean(vapidPublic && vapidPrivate && /^(mailto:|https:\/\/)/.test(subject)) &&
    vapidUsable({ publicKey: vapidPublic!, privateKey: vapidPrivate! });
  const key = env.RESEND_API_KEY?.trim();
  const from = env.NOTIFY_FROM_ADDRESS?.trim();
  const secret = env.NOTIFY_TOKEN_SECRET?.trim();
  const siteOk = site && ORIGIN.test(site) ? site : null;
  const mailOk = Boolean(key && from && siteOk && secret && secret.length >= TOKEN_SECRET_MIN);
  return {
    push: vapidOk
      ? vapidPushSender({ publicKey: vapidPublic!, privateKey: vapidPrivate!, subject })
      : null,
    vapidPublicKey: vapidOk ? vapidPublic! : null,
    mail: mailOk ? resendMail(key!) : null,
    from: mailOk ? from! : null,
    site: siteOk,
    tokenSecret: secret && secret.length >= TOKEN_SECRET_MIN ? secret : null,
    cronSecret: env.CRON_SECRET?.trim() || null,
    now: Date.now,
  };
}

export function integrations(): Integrations {
  return override ?? integrationsFromEnv();
}

/** Notification dependencies on top of the accounts' database and provider. */
export function notifyDepsFor(auth: AuthDeps): NotifyDeps {
  const i = integrations();
  return {
    sql: auth.sql,
    emailOf: (id) => auth.provider.emailOf(id).catch(() => null),
    integrations: i,
    switchOn: async () => (await featureSwitches(auth.sql, i.now())).push_notifications,
  };
}

/** What this copy can do right now, for the settings page and the admin page. */
export async function capabilities(nd: NotifyDeps): Promise<{
  switchOn: boolean;
  push: boolean;
  email: boolean;
}> {
  const switchOn = await nd.switchOn();
  const i = nd.integrations;
  return {
    switchOn,
    push: switchOn && i.push !== null && i.vapidPublicKey !== null,
    email: switchOn && i.mail !== null && i.tokenSecret !== null && i.site !== null,
  };
}
