import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AD_SLOTS } from '@gg/shared';
import type { SqlClient, SqlRunner } from '../db/sql';
import { pgliteSql } from '../test-support/pgliteSql';
import { setAuthDeps } from '../auth/deps';
import * as adminRoute from '../../app/api/ads/admin/route';
import * as reportRoute from '../../app/api/ads/admin/report/route';
import * as pickRoute from '../../app/api/ads/pick/route';
import * as eventRoute from '../../app/api/ads/event/route';
import * as clickRoute from '../../app/api/ads/click/[id]/route';
import * as mediaRoute from '../../app/api/ads/media/[id]/route';
import * as switchRoute from '../../app/api/admin/switches/route';
import * as meRoute from '../../app/api/auth/me/route';
import { ANON } from './serve';
import { b64, jpegBytes, mp4Bytes, pngBytes, webpBytes } from './fixtures';
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, MediaError, sniff } from './media';
import { campaignReport, dailyCounts, listSlots, reportCsv } from './adminStore';
import {
  PEPPER,
  call,
  campaign,
  person,
  resetKit,
  startKit,
  stopKit,
  switches,
  type Kit,
  type Person,
} from './testkit';

const state: { cookie: string } = { cookie: '' };
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () =>
      state.cookie
        ? state.cookie.split('; ').map((c) => ({ name: c.split('=')[0]!, value: c.split('=')[1]! }))
        : [],
  }),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => '/admin/ads',
}));

let kit: Kit;
beforeAll(async () => {
  kit = await startKit();
}, 120_000);
afterAll(() => stopKit(kit));
beforeEach(() => resetKit(kit));

const sql = () => pgliteSql(kit.db);
const act = (
  body: unknown,
  who: Person | string | null,
  headers: Record<string, string> = {},
  address?: string,
) =>
  call(kit, adminRoute.POST, '/api/ads/admin', {
    body,
    cookie: typeof who === 'string' ? who : (who?.cookie ?? null),
    headers,
    address,
  });
const ok = async (res: Response) => {
  const body = (await res.json()) as Record<string, unknown>;
  expect(res.status, JSON.stringify(body)).toBe(200);
  return body;
};
const sydneyToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date());
const auditRows = async () =>
  (
    await kit.db.query<{ action: string; details: Record<string, unknown> }>(
      'select action, details from public.admin_audit_log order by id',
    )
  ).rows;

const walk = (dir: string, match: RegExp): string[] => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const out: string[] = [];
  for (const name of readdirSync(join(root, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) out.push(...walk(rel, match));
    else if (match.test(name)) out.push(rel);
  }
  return out;
};
const root = fileURLToPath(new URL('../../', import.meta.url));
const pages = import.meta.glob('../../app/admin/ads/**/page.tsx');

// ---------------------------------------------------------------- the registry and the one-per-phone-screen rule

describe('the slot registry', () => {
  it('has every slot id from the shared list, with a size in at least one layout and its switch', async () => {
    const { SLOTS } = await import('../../lib/ads/registry');
    expect(Object.keys(SLOTS).sort()).toEqual([...AD_SLOTS].sort());
    for (const id of AD_SLOTS) {
      const d = SLOTS[id];
      expect(d.id).toBe(id);
      expect(
        Object.values(d.sizes).some((s) => s !== null),
        id,
      ).toBe(true);
      expect(d.screens.length, id).toBeGreaterThan(0);
      if (d.video) expect(d.needs, id).toBe('video_ads');
      if (d.timed) expect(d.needs, id).toBe('banner_ads');
      if (!d.placed) expect(d.notPlacedWhy, id).toBeTruthy();
    }
    // The sizes in PRD 10.1.
    expect(SLOTS.phone_banner.sizes.phone).toEqual({ w: 320, h: 50 });
    expect(SLOTS.pc_banner.sizes.pc).toEqual({ w: 728, h: 90 });
    expect(SLOTS.pc_farm_rail.maxItems).toBe(3);
    expect(SLOTS.landing_sponsors.publicPage).toBe(true);
    // No ad over the map on a phone on its side; the phone banner is upright only.
    expect(SLOTS.phone_banner.sizes.landscape).toBeNull();
  });

  it('every <AdSlot id="..."> in the code is a placed slot, and every placed slot has one place', async () => {
    const { SLOTS } = await import('../../lib/ads/registry');
    const files = [...walk('components', /\.tsx$/), ...walk('app', /\.tsx$/)].filter(
      (f) => !f.endsWith('components/ads/AdSlot.tsx'),
    );
    const found: string[] = [];
    for (const f of files) {
      for (const m of readFileSync(join(root, f), 'utf8').matchAll(/<AdSlot\s+id="([a-z_]+)"/g)) {
        found.push(m[1]!);
      }
    }
    for (const id of found) expect(AD_SLOTS as readonly string[], id).toContain(id);
    const placed = AD_SLOTS.filter((id) => SLOTS[id].placed);
    expect([...new Set(found)].sort()).toEqual([...placed].sort());
    for (const id of AD_SLOTS.filter((id) => !SLOTS[id].placed))
      expect(found, id).not.toContain(id);
  });

  it('no ad code loads a third-party script or player', () => {
    const files = [
      ...walk('components/ads', /\.tsx?$/),
      ...walk('server/ads', /\.ts$/),
      ...walk('lib/ads', /\.ts$/),
    ];
    for (const f of files) {
      if (f.endsWith('.test.ts')) continue;
      const src = readFileSync(join(root, f), 'utf8');
      expect(src, f).not.toMatch(
        /adsbygoogle|googlesyndication|pagead2|doubleclick|h5games|<script|next\/script|dangerouslySetInnerHTML|\.innerHTML/i,
      );
      expect(src, f).not.toMatch(/ca-pub-|pub-\d{6,}/);
    }
  });
});

