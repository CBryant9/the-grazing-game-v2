import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AD_SLOTS, FEATURE_SWITCHES } from '@gg/shared';
import sitemap from '@/app/sitemap';
import { AD_SLOT_INFO } from './adSlotInfo';
import {
  DETAILS_TO_COME,
  SHARED_SWITCH_KEYS,
  SITE_PAGES,
  SITE_SWITCHES_DEFAULT_ON,
  SITE_URL,
  linkedPages,
} from './site';

/*
 * The public pages are built once, with the feature switches off except Daily Farm
 * (on by default, as in the game; SITE_SWITCHES_OFF turns it off). Each part
 * that depends on a switch must stay out of the page until that switch is on,
 * so the live site never promises what is not built. These tests render each
 * page to HTML the way the build does.
 */

const ENV_KEYS = [
  'SITE_SWITCHES_ON',
  'SITE_SWITCHES_OFF',
  'SITE_CONTACT_EMAIL',
  'SITE_OWNER_NAME',
] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

async function html(page: string): Promise<string> {
  const mod = (await import(`../pages/${page}.tsx`)) as { default: ComponentType };
  return renderToStaticMarkup(createElement(mod.default));
}

describe('at the build defaults', () => {
  it('Daily Farm shows on the landing page, as it is on in the game (FEATURE_SWITCHES)', async () => {
    expect(SITE_SWITCHES_DEFAULT_ON).toEqual(['daily_farm']);
    expect(FEATURE_SWITCHES.daily_farm).toBe(true);
    expect(await html('index')).toContain('Daily Farm');
  });

  it('SITE_SWITCHES_OFF takes Daily Farm off the site, and a minus in SITE_SWITCHES_ON does nothing', async () => {
    process.env.SITE_SWITCHES_OFF = 'daily_farm';
    expect(await html('index')).not.toContain('Daily Farm');
    delete process.env.SITE_SWITCHES_OFF;
    process.env.SITE_SWITCHES_ON = 'community,-daily_farm';
    expect(await html('index')).toContain('<h3 class="px">Daily Farm</h3>');
  });
});

describe('with every switch off', () => {
  // Daily Farm is on by default (SITE_SWITCHES_DEFAULT_ON), so it is turned off here by name.
  beforeEach(() => {
    process.env.SITE_SWITCHES_OFF = 'daily_farm';
  });

  it('the landing page names only what is live', async () => {
    const h = await html('index');
    expect(h).toContain('Fast Farm');
    // (The footer has a "Community rules" link, so look for the card, not the word.)
    for (const word of [
      'Daily Farm',
      'Sheep and wool',
      'Leaderboards',
      '<h3 class="px">Community</h3>',
    ]) {
      expect(h, word).not.toContain(word);
    }
  });

  it('the pricing page shows no price and no packs', async () => {
    const h = await html('pricing');
    expect(h).toContain('Nothing in the game is for sale today');
    // A$0 is the free plan. No other price may show.
    expect(h).not.toMatch(/A\$[1-9]/);
    expect(h).not.toContain('Farm pack');
    expect(h).not.toContain('Paying to keep going');
  });

  it('the advertise page lists only slots in places that exist today', async () => {
    const h = await html('advertise');
    for (const id of AD_SLOTS) {
      const needs = AD_SLOT_INFO[id].needs;
      if (needs === null) expect(h, id).toContain(id);
      else expect(h, id).not.toContain(id);
    }
    expect(h).toContain('We are not taking enquiries through this page yet.');
    expect(h).not.toContain('mailto:');
  });

  it('the privacy page leaves out accounts, the community, analytics, ads and payments', async () => {
    const h = await html('privacy');
    expect(h).toContain('Draft. Not yet reviewed.');
    for (const heading of [
      'If you make an account',
      'The community',
      'Analytics',
      'Payments',
      '<h2>Ads</h2>',
    ]) {
      expect(h, heading).not.toContain(heading);
    }
    expect(h).toContain(DETAILS_TO_COME);
    expect(h).toContain('https://www.oaic.gov.au/privacy/privacy-complaints');
  });

  it('the terms leave out accounts, posting and purchases', async () => {
    const h = await html('terms');
    expect(h).toContain('Draft. Not yet reviewed.');
    for (const heading of ['<h2>Accounts</h2>', '<h2>What you post</h2>', '<h2>Purchases</h2>']) {
      expect(h, heading).not.toContain(heading);
    }
    expect(h).toContain(DETAILS_TO_COME);
  });

  it('the community rules say there is no community today', async () => {
    const h = await html('community-rules');
    expect(h).toContain('Draft. Not yet reviewed.');
    expect(h).toContain('The game has no community features today');
  });

  it('the header and footer do not link to Pricing', async () => {
    expect(linkedPages('header').map((p) => p.path)).not.toContain('/pricing');
    expect(linkedPages('footer').map((p) => p.path)).not.toContain('/pricing');
    const h = await html('about');
    expect(h).not.toContain('href="/pricing"');
  });

  it('no page has a contact link while no address is set', async () => {
    for (const p of ['index', 'about', 'privacy', 'terms', 'community-rules', 'advertise']) {
      expect(await html(p), p).not.toContain('mailto:');
    }
  });
});

