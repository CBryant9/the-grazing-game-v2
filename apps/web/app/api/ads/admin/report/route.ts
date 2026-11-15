import { adminReadRoute } from '@/server/ads/adminRead';
import { campaignReport, reportCsv } from '@/server/ads/adminStore';

export const dynamic = 'force-dynamic';

/** The sponsor report for one campaign as a CSV download: counts by day and slot, nothing else. Admins only. */
export const GET = adminReadRoute({ name: 'ads-report', max: 20 }, async ({ req, deps }) => {
  const id = new URL(req.url).searchParams.get('campaign');
  const report = await campaignReport(deps.sql, id);
  const slug = report.campaign.id.slice(0, 8);
  return new Response(reportCsv(report), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="campaign-${slug}-report.csv"`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
