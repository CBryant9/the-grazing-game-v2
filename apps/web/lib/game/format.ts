import type { DateParts, JobCardWire } from './types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "$212,400", or "-$1,200" when the bank balance is below zero. */
export function money(n: number): string {
  const body = `$${Math.round(Math.abs(n)).toLocaleString('en-AU')}`;
  return n < 0 ? `-${body}` : body;
}

/** "14 Nov 2026". */
export function dateText(d: DateParts): string {
  return `${d.date} ${MONTHS[d.month]} ${d.year}`;
}

/** "14 Nov", for a range inside one year. */
export function shortDate(d: DateParts): string {
  return `${d.date} ${MONTHS[d.month]}`;
}

/** "5:02 am". Minutes after midnight. */
export function clockText(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** "45 min", "1 h 20 min", "3 h". */
export function durationText(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

/**
 * The daylight note: light, not a countdown. About so many hours, to the
 * nearest hour, and plain words when there is little left.
 */
export function lightNote(leftMin: number, evening: boolean): string {
  if (evening) return 'Not enough light left for a job today';
  if (leftMin >= 90) return `About ${Math.round(leftMin / 60)} h of light left`;
  if (leftMin >= 45) return 'About an hour of light left';
  return 'A little light left';
}

/** Whole numbers with thousands separators: "4,150". */
export function num(n: number, places = 0): string {
  return n.toLocaleString('en-AU', {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  });
}

/** A signed difference: "+120", "-3", "no change". */
export function delta(before: number, after: number, places = 0): string {
  const d = Math.round((after - before) * 10 ** places) / 10 ** places;
  if (d === 0) return 'no change';
  return `${d > 0 ? '+' : '-'}${num(Math.abs(d), places)}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${num(n)} ${n === 1 ? one : many}`;
}

/** What a job card says, as short facts: time, cost, and the light left after it. */
export function cardLines(card: JobCardWire): string[] {
  const lines: string[] = [];
  lines.push(
    card.outcome === 'free' ? 'Takes none of the day.' : `Takes ${durationText(card.workMin)}.`,
  );
  if (card.cost < 0) lines.push(`Pays ${money(-card.cost)}.`);
  else if (card.cost === 0) lines.push('No cost.');
  else lines.push(`Costs ${money(card.cost)}.`);
  if (card.outcome !== 'free') {
    lines.push(
      card.usesRestOfDay
        ? 'This would use up your full day.'
        : `About ${durationText(card.leftAfterMin)} of light left after.`,
    );
  }
  if (card.outcome === 'part') lines.push('Only part of it fits today.');
  return [...lines, ...card.notes];
}
