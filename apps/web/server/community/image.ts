import { crc32 } from 'node:zlib';

/**
 * Photos, cleaned on the server before they are stored (BUILD_PLAN 4.3).
 *
 * The server does not trust the type the browser names or the size the page shrank the photo to.
 * It reads the first bytes to find the real type (JPEG, PNG or WebP only), reads the picture's
 * width and height from its own header, and then rebuilds the file keeping only the parts the
 * picture needs. Everything else is dropped, so the stored file carries no location:
 *
 * - JPEG: the EXIF block (where the GPS position lives), XMP, IPTC, comments and every other
 *   application block are removed. Kept: the JFIF header (without its thumbnail), the colour
 *   profile and Adobe colour flag, the tables and the picture data. A file with two frame
 *   headers is refused.
 * - PNG: every chunk except the picture's own (header, palette, data, transparency, gamma,
 *   colour and size hints). EXIF (`eXIf`), text chunks and the time chunk are removed. An
 *   animated PNG keeps only its first picture.
 * - WebP: the `EXIF` and `XMP ` chunks and the colour profile are removed, and the header's
 *   flags are rewritten to match. An animated WebP is refused.
 *
 * This removes metadata. It does not re-compress the picture (no image library is installed in
 * the project, and none is added without Claudia's say-so): the page shrinks and re-encodes the
 * photo in the browser first, which also applies the camera's rotation, and the server strips
 * again whatever arrives, because a file sent without the page is not shrunk. A file that does
 * not parse as one of the three formats is refused, which is what stops a script or a page
 * renamed `.jpg`.
 */

export type ImageType = 'jpeg' | 'png' | 'webp';
export const MIME: Record<ImageType, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
export const EXTENSION: Record<ImageType, string> = { jpeg: 'jpg', png: 'png', webp: 'webp' };

/** The most pixels one photo may have, and the longest side. A decompression bomb is a small file with huge sides. */
export const MAX_PIXELS = 36_000_000;
export const MAX_SIDE = 12_000;

export class ImageError extends Error {}
const BAD = 'That file is not a photo we can use. Send a JPEG, PNG or WebP picture.';

export interface CleanImage {
  type: ImageType;
  width: number;
  height: number;
  bytes: Uint8Array;
}

/** The real type from the first bytes, or null. */
export function sniff(b: Uint8Array): ImageType | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return 'png';
  if (b.length > 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') {
    return 'webp';
  }
  return null;
}

const ascii = (b: Uint8Array, from: number, to: number): string =>
  String.fromCharCode(...b.subarray(from, to));
const u16 = (b: Uint8Array, at: number): number => (b[at]! << 8) | b[at + 1]!;
const u32 = (b: Uint8Array, at: number): number =>
  ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0;
const l32 = (b: Uint8Array, at: number): number =>
  (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)) >>> 0;

function join(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function checkSize(width: number, height: number): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_SIDE ||
    height > MAX_SIDE ||
    width * height > MAX_PIXELS
  ) {
    throw new ImageError('That photo is too large in size. Send a smaller picture.');
  }
}

// ------------------------------------------------------------------ JPEG

