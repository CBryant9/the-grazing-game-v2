/**
 * Prices and pack contents for the Pricing page. Every figure comes from
 * PRD section 10.3 and nowhere else (PRD 21, rows 29 and 30). lib/pricing.test.ts
 * checks each one against the PRD's words.
 *
 * All prices are Australian dollars with GST included. Where the PRD says
 * "about", `about` is true and the page says "about". `null` is a price the
 * PRD marks Open: the page says "To be set" and shows no figure.
 * Nothing here is shown while the `purchases` switch is off.
 */
export type Price = { amount: number | null; about: boolean };

export const PRICES = {
  /** PRD 10.3: "Farm pack, about A$30, one-off: 5 of each farm, plus perks." */
  farmPack: { amount: 30, about: true },
  /** PRD 10.3: "Farm pack with no ads, about A$50, one-off". */
  farmPackNoAds: { amount: 50, about: true },
  /** PRD 10.3, Proposed: "A$20 to upgrade from the first pack." */
  upgradeToNoAds: { amount: 20, about: false },
  /** PRD 10.3: "Fast Farm: A$5." */
  keepGoingFast: { amount: 5, about: false },
  /**
   * PRD 10.3: "about A$25 at 6 months, A$50 at 1 year, A$100 over 2 years.
   * [Open] the price under 6 months (A$15 until set)." The Open price is not
   * shown: the page says it is to be set.
   */
  keepGoingDaily: [
    { label: 'Under 6 months', price: { amount: null, about: false } },
    { label: '6 months', price: { amount: 25, about: true } },
    { label: '1 year', price: { amount: 50, about: false } },
    { label: 'Over 2 years', price: { amount: 100, about: false } },
  ],
} as const satisfies {
  farmPack: Price;
  farmPackNoAds: Price;
  upgradeToNoAds: Price;
  keepGoingFast: Price;
  keepGoingDaily: readonly { label: string; price: Price }[];
};

/** PRD 10.3, Proposed: what a pack's "perks" are. */
export const PACK_PERKS = [
  'Full diary history',
  'Extra charts',
  'A supporter badge',
  'Early access to new districts',
] as const;

/** "A$30", "About A$30", or "To be set" when the PRD leaves the price open. */
export function priceText(price: Price): string {
  if (price.amount === null) return 'To be set';
  return `${price.about ? 'About ' : ''}A$${price.amount}`;
}
