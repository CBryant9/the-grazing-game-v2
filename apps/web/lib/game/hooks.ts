'use client';

import { useSyncExternalStore } from 'react';

export type Layout = 'phone' | 'landscape' | 'pc';
export type ThemeName = 'light' | 'dark';

const PC = '(min-width: 900px) and (min-height: 501px)';
const LANDSCAPE = '(orientation: landscape) and (max-height: 500px)';

function layoutNow(): Layout {
  if (window.matchMedia(PC).matches) return 'pc';
  if (window.matchMedia(LANDSCAPE).matches) return 'landscape';
  return 'phone';
}

function subscribeLayout(onChange: () => void): () => void {
  const lists = [window.matchMedia(PC), window.matchMedia(LANDSCAPE)];
  for (const l of lists) l.addEventListener('change', onChange);
  return () => {
    for (const l of lists) l.removeEventListener('change', onChange);
  };
}

/** Which of the three layouts is showing: phone upright, phone on its side, or PC and tablet. */
export function useLayout(): Layout {
  return useSyncExternalStore(subscribeLayout, layoutNow, () => 'phone');
}

function themeNow(): ThemeName {
  const set = document.documentElement.getAttribute('data-theme');
  if (set === 'light' || set === 'dark') return set;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function subscribeTheme(onChange: () => void): () => void {
  const media = window.matchMedia('(prefers-color-scheme: light)');
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  media.addEventListener('change', onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener('change', onChange);
  };
}

/** The theme on screen, so the map can follow the page (PRD 6.3a). */
export function useTheme(): ThemeName {
  return useSyncExternalStore(subscribeTheme, themeNow, () => 'dark');
}

function subscribeMotion(onChange: () => void): () => void {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

/** True when the player has asked for less motion. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );
}
