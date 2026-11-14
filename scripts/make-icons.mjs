// Makes the app icons from code. No outside art.
//
//   node scripts/make-icons.mjs
//
// The picture is the pixel glyph already in apps/web/public/icon.svg: lime
// pixels on the dark frame colour (--frame and --accent in
// apps/web/app/globals.css). This writes the SVG and the PNG sizes the
// manifest and iPhone need into apps/web/public:
//
//   icon.svg               any size, rounded square
//   icon-192.png           Android home screen
//   icon-512.png           Android splash screen and stores
//   icon-maskable-512.png  full-bleed, the glyph kept inside the safe circle
//   apple-icon.png         iPhone home screen (180 px, square corners: iOS rounds them)
//
// The PNG files are written by a small encoder here (zlib and a CRC), with a
// 4 x 4 grid of samples per pixel so edges and corners are smooth.

import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'apps/web/public');

// Design tokens (apps/web/app/globals.css: --frame, --accent).
const FRAME = [0x0b, 0x12, 0x20];
const ACCENT = [0xc6, 0xf4, 0x32];

// The glyph: unit squares on an 8 x 7 grid, as [x, y, width, height].
const GLYPH = [
  [2, 1, 1, 1],
  [5, 1, 1, 1],
  [0, 2, 1, 1],
  [2, 2, 1, 1],
  [4, 2, 2, 1],
  [7, 2, 1, 1],
  [0, 3, 3, 1],
  [4, 3, 1, 1],
  [6, 3, 2, 1],
  [1, 4, 6, 1],
  [0, 5, 8, 2],
];
const GLYPH_W = 8;
const GLYPH_H = 7;

/** The SVG, on a 64 x 64 canvas, the same picture the site has always used. */
export function svg() {
  const rects = GLYPH.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`);
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" shape-rendering="crispEdges">' +
    '<rect width="64" height="64" rx="12" fill="#0b1220"/>' +
    `<g fill="#c6f432" transform="translate(8 8) scale(6)">${rects.join('')}</g></svg>\n`
  );
}

/**
 * The share of a pixel that is glyph, for a canvas of `size` pixels.
 * `scale` is the glyph's size as a share of the canvas (0.75 is the SVG's);
 * `radius` is the corner radius as a share of the canvas (0 for none).
 */
function render(size, { scale, radius }) {
  const px = Buffer.alloc(size * size * 4);
  const cell = (size * scale) / GLYPH_W; // one glyph pixel, in canvas pixels
  const gx = (size - cell * GLYPH_W) / 2;
  const gy = (size - cell * GLYPH_H) / 2;
  const r = radius * size;
  const N = 4;
  const inGlyph = (x, y) => {
    const u = Math.floor((x - gx) / cell);
    const v = Math.floor((y - gy) / cell);
    if (x < gx || y < gy || u < 0 || v < 0 || u >= GLYPH_W || v >= GLYPH_H) return false;
    return GLYPH.some(([a, b, w, h]) => u >= a && u < a + w && v >= b && v < b + h);
  };
  const inFrame = (x, y) => {
    if (r === 0) return true;
    const cx = x < r ? r : x > size - r ? size - r : x;
    const cy = y < r ? r : y > size - r ? size - r : y;
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let frame = 0;
      let glyph = 0;
      for (let b = 0; b < N; b++) {
        for (let a = 0; a < N; a++) {
          const x = i + (a + 0.5) / N;
          const y = j + (b + 0.5) / N;
          if (inFrame(x, y)) {
            frame++;
            if (inGlyph(x, y)) glyph++;
          }
        }
      }
      const total = N * N;
      const alpha = frame / total;
      const k = (j * size + i) * 4;
      if (frame === 0) continue;
      // Glyph over frame, then the frame's own edge as transparency.
      const g = glyph / frame;
      for (let c = 0; c < 3; c++) px[k + c] = Math.round(FRAME[c] * (1 - g) + ACCENT[c] * g);
      px[k + 3] = Math.round(alpha * 255);
    }
  }
  return px;
}

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** A PNG file (8-bit RGBA) from raw pixels. */
function png(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    rows[y * (size * 4 + 1)] = 0; // no filter
    pixels.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const files = [
  ['icon-192.png', 192, { scale: 0.75, radius: 12 / 64 }],
  ['icon-512.png', 512, { scale: 0.75, radius: 12 / 64 }],
  // Full-bleed. The glyph is kept inside the middle 80% circle that any
  // launcher mask leaves visible.
  ['icon-maskable-512.png', 512, { scale: 0.6, radius: 0 }],
  ['apple-icon.png', 180, { scale: 0.65, radius: 0 }],
];

writeFileSync(join(OUT, 'icon.svg'), svg());
for (const [name, size, opts] of files) {
  writeFileSync(join(OUT, name), png(size, render(size, opts)));
  console.log(`wrote apps/web/public/${name}`);
}
console.log('wrote apps/web/public/icon.svg');
