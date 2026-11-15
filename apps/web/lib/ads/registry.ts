import { AD_SLOTS, type AdSlotId } from '@gg/shared';

/**
 * The slot registry (PRD 10.1): every ad slot, the screen it belongs to, its sizes in each layout,
 * the switches it needs, and what it may show. It is the one place that knows which slots can
 * share a screen, so "never two ad units on one phone screen" is enforced here and nowhere else.
 *
 * Plain data and plain functions, no game rules, safe for the browser. The slot ids come from
 * `@gg/shared`; this file adds the places and sizes.
 */

export type AdLayout = 'phone' | 'landscape' | 'pc';

/**
 * The screens an ad can sit on. A screen is what the player sees at one moment: the farm, the
 * day summary over it, the year end card over it, a website page.
 */
export type AdScreen =
  | 'farm'
  | 'day_summary'
  | 'year_end'
  | 'daily_summary'
  | 'community'
  | 'profile'
  | 'leaderboard'
  | 'challenge'
  | 'home';

/** What the slot draws. */
export type AdShape = 'banner' | 'cards' | 'card' | 'video' | 'post' | 'logos';

/** Which kinds of creative a slot can show. */
export type CreativeKind = 'image' | 'video' | 'text' | 'logo';

export interface AdSize {
  w: number;
  h: number;
}

export interface SlotDef {
  id: AdSlotId;
  /** The screens the slot can be placed on. */
  screens: readonly AdScreen[];
  shape: AdShape;
  /** What the admin sees. */
  label: string;
  /** Size per layout (CSS pixels). `null`: the slot never shows in that layout. */
  sizes: Record<AdLayout, AdSize | null>;
  /** Cards a slot may show at once (cards, logos). */
  maxItems: number;
  kinds: readonly CreativeKind[];
  /** The extra feature switch the slot needs besides the master `ads` switch. */
  needs: 'banner_ads' | 'video_ads' | null;
  /**
   * Shown for a short time, then hidden, with a close button and a cap (the banners). The
   * player's own close is remembered for the visit.
   */
  timed: boolean;
  /** A video break (the player built here, never autoplaying with sound). */
  video: boolean;
  /**
   * A server-rendered public page may show it with no script. Public pages send no script, so a
   * slot there must be plain markup. Views can not be measured without a script, so such a slot
   * counts clicks only.
   */
  publicPage: boolean;
  /**
   * Whether a place for it exists in this build. `false`: the screen is not built yet (the
   * community, profile, leaderboard and challenge pages) or the slot's rule needs something the
   * server must not read (see the log). The slot is still switched on or off and given
   * campaigns in admin, and the page that gets built adds one `<AdSlot id=... />`.
   */
  placed: boolean;
  /** Why it is not placed, in words for the admin. */
  notPlacedWhy?: string;
  /** Lower wins when two slots could share one phone screen. */
  priority: number;
}

const NONE = null;

