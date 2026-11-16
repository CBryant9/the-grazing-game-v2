import 'server-only';
import { randomBytes } from 'node:crypto';

/**
 * Ad uploads. An ad is an image or a short video, never HTML, script or SVG. What a file is is
 * decided by LOOKING AT ITS BYTES, never by its name or by the type the browser says: a script
 * named `.png`, an SVG, an HTML page and a renamed document are all refused because their bytes
 * are not an image or a video. The stored name comes from the type found here, never from the
 * file name the admin chose.
 *
 * Accepted: JPEG, PNG, WebP images; MP4 (H.264) video up to 30 seconds. WebM is not accepted
 * yet (its length can not be read as simply), so the stored type list is a subset of the
 * bucket's.
 */

export type MediaMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'video/mp4';

export interface Sniffed {
  mime: MediaMime;
  ext: 'jpg' | 'png' | 'webp' | 'mp4';
  kind: 'image' | 'video';
  width: number | null;
  height: number | null;
  /** Whole seconds, rounded up (video only). */
  durationS: number | null;
}

/** Limits. A video goes through the page as one request, which Vercel limits to 4.5 MB, so it is 3 MB here. */
export const MAX_IMAGE_BYTES = 1024 * 1024;
export const MAX_VIDEO_BYTES = 3 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 30;
export const MAX_SIDE_PX = 4096;
export const MIN_SIDE_PX = 16;

export class MediaError extends Error {
  constructor(message: string) {
    super(message);
  }
}

const REFUSED = 'That file is not a JPEG, PNG or WebP picture, or an MP4 video.';

const ascii = (b: Uint8Array, at: number, n: number): string =>
  String.fromCharCode(...b.subarray(at, at + n));
const u16be = (b: Uint8Array, at: number): number => (b[at]! << 8) | b[at + 1]!;
const u32be = (b: Uint8Array, at: number): number =>
  ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0;
const u24le = (b: Uint8Array, at: number): number =>
  b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16);

function png(b: Uint8Array): { w: number; h: number } | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 33 || sig.some((v, i) => b[i] !== v)) return null;
  if (ascii(b, 12, 4) !== 'IHDR') return null;
  return { w: u32be(b, 16), h: u32be(b, 20) };
}

function jpeg(b: Uint8Array): { w: number; h: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1]!;
    if (marker === 0xff) {
      i++;
      continue;
    }
    // Start of frame (baseline, extended, progressive...), but not DHT, JPG or DAC.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { w: u16be(b, i + 7), h: u16be(b, i + 5) };
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    i += 2 + u16be(b, i + 2);
  }
  return null;
}

