/**
 * The game's pixel icons: 8 by 8 grids from the mockups (docs/mockups/index.html, `ICONS`),
 * drawn filled and crisp. They are decoration: every button carries its own words.
 */
const GRIDS = {
  hammer: [
    'XXXXXX..',
    'XXXXXX..',
    '..XX....',
    '..XX....',
    '..XX....',
    '..XX....',
    '..XX....',
    '..XX....',
  ],
  cow: [
    'XX......',
    'XXX.....',
    '.XXXXXXX',
    '.XXXXXXX',
    '.XXXXXX.',
    '.X.X.X.X',
    '.X.X.X.X',
    '........',
  ],
  grass: [
    '........',
    '..X..X..',
    'X.X.XX.X',
    'XXX.X.XX',
    '.XXXXXX.',
    'XXXXXXXX',
    'XXXXXXXX',
    '........',
  ],
  tag: [
    '...X....',
    '.XXXXX..',
    'XX.X....',
    '.XXXX...',
    '...X.XX.',
    'XXXXXX..',
    '...X....',
    '........',
  ],
  dots: [
    '........',
    '........',
    '........',
    'XX.XX.XX',
    'XX.XX.XX',
    '........',
    '........',
    '........',
  ],
  bell: [
    '...XX...',
    '..XXXX..',
    '.XXXXXX.',
    '.XXXXXX.',
    '.XXXXXX.',
    'XXXXXXXX',
    '...XX...',
    '........',
  ],
  house: [
    '...XX...',
    '..XXXX..',
    '.XXXXXX.',
    'XXXXXXXX',
    '.X....X.',
    '.X.XX.X.',
    '.X.XX.X.',
    '.XXXXXX.',
  ],
  chat: [
    'XXXXXXX.',
    'X.....X.',
    'X.X.X.X.',
    'X.....X.',
    'XXXXXXX.',
    'XX......',
    'X.......',
    '........',
  ],
  trophy: [
    'XXXXXXXX',
    'X.XXXX.X',
    'X.XXXX.X',
    '.XXXXXX.',
    '..XXXX..',
    '...XX...',
    '..XXXX..',
    '.XXXXXX.',
  ],
  user: [
    '..XXXX..',
    '..XXXX..',
    '..XXXX..',
    '...XX...',
    '.XXXXXX.',
    'XXXXXXXX',
    'XXXXXXXX',
    '........',
  ],
  heart: [
    '.XX.XX..',
    'XXXXXXX.',
    'XXXXXXX.',
    '.XXXXX..',
    '..XXX...',
    '...X....',
    '........',
    '........',
  ],
  lock: [
    '..XXX...',
    '.X...X..',
    '.X...X..',
    'XXXXXXX.',
    'XXX.XXX.',
    'XXX.XXX.',
    'XXXXXXX.',
    '........',
  ],
  check: [
    '........',
    '.......X',
    '......XX',
    '.....XX.',
    'X...XX..',
    'XX.XX...',
    '.XXX....',
    '..X.....',
  ],
  plan: [
    'XX......',
    'XX..XX..',
    '....XX..',
    'XX......',
    'XX..XX..',
    '....XX..',
    'XX......',
    'XX......',
  ],
  book: [
    'XXXXXXX.',
    'X.....X.',
    'X.XXX.X.',
    'X.....X.',
    'X.XXX.X.',
    'X.....X.',
    'XXXXXXX.',
    '........',
  ],
  star: [
    '...X....',
    '...X....',
    'XXXXXXX.',
    '.XXXXX..',
    '..XXX...',
    '.XX.XX..',
    'X.....X.',
    '........',
  ],
  // Drawn for the game in the same 8 by 8 style.
  drop: [
    '...X....',
    '...X....',
    '..XXX...',
    '.XXXXX..',
    '.XXXXX..',
    '.XXXXX..',
    '..XXX...',
    '........',
  ],
  help: [
    '..XXX...',
    '.X...X..',
    '.....X..',
    '....X...',
    '...X....',
    '........',
    '...X....',
    '........',
  ],
  close: [
    '........',
    '.X....X.',
    '..X..X..',
    '...XX...',
    '...XX...',
    '..X..X..',
    '.X....X.',
    '........',
  ],
  back: [
    '........',
    '....X...',
    '...X....',
    '..X.....',
    '..X.....',
    '...X....',
    '....X...',
    '........',
  ],
  chevron: [
    '........',
    '........',
    '.X....X.',
    '..X..X..',
    '...XX...',
    '........',
    '........',
    '........',
  ],
} as const;

export type IconName = keyof typeof GRIDS;

/** One path per icon: each row's runs of filled cells as rectangles. Worked out once. */
const PATHS = Object.fromEntries(
  Object.entries(GRIDS).map(([name, rows]) => {
    let d = '';
    rows.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        if (row[x] !== 'X') {
          x++;
          continue;
        }
        let w = 0;
        while (row[x + w] === 'X') w++;
        d += `M${x} ${y}h${w}v1h-${w}z`;
        x += w;
      }
    });
    return [name, d];
  }),
) as Record<IconName, string>;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      viewBox="0 0 8 8"
      width={size}
      height={size}
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
