import { handleRollover, realRolloverDeps } from '@/server/daily/cronroute';

export const dynamic = 'force-dynamic';
/** A run works for up to 45 seconds and leaves the rest for the next one. */
export const maxDuration = 60;

/** Vercel's cron calls GET and sends `Authorization: Bearer $CRON_SECRET`. pg_cron can call POST the same way. */
export const GET = (req: Request): Promise<Response> => handleRollover(req, realRolloverDeps());
export const POST = GET;