function webp(b: Uint8Array): { w: number; h: number } | null {
  if (b.length < 30 || ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === 'VP8X') return { w: u24le(b, 24) + 1, h: u24le(b, 27) + 1 };
  if (chunk === 'VP8L') {
    if (b[20] !== 0x2f) return null;
    const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
    return { w: (bits & 0x3fff) + 1, h: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8 ') {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { w: (b[26]! | (b[27]! << 8)) & 0x3fff, h: (b[28]! | (b[29]! << 8)) & 0x3fff };
  }
  return null;
}

const MP4_BRANDS = new Set([
  'isom',
  'iso2',
  'iso4',
  'iso5',
  'iso6',
  'mp41',
  'mp42',
  'avc1',
  'M4V ',
  'dash',
]);

/** Walk the boxes of an MP4 for its length and picture size. Nothing is read past the buffer. */
function mp4(b: Uint8Array): { w: number; h: number; seconds: number } | null {
  if (b.length < 16 || ascii(b, 4, 4) !== 'ftyp' || !MP4_BRANDS.has(ascii(b, 8, 4))) return null;
  const find = (from: number, to: number, name: string): [number, number] | null => {
    let i = from;
    while (i + 8 <= to) {
      let size = u32be(b, i);
      const type = ascii(b, i + 4, 4);
      let head = 8;
      if (size === 1) {
        if (i + 16 > to || u32be(b, i + 8) !== 0) return null;
        size = u32be(b, i + 12);
        head = 16;
      } else if (size === 0) size = to - i;
      if (size < head || i + size > to) return null;
      if (type === name) return [i + head, i + size];
      i += size;
    }
    return null;
  };
  const moov = find(0, b.length, 'moov');
  if (!moov) return null;
  const mvhd = find(moov[0], moov[1], 'mvhd');
  if (!mvhd) return null;
  const v = b[mvhd[0]]!;
  const at = mvhd[0] + (v === 1 ? 20 : 12);
  const scale = u32be(b, at);
  const dur = v === 1 ? u32be(b, at + 4) * 2 ** 32 + u32be(b, at + 8) : u32be(b, at + 4);
  if (!scale || !dur) return null;
  // The first video track's picture size, from its `tkhd` (16.16 fixed point).
  let w = 0;
  let h = 0;
  let i = moov[0];
  while (i + 8 <= moov[1]) {
    const size = u32be(b, i);
    if (size < 8 || i + size > moov[1]) break;
    if (ascii(b, i + 4, 4) === 'trak') {
      const tkhd = find(i + 8, i + size, 'tkhd');
      if (tkhd) {
        const tv = b[tkhd[0]]!;
        const base = tkhd[0] + (tv === 1 ? 88 : 76);
        if (base + 8 <= tkhd[1]) {
          const tw = u32be(b, base) >>> 16;
          const th = u32be(b, base + 4) >>> 16;
          if (tw > 0 && th > 0) {
            w = tw;
            h = th;
            break;
          }
        }
      }
    }
    i += size;
  }
  return { w, h, seconds: Math.ceil(dur / scale) };
}

/**
 * Say what these bytes are, or refuse them. Refuses: anything that is not one of the accepted
 * types by its bytes, a file too big for its kind, a picture smaller than 16 or larger than
 * 4,096 pixels a side, a video over 30 seconds.
 */
export function sniff(bytes: Uint8Array): Sniffed {
  if (bytes.length === 0) throw new MediaError('That file is empty.');
  const image = (
    mime: MediaMime,
    ext: Sniffed['ext'],
    dims: { w: number; h: number } | null,
  ): Sniffed => {
    if (bytes.length > MAX_IMAGE_BYTES) throw new MediaError('A picture can be up to 1 MB.');
    if (!dims) throw new MediaError('That picture could not be read.');
    if (
      dims.w < MIN_SIDE_PX ||
      dims.h < MIN_SIDE_PX ||
      dims.w > MAX_SIDE_PX ||
      dims.h > MAX_SIDE_PX
    ) {
      throw new MediaError(
        `A picture must be between ${MIN_SIDE_PX} and ${MAX_SIDE_PX} pixels a side.`,
      );
    }
    return { mime, ext, kind: 'image', width: dims.w, height: dims.h, durationS: null };
  };
  let p;
  if ((p = png(bytes))) return image('image/png', 'png', p);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return image('image/jpeg', 'jpg', jpeg(bytes));
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    return image('image/webp', 'webp', webp(bytes));
  }
  if (ascii(bytes, 4, 4) === 'ftyp') {
    const v = mp4(bytes);
    if (!v) throw new MediaError('That video could not be read. Use an MP4 (H.264).');
    if (bytes.length > MAX_VIDEO_BYTES) throw new MediaError('A video can be up to 3 MB.');
    if (v.seconds > MAX_VIDEO_SECONDS) {
      throw new MediaError(`A video can be up to ${MAX_VIDEO_SECONDS} seconds.`);
    }
    return {
      mime: 'video/mp4',
      ext: 'mp4',
      kind: 'video',
      width: v.w || null,
      height: v.h || null,
      durationS: Math.max(1, v.seconds),
    };
  }
  throw new MediaError(REFUSED);
}

