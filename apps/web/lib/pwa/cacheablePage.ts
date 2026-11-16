// Which pages the service worker may keep and show offline. Only the home
// page and the game page. Every other page (admin, sign-in callbacks,
// account pages, anything under /api) always goes to the network and is
// never stored. Kept as a small pure function so a test can check it.

const CACHEABLE_PAGES: readonly string[] = ['/', '/play'];

/** True when a page request for this path may be stored and served offline. */
export function isCacheablePagePath(pathname: string): boolean {
  return CACHEABLE_PAGES.includes(pathname);
}
