import 'server-only';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { AdSlotId } from '@gg/shared';
import { isSlotId } from '@/lib/ads/registry';

/**
 * The impression token. When the server chooses an ad it makes a random impression id and signs
 * it together with the slot, the campaign and the creative. The browser sends the token back with
 * a view event. Signed, so a view can only be reported for an ad the server really showed, in the
 * slot it showed it in. The id is unique in the database, so a replayed beacon counts once.
 *
 * The key is made from the server's secret pepper, with its own label, so it can not be used for
 * anything else. Nothing in the token says who the player is.
 */

/** How long after being chosen a view may still be reported. */
export const TOKEN_LIFE_MS = 30 * 60_000;

export interface Impression {
  id: string;
  slot: AdSlotId;
  campaign: string;
  creative: string;
  at: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const key = (pepper: string): Buffer => createHmac('sha256', 'gg-ads-v1').update(pepper).digest();
const sign = (pepper: string, body: string): string =>
  createHmac('sha256', key(pepper)).update(body).digest('base64url');

export function makeImpression(
  pepper: string,
  slot: AdSlotId,
  campaign: string,
  creative: string,
  now = Date.now(),
): { token: string; impression: Impression } {
  const impression: Impression = { id: randomUUID(), slot, campaign, creative, at: now };
  const body = Buffer.from(JSON.stringify([impression.id, slot, campaign, creative, now])).toString(
    'base64url',
  );
  return { token: `${body}.${sign(pepper, body)}`, impression };
}

/** The impression a token carries, or null when it is forged, malformed or too old. */
export function readImpression(
  pepper: string,
  token: unknown,
  now = Date.now(),
): Impression | null {
  if (typeof token !== 'string' || token.length > 400) return null;
  const dot = token.indexOf('.');
  if (dot < 1 || dot !== token.lastIndexOf('.')) return null;
  const body = token.slice(0, dot);
  const want = Buffer.from(sign(pepper, body));
  const got = Buffer.from(token.slice(dot + 1));
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const v = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as unknown;
    if (!Array.isArray(v) || v.length !== 5) return null;
    const [id, slot, campaign, creative, at] = v as [unknown, unknown, unknown, unknown, unknown];
    if (typeof id !== 'string' || !UUID.test(id)) return null;
    if (!isSlotId(slot)) return null;
    if (typeof campaign !== 'string' || !UUID.test(campaign)) return null;
    if (typeof creative !== 'string' || !UUID.test(creative)) return null;
    if (typeof at !== 'number' || !Number.isFinite(at)) return null;
    if (now - at > TOKEN_LIFE_MS || at - now > 60_000) return null;
    return { id, slot, campaign, creative, at };
  } catch {
    return null;
  }
}
