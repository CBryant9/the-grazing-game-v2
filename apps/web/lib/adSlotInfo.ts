import type { AdSlotId } from '@gg/shared';
import type { SiteSwitchKey } from './site';

/**
 * What the Advertise page says about each in-house ad slot. The places,
 * formats and behaviour are PRD 10.1, shortened. Nothing here is a price or an
 * audience figure: the PRD gives no rate card, and there is no audience yet.
 *
 * `needs` is the switch for the part of the game the slot sits in. A slot is
 * listed only when that part is switched on, so the page never describes a
 * place that does not exist yet (the page's own switches are in lib/site.ts).
 */
export type AdSlotInfo = {
  where: string;
  format: string;
  behaviour: string;
  needs: SiteSwitchKey | null;
};

export const AD_SLOT_INFO = {
  pc_farm_rail: {
    where: 'Farm page on PC, in a rail left of the map (wide screens)',
    format: 'Up to 3 cards: image, logo, name, one line and a link',
    behaviour: 'Always visible when on',
    needs: null,
  },
  pc_community_side: {
    where: 'Community page on PC, right column',
    format: 'Up to 3 cards, plus an "Advertise here" card',
    behaviour: 'Always visible when on',
    needs: 'community',
  },
  pc_profile_side: {
    where: 'Profile page on PC, right column',
    format: '1 card',
    behaviour: 'Always visible when on',
    needs: 'community',
  },
  pc_leaderboard_banner: {
    where: 'Leaderboard on PC, above the table',
    format: '1 wide banner',
    behaviour: 'Always visible when on',
    needs: 'leaderboards',
  },
  phone_banner: {
    where: 'Phone, a thin strip above the bottom bar',
    format: '320 by 50 image or text',
    behaviour:
      'Shows now and then for 30 to 60 seconds, then hides. Has a close button. Never covers a confirm button',
    needs: null,
  },
  pc_banner: {
    where: 'PC, a thin strip under the map',
    format: '728 by 90',
    behaviour: 'Same rules as the phone banner',
    needs: null,
  },
  video_between_days: {
    where: 'Fast Farm, after Next day or a skip',
    format: 'Video up to 30 seconds',
    behaviour: 'Skippable after 5 seconds. Capped, so it is not shown every day',
    needs: 'video_ads',
  },
  video_between_years: {
    where: 'After the year-end summary',
    format: 'Video up to 30 seconds',
    behaviour: 'Skippable after 5 seconds',
    needs: 'video_ads',
  },
  video_daily_summary: {
    where: 'Daily Farm, on the morning catch-up summary',
    format: 'Video up to 30 seconds',
    behaviour: 'Once a day at most',
    needs: 'daily_farm',
  },
  summary_sponsor_card: {
    where: 'End of day and end of year summaries',
    format: 'A card: "This season brought to you by..."',
    behaviour: 'Always when on',
    needs: null,
  },
  feed_sponsored: {
    where: 'Community feed',
    format: 'A post-style card marked Sponsored',
    behaviour: 'Every few posts',
    needs: 'feed_posts',
  },
  challenge_sponsor: {
    where: 'Challenge and league pages, and the home page announcement bar',
    format: 'Logo and name',
    behaviour: 'Per challenge',
    needs: 'community',
  },
  landing_sponsors: {
    where: 'Home page, a logo strip near the bottom',
    format: 'Logos',
    behaviour: 'Always when on',
    needs: null,
  },
} as const satisfies Record<AdSlotId, AdSlotInfo>;