describe('never two ad units on one phone screen', () => {
  it('for every screen, every set of slots that can be mounted there, on a phone upright or on its side, at most one draws', async () => {
    const { SLOTS, visibleSlots } = await import('../../lib/ads/registry');
    const mounts = AD_SLOTS.flatMap((id) => SLOTS[id].screens.map((screen) => ({ id, screen })));
    expect(mounts.length).toBeGreaterThan(AD_SLOTS.length - 1);
    // Every subset of everything that could be mounted (2^n for the n mounts, all of them).
    const n = mounts.length;
    expect(n).toBeLessThan(20);
    for (const layout of ['phone', 'landscape'] as const) {
      for (let mask = 0; mask < 1 << n; mask++) {
        const set = mounts.filter((_, i) => mask & (1 << i));
        const shown = visibleSlots(set, layout);
        expect(shown.length, `${layout} ${set.map((s) => s.id).join()}`).toBeLessThanOrEqual(1);
        for (const id of shown) expect(SLOTS[id].sizes[layout], id).not.toBeNull();
      }
    }
  });

  it('a screen over the farm hides the farm ads under it, and on the year end card the video beats the card', async () => {
    const { visibleSlots } = await import('../../lib/ads/registry');
    expect(
      visibleSlots(
        [
          { id: 'phone_banner', screen: 'farm' },
          { id: 'summary_sponsor_card', screen: 'day_summary' },
        ],
        'phone',
      ),
    ).toEqual(['summary_sponsor_card']);
    expect(
      visibleSlots(
        [
          { id: 'pc_banner', screen: 'farm' },
          { id: 'pc_farm_rail', screen: 'farm' },
          { id: 'summary_sponsor_card', screen: 'day_summary' },
        ],
        'pc',
      ),
    ).toEqual(['summary_sponsor_card']);
    expect(
      visibleSlots(
        [
          { id: 'summary_sponsor_card', screen: 'year_end' },
          { id: 'video_between_years', screen: 'year_end' },
        ],
        'phone',
      ),
    ).toEqual(['video_between_years']);
    expect(
      visibleSlots(
        [
          { id: 'summary_sponsor_card', screen: 'year_end' },
          { id: 'video_between_years', screen: 'year_end' },
        ],
        'pc',
      ),
    ).toEqual(['summary_sponsor_card', 'video_between_years']);
  });

  it('on a PC the rail and the banner may both show, as the mockups draw it; a phone banner never shows on a PC', async () => {
    const { visibleSlots } = await import('../../lib/ads/registry');
    expect(
      visibleSlots(
        [
          { id: 'pc_farm_rail', screen: 'farm' },
          { id: 'pc_banner', screen: 'farm' },
          { id: 'phone_banner', screen: 'farm' },
        ],
        'pc',
      ).sort(),
    ).toEqual(['pc_banner', 'pc_farm_rail']);
    expect(
      visibleSlots(
        [
          { id: 'phone_banner', screen: 'farm' },
          { id: 'pc_banner', screen: 'farm' },
          { id: 'pc_farm_rail', screen: 'farm' },
        ],
        'phone',
      ),
    ).toEqual(['phone_banner']);
    expect(visibleSlots([{ id: 'phone_banner', screen: 'farm' }], 'landscape')).toEqual([]);
  });

  it('the lease in the browser applies the same rule', async () => {
    const { allowedKeys } = await import('../../lib/ads/lease');
    const keys = allowedKeys(
      [
        { key: 'a', id: 'phone_banner', screen: 'farm' },
        { key: 'b', id: 'summary_sponsor_card', screen: 'day_summary' },
      ],
      'phone',
    );
    expect([...keys]).toEqual(['b']);
  });
});

