/**
 * Files for the tests: the smallest bytes that are, to a program reading the header, a picture or
 * a video. Nothing here is used by the site.
 */

const u32 = (n: number): number[] => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));

/** A PNG header (signature and IHDR) of this size, padded with zeros up to `bytes` if asked. */
export function pngBytes(w = 64, h = 64, bytes = 0): Uint8Array {
  const head = [
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...u32(13),
    ...ascii('IHDR'),
    ...u32(w),
    ...u32(h),
    8,
    2,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
  ];
  const out = new Uint8Array(Math.max(head.length, bytes));
  out.set(head);
  return out;
}

export function jpegBytes(w = 64, h = 32): Uint8Array {
  // SOI, APP0 (16 bytes), SOF0 with the size, EOI.
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x10,
    ...ascii('JFIF'),
    0,
    1,
    1,
    0,
    0,
    1,
    0,
    1,
    0,
    0,
    0xff,
    0xc0,
    0x00,
    0x11,
    8,
    (h >> 8) & 255,
    h & 255,
    (w >> 8) & 255,
    w & 255,
    3,
    1,
    0x22,
    0,
    2,
    0x11,
    1,
    3,
    0x11,
    1,
    0xff,
    0xd9,
  ]);
}

export function webpBytes(w = 64, h = 32): Uint8Array {
  // RIFF, WEBP, VP8X with the size minus one in three bytes each.
  const wm = w - 1;
  const hm = h - 1;
  return new Uint8Array([
    ...ascii('RIFF'),
    22,
    0,
    0,
    0,
    ...ascii('WEBP'),
    ...ascii('VP8X'),
    10,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    wm & 255,
    (wm >> 8) & 255,
    (wm >> 16) & 255,
    hm & 255,
    (hm >> 8) & 255,
    (hm >> 16) & 255,
  ]);
}

const box = (type: string, ...content: number[][]): number[] => {
  const body = content.flat();
  return [...u32(8 + body.length), ...ascii(type), ...body];
};

/** An MP4 with a `moov` box saying how long it is (whole seconds) and how big the picture is. */
export function mp4Bytes(seconds = 10, w = 640, h = 360, bytes = 0): Uint8Array {
  const ftyp = box('ftyp', ascii('isom'), u32(0), ascii('isom'), ascii('mp42'));
  const mvhd = box(
    'mvhd',
    [0, 0, 0, 0],
    u32(0),
    u32(0),
    u32(1000),
    u32(seconds * 1000),
    new Array(80).fill(0),
  );
  const tkhd = box(
    'tkhd',
    [0, 0, 0, 7],
    u32(0),
    u32(0),
    u32(1),
    u32(0),
    u32(seconds * 1000),
    new Array(8).fill(0),
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    new Array(36).fill(0),
    u32(w << 16),
    u32(h << 16),
  );
  const moov = box('moov', mvhd, box('trak', tkhd));
  const head = [...ftyp, ...moov];
  const out = new Uint8Array(Math.max(head.length, bytes));
  out.set(head);
  return out;
}

export const b64 = (bytes: Uint8Array | string): string =>
  Buffer.from(typeof bytes === 'string' ? Buffer.from(bytes) : bytes).toString('base64');
