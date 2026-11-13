/**
 * Shared, browser-safe constants and types.
 *
 * Nothing in this package may reveal game rules. Job times, costs, growth
 * figures and every other number the simulation runs on live in
 * `@gg/engine`, which runs on the server only (PRD 5.16).
 */

/** Mode names live here so they can be renamed everywhere at once (PRD 21, row 1). */
export const MODES = {
  daily: { id: 'daily', name: 'Daily Farm' },
  fast: { id: 'fast', name: 'Fast Farm' },
} as const;
export type ModeId = keyof typeof MODES;

/** The four launch districts (PRD v1.1, section 1A). Display details only. */
export const DISTRICTS = {
  cq: { id: 'cq', name: 'Central Queensland', town: 'Emerald', state: 'QLD' },
  nsw: { id: 'nsw', name: 'Northern Tablelands NSW', town: 'Armidale', state: 'NSW' },
  cw: { id: 'cw', name: 'Central West NSW', town: 'Dubbo', state: 'NSW' },
  wv: { id: 'wv', name: 'Western Victoria', town: 'Hamilton', state: 'VIC' },
} as const;
export type DistrictId = keyof typeof DISTRICTS;
export const DISTRICT_IDS = Object.keys(DISTRICTS) as DistrictId[];

/** Farms per account (PRD 5.5). The server enforces these; this is for display. */
export const FARM_LIMITS = {
  guest: { daily: 0, fast: 1 },
  free: { daily: 2, fast: 2 },
  pack: { daily: 5, fast: 5 },
} as const;

/** Minimum ages (PRD 8.3, v1.1). */
export const MIN_ACCOUNT_AGE = 14;
export const MIN_COMMUNITY_AGE = 16;

/** Neutral paddock labels. Describe, never judge (REQUIREMENTS: Wording). */
export const PADDOCK_LABELS = {
  green: { id: 'green', name: 'Green', colour: '#7fe05a' },
  mixed: { id: 'mixed', name: 'Mixed', colour: '#f0b43a' },
  rank: { id: 'rank', name: 'Dry & rank', colour: '#e0a860' },
  short: { id: 'short', name: 'Short', colour: '#ec6a48' },
} as const;
export type PaddockLabelId = keyof typeof PADDOCK_LABELS;

/** Ad slot IDs (PRD 10.1). Every slot is off by default. */
export const AD_SLOTS = [
  'pc_farm_rail',
  'pc_community_side',
  'pc_profile_side',
  'pc_leaderboard_banner',
  'phone_banner',
  'pc_banner',
  'video_between_days',
  'video_between_years',
  'video_daily_summary',
  'summary_sponsor_card',
  'feed_sponsored',
  'challenge_sponsor',
  'landing_sponsors',
] as const;
export type AdSlotId = (typeof AD_SLOTS)[number];

/** Feature switches and their launch defaults (PRD 11.7). */
export const FEATURE_SWITCHES = {
  signups_open: true,
  daily_farm: true,
  fast_farm: true,
  community: false,
  feed_posts: false,
  groups: false,
  activity_ticker: false,
  farm_viewing: false,
  leaderboards: true,
  ads: false,
  video_ads: false,
  banner_ads: false,
  adsense: false,
  purchases: false,
  push_notifications: true,
  maintenance_mode: false,
} as const;
export type FeatureSwitchKey = keyof typeof FEATURE_SWITCHES;

export const SITE = {
  name: 'The Grazing Game',
  tagline: 'Run a real grazing business. One day at a time.',
  description:
    'A free, realistic grazing game for Australian graziers. Real seasons, real prices, real decisions about grass and stock. Play on your phone or PC.',
  locale: 'en-AU',
} as const;

// The farm view: the numbers the server sends the map to draw (PRD 5.16).
export {
  FARM_GRID_H,
  FARM_GRID_N,
  FARM_GRID_W,
  FARM_VIEW_VERSION,
  VIEW_FENCE,
  VIEW_LABELS,
  VIEW_LAND,
} from './farmView';
export type {
  FarmView,
  FarmViewArea,
  FarmViewBuilding,
  FarmViewCattle,
  FarmViewFences,
  FarmViewGate,
  FarmViewJob,
  FarmViewMob,
  FarmViewPaddock,
  FarmViewPart,
  FarmViewPlanting,
  FarmViewSquares,
  FarmViewSward,
  FarmViewTrough,
  FarmViewWater,
  ViewBuildingKind,
  ViewCattleKind,
  ViewEdge,
  ViewFence,
  ViewGateKind,
  ViewLand,
  ViewPlantingKind,
  ViewPlantingStage,
} from './farmView';