describe('with every switch off the screens draw nothing', () => {
  it('<AdSlot> renders no markup for any slot when the server lists none, or lists others', async () => {
    const { useMe } = await import('../../lib/auth/store');
    const { AdSlot } = await import('../../components/ads/AdSlot');
    const { createElement } = await import('react');
    const meBase = {
      accounts: true,
      signedIn: false,
      signupsOpen: true,
      needsSignUp: false,
      refused: false,
      username: null,
      method: null,
      community: false,
      leaderboards: false,
      interestAds: true,
      scope: null,
    };
    for (const ads of [[], undefined] as const) {
      useMe.setState({ me: { ...meBase, ads: ads as never }, settled: true, unknown: false });
      for (const id of AD_SLOTS)
        expect(renderToStaticMarkup(createElement(AdSlot, { id })), id).toBe('');
    }
    useMe.setState({ me: null, settled: false, unknown: false });
    for (const id of AD_SLOTS)
      expect(renderToStaticMarkup(createElement(AdSlot, { id })), id).toBe('');
    // A slot the server did not list stays empty even when another is listed.
    useMe.setState({
      me: { ...meBase, ads: ['summary_sponsor_card'] },
      settled: true,
      unknown: false,
    });
    expect(renderToStaticMarkup(createElement(AdSlot, { id: 'phone_banner' }))).toBe('');
    useMe.setState({ me: null, settled: false, unknown: false });
  });

  it('the pages that hold slots import only the one component, and the ad code is loaded on demand', () => {
    const slot = readFileSync(join(root, 'components/ads/AdSlot.tsx'), 'utf8');
    expect(slot).toMatch(/dynamic\(\(\) => import\('\.\/AdSlotLive'\)/);
    for (const f of [
      'components/play/PlayScreen.tsx',
      'components/play/SummaryCard.tsx',
      'components/play/YearEndCard.tsx',
    ]) {
      const src = readFileSync(join(root, f), 'utf8');
      expect(src, f).toMatch(/from '@\/components\/ads\/AdSlot'/);
      expect(src, f).not.toMatch(/AdSlotLive|VideoBreak|AdCard/);
    }
  });

  it('no game video ad network, no outside ad script, and the AdSense adapter loads nothing', async () => {
    const adsense = await import('./adsense');
    expect(adsense.adsense.available).toBe(false);
    expect(adsense.adsense.scriptUrl).toBeNull();
    expect(adsense.adsenseMayLoad({ consent: true, switchOn: true, underSixteen: false })).toBe(
      false,
    );
    expect(adsense.adsenseMayLoad({ consent: false, switchOn: true, underSixteen: false })).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------- uploads

describe('what is a picture or a video is decided by the bytes', () => {
  it('accepts JPEG, PNG, WebP and MP4 and reads their sizes and length', () => {
    expect(sniff(pngBytes(320, 50))).toMatchObject({
      mime: 'image/png',
      ext: 'png',
      kind: 'image',
      width: 320,
      height: 50,
    });
    expect(sniff(jpegBytes(728, 90))).toMatchObject({
      mime: 'image/jpeg',
      ext: 'jpg',
      width: 728,
      height: 90,
    });
    expect(sniff(webpBytes(356, 120))).toMatchObject({
      mime: 'image/webp',
      ext: 'webp',
      width: 356,
      height: 120,
    });
    expect(sniff(mp4Bytes(28, 640, 360))).toMatchObject({
      mime: 'video/mp4',
      ext: 'mp4',
      kind: 'video',
      durationS: 28,
      width: 640,
      height: 360,
    });
  });

  it('refuses SVG, HTML, script, text, an empty file and a script that is named like a picture', () => {
    const text = (s: string) => new TextEncoder().encode(s);
    for (const bad of [
      text('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'),
      text('<?xml version="1.0"?><svg/>'),
      text('<!doctype html><script>alert(1)</script>'),
      text('<script>alert(1)</script>'),
      text('GIF89a....'),
      text('%PDF-1.4'),
      new Uint8Array(),
      new Uint8Array(100),
      // A picture header with a script after it is still a picture: it is served as an image with nosniff.
    ]) {
      expect(() => sniff(bad)).toThrow(MediaError);
    }
  });

  it('refuses too big, too small, too long and unreadable files', () => {
    expect(() => sniff(pngBytes(64, 64, MAX_IMAGE_BYTES + 1))).toThrow(/1 MB/);
    expect(() => sniff(pngBytes(8, 8))).toThrow(/pixels/);
    expect(() => sniff(pngBytes(5000, 100))).toThrow(/pixels/);
    expect(() => sniff(mp4Bytes(31))).toThrow(/30 seconds/);
    expect(() => sniff(mp4Bytes(10, 640, 360, MAX_VIDEO_BYTES + 1))).toThrow(/3 MB/);
    expect(() => sniff(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 2]))).toThrow(MediaError);
    // The start of an MP4 with no movie box, and a WebM.
    expect(() =>
      sniff(
        new Uint8Array([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]),
      ),
    ).toThrow(MediaError);
    expect(() => sniff(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]))).toThrow(MediaError);
  });
});

describe('uploads through the admin route', () => {
  const setup = async () => {
    const admin = await person(kit, 'admin', { role: 'admin' });
    const made = await ok(
      await act(
        {
          action: 'campaign_save',
          name: 'House',
          house: true,
          startDay: sydneyToday(),
          slots: ['summary_sponsor_card'],
          active: true,
        },
        admin,
      ),
    );
    return { admin, campaignId: made.id as string };
  };
  const upload = (
    admin: Person,
    campaignId: string,
    kind: string,
    bytes: Uint8Array | string,
    extra: Record<string, unknown> = {},
  ) =>
    act(
      {
        action: 'creative_save',
        campaignId,
        kind,
        headline: 'Our soil tests',
        linkUrl: 'https://example.com.au/soil',
        alt: 'A paddock',
        upload: { data: b64(bytes) },
        ...extra,
      },
      admin,
    );

  it('stores a picture under a random name with the extension found in the bytes, and records what it is', async () => {
    const { admin, campaignId } = await setup();
    const out = await ok(await upload(admin, campaignId, 'image', pngBytes(356, 120)));
    const row = (
      await kit.db.query<{
        media_path: string;
        media_mime: string;
        width: number;
        height: number;
        media_bytes: number;
      }>('select * from public.ad_creatives where id = $1', [out.id])
    ).rows[0]!;
    expect(row.media_path).toMatch(
      new RegExp(`^${campaignId.slice(0, 0)}[0-9a-f-]{36}/[0-9a-f]{16}\\.png$`),
    );
    expect(row.media_mime).toBe('image/png');
    expect([row.width, row.height]).toEqual([356, 120]);
    expect(kit.media.files.get(row.media_path)?.mime).toBe('image/png');
    expect(kit.media.files.size).toBe(1);
  });

  it('refuses SVG, HTML, a script named .png, a video for a picture ad, oversize files and bad base64, and stores nothing', async () => {
    const { admin, campaignId } = await setup();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
    const cases: [string, Uint8Array | string, string][] = [
      ['image', svg, 'svg'],
      ['logo', '<!doctype html><script>alert(1)</script>', 'html'],
      ['image', 'alert(document.cookie)', 'script named .png'],
      ['image', pngBytes(64, 64, MAX_IMAGE_BYTES + 10), 'oversize picture'],
      ['video', mp4Bytes(10, 640, 360, MAX_VIDEO_BYTES + 10), 'oversize video'],
      ['video', mp4Bytes(45), 'a video that is too long'],
      ['image', mp4Bytes(10), 'a video for a picture ad'],
      ['video', pngBytes(), 'a picture for a video ad'],
    ];
    for (const [kind, bytes, why] of cases) {
      const res = await upload(admin, campaignId, kind, bytes);
      expect(res.status, why).toBe(400);
    }
    const bad = await act(
      { action: 'creative_save', campaignId, kind: 'image', upload: { data: 'not base64 !!' } },
      admin,
    );
    expect(bad.status).toBe(400);
    const none = await act(
      { action: 'creative_save', campaignId, kind: 'image', headline: 'x' },
      admin,
    );
    expect(none.status).toBe(400);
    const text = await act(
      {
        action: 'creative_save',
        campaignId,
        kind: 'text',
        headline: 'x',
        upload: { data: b64(pngBytes()) },
      },
      admin,
    );
    expect(text.status).toBe(400);
    expect(kit.media.files.size).toBe(0);
    expect(
      Number(
        (await kit.db.query<{ n: string }>('select count(*) as n from public.ad_creatives'))
          .rows[0]!.n,
      ),
    ).toBe(0);
  });

  it('a link must be plain https, and a headline is length-limited', async () => {
    const { admin, campaignId } = await setup();
    for (const linkUrl of [
      'http://example.com.au',
      'javascript:alert(1)',
      '//evil.example',
      'https://user:pw@example.com.au/',
      'https://x',
      'ftp://example.com.au',
    ]) {
      const res = await act(
        { action: 'creative_save', campaignId, kind: 'text', headline: 'Hello', linkUrl },
        admin,
      );
      expect(res.status, linkUrl).toBe(400);
    }
    expect(
      (
        await act(
          { action: 'creative_save', campaignId, kind: 'text', headline: 'x'.repeat(81) },
          admin,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await act(
          {
            action: 'creative_save',
            campaignId,
            kind: 'text',
            headline: 'Hello',
            linkUrl: 'https://example.com.au/a?b=c',
          },
          admin,
        )
      ).status,
    ).toBe(200);
  });

  it('replacing a file removes the old one, a failed save leaves nothing behind, and deleting removes the file', async () => {
    const { admin, campaignId } = await setup();
    const first = await ok(await upload(admin, campaignId, 'image', pngBytes()));
    const id = first.id as string;
    expect(kit.media.files.size).toBe(1);
    const second = await act(
      {
        action: 'creative_save',
        id,
        campaignId,
        kind: 'image',
        headline: 'New',
        upload: { data: b64(jpegBytes()) },
      },
      admin,
    );
    await ok(second);
    expect(kit.media.files.size).toBe(1);
    expect([...kit.media.files.keys()][0]).toMatch(/\.jpg$/);
    // The database change fails, so the new file must not be left behind.
    const before = [...kit.media.files.keys()];
    const failing: SqlClient = {
      query: (t, p) => sql().query(t, p),
      transaction: (fn) =>
        sql().transaction((tx) =>
          fn({
            query: (t: string, p?: unknown[]) =>
              /insert into public\.admin_audit_log/.test(t)
                ? Promise.reject(new Error('audit write failed'))
                : tx.query(t, p),
          } as SqlRunner),
        ),
    };
    setAuthDeps({ ...kit.deps, sql: failing });
    const res = await act(
      {
        action: 'creative_save',
        id,
        campaignId,
        kind: 'image',
        upload: { data: b64(webpBytes()) },
      },
      admin,
    );
    expect(res.status).toBe(500);
    setAuthDeps(kit.deps);
    expect([...kit.media.files.keys()]).toEqual(before);
    await ok(await act({ action: 'creative_delete', id }, admin));
    expect(kit.media.files.size).toBe(0);
  });

  it('without file storage an upload is refused plainly', async () => {
    const { admin, campaignId } = await setup();
    const { setAdMediaStore } = await import('./media');
    const keep = process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    setAdMediaStore(undefined);
    expect((await upload(admin, campaignId, 'image', pngBytes())).status).toBe(503);
    if (keep) process.env.NEXT_PUBLIC_SUPABASE_URL = keep;
    setAdMediaStore(kit.media);
  });
});

// ---------------------------------------------------------------- serving media

describe('ad media is served with safe headers', () => {
  it('sets the type found by the bytes, nosniff, a sandboxing policy and a same-origin policy, and supports ranges', async () => {
    const admin = await person(kit, 'admin', { role: 'admin' });
    const made = await ok(
      await act(
        {
          action: 'campaign_save',
          name: 'H',
          house: true,
          startDay: sydneyToday(),
          slots: ['video_between_years'],
          active: true,
        },
        admin,
      ),
    );
    const png = await ok(
      await act(
        {
          action: 'creative_save',
          campaignId: made.id,
          kind: 'image',
          alt: 'x',
          upload: { data: b64(pngBytes()) },
        },
        admin,
      ),
    );
    const mp4 = await ok(
      await act(
        {
          action: 'creative_save',
          campaignId: made.id,
          kind: 'video',
          alt: 'x',
          upload: { data: b64(mp4Bytes(12)) },
        },
        admin,
      ),
    );
    const img = await call(kit, mediaRoute.GET, `/api/ads/media/${png.id}`);
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toBe('image/png');
    expect(img.headers.get('x-content-type-options')).toBe('nosniff');
    expect(img.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
    expect(img.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    expect(img.headers.get('content-disposition')).toBe('inline');
    expect(img.headers.get('accept-ranges')).toBe('bytes');
    expect((await img.arrayBuffer()).byteLength).toBe(pngBytes().length);
    const vid = await call(kit, mediaRoute.GET, `/api/ads/media/${mp4.id}`, {
      headers: { range: 'bytes=0-9' },
    });
    expect(vid.status).toBe(206);
    expect(vid.headers.get('content-type')).toBe('video/mp4');
    expect(vid.headers.get('content-range')).toMatch(/^bytes 0-9\/\d+$/);
    expect((await vid.arrayBuffer()).byteLength).toBe(10);
    // Unknown ids, bad ids and a creative with no file are a plain 404.
    for (const id of ['00000000-0000-4000-8000-000000000000', 'x', '..%2F..%2Fetc']) {
      expect((await call(kit, mediaRoute.GET, `/api/ads/media/${id}`)).status, id).toBe(404);
    }
    const text = await ok(
      await act(
        { action: 'creative_save', campaignId: made.id, kind: 'text', headline: 'W' },
        admin,
      ),
    );
    expect((await call(kit, mediaRoute.GET, `/api/ads/media/${text.id}`)).status).toBe(404);
    // A range the server will not pass on is ignored, not passed to storage.
    const odd = await call(kit, mediaRoute.GET, `/api/ads/media/${mp4.id}`, {
      headers: { range: 'bytes=0-1,5-9' },
    });
    expect(odd.status).toBe(200);
  });

  it('with no keys it serves nothing', async () => {
    setAuthDeps(null);
    expect(
      (await call(kit, mediaRoute.GET, '/api/ads/media/00000000-0000-4000-8000-000000000000'))
        .status,
    ).toBe(404);
  });
});

// ---------------------------------------------------------------- sponsors, campaigns and slots in admin

describe('sponsors, campaigns and slots', () => {
  it('a slot is switched on and off by an admin, audited, and the caps are checked', async () => {
    const admin = await person(kit, 'admin', { role: 'admin' });
    const on = await ok(
      await act({ action: 'slot_set', slot: 'phone_banner', enabled: true }, admin),
    );
    expect(on.changed).toBe(true);
    expect(
      (await ok(await act({ action: 'slot_set', slot: 'phone_banner', enabled: true }, admin)))
        .changed,
    ).toBe(false);
    expect(
      (
        await kit.db.query<{ enabled: boolean }>(
          `select enabled from public.ad_slots where slot_id = 'phone_banner'`,
        )
      ).rows[0]!.enabled,
    ).toBe(true);
    expect(await auditRows()).toEqual([
      { action: 'ad_slot_set', details: { slot_id: 'phone_banner', enabled: true, count: 0 } },
    ]);
    await ok(
      await act(
        {
          action: 'slot_set',
          slot: 'phone_banner',
          settings: { min_seconds_between: 600, show_seconds_min: 20, show_seconds_max: 40 },
        },
        admin,
      ),
    );
    const s = (
      await kit.db.query<{ settings: Record<string, number> }>(
        `select settings from public.ad_slots where slot_id = 'phone_banner'`,
      )
    ).rows[0]!.settings;
    expect(s).toMatchObject({
      min_seconds_between: 600,
      show_seconds_min: 20,
      show_seconds_max: 40,
    });
    for (const settings of [
      { min_seconds_between: -1 },
      { min_seconds_between: 'x' },
      { show_seconds_min: 100, show_seconds_max: 10 },
      { every_n_posts: 8 },
      { skip_after_seconds: 1 },
      { evil: 1 },
      [1],
    ]) {
      expect(
        (await act({ action: 'slot_set', slot: 'phone_banner', settings }, admin)).status,
        JSON.stringify(settings),
      ).toBe(400);
    }
    for (const slot of ['nope', '', null, 7]) {
      expect((await act({ action: 'slot_set', slot, enabled: true }, admin)).status).toBe(400);
    }
    expect(
      (await act({ action: 'slot_set', slot: 'phone_banner', enabled: 'yes' }, admin)).status,
    ).toBe(400);
    expect((await act({ action: 'nonsense' }, admin)).status).toBe(400);
  });

  it('sponsors and campaigns: made, edited, dated in Sydney days, with slots, targeting and limits; bad input refused', async () => {
    const admin = await person(kit, 'admin', { role: 'admin' });
    const sp = await ok(
      await act(
        {
          action: 'sponsor_save',
          name: 'Brigalow Fencing',
          contact: 'Sam, private',
          notes: 'Paid for Q1',
        },
        admin,
      ),
    );
    await ok(
      await act({ action: 'sponsor_save', id: sp.id, name: 'Brigalow Fencing Supplies' }, admin),
    );
    const camp = {
      action: 'campaign_save',
      name: 'Spring',
      sponsorId: sp.id,
      house: false,
      startDay: '2026-12-01',
      endDay: '2026-12-31',
      audience: 'farmers',
      states: ['QLD', 'NSW'],
      weight: 5,
      maxViewsPerViewerDay: 3,
      maxViews: 1000,
      slots: ['pc_farm_rail', 'summary_sponsor_card'],
      active: true,
    };
    const made = await ok(await act(camp, admin));
    const row = (
      await kit.db.query<Record<string, unknown>>(
        `select c.*, to_char(c.starts_at at time zone 'Australia/Sydney', 'YYYY-MM-DD HH24:MI') as s, to_char(c.ends_at at time zone 'Australia/Sydney', 'YYYY-MM-DD HH24:MI') as e from public.campaigns c where id = $1`,
        [made.id],
      )
    ).rows[0]!;
    expect(row.s).toBe('2026-12-01 00:00');
    expect(row.e).toBe('2027-01-01 00:00');
    expect(row.targeting).toEqual({ audience: 'farmers', states: ['QLD', 'NSW'] });
    expect(row).toMatchObject({
      weight: 5,
      max_views_per_viewer_day: 3,
      max_views: 1000,
      active: true,
      is_house_ad: false,
    });
    const slots = await kit.db.query<{ slot_id: string }>(
      'select slot_id from public.campaign_slots where campaign_id = $1 order by 1',
      [made.id],
    );
    expect(slots.rows.map((r) => r.slot_id)).toEqual(['pc_farm_rail', 'summary_sponsor_card']);
    await ok(await act({ ...camp, id: made.id, slots: ['pc_farm_rail'], active: false }, admin));
    expect(
      (await kit.db.query('select 1 from public.campaign_slots where campaign_id = $1', [made.id]))
        .rowCount,
    ).toBe(1);
    // Nothing free-text goes in the audit log.
    const audit = JSON.stringify(await auditRows());
    expect(audit).not.toMatch(/Brigalow|Spring|private|Paid/);
    for (const bad of [
      { ...camp, name: '' },
      { ...camp, startDay: 'tomorrow' },
      { ...camp, startDay: '2026-02-30' },
      { ...camp, endDay: '2026-11-01' },
      { ...camp, weight: 0 },
      { ...camp, weight: 101 },
      { ...camp, states: ['XX'] },
      { ...camp, slots: ['nope'] },
      { ...camp, sponsorId: null, house: false },
      { ...camp, sponsorId: '00000000-0000-4000-8000-000000000000' },
      { ...camp, maxViews: 0 },
      { ...camp, maxViews: 1.5 },
      { ...camp, id: 'x' },
    ]) {
      expect(
        (await act(bad, admin)).status,
        JSON.stringify(bad).slice(0, 80),
      ).toBeGreaterThanOrEqual(400);
    }
    // A sponsor with campaigns cannot be deleted; a campaign with views cannot be deleted, so its report stays.
    expect((await act({ action: 'sponsor_delete', id: sp.id }, admin)).status).toBe(409);
    await kit.db.query(
      `insert into public.ad_events (slot_id, campaign_id, kind) values ('pc_farm_rail', $1, 'view')`,
      [made.id],
    );
    expect((await act({ action: 'campaign_delete', id: made.id }, admin)).status).toBe(409);
    await kit.db.query('delete from public.ad_events');
    await ok(await act({ action: 'campaign_delete', id: made.id }, admin));
    await ok(await act({ action: 'sponsor_delete', id: sp.id }, admin));
    const actions = (await auditRows()).map((r) => r.action);
    expect(actions).toContain('ad_campaign_delete');
    expect(actions).toContain('ad_sponsor_delete');
  });
});

// ---------------------------------------------------------------- the end to end test

describe('Claudia can switch on a slot, upload a house ad and see views', () => {
  it('works end to end: switch on, upload, a player sees it, views and clicks show in admin and match the database', async () => {
    const admin = await person(kit, 'admin', { role: 'admin' });
    const pat = await person(kit, 'pat');
    // Off at the start: the player is told no slots.
    const meOf = async (p: Person) =>
      (
        (await (await call(kit, meRoute.GET, '/api/auth/me', { cookie: p.full })).json()) as {
          ads: string[];
        }
      ).ads;
    expect(await meOf(pat)).toEqual([]);

    // 1. Claudia turns the master switch and the slot on.
    await ok(
      await call(kit, switchRoute.POST, '/api/admin/switches', {
        body: { key: 'ads', enabled: true },
        cookie: admin.cookie,
      }),
    );
    await ok(await act({ action: 'slot_set', slot: 'summary_sponsor_card', enabled: true }, admin));
    expect(await meOf(pat)).toEqual([]); // nothing to show yet: no empty box

    // 2. She makes a house campaign for the slot and uploads a picture.
    const camp = await ok(
      await act(
        {
          action: 'campaign_save',
          name: 'Our soil tests',
          house: true,
          startDay: sydneyToday(),
          slots: ['summary_sponsor_card'],
          active: true,
        },
        admin,
      ),
    );
    const ad = await ok(
      await act(
        {
          action: 'creative_save',
          campaignId: camp.id,
          kind: 'image',
          headline: 'Soil tests',
          body: 'Know your paddocks',
          linkUrl: 'https://example.com.au/soil',
          alt: 'A paddock',
          upload: { data: b64(pngBytes(356, 120)) },
        },
        admin,
      ),
    );

    // 3. A player now sees it, labelled, with a link through the server and a picture from our own address.
    expect(await meOf(pat)).toEqual(['summary_sponsor_card']);
    const got = (await (
      await call(kit, pickRoute.GET, '/api/ads/pick?slot=summary_sponsor_card', {
        cookie: pat.full,
      })
    ).json()) as {
      items: { token: string; label: string; mediaUrl: string; href: string; creativeId: string }[];
    };
    expect(got.items).toHaveLength(1);
    const item = got.items[0]!;
    expect(item).toMatchObject({
      label: 'Ad',
      mediaUrl: `/api/ads/media/${ad.id}`,
      creativeId: ad.id,
    });
    expect((await call(kit, mediaRoute.GET, item.mediaUrl)).status).toBe(200);

    // 4. It is seen (after a second on screen) and followed.
    await new Promise((r) => setTimeout(r, 1000));
    expect(
      await (
        await call(kit, eventRoute.POST, '/api/ads/event', {
          body: { token: item.token, kind: 'view' },
          cookie: pat.full,
        })
      ).json(),
    ).toEqual({ counted: true });
    const click = await call(kit, clickRoute.GET, item.href, { cookie: pat.full });
    expect(click.status).toBe(302);
    expect(click.headers.get('location')).toBe('https://example.com.au/soil');

    // 5. Admin sees it: the slot table, the daily counts and the sponsor report, all matching the database.
    const dbViews = Number(
      (
        await kit.db.query<{ n: string }>(
          `select count(*) as n from public.ad_events where kind = 'view'`,
        )
      ).rows[0]!.n,
    );
    const dbClicks = Number(
      (
        await kit.db.query<{ n: string }>(
          `select count(*) as n from public.ad_events where kind = 'click'`,
        )
      ).rows[0]!.n,
    );
    expect([dbViews, dbClicks]).toEqual([1, 1]);
    const slot = (await listSlots(sql())).find((s) => s.id === 'summary_sponsor_card')!;
    expect(slot).toMatchObject({ enabled: true, liveCampaigns: 1, views30: 1, clicks30: 1 });
    const daily = await dailyCounts(sql(), { days: 30 });
    expect(daily).toEqual([
      {
        day: sydneyToday(),
        slot: 'summary_sponsor_card',
        views: 1,
        clicks: 1,
        videoCompletes: 0,
        videoSkips: 0,
      },
    ]);
    const csvRes = await call(kit, reportRoute.GET, `/api/ads/admin/report?campaign=${camp.id}`, {
      cookie: admin.cookie,
    });
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers.get('content-type')).toContain('text/csv');
    expect(csvRes.headers.get('content-disposition')).toMatch(
      /^attachment; filename="campaign-[0-9a-f]{8}-report\.csv"$/,
    );
    const csv = await csvRes.text();
    expect(csv.split('\r\n')).toEqual([
      'day,slot,views,clicks,video_completes,video_skips',
      `${sydneyToday()},summary_sponsor_card,1,1,0,0`,
      'total,,1,1,0,0',
      '',
    ]);
    // Counts only: no account id, guest id, name or address anywhere in it.
    expect(csv).not.toContain(pat.id);
    expect(csv).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
    expect(reportCsv(await campaignReport(sql(), camp.id))).toBe(csv);

    // 6. The audit log has every change.
    const actions = (await auditRows()).map((r) => r.action);
    expect(actions).toEqual(
      expect.arrayContaining(['switch_set', 'ad_slot_set', 'ad_campaign_save', 'ad_creative_save']),
    );
  }, 30_000);

  it('the ad screens render for an admin with real data, and show the report numbers', async () => {
    const admin = await person(kit, 'admin', { role: 'admin' });
    await switches(kit, 'ads');
    const sp = await ok(await act({ action: 'sponsor_save', name: 'Gidgee Rural Finance' }, admin));
    const c = await campaign(kit, {
      name: 'Spring',
      slots: ['summary_sponsor_card'],
      creatives: [{ kind: 'image' }, { kind: 'text' }],
    });
    await kit.db.query(
      `insert into public.ad_events (slot_id, campaign_id, kind) values ('summary_sponsor_card', $1, 'view'), ('summary_sponsor_card', $1, 'view'), ('summary_sponsor_card', $1, 'click')`,
      [c.id],
    );
    state.cookie = admin.cookie;
    const render = async (path: string, props: Record<string, unknown> = {}) => {
      const Page = (
        (await pages[`../../app/admin/ads${path}/page.tsx`]!()) as {
          default: (p: unknown) => Promise<unknown>;
        }
      ).default;
      return renderToStaticMarkup(
        (await Page({
          params: Promise.resolve(props),
          searchParams: Promise.resolve({}),
        })) as never,
      );
    };
    const home = await render('');
    expect(home).toContain('Ads and sponsors');
    for (const id of AD_SLOTS) expect(home).toContain(id);
    expect(home).toContain('Google AdSense does nothing yet');
    expect(await render('/sponsors')).toContain('Gidgee Rural Finance');
    expect(await render('/campaigns')).toContain('Spring');
    const detail = await render('/campaigns/[id]', { id: c.id });
    expect(detail).toContain('Add an ad');
    expect(detail).toContain('Sponsored');
    expect(detail).toContain('On a phone');
    expect(detail).toContain('Ads in this campaign');
    const report = await render('/campaigns/[id]/report', { id: c.id });
    expect(report).toContain('<b>2</b> views, <b>1</b> clicks');
    expect(report).toContain('Download as CSV');
    const stats = await render('/stats');
    expect(stats).toContain('<b>2</b> views and <b>1</b> clicks');
    // The preview is not clickable and counts nothing.
    expect(detail).not.toContain('/api/ads/click/');
    // Not an admin: not found.
    state.cookie = (await person(kit, 'pat')).full;
    await expect(render('')).rejects.toThrow('NEXT_NOT_FOUND');
    void sp;
  });
});

// ---------------------------------------------------------------- every route found by walking the code

const adsRoutes = walk('app/api/ads', /^route\.ts$/).map((f) =>
  f.replace('app/api/ads/', '').replace('/route.ts', ''),
);

describe('every ads route, found by walking the code, has the gate, CSRF and limits it needs', () => {
  const KIND: Record<string, 'admin-post' | 'admin-get' | 'public-get' | 'public-post'> = {
    admin: 'admin-post',
    'admin/report': 'admin-get',
    pick: 'public-get',
    event: 'public-post',
    'click/[id]': 'public-get',
    'media/[id]': 'public-get',
  };

  it('lists every route file, and a new one fails here until it is classified', () => {
    expect(adsRoutes.length).toBeGreaterThanOrEqual(6);
    for (const r of adsRoutes) expect(Object.keys(KIND), `${r} needs a line in KIND`).toContain(r);
  });

  it('exports only the method it says, and no other', async () => {
    const mods: Record<string, Record<string, unknown>> = {
      admin: adminRoute,
      'admin/report': reportRoute,
      pick: pickRoute,
      event: eventRoute,
      'click/[id]': clickRoute,
      'media/[id]': mediaRoute,
    };
    for (const r of adsRoutes) {
      const methods = Object.keys(mods[r]!).filter((k) =>
        /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(k),
      );
      expect(methods, r).toEqual([KIND[r]!.endsWith('post') ? 'POST' : 'GET']);
    }
  });

  it('the admin routes answer everyone who is not an admin in good standing, and a copy with no keys, with the same plain 404', async () => {
    await person(kit, 'admin', { role: 'admin' });
    const pat = await person(kit, 'pat');
    const kid = await person(kit, 'kid', { age: 15 });
    const susp = await person(kit, 'susp', { role: 'admin', suspended: true });
    const banned = await person(kit, 'banned', { role: 'admin', banned: true });
    let n = 0;
    for (const who of [null, pat, kid, susp, banned]) {
      const a = await act(
        { action: 'slot_set', slot: 'phone_banner', enabled: true },
        who,
        {},
        `10.5.${kit.ip}.${++n}`,
      );
      expect(a.status, who?.username ?? 'nobody').toBe(404);
      expect(a.headers.get('x-robots-tag')).toBeNull();
      expect(await a.text()).toBe('{"error":"Not found."}');
      const r = await call(kit, reportRoute.GET, '/api/ads/admin/report?campaign=x', {
        cookie: who?.cookie,
        address: `10.5.${kit.ip}.${++n}`,
      });
      expect(r.status).toBe(404);
      expect(r.headers.get('x-robots-tag')).toBeNull();
    }
    setAuthDeps(null);
    expect(
      (await act({ action: 'slot_set', slot: 'phone_banner', enabled: true }, null)).status,
    ).toBe(404);
    expect((await call(kit, reportRoute.GET, '/api/ads/admin/report?campaign=x')).status).toBe(404);
    expect(await auditRows()).toEqual([]);
    expect((await kit.db.query(`select 1 from public.ad_slots where enabled`)).rowCount).toBe(0);
  });

  it('the admin write route refuses another site, a cross-site fetch and a non-JSON body, and an admin who passes is marked noindex', async () => {
    const admin = await person(kit, 'admin', { role: 'admin' });
    const body = { action: 'slot_set', slot: 'phone_banner', enabled: true };
    expect((await act(body, admin, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await act(body, admin, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await act(body, admin, { 'content-type': 'text/plain' })).status).toBe(403);
    const good = await act(body, admin);
    expect(good.status).toBe(200);
    expect(good.headers.get('x-robots-tag')).toContain('noindex');
  });

  it('a failed audit write rolls the change back and answers a plain 500, for every action', async () => {
    const admin = await person(kit, 'admin', { role: 'admin' });
    const sp = await ok(await act({ action: 'sponsor_save', name: 'S' }, admin));
    const camp = await ok(
      await act(
        {
          action: 'campaign_save',
          name: 'C',
          house: true,
          startDay: '2026-12-01',
          slots: [],
          active: false,
        },
        admin,
      ),
    );
    const cr = await ok(
      await act(
        { action: 'creative_save', campaignId: camp.id, kind: 'text', headline: 'H' },
        admin,
      ),
    );
    const digest = async () =>
      JSON.stringify(
        (
          await kit.db.query(
            `select (select jsonb_agg(to_jsonb(t) order by slot_id) from public.ad_slots t) a, (select jsonb_agg(to_jsonb(t) order by id) from public.sponsors t) b, (select jsonb_agg(to_jsonb(t) order by id) from public.campaigns t) c, (select jsonb_agg(to_jsonb(t) order by id) from public.ad_creatives t) d, (select count(*) from public.campaign_slots) e, (select count(*) from public.admin_audit_log) f`,
          )
        ).rows,
      );
    const failing: SqlClient = {
      query: (t, p) => sql().query(t, p),
      transaction: (fn) =>
        sql().transaction((tx) =>
          fn({
            query: (t: string, p?: unknown[]) =>
              /insert into public\.admin_audit_log/.test(t)
                ? Promise.reject(new Error('audit write failed'))
                : tx.query(t, p),
          } as SqlRunner),
        ),
    };
    const before = await digest();
    setAuthDeps({ ...kit.deps, sql: failing });
    const bodies = [
      { action: 'slot_set', slot: 'phone_banner', enabled: true },
      { action: 'sponsor_save', name: 'Changed' },
      { action: 'sponsor_save', id: sp.id, name: 'Changed' },
      { action: 'sponsor_delete', id: sp.id },
      {
        action: 'campaign_save',
        name: 'New',
        house: true,
        startDay: '2026-12-01',
        slots: ['pc_banner'],
        active: true,
      },
      {
        action: 'campaign_save',
        id: camp.id,
        name: 'Changed',
        house: true,
        startDay: '2026-12-01',
        slots: ['pc_banner'],
        active: true,
      },
      { action: 'campaign_delete', id: camp.id },
      { action: 'creative_save', campaignId: camp.id, kind: 'text', headline: 'New' },
      {
        action: 'creative_save',
        id: cr.id,
        campaignId: camp.id,
        kind: 'text',
        headline: 'Changed',
      },
      { action: 'creative_delete', id: cr.id },
    ];
    for (const b of bodies) {
      const res = await act(b, admin);
      expect(res.status, JSON.stringify(b)).toBe(500);
      expect(await res.text()).not.toMatch(/audit write failed/);
    }
    setAuthDeps(kit.deps);
    expect(await digest()).toBe(before);
  });

  it('with no keys every public route answers "nothing", and the screen is told no slots', async () => {
    const c = await campaign(kit, { house: true, slots: [...AD_SLOTS] });
    setAuthDeps(null);
    expect(
      await (await call(kit, pickRoute.GET, '/api/ads/pick?slot=phone_banner')).json(),
    ).toEqual({ items: [] });
    expect(
      await (
        await call(kit, eventRoute.POST, '/api/ads/event', { body: { token: 'x', kind: 'view' } })
      ).json(),
    ).toEqual({ counted: false });
    expect(
      (await call(kit, clickRoute.GET, `/api/ads/click/${c.creatives[0]}?s=phone_banner`)).status,
    ).toBe(404);
    expect((await call(kit, mediaRoute.GET, `/api/ads/media/${c.creatives[0]}`)).status).toBe(404);
    const me = (await (await call(kit, meRoute.GET, '/api/auth/me')).json()) as { ads: string[] };
    expect(me.ads).toEqual([]);
  });

  it('the public routes have their own limits: pick, event and click answer 429 past them', async () => {
    const pat = await person(kit, 'pat');
    const same = `10.4.${kit.ip}.9`;
    const pickAt = () =>
      call(kit, pickRoute.GET, '/api/ads/pick?slot=phone_banner', {
        cookie: pat.full,
        address: same,
      });
    let last = 200;
    for (let i = 0; i < 61; i++) last = (await pickAt()).status;
    expect(last).toBe(429);
    // A different player is not held back by it.
    const bob = await person(kit, 'bob');
    expect(
      (
        await call(kit, pickRoute.GET, '/api/ads/pick?slot=phone_banner', {
          cookie: bob.full,
          address: same,
        })
      ).status,
    ).toBe(200);
    let ev = 200;
    for (let i = 0; i < 121; i++)
      ev = (
        await call(kit, eventRoute.POST, '/api/ads/event', {
          body: { token: 'x', kind: 'view' },
          cookie: pat.full,
          address: same,
        })
      ).status;
    expect(ev).toBe(429);
    let cl = 404;
    const click = `/api/ads/click/00000000-0000-4000-8000-000000000000?s=phone_banner`;
    for (let i = 0; i < 31; i++)
      cl = (await call(kit, clickRoute.GET, click, { cookie: pat.full, address: same })).status;
    expect(cl).toBe(429);
    const admin = await person(kit, 'admin', { role: 'admin' });
    let rep = 404;
    for (let i = 0; i < 21; i++)
      rep = (
        await call(
          kit,
          reportRoute.GET,
          '/api/ads/admin/report?campaign=00000000-0000-4000-8000-000000000000',
          { cookie: admin.cookie, address: `10.4.${kit.ip}.10` },
        )
      ).status;
    expect(rep).toBe(429);
  }, 30_000);

  it('an unknown slot or a missing one is a 400 on pick, and nothing is chosen', async () => {
    for (const q of ['', '?slot=nope', '?slot=', '?slot=phone_banner;drop']) {
      const res = await call(kit, pickRoute.GET, `/api/ads/pick${q}`);
      expect(res.status, q).toBe(400);
    }
  });

  it('the viewer record for a guest or for nobody never carries profile answers', () => {
    expect(ANON).toEqual({
      userId: null,
      guestId: null,
      underSixteen: false,
      farms: null,
      state: null,
    });
    void PEPPER;
  });

  it('the AdSense switch and unit id exist in the data but nothing reads them to load a script', () => {
    const files = [
      ...walk('components', /\.tsx?$/),
      ...walk('app', /\.tsx?$/),
      ...walk('server/ads', /\.ts$/),
    ];
    for (const f of files) {
      if (/\.test\.ts$/.test(f) || f.endsWith('adsense.ts')) continue;
      expect(readFileSync(join(root, f), 'utf8'), f).not.toMatch(/adsense_unit_id|adsbygoogle/);
    }
  });
});
