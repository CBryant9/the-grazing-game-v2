import { describe, expect, it } from 'vitest';
import { PACK_PERKS, PRICES, priceText } from './pricing';

/*
 * The Pricing page may only show what PRD 10.3 says. The figures below are
 * written out here from the PRD's own words, with the line they come from, so
 * a change to lib/pricing.ts that does not match the PRD fails this test.
 */
describe('prices match PRD 10.3', () => {
  it('Farm pack: "about A$30, one-off" (PRD line 607)', () => {
    expect(PRICES.farmPack).toEqual({ amount: 30, about: true });
  });

  it('Farm pack with no ads: "about A$50, one-off" (PRD line 608)', () => {
    expect(PRICES.farmPackNoAds).toEqual({ amount: 50, about: true });
  });

  it('Upgrade: "A$20 to upgrade from the first pack" (PRD line 608, Proposed)', () => {
    expect(PRICES.upgradeToNoAds).toEqual({ amount: 20, about: false });
  });

  it('Perks: full diary history, extra charts, a supporter badge, early access (PRD line 609)', () => {
    expect([...PACK_PERKS]).toEqual([
      'Full diary history',
      'Extra charts',
      'A supporter badge',
      'Early access to new districts',
    ]);
  });

  it('Keep going, Fast Farm: "A$5" (PRD line 613)', () => {
    expect(PRICES.keepGoingFast).toEqual({ amount: 5, about: false });
  });

  it('Keep going, Daily Farm: "about A$25 at 6 months, A$50 at 1 year, A$100 over 2 years" (PRD line 614)', () => {
    const byLabel = Object.fromEntries(PRICES.keepGoingDaily.map((r) => [r.label, r.price]));
    expect(byLabel['6 months']).toEqual({ amount: 25, about: true });
    expect(byLabel['1 year']).toEqual({ amount: 50, about: false });
    expect(byLabel['Over 2 years']).toEqual({ amount: 100, about: false });
  });

  it('shows no figure for the price the PRD marks Open (under 6 months, PRD line 614)', () => {
    const open = PRICES.keepGoingDaily.find((r) => r.label === 'Under 6 months');
    expect(open?.price.amount).toBeNull();
    expect(priceText(open!.price)).toBe('To be set');
  });

  it('has no other figures: every priced row is one of the PRD amounts', () => {
    const all: (number | null)[] = [
      PRICES.farmPack.amount,
      PRICES.farmPackNoAds.amount,
      PRICES.upgradeToNoAds.amount,
      PRICES.keepGoingFast.amount,
      ...PRICES.keepGoingDaily.map((r) => r.price.amount),
    ];
    const amounts = all.flatMap((a) => (a === null ? [] : [a]));
    expect(amounts.sort((a, b) => a - b)).toEqual([5, 20, 25, 30, 50, 50, 100]);
  });

  it('says "About" only where the PRD does', () => {
    expect(priceText(PRICES.farmPack)).toBe('About A$30');
    expect(priceText(PRICES.keepGoingFast)).toBe('A$5');
  });
});
