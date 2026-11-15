import 'server-only';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { logFailure } from '../logging';
import { asUser, type AuthDeps } from '../auth/accounts';
import type { SqlRunner } from '../db/sql';
import { CommunityError } from './errors';
import { EXTENSION, MIME, cleanImage, decodeBase64, servableType, type CleanImage } from './image';

/**
 * Photos: upload, the pending state, the image check, and approval (BUILD_PLAN 4.3).
 *
 * A photo never shows before it has been checked. The path is:
 *
 * 1. The browser sends the picture to this server (never to Storage), as the signed-in player.
 * 2. The server reads the real type from the bytes, rebuilds the file without its metadata
 *    (image.ts: GPS and every other tag are removed), and refuses anything that is not a JPEG,
 *    PNG or WebP picture, or is over the size limits (the bucket's own limits as well).
 * 3. The file is stored in the player's own folder (`<account id>/<random>.<ext>`: the folder is
 *    the session's id, never one the browser names) and a row is added with status `pending`.
 *    The database only ever lets a row start pending.
 * 4. The image check (an interface) looks at the stored file. Three answers: `pass` approves it,
 *    `fail` rejects it, `review` leaves it pending for a person. With no service set up the
 *    answer is always `review`: every photo waits in the admin queue (`/admin/photos`).
 * 5. Approval is only ever `public.approve_photo(kind, row, object id, changed at, version)`,
 *    given the id, change time and version of the exact file the check read. If the file at the
 *    path is not that file when the function runs, nothing is approved.
 * 6. The pages show a photo only through `/api/community/photo`, which serves it only when the
 *    row is approved, the viewer may see the post or profile (the database says), and the stored
 *    file is still the one that was approved. The author sees a "waiting for a check" note in its place.
 */

export interface PhotoStorage {
  put(bucket: string, path: string, bytes: Uint8Array, mime: string): Promise<void>;
  get(bucket: string, path: string): Promise<Uint8Array | null>;
  remove(bucket: string, paths: string[]): Promise<void>;
}

export type CheckResult = 'pass' | 'fail' | 'review';

/**
 * The image check. The real one is an outside service that Claudia chooses and sets up (BUILD_PLAN
 * section 8, milestone 4.3): an adapter that implements this interface goes here. Until then
 * `heldForReview` is used and every photo waits for a person.
 */
export interface ImageCheck {
  check(bytes: Uint8Array, mime: string): Promise<CheckResult>;
}

export const heldForReview: ImageCheck = { check: async () => 'review' };

export interface PhotoDeps {
  storage: PhotoStorage | null;
  check: ImageCheck;
}

let override: PhotoDeps | undefined;
/** For tests: use this storage and check. `undefined` goes back to the environment. */
export function setPhotoDeps(d: PhotoDeps | undefined): void {
  override = d;
}

export function photoDeps(): PhotoDeps {
  if (override) return override;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  return { storage: url && secret ? supabaseStorage(url, secret) : null, check: heldForReview };
}

/** The real storage: Supabase Storage, written with the secret key (server only). */
export function supabaseStorage(url: string, secretKey: string): PhotoStorage {
  const admin = () =>
    createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    async put(bucket, path, bytes, mime) {
      const { error } = await admin().storage.from(bucket).upload(path, bytes, {
        contentType: mime,
        upsert: false,
      });
      if (error) throw error;
    },
    async get(bucket, path) {
      const { data, error } = await admin().storage.from(bucket).download(path);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    },
    async remove(bucket, paths) {
      if (paths.length === 0) return;
      const { error } = await admin().storage.from(bucket).remove(paths);
      if (error) throw error;
    },
  };
}

export const LIMITS = {
  /** Raw bytes the server will read from one upload. The buckets' own limits are 2 MB (avatars) and 8 MB (post photos). */
  avatar: 2 * 1048576,
  post: 6 * 1048576,
  /** Photos on one post (PRD 9.2). */
  perPost: 4,
};

/** The body size a photo route accepts: the photo in base64, with a little for the rest. */
export const bodyLimitFor = (bytes: number): number => Math.ceil((bytes * 4) / 3) + 2048;

export type PhotoStatus = 'pending' | 'approved' | 'rejected';

function storageOrRefuse(): PhotoStorage {
  const s = photoDeps().storage;
  if (!s) throw new CommunityError(503, 'Photos are not set up on this copy of the game yet.');
  return s;
}

