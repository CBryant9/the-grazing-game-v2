import { isIosBrowser, isInstalled } from '../pwa/install';
import { notifyApi, NotifyApiError } from './api';

/**
 * This browser as a device for push. Nothing here ever asks for permission by itself:
 * `turnOnThisDevice` is only called from a button the player taps, and `forgetThisDevice`
 * only ever removes.
 */

export type DeviceSupport = 'yes' | 'needs_install' | 'no';

/**
 * Can this browser take push? An iPhone or iPad only can once the game is added to the home
 * screen (`needs_install`); every other browser needs the Push API.
 */
export function deviceSupport(): DeviceSupport {
  if (typeof window === 'undefined') return 'no';
  const ios = isIosBrowser(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
  if (ios && !isInstalled()) return 'needs_install';
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    ? 'yes'
    : 'no';
}

/** True on an iPhone or iPad that has not had the game added to the home screen. */
export const needsHomeScreenGuide = (): boolean => deviceSupport() === 'needs_install';

export const permission = (): NotificationPermission | 'unsupported' =>
  typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;

const hex = (buf: ArrayBuffer): string =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** The short code the server uses for an address (the first 12 characters of its SHA-256). */
async function refOf(endpoint: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return hex(d).slice(0, 12);
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration('/')) ?? null;
}

/** The code of this browser's push address, or null when it has none. Never asks for anything. */
export async function thisDeviceRef(): Promise<string | null> {
  try {
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    return sub ? await refOf(sub.endpoint) : null;
  } catch {
    return null;
  }
}

const b64url = (buf: ArrayBuffer | null): string =>
  buf
    ? btoa(String.fromCharCode(...new Uint8Array(buf)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
    : '';

function keyBytes(publicKey: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (publicKey.length % 4)) % 4);
  const raw = atob((publicKey + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export type TurnOn = { ok: true; ref: string } | { ok: false; message: string };

function deviceLabel(): string {
  const ua = navigator.userAgent;
  const where = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac/.test(ua)
            ? 'Mac'
            : 'Computer';
  const how = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'browser';
  return `${where} ${how}`;
}

/** Ask the browser's permission (the player has just tapped the button), subscribe, and save. */
export async function turnOnThisDevice(publicKey: string): Promise<TurnOn> {
  if (deviceSupport() !== 'yes') {
    return { ok: false, message: "Notifications aren't available in this browser yet." };
  }
  if (Notification.permission === 'denied') {
    return {
      ok: false,
      message:
        'Notifications are blocked for this site in your browser settings. Allow them there, then come back.',
    };
  }
  try {
    const answer = await Notification.requestPermission();
    if (answer !== 'granted') {
      return { ok: false, message: 'Notifications stay off. You can try again whenever you like.' };
    }
    const reg =
      (await registration()) ??
      (await navigator.serviceWorker.register('/serwist/sw.js', { scope: '/', type: 'module' }));
    await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(publicKey),
      }));
    const saved = await notifyApi.subscribe({
      endpoint: sub.endpoint,
      keys: { p256dh: b64url(sub.getKey('p256dh')), auth: b64url(sub.getKey('auth')) },
      device: deviceLabel(),
    });
    return { ok: true, ref: saved.ref };
  } catch (e) {
    if (e instanceof NotifyApiError) return { ok: false, message: e.message };
    return {
      ok: false,
      message: 'This device could not be set up for notifications. Try again in a moment.',
    };
  }
}

/** Remove this browser's device from the account and from the browser. Never throws, never asks. */
export async function forgetThisDevice(): Promise<void> {
  try {
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await notifyApi.removeDevice({ ref: await refOf(sub.endpoint) }).catch(() => undefined);
    await sub.unsubscribe().catch(() => undefined);
  } catch {
    // Nothing to forget, or the browser would not say. Sign-out goes ahead.
  }
}
