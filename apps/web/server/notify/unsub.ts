import 'server-only';
import { KIND_INFO } from '../../lib/notify/kinds';
import { integrations, type NotifyDeps } from './deps';
import { applyUnsubscribe } from './store';
import { readUnsubToken } from './token';

const escape = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A small page with no script: nothing to download, nothing to track. */
function page(title: string, lines: string[], form?: string): Response {
  const html = `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer"><title>${escape(title)}</title><style>body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:24px 16px;background:#f6f3ea;color:#1f2a1f;line-height:1.5}main{max-width:360px;margin:0 auto}h1{font-size:20px;margin:0 0 12px}button{min-height:44px;padding:0 20px;font-size:16px;border:0;border-radius:8px;background:#2f6b3a;color:#fff;cursor:pointer}@media (prefers-color-scheme:dark){body{background:#151b15;color:#e9efe5}button{background:#7fc08a;color:#10210f}}</style></head><body><main><h1>${escape(title)}</h1>${lines.map((l) => `<p>${escape(l)}</p>`).join('')}${form ?? ''}</main></body></html>`;
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

const INVALID = page('That link does not work', [
  'It is not valid, or it has expired.',
  'You can change your notifications any time in the game: More, then Your account, then Notifications.',
]);

/**
 * GET shows what the link would do and a button. It changes nothing (a mail scanner opening the
 * link must not unsubscribe anyone). POST does it: the one-click unsubscribe mail providers send
 * (RFC 8058, `List-Unsubscribe=One-Click`) and the button on the page both land here.
 */
export async function unsubscribeResponse(req: Request, nd: NotifyDeps): Promise<Response> {
  const i = integrations();
  const url = new URL(req.url);
  const token = url.searchParams.get('t');
  if (!i.tokenSecret) return INVALID;
  const read = readUnsubToken(i.tokenSecret, token, i.now());
  if (!read.ok) return INVALID;
  const label = KIND_INFO[read.claims.kind].label;
  if (req.method === 'POST') {
    // Drain a small body without reading it: the credential is the token in the address.
    await req.arrayBuffer().catch(() => undefined);
    await applyUnsubscribe(nd.sql, read.claims.userId, read.claims.kind, read.claims.issuedAt);
    return page('Emails are off', [
      `You will not get emails for "${label}" any more.`,
      'Your other notifications stay as they are. You can change any of them in the game: More, then Your account, then Notifications.',
    ]);
  }
  return page(
    'Stop these emails?',
    [`This turns off emails for "${label}". Nothing else changes.`],
    `<form method="post" action="/api/notify/u?t=${encodeURIComponent(token!)}"><button type="submit">Turn these emails off</button></form>`,
  );
}