/** Sizes are the reserved box. The creative fits it (`object-fit: cover`), so a slot never jumps. */
export const SLOTS: Record<AdSlotId, SlotDef> = {
  pc_farm_rail: {
    id: 'pc_farm_rail',
    screens: ['farm'],
    shape: 'cards',
    label: 'Farm page, left rail (PC)',
    sizes: { phone: NONE, landscape: NONE, pc: { w: 232, h: 168 } },
    maxItems: 3,
    kinds: ['image', 'text', 'logo'],
    needs: null,
    timed: false,
    video: false,
    publicPage: false,
    placed: true,
    priority: 5,
  },
  pc_community_side: {
    id: 'pc_community_side',
    screens: ['community'],
    shape: 'cards',
    label: 'Community page, right column (PC)',
    sizes: { phone: NONE, landscape: NONE, pc: { w: 300, h: 168 } },
    maxItems: 3,
    kinds: ['image', 'text', 'logo'],
    needs: null,
    timed: false,
    video: false,
    publicPage: false,
    // m6 join: placed now the page exists (the community pages).
    placed: true,
    priority: 5,
  },
  pc_profile_side: {
    id: 'pc_profile_side',
    screens: ['profile'],
    shape: 'card',
    label: 'Profile page, right column (PC)',
    sizes: { phone: NONE, landscape: NONE, pc: { w: 300, h: 168 } },
    maxItems: 1,
    kinds: ['image', 'text', 'logo'],
    needs: null,
    timed: false,
    video: false,
    publicPage: false,
    // m6 join: placed now the page exists (the community pages).
    placed: true,
    priority: 5,
  },
  pc_leaderboard_banner: {
    id: 'pc_leaderboard_banner',
    screens: ['leaderboard'],
    shape: 'banner',
    label: 'Leaderboard, wide banner (PC)',
    sizes: { phone: NONE, landscape: NONE, pc: { w: 728, h: 90 } },
    maxItems: 1,
    kinds: ['image', 'text'],
    needs: null,
    timed: false,
    video: false,
    publicPage: false,
    placed: false,
    notPlacedWhy:
      'The leaderboard page is a public page that sends no script (PRD 14.10), and a slot needs script to choose and count. It needs a decision from Claudia.',
    priority: 5,
  },
  phone_banner: {
    id: 'phone_banner',
    screens: ['farm'],
    shape: 'banner',
    label: 'Phone banner above the tool bar',
    // Upright only. A phone on its side shows no ad over the map (PRD 10.1).
    sizes: { phone: { w: 320, h: 50 }, landscape: NONE, pc: NONE },
    maxItems: 1,
    kinds: ['image', 'text'],
    needs: 'banner_ads',
    timed: true,
    video: false,
    publicPage: false,
    placed: true,
    priority: 1,
  },
  pc_banner: {
    id: 'pc_banner',
    screens: ['farm'],
    shape: 'banner',
    label: 'PC banner under the map',
    sizes: { phone: NONE, landscape: NONE, pc: { w: 728, h: 90 } },
    maxItems: 1,
    kinds: ['image', 'text'],
    needs: 'banner_ads',
    timed: true,
    video: false,
    publicPage: false,
    placed: true,
    priority: 1,
  },
  video_between_days: {
    id: 'video_between_days',
    screens: ['day_summary'],
    shape: 'video',
    label: 'Video between days (Fast Farm)',
    sizes: {
      phone: { w: 356, h: 200 },
      landscape: { w: 356, h: 200 },
      pc: { w: 356, h: 200 },
    },
    maxItems: 1,
    kinds: ['video'],
    needs: 'video_ads',
    timed: false,
    video: true,
    publicPage: false,
    placed: false,
    notPlacedWhy:
      'Its cap counts game days, and choosing an ad must never read the farm. It needs a decision from Claudia.',
    priority: 0,
  },
  video_between_years: {
    id: 'video_between_years',
    screens: ['year_end'],
    shape: 'video',
    label: 'Video between years',
    sizes: {
      phone: { w: 356, h: 200 },
      landscape: { w: 356, h: 200 },
      pc: { w: 356, h: 200 },
    },
    maxItems: 1,
    kinds: ['video'],
    needs: 'video_ads',
    timed: false,
    video: true,
    publicPage: false,
    placed: true,
    priority: 0,
  },
  video_daily_summary: {
    id: 'video_daily_summary',
    screens: ['daily_summary'],
    shape: 'video',
    label: 'Video on the Daily Farm catch-up',
    sizes: {
      phone: { w: 356, h: 200 },
      landscape: { w: 356, h: 200 },
      pc: { w: 356, h: 200 },
    },
    maxItems: 1,
    kinds: ['video'],
    needs: 'video_ads',
    timed: false,
    video: true,
    publicPage: false,
    // m6: on the Daily Farm catch-up ("While you were away"), which holds its button for the break.
    placed: true,
    priority: 0,
  },
  summary_sponsor_card: {
    id: 'summary_sponsor_card',
    screens: ['day_summary', 'year_end'],
    shape: 'card',
    label: 'Sponsor card on the day and year summaries',
    sizes: {
      phone: { w: 356, h: 120 },
      landscape: { w: 356, h: 120 },
      pc: { w: 356, h: 120 },
    },
    maxItems: 1,
    kinds: ['image', 'text', 'logo'],
    needs: null,
    timed: false,
    video: false,
    publicPage: false,
    placed: true,
    priority: 2,
  },
  feed_sponsored: {
    id: 'feed_sponsored',
    screens: ['community'],
    shape: 'post',
    label: 'Sponsored post in the feed',
    sizes: {
      phone: { w: 324, h: 120 },
      landscape: NONE,
      pc: { w: 560, h: 130 },
    },
    maxItems: 1,
    kinds: ['image', 'text'],
    needs: null,
    timed: false,
    video: false,
    publicPage: false,
    // m6 join: placed now the page exists (the community pages).
    placed: true,
    priority: 3,
  },
  challenge_sponsor: {
    id: 'challenge_sponsor',
    screens: ['challenge'],
    shape: 'logos',
    label: 'Challenge and league sponsor',
    sizes: {
      phone: { w: 160, h: 48 },
      landscape: NONE,
      pc: { w: 160, h: 48 },
    },
    maxItems: 1,
    kinds: ['logo', 'image'],
    needs: null,
    timed: false,
    video: false,
    publicPage: false,
    // m6 join: placed now the page exists (the community pages).
    placed: true,
    priority: 4,
  },
  landing_sponsors: {
    id: 'landing_sponsors',
    screens: ['home'],
    shape: 'logos',
    label: 'Home page logo strip',
    sizes: {
      phone: { w: 120, h: 48 },
      landscape: { w: 120, h: 48 },
      pc: { w: 120, h: 48 },
    },
    maxItems: 5,
    kinds: ['logo'],
    needs: null,
    timed: false,
    video: false,
    publicPage: true,
    placed: false,
    notPlacedWhy:
      'The home page is built ahead, sends no script and reads no database. A logo strip there would make it a page that rebuilds, which is a decision for Claudia.',
    priority: 0,
  },
};

