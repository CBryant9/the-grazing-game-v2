import { adminRoute } from '@/server/admin/route';
import { exportTable } from '@/server/admin/dashboardExport';

export const dynamic = 'force-dynamic';

/**
 * One dashboard table as CSV: `?table=summary&from=YYYY-MM-DD&to=YYYY-MM-DD`. Admins only; each
 * download is written to the audit log with the table's name and its number of rows.
 */
export const GET = adminRoute({ name: 'dashboard-export', max: 30, method: 'GET' }, exportTable);
