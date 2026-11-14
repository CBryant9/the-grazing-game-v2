/**
 * The live activity ticker's script tag (PRD 9.4). Website pages only: the landing page, the
 * community pages, the public leaderboard and group pages. NEVER the game (`/play`) and never a
 * game component. The script is hand written, has no libraries and is not part of the page's
 * own bundle (`/ticker.js` in `public`). `place="strip"` also shows a strip on narrow screens.
 *
 * Whoever renders this decides if the switch is on: the landing page at build time with
 * `siteSwitchOn('activity_ticker')`, the community pages from the live switches.
 */
export function Ticker({ place }: { place?: 'strip' }) {
  return <script src="/ticker.js" defer data-place={place} />;
}