function cleanJpeg(b: Uint8Array): CleanImage {
  const out: Uint8Array[] = [Uint8Array.of(0xff, 0xd8)];
  let at = 2;
  let size: { w: number; h: number } | null = null;
  let scan = false;
  while (at < b.length) {
    if (b[at] !== 0xff) throw new ImageError(BAD);
    // Fill bytes before a marker.
    while (b[at] === 0xff && at < b.length) at++;
    const m = b[at++];
    if (m === undefined) break;
    if (m === 0xd9) {
      out.push(Uint8Array.of(0xff, 0xd9));
      break;
    }
    // Markers with no length.
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd8)) {
      out.push(Uint8Array.of(0xff, m));
      continue;
    }
    if (at + 2 > b.length) throw new ImageError(BAD);
    const len = u16(b, at);
    if (len < 2 || at + len > b.length) throw new ImageError(BAD);
    const body = b.subarray(at, at + len);
    const isSof = m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
    if (isSof) {
      // One frame only. A decoder reads the first frame header, so a second one (a small size
      // after a huge one) would let a decompression bomb past the size check.
      if (size) throw new ImageError(BAD);
      if (len < 8) throw new ImageError(BAD);
      size = { h: u16(body, 3), w: u16(body, 5) };
    }
    let keep = false;
    if (isSof || m === 0xc4 || m === 0xdb || m === 0xdd || m === 0xda || m === 0xcc) keep = true;
    else if (m === 0xe0 && ascii(body, 2, 6) === 'JFIF' && len >= 16) {
      // The JFIF header, rebuilt without its thumbnail (a second, unchecked picture).
      const jfif = Uint8Array.from(body.subarray(0, 16));
      jfif[0] = 0;
      jfif[1] = 16;
      jfif[14] = 0;
      jfif[15] = 0;
      out.push(Uint8Array.of(0xff, m), jfif);
    } else if (m === 0xe2) keep = ascii(body, 2, 13) === 'ICC_PROFILE';
    else if (m === 0xee) keep = ascii(body, 2, 7) === 'Adobe';
    // APP1 (EXIF, XMP), APP13 (IPTC), JFXX thumbnails, comments and the rest are dropped.
    if (keep) out.push(Uint8Array.of(0xff, m), body);
    at += len;
    if (m === 0xda) {
      // The picture data runs on to the end marker. Copy it as it is, taking care that a restart
      // or fill byte inside it is not read as a block.
      scan = true;
      let end = at;
      while (end < b.length) {
        if (b[end] === 0xff) {
          const n = b[end + 1];
          if (n === undefined) {
            end = b.length;
            break;
          }
          if (n === 0x00 || (n >= 0xd0 && n <= 0xd7) || n === 0xff) {
            end += n === 0xff ? 1 : 2;
            continue;
          }
          break;
        }
        end++;
      }
      out.push(b.subarray(at, end));
      at = end;
    }
  }
  if (!size || !scan) throw new ImageError(BAD);
  checkSize(size.w, size.h);
  const last = out[out.length - 1]!;
  if (!(last.length === 2 && last[0] === 0xff && last[1] === 0xd9)) {
    out.push(Uint8Array.of(0xff, 0xd9));
  }
  return { type: 'jpeg', width: size.w, height: size.h, bytes: join(out) };
}

// ------------------------------------------------------------------ PNG

const PNG_SIG = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const PNG_KEEP = new Set([
  'IHDR',
  'PLTE',
  'IDAT',
  'IEND',
  'tRNS',
  'gAMA',
  'cHRM',
  'sRGB',
  'sBIT',
  'bKGD',
  'pHYs',
]);

function cleanPng(b: Uint8Array): CleanImage {
  for (let i = 0; i < 8; i++) if (b[i] !== PNG_SIG[i]) throw new ImageError(BAD);
  const out: Uint8Array[] = [PNG_SIG];
  let at = 8;
  let w = 0;
  let h = 0;
  let first = true;
  let ended = false;
  let data = false;
  while (at + 12 <= b.length) {
    const len = u32(b, at);
    const type = ascii(b, at + 4, at + 8);
    if (len > b.length || at + 12 + len > b.length) throw new ImageError(BAD);
    const chunk = b.subarray(at, at + 12 + len);
    const crc = u32(b, at + 8 + len);
    if (crc32(b.subarray(at + 4, at + 8 + len)) >>> 0 !== crc) throw new ImageError(BAD);
    if (first) {
      if (type !== 'IHDR' || len !== 13) throw new ImageError(BAD);
      w = u32(b, at + 8);
      h = u32(b, at + 12);
      first = false;
    }
    if (type === 'IDAT') data = true;
    if (PNG_KEEP.has(type)) out.push(chunk);
    at += 12 + len;
    if (type === 'IEND') {
      ended = true;
      break;
    }
  }
  if (!ended || !data) throw new ImageError(BAD);
  checkSize(w, h);
  return { type: 'png', width: w, height: h, bytes: join(out) };
}

// ------------------------------------------------------------------ WebP