export interface ObjectIdentity {
  id: string;
  updatedAt: string;
  version: string | null;
}

/** The identity of the stored file: its id, change time and version, as Storage records them. */
export async function identityOf(
  sql: SqlRunner,
  bucket: string,
  path: string,
): Promise<ObjectIdentity | null> {
  const r = await sql.query<{ id: string; updated_at: string; version: string | null }>(
    `select id, to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at, version
       from storage.objects where bucket_id = $1 and name = $2`,
    [bucket, path],
  );
  const row = r.rows[0];
  return row ? { id: row.id, updatedAt: row.updated_at, version: row.version } : null;
}

export type Kind = 'post_photo' | 'avatar';
const BUCKET: Record<Kind, string> = { post_photo: 'post-photos', avatar: 'avatars' };

/**
 * Run the image check on the stored file and act on the answer. The identity is read before the
 * bytes and again after, so a file swapped while the check ran is not approved (and the database
 * checks it once more inside `approve_photo`). Never throws: a failed check leaves the photo pending.
 */
export async function runCheck(
  deps: AuthDeps,
  kind: Kind,
  row: string,
  path: string,
): Promise<PhotoStatus> {
  const photo = photoDeps();
  try {
    if (!photo.storage) return 'pending';
    const bucket = BUCKET[kind];
    const before = await identityOf(deps.sql, bucket, path);
    if (!before) return 'pending';
    const bytes = await photo.storage.get(bucket, path);
    if (!bytes) return 'pending';
    const type = servableType(bytes, path);
    if (!type) return 'pending';
    const answer = await photo.check.check(bytes, MIME[type]);
    if (answer === 'review') return 'pending';
    const after = await identityOf(deps.sql, bucket, path);
    if (!after || after.id !== before.id || after.updatedAt !== before.updatedAt) return 'pending';
    if (answer === 'fail') {
      await reject(deps.sql, kind, row, path, before);
      return 'rejected';
    }
    await approve(deps.sql, kind, row, before);
    return 'approved';
  } catch (e) {
    logFailure({ route: 'community-photo-check', reason: 'image_check_failed' }, e);
    return 'pending';
  }
}

/** Approve one exact file, through the database's own function and nothing else. */
export async function approve(
  sql: { query: SqlRunner['query'] },
  kind: Kind,
  row: string,
  file: ObjectIdentity,
): Promise<void> {
  await sql.query('select public.approve_photo($1, $2::uuid, $3::uuid, $4::timestamptz, $5)', [
    kind,
    row,
    file.id,
    file.updatedAt,
    file.version,
  ]);
}

/** Mark the photo rejected, only while it is still pending on this same file. */
export async function reject(
  sql: SqlRunner | { query: SqlRunner['query'] },
  kind: Kind,
  row: string,
  path: string,
  file: ObjectIdentity,
): Promise<number> {
  const current = await identityOf(sql as SqlRunner, BUCKET[kind], path);
  if (!current || current.id !== file.id || current.updatedAt !== file.updatedAt) return 0;
  const r =
    kind === 'post_photo'
      ? await sql.query(
          `update public.post_photos set moderation_status = 'rejected', checked_at = now()
            where id = $1 and moderation_status = 'pending' and storage_path = $2`,
          [row, path],
        )
      : await sql.query(
          `update public.profiles set avatar_status = 'rejected', avatar_checked_at = now()
            where user_id = $1 and avatar_status = 'pending' and avatar_path = $2`,
          [row, path],
        );
  return r.rowCount;
}

export function decodeUpload(
  data: unknown,
  maxBytes: number,
): { image: CleanImage; path: (user: string) => string } {
  const image = cleanImage(decodeBase64(data, maxBytes), maxBytes);
  return { image, path: (user) => `${user}/${randomUUID()}.${EXTENSION[image.type]}` };
}

