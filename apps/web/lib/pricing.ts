/**
 * Prices and pack contents for the Pricing page. Every figure comes from
 * PRD section 10.3 and nowhere else (PRD 21, rows 29 and 30).
 *
 * All prices are Australian dollars with GST included, and "about" until they
 * are set in Stripe and admin (milestone 5.2). Nothing here is shown while the
 * `purchases` switch is off.
 */
export const PRICES = {
  /** PRD 10.3: "Farm pack, about A$30, one-off: 5 of each farm, plus perks." */
  farmPack: 30,
  /** PRD 10.3: "Farm pack with no ads, about A$50, one-off". */
  farmPackNoAds: 50,
  /** PRD 10.3, Proposed: "A$20 to upgrade from the first pack." */
  upgradeToNoAds: 20,
  /** PRD 10.3: Fast Farm, paying to keep going. */
  keepGoingFast: 5,
  /** PRD 10.3: Daily Farm, by how long the farm has run. */
  keepGoingDaily: [
    { label: 'Under 6 months', price: 15 },
    { label: '6 months', price: 25 },
    { label: '1 year', price: 50 },
    { label: 'Over 2 years', price: 100 },
  ],
} as const;

/** PRD 10.3, Proposed: what a pack's "perks" are. */
export const PACK_PERKS = [
  'Full diary history',
  'Extra charts',
  'A supporter badge',
  'Early access to new districts',
] as const;

export function dollars(amount: number): string {
  return `A$${amount}`;
}
