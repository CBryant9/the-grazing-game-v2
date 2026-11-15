/**
 * The browser's whole analytics code (milestone 5.3): a few events sent to our own `/api/collect`
 * with `navigator.sendBeacon`. No analytics library, no outside script.
 *
 * Nothing is sent unless this browser's consent cookie says yes (`gg_analytics=y`, set only by
 * the consent control). The server checks again, with an account's choice in the database.
 * The id is random, made here once and kept in this browser; it says nothing about the person.
 */
import { CONSENT_COOKIE } from '@gg/shared';
import type { AppPageId, WebVital } from '@gg/shared/analytics';

export type BeaconEvent =
  | { e: 'page_view'; p: { page: AppPageId } }
  | { e: 'web_vital'; p: { page: AppPageId; metric: WebVital; value: number } }
  | { e: 'pwa_installed' }
  | { e: 'notification_opened' };

const ID_KEY = 'gg_aid';

export function consented(): boolean {
  try {
    return document.cookie.split('; ').includes(`${CONSENT_COOKIE}=y`);
  } catch {
    return false;
  }
}

function installId(): string | undefined {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    return undefined;
  }
}

/** Forget this browser's id (when the person says no). */
export function forgetInstallId(): void {
  try {
    localStorage.removeItem(ID_KEY);
  } catch {
    // nothing kept
  }
}

export function sendEvents(ev: BeaconEvent[]): void {
  if (ev.length === 0 || !consented()) return;
  const body = JSON.stringify({ id: installId(), ev });
  try {
    if (navigator.sendBeacon?.('/api/collect', new Blob([body], { type: 'application/json' })))
      return;
  } catch {
    // fall through
  }
  void fetch('/api/collect', {
    method: 'POST',
    credentials: 'same-origin',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body,
  }).catch(() => undefined);
}
