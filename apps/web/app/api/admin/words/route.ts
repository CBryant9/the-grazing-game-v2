import { adminRoute, AdminError } from '@/server/admin/route';
import { addWord, removeWord } from '@/server/admin/moderation';

export const dynamic = 'force-dynamic';

/** Add or remove a word or phrase on the filter list (docs: PRD 9.9). Each change is audited. */
export const POST = adminRoute({ name: 'words', max: 30 }, async ({ admin, deps, body }) => {
  if (body.action === 'add') {
    await addWord(deps.sql, admin.userId, body.term, body.kind);
    return { ok: true };
  }
  if (body.action === 'remove') {
    await removeWord(deps.sql, admin.userId, body.id);
    return { ok: true };
  }
  throw new AdminError(400, 'That is not something an admin can do here.');
});
