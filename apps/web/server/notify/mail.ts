import 'server-only';
import { KIND_INFO, type NotifyKind } from '../../lib/notify/kinds';

/**
 * Email through a small interface. The real one is Resend (https://resend.com/docs/api-reference/emails/send-email,
 * read 15 Nov 2026): `POST https://api.resend.com/emails`, `Authorization: Bearer <key>`, a body of
 * `from`, `to`, `subject`, `text` and `html`, our own `headers`, and an `Idempotency-Key` header
 * (kept 24 hours, at most 256 characters) so a retry of the same send is never a second email.
 * Tests give a fake. With no key set there is no mail sender and email is simply not sent.
 */

export interface MailMessage {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
  idempotencyKey: string;
}

export type MailResult =
  { ok: true } | { ok: false; retry: boolean; retryAfterSec?: number; reason: string };

export interface MailSender {
  send(message: MailMessage): Promise<MailResult>;
}

export function resendMail(apiKey: string, fetchFn: typeof fetch = fetch): MailSender {
  return {
    async send(m) {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 10_000);
      try {
        const res = await fetchFn('https://api.resend.com/emails', {
          method: 'POST',
          redirect: 'error',
          signal: abort.signal,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': m.idempotencyKey,
          },
          body: JSON.stringify({
            from: m.from,
            to: [m.to],
            subject: m.subject,
            text: m.text,
            html: m.html,
            headers: m.headers,
          }),
        });
        if (res.status >= 200 && res.status < 300) return { ok: true };
        if (res.status === 429 || res.status >= 500) {
          const n = Number(res.headers.get('retry-after'));
          return {
            ok: false,
            retry: true,
            ...(Number.isFinite(n) && n > 0 ? { retryAfterSec: Math.min(n, 7200) } : {}),
            reason: res.status === 429 ? 'mail_throttled' : 'mail_service_error',
          };
        }
        if (res.status === 401 || res.status === 403) {
          return { ok: false, retry: false, reason: 'mail_auth_rejected' };
        }
        return { ok: false, retry: false, reason: 'mail_rejected' };
      } catch {
        return { ok: false, retry: true, reason: 'mail_network' };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
}

/**
 * The email for one notification. It carries the fact line and the link, and the way to stop
 * these emails. Never anything that is not already on the lock-screen line.
 *
 * Headers for one-click unsubscribe (RFC 8058, and the sender rules Gmail and Yahoo publish): a
 * `List-Unsubscribe` with one https address, and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
 * The address answers a POST with no sign-in and no cookies. The mail service signs the message
 * with the domain's DKIM key, which the sender domain's DNS records (set up with Resend) enable.
 */
export function emailFor(
  kind: NotifyKind,
  title: string,
  body: string | null,
  openUrl: string | null,
  unsubscribeUrl: string,
): EmailContent {
  const label = KIND_INFO[kind].label;
  const lines = [title, ...(body ? [body] : [])];
  const text = [
    ...lines,
    ...(openUrl ? ['', `Open the game: ${openUrl}`] : []),
    '',
    `You get this email because you turned on email for "${label}" in your notification settings.`,
    `Stop these emails: ${unsubscribeUrl}`,
  ].join('\n');
  const html = [
    '<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#222;line-height:1.5">',
    ...lines.map((l) => `<p style="font-size:16px;margin:0 0 12px">${escapeHtml(l)}</p>`),
    openUrl ? `<p><a href="${escapeHtml(openUrl)}">Open the game</a></p>` : '',
    `<p style="font-size:13px;color:#555">You get this email because you turned on email for &ldquo;${escapeHtml(label)}&rdquo; in your notification settings. <a href="${escapeHtml(unsubscribeUrl)}">Stop these emails</a>.</p>`,
    '</body></html>',
  ].join('');
  return {
    subject: title,
    text,
    html,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}
