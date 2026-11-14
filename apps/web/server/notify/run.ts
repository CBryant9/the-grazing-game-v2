import 'server-only';
import type { NotifyDeps } from './deps';
import { dailyFarmReader, runReminders, type ReminderReport } from './reminders';
import { housekeep, isPaused, runSender, type SenderReport } from './sender';

export interface RunReport {
  reminders: ReminderReport | null;
  sender: SenderReport;
  pruned: number;
}

/**
 * What the scheduler calls every few minutes: make today's reminders that are due, send what is
 * waiting, and tidy old rows. When sending is switched off or paused nothing is made or sent, so
 * nothing piles up behind a pause. The numbers returned are counts only.
 */
export async function runAll(nd: NotifyDeps, budgetMs = 25_000): Promise<RunReport> {
  const off = !(await nd.switchOn());
  const paused = !off && (await isPaused(nd.sql));
  const reminders =
    off || paused ? null : await runReminders(nd, dailyFarmReader(nd.sql)).catch(() => null);
  const sender = await runSender(nd, { budgetMs });
  const pruned = off || paused ? 0 : await housekeep(nd).catch(() => 0);
  return { reminders, sender, pruned };
}