/** Set a new profile photo. The old file goes once the new row is in place. */
export async function setAvatar(
  deps: AuthDeps,
  userId: string,
  data: unknown,
): Promise<{ status: PhotoStatus }> {
  const storage = storageOrRefuse();
  const { image, path } = decodeUpload(data, LIMITS.avatar);
  const target = path(userId);
  const old = await deps.sql.query<{ avatar_path: string | null }>(
    'select avatar_path from public.profiles where user_id = $1',
    [userId],
  );
  await storage.put('avatars', target, image.bytes, MIME[image.type]);
  try {
    // As the player: the database's rules say the path must be in their own folder.
    await asUser(deps.sql, userId, (tx) =>
      tx.query('update public.profiles set avatar_path = $2 where user_id = $1', [userId, target]),
    );
  } catch (e) {
    await storage.remove('avatars', [target]).catch(() => undefined);
    throw e;
  }
  const previous = old.rows[0]?.avatar_path;
  if (previous && previous !== target) {
    await storage.remove('avatars', [previous]).catch(() => undefined);
  }
  const status = await runCheck(deps, 'avatar', userId, target);
  return { status };
}

/** Take the profile photo away. */
export async function clearAvatar(deps: AuthDeps, userId: string): Promise<void> {
  const storage = photoDeps().storage;
  const old = await deps.sql.query<{ avatar_path: string | null }>(
    'select avatar_path from public.profiles where user_id = $1',
    [userId],
  );
  await asUser(deps.sql, userId, (tx) =>
    tx.query('update public.profiles set avatar_path = null where user_id = $1', [userId]),
  );
  const previous = old.rows[0]?.avatar_path;
  if (previous && storage) await storage.remove('avatars', [previous]).catch(() => undefined);
}

/** Add a photo to the player's own post. Up to four. It starts pending. */
export async function addPostPhoto(
  deps: AuthDeps,
  userId: string,
  postId: string,
  data: unknown,
): Promise<{ id: string; status: PhotoStatus; position: number }> {
  const storage = storageOrRefuse();
  const { image, path } = decodeUpload(data, LIMITS.post);
  const target = path(userId);
  await storage.put('post-photos', target, image.bytes, MIME[image.type]);
  let created: { id: string; position: number };
  try {
    created = await asUser(deps.sql, userId, async (tx) => {
      // The post must be the player's own and still standing. The row level security says so too.
      const own = await tx.query(
        `select 1 from public.posts where id = $1 and author_id = $2 and removed_at is null`,
        [postId, userId],
      );
      if (own.rowCount === 0) throw new CommunityError(404, 'That post was not found.');
      const used = await tx.query<{ position: number }>(
        'select position from public.post_photos where post_id = $1',
        [postId],
      );
      const taken = new Set(used.rows.map((r) => r.position));
      let position = 0;
      for (let p = 1; p <= LIMITS.perPost; p++)
        if (!taken.has(p)) {
          position = p;
          break;
        }
      if (position === 0) {
        throw new CommunityError(409, `A post can have up to ${LIMITS.perPost} photos.`);
      }
      const r = await tx.query<{ id: string }>(
        `insert into public.post_photos (post_id, storage_path, position)
         values ($1, $2, $3) returning id`,
        [postId, target, position],
      );
      return { id: r.rows[0]!.id, position };
    });
  } catch (e) {
    await storage.remove('post-photos', [target]).catch(() => undefined);
    throw e;
  }
  const status = await runCheck(deps, 'post_photo', created.id, target);
  return { ...created, status };
}

/** Remove the stored files of photos that are gone from the database (a deleted post or photo). */
export async function removeFiles(bucket: string, paths: string[]): Promise<void> {
  const storage = photoDeps().storage;
  if (!storage || paths.length === 0) return;
  await storage.remove(bucket, paths).catch((e) => {
    logFailure({ route: 'community-photo-remove', reason: 'file_remove_failed' }, e);
  });
}

// ------------------------------------------------------------------ serving a photo

export interface Served {
  bytes: Uint8Array;
  mime: string;
}

/**
 * The bytes of an approved photo, for a viewer the database lets see it, or null. `tx` runs as the
 * viewer: the row is read through the rules (a post they may not see, a block, a private profile
 * are all "no row"). Only an approved photo is ever served, the author's own included, and only
 * while the stored file is still the exact file that was approved.
 */
