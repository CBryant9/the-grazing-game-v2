import 'server-only';
import type { FeatureSwitchKey } from '@gg/shared';

/**
 * What each feature switch is, in plain words, for the admin screen (PRD 11.7). Typed on
 * `FeatureSwitchKey`, so adding a shared key without a line here fails the type check, and a test
 * checks the screen lists exactly the shared keys.
 *
 * `rebuild`: the public website pages read this switch when the site is built (`SITE_SWITCHES_ON`,
 * lib/site.ts), so changing it here does not change those pages until the site is built again.
 * The game and account routes read the live switch.
 */
export interface SwitchInfo {
  label: string;
  /** What the switch controls. */
  what: string;
  /** What turning it on does to players. */
  whenOn: string;
  /** What turning it off does to players. */
  whenOff: string;
  rebuild: boolean;
}

export const SWITCH_INFO: Record<FeatureSwitchKey, SwitchInfo> = {
  signups_open: {
    label: 'Sign-ups open',
    what: 'Whether new people can make an account.',
    whenOn: 'New people can make an account.',
    whenOff: 'New people can not make an account. Players who already have one are not affected.',
    rebuild: true,
  },
  daily_farm: {
    label: 'Daily Farm',
    what: 'The Daily Farm mode, which moves one day for each real day.',
    whenOn: 'Players can start and keep a Daily Farm.',
    whenOff: 'Players can not start a Daily Farm. Farms already going are kept.',
    rebuild: true,
  },
  fast_farm: {
    label: 'Fast Farm',
    what: 'The Fast Farm mode, which a player moves along as quickly as they like.',
    whenOn: 'Players and guests can start and play a Fast Farm.',
    whenOff: 'Players and guests can not start a Fast Farm. Farms already going are kept.',
    rebuild: false,
  },
  community: {
    label: 'Community (master)',
    what: 'The whole community: profiles seen by others, the feed, groups and farm viewing.',
    whenOn: 'Members 16 and over can use the community parts that are also switched on.',
    whenOff: 'Nobody can use the community. Nothing is deleted.',
    rebuild: true,
  },
  feed_posts: {
    label: 'Feed and posts',
    what: 'Posts, comments and likes. Needs the community switch as well.',
    whenOn: 'Members can post and comment.',
    whenOff: 'Members can not post or comment. Existing posts are kept but not shown.',
    rebuild: false,
  },
  groups: {
    label: 'Groups',
    what: 'Groups and their posts. Needs the community switch as well.',
    whenOn: 'Members can join and make groups.',
    whenOff: 'Members can not use groups. Nothing is deleted.',
    rebuild: false,
  },
  activity_ticker: {
    label: 'Activity ticker',
    what: 'The ticker of what other members are doing. Needs the community switch as well.',
    whenOn: 'Members who opted in appear in the ticker, and members see it.',
    whenOff: 'The ticker is not shown to anyone.',
    rebuild: false,
  },
  farm_viewing: {
    label: 'Farm viewing by others',
    what: 'Looking at another member’s farm, where their privacy setting allows it.',
    whenOn: 'Members can look at farms whose owners allow it.',
    whenOff: 'Nobody can look at another member’s farm.',
    rebuild: false,
  },
  leaderboards: {
    label: 'Leaderboards',
    what: 'The public leaderboards.',
    whenOn: 'Anyone can see the leaderboards.',
    whenOff: 'The leaderboards are hidden from everyone. Scores are still kept.',
    rebuild: true,
  },
  ads: {
    label: 'Ads (master)',
    what: 'All ads. Each ad slot also has its own switch.',
    whenOn: 'Ads can show in the slots that are switched on.',
    whenOff: 'No ads show anywhere.',
    rebuild: true,
  },
  video_ads: {
    label: 'Video ads',
    what: 'The video ad slots between days and years. Needs the ads switch as well.',
    whenOn: 'Video ads can show between days and years.',
    whenOff: 'No video ads show.',
    rebuild: false,
  },
  banner_ads: {
    label: 'Banner ads',
    what: 'The banner and side ad slots. Needs the ads switch as well.',
    whenOn: 'Banner and side ads can show.',
    whenOff: 'No banner or side ads show.',
    rebuild: false,
  },
  adsense: {
    label: 'Google AdSense',
    what: 'Ads served by Google AdSense in the slots that allow it.',
    whenOn: 'AdSense ads can fill the slots that allow them.',
    whenOff: 'AdSense does not load.',
    rebuild: false,
  },
  purchases: {
    label: 'Purchases',
    what: 'Buying the farm pack and other one-off purchases.',
    whenOn: 'Players can buy products.',
    whenOff: 'Players can not buy anything. What they already bought stays theirs.',
    rebuild: true,
  },
  push_notifications: {
    label: 'Push notifications',
    what: 'Notifications sent to a phone or computer.',
    whenOn: 'Players who turned them on get notifications.',
    whenOff: 'No notifications are sent. The in-game inbox still works.',
    rebuild: false,
  },
  maintenance_mode: {
    label: 'Maintenance mode',
    what: 'Puts the game into a “down for maintenance” state while you work on it.',
    whenOn:
      'Players and guests see the maintenance message and can not play. Their farms are safe. Admins can still play.',
    whenOff: 'The game opens again for everyone.',
    rebuild: false,
  },
};

/**
 * The wordings the admin chooses from for maintenance mode. A fixed set, so no free text ever
 * goes to a player's browser. Each starts with the same plain sentence.
 */
export const MAINTENANCE_WORDINGS = [
  {
    id: 'short',
    label: 'Short',
    text: 'The game is down for maintenance. Your farm is safe.',
  },
  {
    id: 'update',
    label: 'Updating',
    text: 'The game is down for maintenance. Your farm is safe. We are updating the game and it will be back soon.',
  },
  {
    id: 'longer',
    label: 'Longer job',
    text: 'The game is down for maintenance. Your farm is safe. This one takes a while, so please try again later today.',
  },
] as const;
export type MaintenanceWordingId = (typeof MAINTENANCE_WORDINGS)[number]['id'];
export const DEFAULT_MAINTENANCE_WORDING: MaintenanceWordingId = 'short';
export const MAINTENANCE_SETTING = 'maintenance_wording';

/** Suspension lengths the admin chooses from, in days. */
export const SUSPEND_DAYS = [1, 3, 7, 14, 30] as const;
