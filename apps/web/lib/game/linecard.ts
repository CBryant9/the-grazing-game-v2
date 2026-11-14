import { aboutTime, money, num } from './format';
import type { JobCardWire } from './types';

/**
 * The facts on the card beside a line of fence, tape or pipe, as short
 * lines: the length, the cost, the time (lightly), and what does not fit
 * today. The words about the part that does not fit come from the server.
 */
export interface LineFacts {
  /** "650 m". The whole line as drawn. */
  length: string;
  /** "Costs $2,340." For a line cut short, what the part that fits costs. */
  cost: string;
  /** "Takes about 3 h." */
  time: string;
  /** What the server says about the part that does not fit. Empty when all of it fits. */
  notFit: string[];
  /** "This would use up your full day." or null. */
  fullDay: string | null;
  /** The metres that fit and the metres that do not. */
  fitsM: number;
  lateM: number;
  /** True when nothing can be built: the Build button is off. */
  nothingFits: boolean;
}

/** Facts for a line card, or null if the card carries no line. */
export function lineFacts(card: JobCardWire): LineFacts | null {
  const l = card.line;
  if (!l) return null;
  const fitsM = l.fits.metres;
  const lateM = l.doesNotFit.metres;
  const part = lateM > 0;
  return {
    length: `${num(fitsM + lateM)} m`,
    cost:
      card.costToday < 0 || card.cost < 0
        ? `Pays ${money(-Math.min(card.cost, card.costToday))}.`
        : card.costToday === 0 && card.cost === 0
          ? 'No cost.'
          : `Costs ${money(part ? card.costToday : card.cost)}${part ? ' for the part that fits' : ''}.`,
    time: `Takes ${aboutTime(card.workMin)}.`,
    notFit: l.words,
    fullDay: card.usesRestOfDay ? 'This would use up your full day.' : null,
    fitsM,
    lateM,
    nothingFits: fitsM <= 0,
  };
}