export async function servePhoto(
  deps: AuthDeps,
  viewer: string,
  kind: 'post' | 'avatar',
  id: string,
): Promise<Served | null> {
  const storage = photoDeps().storage;
  if (!storage) return null;
  let bucket: string;
  let path: string;
  let object: string;
  let updated: string;
  if (kind === 'post') {
    const r = await asUser(deps.sql, viewer, (tx) =>
      tx.query<{ storage_path: string; storage_object_id: string; u: string }>(
        `select storage_path, storage_object_id,
                to_char(storage_object_updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as u
           from public.post_photos where id = $1 and moderation_status = 'approved'`,
        [id],
      ),
    );
    const row = r.rows[0];
    if (!row) return null;
    bucket = 'post-photos';
    path = row.storage_path;
    object = row.storage_object_id;
    updated = row.u;
  } else {
    // A profile photo: the viewer must be able to find the profile (a member, no block, 16 or over).
    const r = await deps.sql.query<{ avatar_path: string; id: string; u: string }>(
      `select avatar_path, avatar_object_id as id,
              to_char(avatar_object_updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as u
         from public.profiles
        where user_id = $2 and avatar_status = 'approved' and avatar_path is not null
          and app.member_raw(user_id) and app.can_find_profile_for($1, user_id)`,
      [viewer, id],
    );
    const row = r.rows[0];
    if (!row) return null;
    bucket = 'avatars';
    path = row.avatar_path;
    object = row.id;
    updated = row.u;
  }
  const now = await identityOf(deps.sql, bucket, path);
  if (!now || now.id !== object || now.updatedAt !== updated) return null;
  const bytes = await storage.get(bucket, path);
  if (!bytes) return null;
  // The bytes must be the picture type the name says, checked here and not guessed: anything
  // else is not served, whatever the row says.
  const type = servableType(bytes, path);
  if (!type) return null;
  return { bytes, mime: MIME[type] };
}

// ------------------------------------------------------------------ the manual queue

export interface PendingPhoto {
  kind: Kind;
  /** The post photo's id, or the account id for an avatar. */
  row: string;
  who: string;
  postId: string | null;
  path: string;
  file: ObjectIdentity | null;
  createdAt: string;
}

/** Photos waiting for a person, oldest first. */
export async function pendingPhotos(sql: SqlRunner, limit = 12): Promise<PendingPhoto[]> {
  const posts = await sql.query<{
    id: string;
    post_id: string;
    storage_path: string;
    username: string;
    created_at: string;
  }>(
    `select ph.id, ph.post_id, ph.storage_path, p.username, ph.created_at
       from public.post_photos ph
       join public.posts po on po.id = ph.post_id
       join public.profiles p on p.user_id = po.author_id
      where ph.moderation_status = 'pending' and po.removed_at is null
      order by ph.created_at limit $1`,
    [limit],
  );
  const avatars = await sql.query<{
    user_id: string;
    avatar_path: string;
    username: string;
    updated_at: string;
  }>(
    `select user_id, avatar_path, username, updated_at from public.profiles
      where avatar_status = 'pending' and avatar_path is not null
      order by updated_at limit $1`,
    [limit],
  );
  const out: PendingPhoto[] = [];
  for (const p of posts.rows) {
    out.push({
      kind: 'post_photo',
      row: p.id,
      who: p.username,
      postId: p.post_id,
      path: p.storage_path,
      file: await identityOf(sql, 'post-photos', p.storage_path),
      createdAt: p.created_at,
    });
  }
  for (const a of avatars.rows) {
    out.push({
      kind: 'avatar',
      row: a.user_id,
      who: a.username,
      postId: null,
      path: a.avatar_path,
      file: await identityOf(sql, 'avatars', a.avatar_path),
      createdAt: a.updated_at,
    });
  }
  out.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  return out.slice(0, limit);
}

/**
 * The bytes of a queued photo for the admin page, served by `/api/admin/photo-preview` (an image
 * address, not a data address in the page). Only a photo still waiting, only the file the queue
 * names, and only a real picture of the type its name says. Null otherwise.
 */
export async function queuedPhoto(sql: SqlRunner, kind: Kind, row: string): Promise<Served | null> {
  const storage = photoDeps().storage;
  if (!storage) return null;
  const r =
    kind === 'post_photo'
      ? await sql.query<{ path: string }>(
          `select storage_path as path from public.post_photos
            where id = $1 and moderation_status = 'pending'`,
          [row],
        )
      : await sql.query<{ path: string }>(
          `select avatar_path as path from public.profiles
            where user_id = $1 and avatar_status = 'pending' and avatar_path is not null`,
          [row],
        );
  const path = r.rows[0]?.path;
  if (!path) return null;
  const bytes = await storage.get(BUCKET[kind], path);
  if (!bytes) return null;
  const type = servableType(bytes, path);
  return type ? { bytes, mime: MIME[type] } : null;
}
