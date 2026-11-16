import { adminRoute } from '@/server/admin/route';
import { actOnReport, parseReportAction } from '@/server/admin/moderation';

export const dynamic = 'force-dynamic';

/**
 * One moderator action on one open report: remove, keep, warn, suspend or ban. The browser sends
 * a report id and an action. The report says what it is about; nothing else is read from the body.
 */
export const POST = adminRoute({ name: 'moderation', max: 60 }, async ({ admin, deps, body }) => {
  const act = parseReportAction(body);
  const out = await actOnReport(deps.sql, admin.userId, body.reportId, act, {
    emailOf: (id) => deps.provider.emailOf(id),
    pepper: deps.pepper,
  });
  return out.note ? { ok: true, note: out.note } : { ok: true };
});
