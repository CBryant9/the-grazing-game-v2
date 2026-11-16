import { create } from 'zustand';

/**
 * Install to the home screen. A light entry in the More tab, never a prompt
 * that nags (PRD 13, 14.1).
 *
 * - Chrome and Edge (Android and PC) send `beforeinstallprompt` when the app
 *   can be installed. It is held until the player taps Install.
 * - iPhone and iPad have no install prompt, so the two steps are shown.
 * - Once installed (running as an app), nothing is shown.
 */

/** The browser's install event, which TypeScript does not know about. */
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallMode = 'none' | 'prompt' | 'ios';

interface InstallState {
  mode: InstallMode;
}
export const useInstall = create<InstallState>()(() => ({ mode: 'none' }));

let held: InstallEvent | null = null;

/** True when this page is running as an installed app. */
export function isInstalled(): boolean {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
  } catch {
    // Treat as not installed.
  }
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** An iPhone or iPad in a browser (not yet added to the home screen). */
export function isIosBrowser(ua: string, platform: string, touchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  // iPadOS asks for the desktop site and says it is a Mac, but has a touch screen.
  return platform === 'MacIntel' && touchPoints > 1;
}

/** Start listening. Call once on /play. Returns the function that stops it. */
export function startInstallWatch(): () => void {
  if (isInstalled()) {
    useInstall.setState({ mode: 'none' });
    return () => {};
  }
  if (isIosBrowser(navigator.userAgent, navigator.platform, navigator.maxTouchPoints)) {
    useInstall.setState({ mode: 'ios' });
  }
  const onPrompt = (e: Event): void => {
    // Keep it for the Install button instead of the browser's own mini bar.
    e.preventDefault();
    held = e as InstallEvent;
    useInstall.setState({ mode: 'prompt' });
  };
  const onInstalled = (): void => {
    held = null;
    useInstall.setState({ mode: 'none' });
  };
  window.addEventListener('beforeinstallprompt', onPrompt);
  window.addEventListener('appinstalled', onInstalled);
  return () => {
    window.removeEventListener('beforeinstallprompt', onPrompt);
    window.removeEventListener('appinstalled', onInstalled);
  };
}

/** Show the browser's install question. The event can be used once. */
export async function promptInstall(): Promise<void> {
  const ev = held;
  if (!ev) return;
  held = null;
  useInstall.setState({ mode: 'none' });
  try {
    await ev.prompt();
    await ev.userChoice;
  } catch {
    // The player closed it, or the browser refused. Nothing to do.
  }
}
