/**
 * Analytics: the fixed list of event names and the fixed property keys each may carry (PRD 12,
 * milestone 5.3). Nothing else is ever counted or sent. A property is either one of a fixed set
 * of words or a whole number in a range, so no free text, email, username or address can ride
 * along. The server checks every event against this list and refuses anything not on it.
 *
 * Nothing is counted for a person until they say yes on the consent control. Under 16: never.
 */

/** A property is a fixed word from a list, or a whole number from `min` to `max`. */
export type PropSpec = readonly string[] | { readonly min: number; readonly max: number };

const MODE = ['daily', 'fast'] as const;
const DISTRICT = ['cq', 'nsw', 'cw', 'wv'] as const;

/**
 * The pages of the app (not the public website) that may report a page view or Web Vitals.
 * The public website sends no script at all; its views are counted on the server.
 */
export const APP_PAGES = [
  'play',
  'account',
  'account_notifications',
  'store',
  'purchase_success',
  'purchase_cancelled',
] as const;
export type AppPageId = (typeof APP_PAGES)[number];

/** The public website pages whose views the server counts, with no cookie and no identifier. */
export const PUBLIC_PAGES = {
  '/': 'home',
  '/about': 'about',
  '/advertise': 'advertise',
  '/pricing': 'pricing',
  '/privacy': 'privacy',
  '/terms': 'terms',
  '/community-rules': 'community_rules',
  '/leaderboards': 'leaderboards',
} as const;
export type PublicPageId = (typeof PUBLIC_PAGES)[keyof typeof PUBLIC_PAGES];

/** The Web Vitals the small collector reports (PRD 14.10). */
export const WEB_VITALS = ['LCP', 'CLS', 'INP'] as const;
export type WebVital = (typeof WEB_VITALS)[number];

/**
 * Every event, with the property keys it may carry. `browser: true` marks the few the browser
 * may send to `/api/collect`; every other one is only ever recorded by the server where the
 * thing happened, so a browser can not invent a sign-up or a purchase.
 */
export const ANALYTICS_EVENTS = {
  page_view: { browser: true, props: { page: APP_PAGES } },
  web_vital: {
    browser: true,
    // LCP and INP in milliseconds. CLS times 1000 (a CLS of 0.05 is sent as 50).
    props: { page: APP_PAGES, metric: WEB_VITALS, value: { min: 0, max: 600_000 } },
  },
  pwa_installed: { browser: true, props: {} },
  // A public website page, counted by the server with no cookie and no identifier. Never sent on.
  website_view: {
    browser: false,
    props: {
      page: [
        'home',
        'about',
        'advertise',
        'pricing',
        'privacy',
        'terms',
        'community_rules',
        'leaderboards',
      ],
    },
  },
  notification_opened: { browser: true, props: {} },
  signup: { browser: false, props: {} },
  login: { browser: false, props: { method: ['email', 'google'] } },
  profile_completed: { browser: false, props: {} },
  farm_started: {
    browser: false,
    props: {
      mode: MODE,
      district: DISTRICT,
      size: ['small', 'medium', 'large'],
      start: ['running', 'scratch'],
      difficulty: ['easy', 'medium', 'hard'],
    },
  },
  farm_ended: { browser: false, props: { mode: MODE, days: { min: 0, max: 100_000 } } },
  day_completed: { browser: false, props: { mode: MODE } },
  skip_used: { browser: false, props: { mode: MODE, days: { min: 1, max: 400 } } },
  checkout_started: { browser: false, props: {} },
} as const satisfies Record<
  string,
  { browser: boolean; props: Readonly<Record<string, PropSpec>> }
>;
export type AnalyticsEventName = keyof typeof ANALYTICS_EVENTS;

/** The most bytes `/api/collect` reads from one beacon. */
export const COLLECT_BODY_LIMIT = 2048;

/** The most events one beacon may carry. */
export const COLLECT_MAX_EVENTS = 10;
