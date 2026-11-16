/** Dates for the admin screens: Sydney time, the way the game and Claudia's audit log read. */
const fmt = new Intl.DateTimeFormat('en-AU', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Australia/Sydney',
});

export function when(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'unknown' : `${fmt.format(d)} (Sydney time)`;
}
