import type { PriceChartWire } from './types';
import { dateText } from './format';

/**
 * The pure parts of the price chart: where each line goes in the box, the
 * scale on the side, and the words for a screen reader. No React and no
 * prices of its own: it only draws the points the server sent, which are
 * the days the farm has already lived.
 */

export interface ChartBox {
  width: number;
  height: number;
  /** Space left for the scale on the left, and for the line ends and dates. */
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface ChartLine {
  id: string;
  label: string;
  /** SVG path data. Empty for a class with no points. */
  d: string;
  /** The end of the line, where its label and dot go. */
  end: { x: number; y: number } | null;
  /** A single day of prices is a dot, not a line. */
  single: boolean;
  last: number;
}

export interface ChartGeometry {
  lines: ChartLine[];
  ticks: { y: number; label: string }[];
  min: number;
  max: number;
}

/** Round a scale to steps that read well: 10, 20 or 50 c/kg. */
function niceStep(range: number): number {
  if (range <= 40) return 10;
  if (range <= 120) return 20;
  if (range <= 300) return 50;
  return 100;
}

/** Where the lines go. `shown` names the classes to draw, in order. */
export function chartGeometry(
  chart: PriceChartWire,
  shown: readonly string[],
  box: ChartBox,
): ChartGeometry {
  const classes = chart.classes.filter((c) => shown.includes(c.id) && c.points.length > 0);
  const all = classes.flatMap((c) => c.points);
  let lo = all.length ? Math.min(...all) : 0;
  let hi = all.length ? Math.max(...all) : 100;
  const step = niceStep(hi - lo);
  lo = Math.floor((lo - step * 0.25) / step) * step;
  hi = Math.ceil((hi + step * 0.25) / step) * step;
  if (hi === lo) hi = lo + step;
  const w = box.width - box.left - box.right;
  const h = box.height - box.top - box.bottom;
  const days = Math.max(1, ...classes.map((c) => c.points.length - 1));
  const x = (i: number): number => box.left + (days === 0 ? 0 : (i / days) * w);
  const y = (v: number): number => box.top + h - ((v - lo) / (hi - lo)) * h;
  const round = (n: number): number => Math.round(n * 10) / 10;
  const lines: ChartLine[] = classes.map((c) => {
    const pts = c.points.map((v, i) => ({ x: round(x(i)), y: round(y(v)) }));
    return {
      id: c.id,
      label: c.label,
      d: pts.length > 1 ? pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ') : '',
      end: pts[pts.length - 1] ?? null,
      single: pts.length === 1,
      last: c.points[c.points.length - 1]!,
    };
  });
  const ticks: { y: number; label: string }[] = [];
  const every = niceStep(hi - lo) * (hi - lo > 100 ? 2 : 1);
  for (let v = lo; v <= hi; v += every) ticks.push({ y: round(y(v)), label: String(v) });
  return { lines, ticks, min: lo, max: hi };
}

/** "+12 c/kg over 30 days", "-4 c/kg over 30 days", "no change over 30 days", or "" with under two days. */
export function changeText(change: number | null, days: number): string {
  if (change === null) return '';
  const span = `over ${days} ${days === 1 ? 'day' : 'days'}`;
  if (change === 0) return `no change ${span}`;
  return `${change > 0 ? '+' : '-'}${Math.abs(change)} c/kg ${span}`;
}

/** "+12", "-4" or "0", for a column of changes in c/kg. */
export const changeShort = (change: number): string =>
  change === 0 ? '0' : `${change > 0 ? '+' : '-'}${Math.abs(change)}`;

/** What a screen reader hears for the chart: each class, its first and last price. */
export function chartSummary(chart: PriceChartWire, shown: readonly string[]): string {
  const parts = chart.classes
    .filter((c) => shown.includes(c.id) && c.points.length > 0)
    .map((c) => {
      const first = c.points[0]!;
      const last = c.points[c.points.length - 1]!;
      return c.points.length > 1
        ? `${c.label} went from ${first} to ${last} c/kg`
        : `${c.label} is at ${last} c/kg`;
    });
  if (!parts.length) return 'No classes are shown on the chart.';
  const span =
    chart.from && chart.to && key(chart.from) !== key(chart.to)
      ? ` from ${dateText(chart.from)} to ${dateText(chart.to)}`
      : '';
  return `Prices in c/kg live weight${span}. ${parts.join('. ')}.`;
}

const key = (d: { year: number; month: number; date: number }): string =>
  `${d.year}-${d.month}-${d.date}`;