describe('with switches on', () => {
  it('Pricing is linked and the packs show, with "About" and no price the PRD leaves open', async () => {
    process.env.SITE_SWITCHES_ON = 'purchases,daily_farm';
    expect(linkedPages('header').map((p) => p.path)).toContain('/pricing');
    expect(linkedPages('footer').map((p) => p.path)).toContain('/pricing');
    const h = await html('pricing');
    expect(h).toContain('About A$30');
    expect(h).toContain('About A$50');
    expect(h).toContain('Daily Farm, 6 months');
    expect(h).toContain('About A$25');
    expect(h).toContain('To be set');
    expect(h).not.toContain('A$15');
  });

  it('Daily Farm keep-going rows stay out while Daily Farm is off', async () => {
    process.env.SITE_SWITCHES_ON = 'purchases';
    process.env.SITE_SWITCHES_OFF = 'daily_farm';
    const h = await html('pricing');
    expect(h).toContain('A$5');
    expect(h).not.toContain('Daily Farm');
  });

  it('the contact address and owner appear when set', async () => {
    process.env.SITE_CONTACT_EMAIL = 'someone@example.test';
    process.env.SITE_OWNER_NAME = 'Example Pty Ltd';
    const h = await html('privacy');
    expect(h).toContain('mailto:someone@example.test');
    expect(h).toContain('Example Pty Ltd');
    expect(h).not.toContain(DETAILS_TO_COME);
  });

  it('switch-gated sections show when their switch is on', async () => {
    process.env.SITE_SWITCHES_ON = 'daily_farm,community,analytics,signups_open';
    expect(await html('index')).toContain('Daily Farm');
    const p = await html('privacy');
    expect(p).toContain('Analytics');
    expect(p).toContain('The community');
    expect(p).toContain('If you make an account');
  });
});

describe('the site switch defaults', () => {
  it('Daily Farm is on with nothing set, and the home page shows its card before Fast Farm', async () => {
    const h = await html('index');
    expect(h).toContain('<h3 class="px">Daily Farm</h3>');
    expect(h.indexOf('Daily Farm')).toBeLessThan(h.indexOf('Fast Farm'));
    expect(h).not.toContain('<h3 class="px">Community</h3>');
  });

  it('the hero offers the leaderboard only while leaderboards are on', async () => {
    expect(await html('index')).toContain('How a day works</a>');
    process.env.SITE_SWITCHES_ON = 'leaderboards,community';
    const h = await html('index');
    expect(h).toContain('href="/leaderboards"');
    expect(h).toContain('<h3 class="px">Community</h3>');
  });

  it('the home page has no announcement bar without one', async () => {
    expect(await html('index')).not.toContain('aria-label="Announcement"');
  });
});

describe('switch keys', () => {
  it('every key the site reads is a shared key or one of the three the site adds', () => {
    const local = ['sheep', 'farm_hands', 'analytics'];
    const used = [
      ...SITE_PAGES.map((p) => p.linkedWhen),
      ...AD_SLOTS.map((id) => AD_SLOT_INFO[id].needs),
    ].filter((k): k is NonNullable<typeof k> => k !== undefined && k !== null);
    for (const key of used) {
      expect([...SHARED_SWITCH_KEYS, ...local], key).toContain(key);
    }
  });
});

describe('the sitemap', () => {
  it('lists the public pages and the game, and nothing private', () => {
    const urls = sitemap().map((e) => e.url);
    const expected = [...SITE_PAGES.map((p) => p.path), '/play'].map((p) =>
      p === '/' ? SITE_URL : `${SITE_URL}${p}`,
    );
    expect([...urls].sort()).toEqual([...expected].sort());
    for (const url of urls) {
      expect(url.startsWith(SITE_URL)).toBe(true);
      expect(url).not.toMatch(/\/(admin|api|dev|serwist)(\/|$)/);
    }
  });
});
