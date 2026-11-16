import 'server-only';
import { audit } from '../admin/store';
import { AdminError } from '../admin/errors';
import type { SqlClient } from '../db/sql';
import { approve, identityOf, reject, type Kind } from './photos';

/**
 * The manual photo queue (`/admin/photos`). While no image-check service is set up, every photo
 * waits here for a person (docs/DEVELOPMENT_LOG.md, "m4.2 Community").
 *
 * The page shows the exact file it read: its id, change time and version go back with the button.
 * Approving calls `public.approve_photo` with them, and the database refuses if the file at that
 * path is a different file by then (a swap while the admin was looking). Rejecting does the same
 * test first. Each step writes its audit row in the same transaction: if the audit write fails,
 * the change is rolled back. The audit row names the kind and the row id and carries no text.
 */
export interface ReviewInput {
  kind: Kind;
  row: string;
  objectId: string;
  updatedAt: string;
  version: string | null;
  decision: 'approve' | 'reject';
}

const BUCKET: Record<Kind, string> = { post_photo: 'post-photos', avatar: 'avatars' };

export async function reviewPhoto(
  sql: SqlClient,
  adminId: string,
  input: ReviewInput,
): Promise<void> {
  await sql.transaction(async (tx) => {
    // Find the path now, and the photo must still be waiting.
    const r =
      input.kind === 'post_photo'
        ? await tx.query<{ path: string }>(
            `select storage_path as path from public.post_photos
              where id = $1 and moderation_status = 'pending' for update`,
            [input.row],
          )
        : await tx.query<{ path: string }>(
            `select avatar_path as path from public.profiles
              where user_id = $1 and avatar_status = 'pending' and avatar_path is not null for update`,
            [input.row],
          );
    const path = r.rows[0]?.path;
    if (!path) throw new AdminError(409, 'That photo is not waiting any more.');
    const now = await identityOf(tx, BUCKET[input.kind], path);
    if (
      !now ||
      now.id !== input.objectId ||
      now.updatedAt !== input.updatedAt ||
      (input.version !== null && now.version !== input.version)
    ) {
      throw new AdminError(409, 'That photo changed while you were looking. Look at the new one.');
    }
    if (input.decision === 'approve') {
      try {
        await approve(tx, input.kind, input.row, now);
      } catch (e) {
        if ((e as { hint?: string }).hint === 'photo_file_changed') {
          throw new AdminError(
            409,
            'That photo changed while you were looking. Look at the new one.',
          );
        }
        throw e;
      }
    } else {
      const n = await reject(tx, input.kind, input.row, path, now);
      if (n === 0)
        throw new AdminError(
          409,
          'That photo changed while you were looking. Look at the new one.',
        );
    }
    await audit(
      tx,
      adminId,
      input.decision === 'approve' ? 'photo_approve' : 'photo_reject',
      'photo',
      input.row,
    );
  });
}