function cleanWebp(b: Uint8Array): CleanImage {
  const riffLen = l32(b, 4);
  if (riffLen + 8 > b.length || riffLen < 12) throw new ImageError(BAD);
  const end = riffLen + 8;
  const chunks: { id: string; data: Uint8Array }[] = [];
  let at = 12;
  while (at + 8 <= end) {
    const id = ascii(b, at, at + 4);
    const len = l32(b, at + 4);
    if (at + 8 + len > end) throw new ImageError(BAD);
    chunks.push({ id, data: b.subarray(at + 8, at + 8 + len) });
    at += 8 + len + (len % 2);
  }
  const image = chunks.find((c) => c.id === 'VP8 ' || c.id === 'VP8L');
  if (!image) throw new ImageError(BAD);
  let w = 0;
  let h = 0;
  const x = chunks.find((c) => c.id === 'VP8X');
  if (x) {
    if (x.data.length < 10) throw new ImageError(BAD);
    if (x.data[0]! & 0x02)
      throw new ImageError('Moving pictures are not supported. Send a still photo.');
    w = (x.data[4]! | (x.data[5]! << 8) | (x.data[6]! << 16)) + 1;
    h = (x.data[7]! | (x.data[8]! << 8) | (x.data[9]! << 16)) + 1;
  } else if (image.id === 'VP8 ') {
    const d = image.data;
    if (d.length < 10 || d[3] !== 0x9d || d[4] !== 0x01 || d[5] !== 0x2a) throw new ImageError(BAD);
    w = (d[6]! | (d[7]! << 8)) & 0x3fff;
    h = (d[8]! | (d[9]! << 8)) & 0x3fff;
  } else {
    const d = image.data;
    if (d.length < 5 || d[0] !== 0x2f) throw new ImageError(BAD);
    const bits = d[1]! | (d[2]! << 8) | (d[3]! << 16) | (d[4]! << 24);
    w = (bits & 0x3fff) + 1;
    h = ((bits >>> 14) & 0x3fff) + 1;
  }
  checkSize(w, h);
  const parts: Uint8Array[] = [];
  const push = (id: string, data: Uint8Array): void => {
    const head = new Uint8Array(8);
    head.set(
      Uint8Array.from(id, (c) => c.charCodeAt(0)),
      0,
    );
    new DataView(head.buffer).setUint32(4, data.length, true);
    parts.push(head, data);
    if (data.length % 2) parts.push(Uint8Array.of(0));
  };
  for (const c of chunks) {
    if (c.id === 'VP8X') {
      const copy = Uint8Array.from(c.data);
      // Clear the flags for a colour profile (0x20), EXIF (0x08) and XMP (0x04): those chunks are gone.
      copy[0] = copy[0]! & ~(0x20 | 0x08 | 0x04);
      push('VP8X', copy);
    } else if (c.id === 'VP8 ' || c.id === 'VP8L' || c.id === 'ALPH') push(c.id, c.data);
  }
  const body = join(parts);
  const head = new Uint8Array(12);
  head.set(
    Uint8Array.from('RIFF', (c) => c.charCodeAt(0)),
    0,
  );
  new DataView(head.buffer).setUint32(4, body.length + 4, true);
  head.set(
    Uint8Array.from('WEBP', (c) => c.charCodeAt(0)),
    8,
  );
  return { type: 'webp', width: w, height: h, bytes: join([head, body]) };
}

/** Check the file and rebuild it without its metadata, or throw `ImageError` with a plain message. */
export function cleanImage(bytes: Uint8Array, maxBytes: number): CleanImage {
  if (bytes.length === 0) throw new ImageError('That file was empty.');
  if (bytes.length > maxBytes) {
    throw new ImageError(
      `That photo is too big. The most is ${Math.floor(maxBytes / 1048576)} MB.`,
    );
  }
  const type = sniff(bytes);
  if (!type) throw new ImageError(BAD);
  const out =
    type === 'jpeg' ? cleanJpeg(bytes) : type === 'png' ? cleanPng(bytes) : cleanWebp(bytes);
  if (out.bytes.length > maxBytes) throw new ImageError('That photo is too big.');
  return out;
}

/**
 * The type of a stored picture, checked again before it is served or shown: it must parse as a
 * JPEG, PNG or WebP picture and its name must end in that type's extension. Null for anything
 * else (a page, a script or an SVG under a picture's name, or a PNG named `.jpg`), which is
 * then not served at all.
 */
export function servableType(bytes: Uint8Array, path: string): ImageType | null {
  const type = sniff(bytes);
  if (!type || !path.toLowerCase().endsWith(`.${EXTENSION[type]}`)) return null;
  try {
    return cleanImage(bytes, Math.max(bytes.length, 1)).type === type ? type : null;
  } catch {
    return null;
  }
}

/** Plain base64 (not URL-safe) with no whitespace, decoded only when its length fits the limit. */
export function decodeBase64(text: unknown, maxBytes: number): Uint8Array {
  if (typeof text !== 'string' || text.length === 0) throw new ImageError('Choose a photo first.');
  if (text.length > Math.ceil((maxBytes * 4) / 3) + 8) {
    throw new ImageError(
      `That photo is too big. The most is ${Math.floor(maxBytes / 1048576)} MB.`,
    );
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text) || text.length % 4 !== 0) throw new ImageError(BAD);
  return new Uint8Array(Buffer.from(text, 'base64'));
}
