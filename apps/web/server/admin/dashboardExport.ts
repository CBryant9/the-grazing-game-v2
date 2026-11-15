import 'server-only';
import type { AdminContext } from './route';
import { AdminError } from './errors';
import { audit } from './store';
import { isTableId, parseRange, readDashboard, toCsv } from './dashboard';

/**
 * Download one dashboard table as CSV. The audit row (`dashboard_export`, the table's id and the
 * number of rows) is written before the file is sent; if it can not be written, nothing is sent.
 */
export async function exportTable(ctx: AdminContext): Promise<Response> {
  const table = ctx.url.searchParams.get('table');
  if (!isTableId(table)) throw new AdminError(400, 'That is not a dashboard table.');
  const range = parseRange(ctx.url.searchParams.get('from'), ctx.url.searchParams.get('to'));
  const data = await readDashboard(ctx.deps.sql, range);
  const t = data.tables[table];
  await ctx.deps.sql.transaction((tx) =>
    audit(tx, ctx.admin.userId, 'dashboard_export', 'dashboard_table', table, {
      count: t.rows.length,
    }),
  );
  const name = `grazing-game-${table}-${range.from}-to-${range.to}.csv`;
  return new Response(toCsv(t), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
    },
  });
}
