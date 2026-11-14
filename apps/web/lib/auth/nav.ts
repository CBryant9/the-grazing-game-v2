/**
 * A full page load of one of this site's own pages. Signing out and deleting an account use it so
 * every screen starts clean, with nothing of the last player left in memory.
 */
export function goTo(path: string): void {
  window.location.replace(new URL(path, window.location.origin).href);
}
