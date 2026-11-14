import 'server-only';
import { AdminError } from '../admin/errors';
import type { SqlClient } from '../db/sql';
import {
  deleteCampaign,
  deleteCreative,
  deleteSponsor,
  saveCampaign,
  saveCreative,
  saveSponsor,
  setSlot,
} from './adminStore';

/**
 * The one admin write route for ads takes `{ action, ... }`. Every action goes through the same
 * gate, the same CSRF rule and the same limits (`adminRoute`), and every one writes its audit
 * row in the same transaction as its change.
 */
export const AD_ACTIONS = [
  'slot_set',
  'sponsor_save',
  'sponsor_delete',
  'campaign_save',
  'campaign_delete',
  'creative_save',
  'creative_delete',
] as const;
export type AdAction = (typeof AD_ACTIONS)[number];

/** A video goes through the page as one request. Vercel limits a request to 4.5 MB; this is a little under. */
export const ADMIN_BODY_LIMIT = 4_300_000;

export async function runAdAction(
  sql: SqlClient,
  adminId: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  switch (body.action) {
    case 'slot_set': {
      const r = await setSlot(sql, adminId, body.slot, body.enabled, body.settings);
      return { ok: true, changed: r.changed };
    }
    case 'sponsor_save':
      return { ok: true, ...(await saveSponsor(sql, adminId, body)) };
    case 'sponsor_delete':
      await deleteSponsor(sql, adminId, body.id);
      return { ok: true };
    case 'campaign_save':
      return { ok: true, ...(await saveCampaign(sql, adminId, body)) };
    case 'campaign_delete':
      await deleteCampaign(sql, adminId, body.id);
      return { ok: true };
    case 'creative_save':
      return { ok: true, ...(await saveCreative(sql, adminId, body)) };
    case 'creative_delete':
      await deleteCreative(sql, adminId, body.id);
      return { ok: true };
    default:
      throw new AdminError(400, 'That is not something the ad screens can do.');
  }
}