export const SLOT_IDS: readonly AdSlotId[] = AD_SLOTS;

export function isSlotId(v: unknown): v is AdSlotId {
  return typeof v === 'string' && (AD_SLOTS as readonly string[]).includes(v);
}

/** Screens that open over another and cover it, so the ads under them are not on screen. */
const MODAL: readonly AdScreen[] = ['year_end', 'day_summary', 'daily_summary'];

/** Layouts where one ad unit at a time is the rule: a phone upright or on its side. */
export const ONE_AT_A_TIME: readonly AdLayout[] = ['phone', 'landscape'];

/** Does this slot show at all in this layout? */
export const slotFits = (id: AdSlotId, layout: AdLayout): boolean =>
  SLOTS[id].sizes[layout] !== null;

/**
 * Of the slots mounted right now, the ones that may be on screen.
 *
 * 1. A slot with no size in this layout is out.
 * 2. While a summary or the year end card is open it covers the farm, so ads under it are out.
 * 3. On a phone (upright or on its side) only one is left: the one with the lowest priority
 *    number. This is the single rule for "never two ad units on one phone screen".
 *
 * On a PC more than one may show (the rail and the banner), as the mockups draw it.
 */
export function visibleSlots(
  mounted: readonly { id: AdSlotId; screen: AdScreen }[],
  layout: AdLayout,
): AdSlotId[] {
  let live = mounted.filter((m) => slotFits(m.id, layout));
  if (live.some((m) => MODAL.includes(m.screen))) {
    live = live.filter((m) => MODAL.includes(m.screen));
  }
  if (!ONE_AT_A_TIME.includes(layout)) return live.map((m) => m.id);
  const best = [...live].sort((a, b) => SLOTS[a.id].priority - SLOTS[b.id].priority)[0];
  return best ? [best.id] : [];
}
