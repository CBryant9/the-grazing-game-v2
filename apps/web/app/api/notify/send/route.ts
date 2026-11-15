import { gameServer } from '@/server/game/game';
import { integrations } from '@/server/notify/deps';
import { cronRoute } from '@/server/notify/route';
import { runAll } from '@/server/notify/run';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * The sender. The scheduler calls it every few minutes with `Authorization: Bearer <CRON_SECRET>`
 * (Vercel Cron sends exactly that, and calls with GET). It makes the reminders that are due and
 * sends what is waiting, within a time budget. Safe to call twice at once. Answers counts only.
 * The game server is made first: it installs Daily Farm's reminder reader (m6), so the morning
 * reminder knows when a farm was opened and how many things there are to check.
 */
const run = cronRoute(
  'send',
  () => integrations().cronSecret,
  (nd) => {
    gameServer();
    return runAll(nd);
  },
);
export const GET = run;
export const POST = run;