/** The path an upload is stored at: the creative's folder and a random name with the found extension. */
export const mediaPath = (creativeId: string, ext: string): string =>
  `${creativeId}/${randomBytes(8).toString('hex')}.${ext}`;

// ---------------------------------------------------------------- the store

export interface MediaBody {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
}

/**
 * Where uploads are kept: the `ad-media` bucket. The server writes it with the secret key (no
 * browser role has a policy on it), so an upload only ever comes through the admin gate.
 */
export interface AdMediaStore {
  put(path: string, bytes: Uint8Array, mime: MediaMime): Promise<void>;
  remove(path: string): Promise<void>;
  /** The bytes, or part of them for a `Range` request. Null when there is no such file. */
  read(path: string, range: string | null): Promise<MediaBody | null>;
}

/** An in-memory store for tests. */
export function memoryAdMedia(): AdMediaStore & {
  files: Map<string, { bytes: Uint8Array; mime: string }>;
} {
  const files = new Map<string, { bytes: Uint8Array; mime: string }>();
  return {
    files,
    async put(path, bytes, mime) {
      files.set(path, { bytes, mime });
    },
    async remove(path) {
      files.delete(path);
    },
    async read(path, range): Promise<MediaBody | null> {
      const f = files.get(path);
      if (!f) return null;
      const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
      if (m && (m[1] || m[2])) {
        const start = m[1] ? Number(m[1]) : Math.max(0, f.bytes.length - Number(m[2]));
        const end = m[2] && m[1] ? Math.min(Number(m[2]), f.bytes.length - 1) : f.bytes.length - 1;
        if (start >= f.bytes.length || start > end) {
          return {
            status: 416,
            headers: { 'Content-Range': `bytes */${f.bytes.length}` },
            body: new Uint8Array(),
          };
        }
        return {
          status: 206,
          headers: { 'Content-Range': `bytes ${start}-${end}/${f.bytes.length}` },
          body: f.bytes.subarray(start, end + 1),
        };
      }
      return { status: 200, headers: {}, body: f.bytes };
    },
  };
}

/** The Supabase Storage store: server to server, with the secret key. Proven against a real project only when keys exist. */
export function supabaseAdMedia(url: string, secretKey: string): AdMediaStore {
  const base = `${url.replace(/\/+$/, '')}/storage/v1/object`;
  const auth = { Authorization: `Bearer ${secretKey}`, apikey: secretKey };
  const enc = (path: string): string => path.split('/').map(encodeURIComponent).join('/');
  return {
    async put(path, bytes, mime) {
      const r = await fetch(`${base}/ad-media/${enc(path)}`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': mime, 'x-upsert': 'false' },
        body: bytes as BodyInit,
      });
      if (!r.ok) throw new Error(`storage put failed: ${r.status}`);
    },
    async remove(path) {
      const r = await fetch(`${base}/ad-media/${enc(path)}`, { method: 'DELETE', headers: auth });
      if (!r.ok && r.status !== 404) throw new Error(`storage remove failed: ${r.status}`);
    },
    async read(path, range) {
      const r = await fetch(`${base}/authenticated/ad-media/${enc(path)}`, {
        headers: { ...auth, ...(range ? { Range: range } : {}) },
      });
      if (r.status === 404 || r.status === 400) return null;
      if (!r.ok && r.status !== 206 && r.status !== 416)
        throw new Error(`storage read failed: ${r.status}`);
      const headers: Record<string, string> = {};
      const cr = r.headers.get('content-range');
      if (cr) headers['Content-Range'] = cr;
      return { status: r.status, headers, body: new Uint8Array(await r.arrayBuffer()) };
    },
  };
}

let override: AdMediaStore | undefined;
/** For tests: use this store, or `undefined` for the real one. */
export function setAdMediaStore(s: AdMediaStore | undefined): void {
  override = s;
}

export function adMediaStore(): AdMediaStore | null {
  if (override) return override;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  return url && secret ? supabaseAdMedia(url, secret) : null;
}
