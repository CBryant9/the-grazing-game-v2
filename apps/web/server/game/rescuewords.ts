import 'server-only';

/**
 * The stock sale of a paid rescue as a fact, by case (m7.1): "1 head was sold", "N head of stock
 * were sold", "to pay the debt" only when there was a debt, or that there was no stock to sell.
 * `tense` picks the diary's past ("were sold for") or the offer card's future ("will be sold at
 * today's prices for", what the stock fetches today). The diary line and the offer card both use
 * it, so they say the same thing.
 */
export function rescueSaleWords(
  head: number,
  value: number,
  debt: boolean,
  tense: 'were' | 'will be',
): string {
  const money = (n: number): string => `$${Math.round(n).toLocaleString('en-AU')}`;
  if (head <= 0) {
    return tense === 'were' ? 'There was no stock to sell.' : 'There is no stock to sell.';
  }
  const verb = head === 1 ? (tense === 'were' ? 'was' : 'will be') : tense;
  const who = head === 1 ? '1 head' : `${head.toLocaleString('en-AU')} head of stock`;
  const when = tense === 'will be' ? " at today's prices" : '';
  return `${who} ${verb} sold${when} for ${money(value)}${debt ? ' to pay the debt' : ''}.`;
}
