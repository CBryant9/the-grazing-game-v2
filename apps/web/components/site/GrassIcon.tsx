/** The 8 by 8 pixel grass mark from the mockups. */
export function GrassIcon() {
  const rows = [
    '........',
    '..X..X..',
    'X.X.XX.X',
    'XXX.X.XX',
    '.XXXXXX.',
    'XXXXXXXX',
    'XXXXXXXX',
    '........',
  ];
  return (
    <svg viewBox="0 0 8 8" width="18" height="18" shapeRendering="crispEdges" fill="currentColor">
      {rows.flatMap((row, y) =>
        [...row].map((c, x) =>
          c === 'X' ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" /> : null,
        ),
      )}
    </svg>
  );
}
