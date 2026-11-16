import 'server-only';
import { isSlotId } from '@/lib/ads/registry';
import { adminGate } from '../admin/gate';
import { authDeps } from '../auth/deps';
import { jarFor } from '../auth/provider';
import { safeDecode } from '../decode';
import { callerKey, type AuthContext } from '../auth/route';
import { GameError } from '../game/game';
import { allow, fail, readJson } from '../game/http';
import { recordEvent, followClick } from './events';
import { adMediaStore } from './media';
import { chooseAds, viewerFor, type Viewer } from './serve';

/**
 * The handlers behind the public ad routes (`app/api/ads`). The routes wrap them in `authRoute`,
 * which gives the shared CSRF rule for writes, a limit by session or address, the sign-in
 * cookies and no caching. Without accounts (no keys) there is no database to ask, so every one
 * answers "nothing": no ad is ever chosen, counted or followed.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function viewerOf(ctx: AuthContext): Promise<Viewer | null> {
  const user = await ctx.deps!.provider.session(ctx.jar).catch(() => null);
  return viewerFor(ctx.deps!.sql, user && !user.anonymous ? user : null, ctx.req);
}

export async function adsPick(ctx: AuthContext): Promise<unknown> {
  if (!ctx.deps) return { items: [] };
  const slot = new URL(ctx.req.url).searchParams.get('slot');
  if (!isSlotId(slot)) throw new GameError(400, 'That is not an ad slot.');
  const viewer = await viewerOf(ctx);
  // A no-ads owner is shown nothing.
  if (!viewer) return { items: [] };
  return chooseAds(ctx.deps.sql, { slot, viewer, pepper: ctx.deps.pepper });
}

export async function adsEvent(ctx: AuthContext): Promise<unknown> {
  if (!ctx.deps) return { counted: false };
  const body = (await readJson(ctx.req, 1024)) as Record<string, unknown>;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new GameError(400, 'That request was not sent properly.');
  }
  const viewer = await viewerOf(ctx);
  if (!viewer) return { counted: false };
  const r = await recordEvent(
    ctx.deps.sql,
    ctx.deps.pepper,
    viewer,
    callerKey(ctx.req),
    body.token,
    body.kind,
  );
  // The browser needs no reason: a refused event is simply not counted.
  return { counted: r.counted };
}

export async function adsClick(ctx: AuthContext): Promise<unknown> {
  const url = new URL(ctx.req.url);
  const id = safeDecode(url.pathname.split('/').filter(Boolean).pop() ?? '') ?? '';
  if (!ctx.deps || !UUID.test(id)) throw new GameError(404, 'Not found.');
  const viewer = await viewerOf(ctx);
  if (!viewer) throw new GameError(404, 'Not found.');
  const target = await followClick(
    ctx.deps.sql,
    ctx.deps.pepper,
    viewer,
    callerKey(ctx.req),
    id,
    url.searchParams.get('s'),
    url.searchParams.get('t'),
  );
  if (!target) throw new GameError(404, 'Not found.');
  return new Response(null, {
    status: 302,
    headers: {
      Location: target.url,
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
    },
  });
}

/** An ad's media, from its creative id, with headers that stop it being anything but a picture or a video. */
export async function adsMedia(req: Request): Promise<Response> {
  const deps = authDeps();
  const id = safeDecode(new URL(req.url).pathname.split('/').filter(Boolean).pop() ?? '') ?? '';
  const store = adMediaStore();
  if (!deps || !store || !UUID.test(id)) return fail(404, 'Not found.');
  if (!allow(`ad-media:${callerKey(req)}`, 240, 60_000)) {
    return fail(429, 'That was a lot of tries. Wait a minute and try again.', {
      'Retry-After': '60',
    });
  }
  const row = (
    await deps.sql.query<{
      media_path: string | null;
      media_mime: string | null;
      live: boolean;
    }>(
      `select a.media_path, a.media_mime, (a.active and c.active) as live
         from public.ad_creatives a
         join public.campaigns c on c.id = a.campaign_id
        where a.id = $1`,
      [id],
    )
  ).rows[0];
  if (!row?.media_path || !row.media_mime) return fail(404, 'Not found.');
  // Media is served only while the creative and its campaign are on. Once an ad is switched off
  // its file is gone from the public site; only an admin (the campaign editor's preview) sees it.
  if (!row.live && (await adminGate(jarFor(req), { refresh: false })).kind !== 'ok') {
    return fail(404, 'Not found.');
  }
  const range = req.headers.get('range');
  const file = await store
    .read(row.media_path, range && /^bytes=\d*-\d*$/.test(range) ? range : null)
    .catch(() => null);
  if (!file) return fail(404, 'Not found.');
  const headers = new Headers({
    // The type found from the bytes when it was uploaded, never one the browser chose.
    'Content-Type': row.media_mime,
    'Content-Length': String(file.body.byteLength),
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Disposition': 'inline',
    'Referrer-Policy': 'no-referrer',
    // Private and short, so a switched-off ad does not live on in a shared cache.
    'Cache-Control': 'private, max-age=300',
  });
  for (const [k, v] of Object.entries(file.headers)) headers.set(k, v);
  return new Response(file.body as BodyInit, { status: file.status, headers });
}
