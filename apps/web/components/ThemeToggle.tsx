'use client';

import { useCallback, useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';

function currentTheme(): Theme {
  const set = document.documentElement.getAttribute('data-theme');
  if (set === 'light' || set === 'dark') return set;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia('(prefers-color-scheme: light)');
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  media.addEventListener('change', onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener('change', onChange);
  };
}

/** Light or dark, remembered on this device. Follows the device until chosen (PRD 6.3a). */
export function ThemeToggle() {
  // On the server we can't know the theme, so the label is neutral until the page is live.
  const theme = useSyncExternalStore<Theme | null>(subscribe, currentTheme, () => null);

  const toggle = useCallback(() => {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('gg-theme', next);
    } catch {
      // Private browsing: the choice lasts for this visit only.
    }
  }, []);

  const label = theme === null ? 'Theme' : theme === 'dark' ? 'Light' : 'Dark';
  return (
    <button
      type="button"
      className="btn ghost"
      onClick={toggle}
      aria-label={
        theme === null
          ? 'Switch between light and dark'
          : `Switch to the ${label.toLowerCase()} theme`
      }
    >
      {label}
    </button>
  );
}
