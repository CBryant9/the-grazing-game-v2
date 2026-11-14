import { FEATURE_SWITCHES, type FeatureSwitchKey } from '@gg/shared';

/**
 * Site-wide settings for the public website (milestone 5.4).
 * Nothing here is part of the game and nothing here is a game rule.
 */

/** The public address of the site. The domain is not chosen yet, so it comes from the environment. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(
  /\/+$/,
  '',
);

/** A full address for a path on this site, for canonical links, the sitemap and share images. */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path === '/' ? '' : path}`;
}

/**
 * The address for enquiries, from the environment. It is never written in the
 * repo. When it is not set, the pages leave the link out.
 */
export function contactEmail(): string | null {
  const value = process.env.SITE_CONTACT_EMAIL?.trim();
  return value ? value : null;
}

/**
 * Who the site belongs to, for "we" in the privacy page and the terms. From the
 * environment, never written in the repo (the owner is not decided: PRD 18).
 * When it is not set, the pages say so plainly.
 */
export function ownerName(): string | null {
  const value = process.env.SITE_OWNER_NAME?.trim();
  return value ? value : null;
}

/** The line the draft pages show where a contact address or an owner will go. */
export const DETAILS_TO_COME = 'Contact details will be added before launch.';

/**
 * Switches that only the website needs beyond the game's own keys.
 * `sheep` and `farm_hands` arrive in Stage 2, `analytics` in milestone 5.3.
 */
export type SiteSwitchKey = FeatureSwitchKey | 'sheep' | 'farm_hands' | 'analytics';

/**
 * A small "off by default" read for the website.
 *
 * The shared defaults (`FEATURE_SWITCHES`) describe launch, and a few of them
 * are on (Daily Farm, leaderboards, sign-ups) although those parts are not
 * built yet. The public pages must never promise what is not there, so every
 * switch here is OFF unless the environment turns it on:
 *
 *   SITE_SWITCHES_ON=community,leaderboards
 *
 * The admin back end (Stage 5) replaces this read with the live switches.
 * The keys are the ones in `@gg/shared` so the two line up.
 */
export function siteSwitchOn(key: SiteSwitchKey): boolean {
  const on = (process.env.SITE_SWITCHES_ON ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return on.includes(key);
}

/** For tests: the shared switch keys. */
export const SHARED_SWITCH_KEYS: readonly string[] = Object.keys(FEATURE_SWITCHES);

export type SitePage = {
  path: string;
  title: string;
  /** The short line under the page heading and in search results. */
  description: string;
  /** Shown in the footer's list of pages. */
  footer: boolean;
  /** Shown in the header on wide screens. */
  header: boolean;
  /** Linked from the header and footer only while this switch is on. The page stays reachable either way. */
  linkedWhen?: SiteSwitchKey;
};

/** The pages to link from the header or the footer, leaving out any whose switch is off. */
export function linkedPages(place: 'header' | 'footer'): SitePage[] {
  return SITE_PAGES.filter(
    (p) => p[place] && (p.linkedWhen === undefined || siteSwitchOn(p.linkedWhen)),
  );
}

/** Every public page. The sitemap, the footer and the header read this one list. */
export const SITE_PAGES: readonly SitePage[] = [
  {
    path: '/',
    title: 'Home',
    description:
      'A free, realistic grazing game for Australian graziers. Real seasons, real prices and real weather, on your phone or PC. No sign-up.',
    footer: false,
    header: false,
  },
  {
    path: '/pricing',
    title: 'Pricing',
    description:
      'The Grazing Game is free to play on your phone or PC, with no sign-up. This page says what is free and what costs money.',
    footer: true,
    header: true,
    linkedWhen: 'purchases',
  },
  {
    path: '/advertise',
    title: 'Advertise',
    description:
      'Where in-house ad slots go in The Grazing Game, what each one looks like, and how advertisers can get in touch.',
    footer: true,
    header: true,
  },
  {
    path: '/about',
    title: 'About',
    description:
      'What The Grazing Game is, why it is built the way it is, and where its weather and price data come from.',
    footer: true,
    header: true,
  },
  {
    path: '/privacy',
    title: 'Privacy',
    description:
      'What The Grazing Game keeps about you, why, and what you can do about it. A plain-English draft.',
    footer: true,
    header: false,
  },
  {
    path: '/terms',
    title: 'Terms of use',
    description: 'The terms for using The Grazing Game, in plain English. A draft.',
    footer: true,
    header: false,
  },
  {
    path: '/community-rules',
    title: 'Community rules',
    description:
      'How people are expected to treat each other in The Grazing Game community, and what happens when they do not. A draft.',
    footer: true,
    header: false,
  },
];
