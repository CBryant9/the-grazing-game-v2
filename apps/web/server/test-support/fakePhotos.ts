import type { PGlite } from '@electric-sql/pglite';
import type { CheckResult, ImageCheck, PhotoStorage } from '../community/photos';

/**
 * A stand-in for Supabase Storage in tests: the bytes are kept in memory, and each put writes the
 * file's row in `storage.objects` (which the database's rules and `approve_photo` read), the way
 * Storage does. A second put to the same path is an overwrite (new change time and version), like
 * an upsert. What it can not prove is Storage's own HTTP layer: that is owed against a real project.
 */
export class FakeStorage implements PhotoStorage {
  readonly files = new Map<string, Uint8Array>();
  readonly removed: string[] = [];
  constructor(private readonly db: PGlite) {}

  async put(bucket: string, path: string, bytes: Uint8Array): Promise<void> {
    this.files.set(`${bucket}/${path}`, bytes);
    await this.db.query(
      `insert into storage.objects (bucket_id, name) values ($1, $2)
       on conflict (bucket_id, name) do update set metadata = '{"overwritten": true}'::jsonb`,
      [bucket, path],
    );
  }

  async get(bucket: string, path: string): Promise<Uint8Array | null> {
    return this.files.get(`${bucket}/${path}`) ?? null;
  }

  async remove(bucket: string, paths: string[]): Promise<void> {
    for (const p of paths) {
      this.files.delete(`${bucket}/${p}`);
      this.removed.push(`${bucket}/${p}`);
      await this.db.query('delete from storage.objects where bucket_id = $1 and name = $2', [
        bucket,
        p,
      ]);
    }
  }
}

/** An image check with an answer the test chooses. */
export class FakeCheck implements ImageCheck {
  answer: CheckResult = 'review';
  readonly seen: number[] = [];
  async check(bytes: Uint8Array): Promise<CheckResult> {
    this.seen.push(bytes.length);
    return this.answer;
  }
}

// ------------------------------------------------------------------ real tiny images

import { crc32 } from 'node:zlib';

/** A tiny JPEG with an EXIF block (a fake GPS string inside) and a comment, for the metadata tests. */
export function jpegWithExif(): Uint8Array {
  const exif = Buffer.concat([
    Buffer.from([0xff, 0xe1, 0x00, 0x1b]),
    Buffer.from('Exif\0\0GPSLatitude-33.8688'),
  ]);
  const com = Buffer.concat([Buffer.from([0xff, 0xfe, 0x00, 0x0c]), Buffer.from('secret-com')]);
  const jfif = Buffer.concat([
    Buffer.from([0xff, 0xe0, 0x00, 0x10]),
    Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0'),
  ]);
  const sof = Buffer.from([
    0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x02, 0x00, 0x03, 0x01, 0x01, 0x11, 0x00,
  ]);
  const dqt = Buffer.concat([Buffer.from([0xff, 0xdb, 0x00, 0x43, 0x00]), Buffer.alloc(64, 8)]);
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]);
  const data = Buffer.from([0x12, 0x34, 0xff, 0x00, 0x56]);
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      jfif,
      exif,
      com,
      dqt,
      sof,
      sos,
      data,
      Buffer.from([0xff, 0xd9]),
    ]),
  );
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

/** A 1 by 1 PNG with a text chunk and an eXIf chunk. */
export function pngWithText(): Uint8Array {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk('IHDR', ihdr),
      pngChunk('tEXt', Buffer.from('Comment\0secret-text')),
      pngChunk('eXIf', Buffer.from('MM\0*GPS')),
      pngChunk(
        'IDAT',
        Buffer.from([0x78, 0x9c, 0x63, 0x60, 0x60, 0x60, 0x00, 0x00, 0x00, 0x04, 0x00, 0x01]),
      ),
      pngChunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

/** A lossless WebP (VP8L) in a VP8X wrapper with EXIF and XMP chunks. */
export function webpWithExif(): Uint8Array {
  const chunk = (id: string, data: Buffer): Buffer => {
    const h = Buffer.alloc(8);
    h.write(id, 0, 'ascii');
    h.writeUInt32LE(data.length, 4);
    return Buffer.concat([h, data, data.length % 2 ? Buffer.from([0]) : Buffer.alloc(0)]);
  };
  const vp8x = Buffer.alloc(10);
  vp8x[0] = 0x08 | 0x04; // EXIF and XMP flags
  vp8x[4] = 1; // width 2
  vp8x[7] = 1; // height 2
  const vp8l = Buffer.from([0x2f, 0x01, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00]); // 2x2
  const body = Buffer.concat([
    Buffer.from('WEBP'),
    chunk('VP8X', vp8x),
    chunk('VP8L', vp8l),
    chunk('EXIF', Buffer.from('GPS-secret')),
    chunk('XMP ', Buffer.from('<x>secret</x>')),
  ]);
  const head = Buffer.alloc(8);
  head.write('RIFF', 0, 'ascii');
  head.writeUInt32LE(body.length, 4);
  return new Uint8Array(Buffer.concat([head, body]));
}
