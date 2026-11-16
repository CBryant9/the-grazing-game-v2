/**
 * Colour helpers. A colour is one number, 0xRRGGBB, as PixiJS takes them.
 */

const byte = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/** A colour from red, green and blue, each 0 to 255. */
export const rgb = (r: number, g: number, b: number): number =>
  (byte(r) << 16) | (byte(g) << 8) | byte(b);

export const red = (c: number): number => (c >> 16) & 255;
export const green = (c: number): number => (c >> 8) & 255;
export const blue = (c: number): number => c & 255;

/** Straight-line mix of two colours. t = 0 gives a, t = 1 gives b. */
export function mix(a: number, b: number, t: number): number {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return rgb(
    red(a) + (red(b) - red(a)) * k,
    green(a) + (green(b) - green(a)) * k,
    blue(a) + (blue(b) - blue(a)) * k,
  );
}

/** A colour made brighter or darker. f = 1 leaves it alone. */
export const shade = (c: number, f: number): number => rgb(red(c) * f, green(c) * f, blue(c) * f);

/** One colour lit by another, channel by channel. White light leaves it alone. */
export const lit = (c: number, light: number): number =>
  rgb((red(c) * red(light)) / 255, (green(c) * green(light)) / 255, (blue(c) * blue(light)) / 255);

/** "#rrggbb" for canvas drawing. */
export const css = (c: number): string => '#' + (c & 0xffffff).toString(16).padStart(6, '0');

/** "rgba(r,g,b,a)" for canvas drawing. */
export const cssA = (c: number, alpha: number): string =>
  `rgba(${red(c)},${green(c)},${blue(c)},${alpha})`;

const linear = (v: number): number => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** Relative luminance, 0 (black) to 1 (white), as WCAG defines it. */
export const luminance = (c: number): number =>
  0.2126 * linear(red(c)) + 0.7152 * linear(green(c)) + 0.0722 * linear(blue(c));

/** Contrast between two colours, 1 (none) to 21 (black on white), as WCAG defines it. */
export function contrast(a: number, b: number): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
