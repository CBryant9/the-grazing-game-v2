import type { PGlite } from '@electric-sql/pglite';
import type { AdSlotId } from '@gg/shared';
import { freshDb } from '../../../../packages/db/src/harness';
import { resetSwitchCache, type AuthDeps } from '../auth/accounts';
import { setAuthDeps } from '../auth/deps';
import { TRUSTED_IP_HEADER_ENV, resetRateLimits } from '../game/http';
import { FakeAuth } from '../test-support/fakeAuth';
import { pgliteSql } from '../test-support/pgliteSql';
import { memoryAdMedia, setAdMediaStore } from './media';
import { setNoAdsReader } from './serve';
import { resetAdCache } from './slots';

/**
 * What the ad tests share: a database on PGlite with every migration, the fake sign-in provider,
 * people (a visitor, an adult, an under-16, an admin), campaigns made straight in the database,
 * and a way to call the route files the way a browser would. Nothing here is used by the site.
 */
export const PEPPER = 'pepper-for-tests-'.padEnd(48, 'x');
export const HOST = 'http://localhost:3000';

export interface Person {
  id: string;
  cookie: string;
  full: string;
  username: string;
}

export interface Kit {
  db: PGlite;
  auth: FakeAuth;
  deps: AuthDeps;
  media: ReturnType<typeof memoryAdMedia>;
  people: Record<string, Person>;
  slotDefaults: Map<string, unknown>;
  ip: number;
}

export async function startKit(): Promise<Kit> {
  process.env[TRUSTED_IP_HEADER_ENV] = 'x-real-ip';
  const db = await freshDb({ seed: false });
  const slots = await db.query<{ slot_id: string; settings: unknown }>(
    'select slot_id, settings from public.ad_slots',
  );
  return {
    db,
    auth: undefined as never,
    deps: undefined as never,
    media: memoryAdMedia(),
    people: {},
    slotDefaults: new Map(slots.rows.map((r) => [r.slot_id, r.settings])),
    ip: 0,
  };
}

export async function stopKit(kit: Kit): Promise<void> {
  delete process.env[TRUSTED_IP_HEADER_ENV];
  setAuthDeps(undefined);
  setNoAdsReader(undefined);
  setAdMediaStore(undefined);
  await kit.db.close();
}

/** Empty everything a test can change and start again with fresh people and an empty media store. */
export async function resetKit(kit: Kit): Promise<void> {
  const { db } = kit;
  await db.exec(
    `update public.account_status set banned_at = null, suspended_until = null;
     truncate public.admin_audit_log;
     delete from public.ad_events; delete from public.ad_daily;
     delete from public.campaigns; delete from public.sponsors;
     delete from public.account_entitlements;
     delete from public.rate_limit_hits;
     update public.rate_limit_rules set max_count = 300 where action = 'ad_view';
     update public.rate_limit_rules set max_count = 60 where action = 'ad_click';
     delete from public.farms; delete from public.guest_sessions; delete from auth.users;
     update public.ad_slots set enabled = false;
     update public.feature_switches set enabled = false, updated_by = null;`,
  );
  for (const [id, settings] of kit.slotDefaults) {
    await db.query('update public.ad_slots set settings = $2::jsonb where slot_id = $1', [
      id,
      JSON.stringify(settings),
    ]);
  }
  resetRateLimits();
  resetSwitchCache();
  resetAdCache();
  setNoAdsReader(undefined);
  kit.media = memoryAdMedia();
  setAdMediaStore(kit.media);
  kit.auth = new FakeAuth(db);
  kit.deps = { provider: kit.auth, sql: pgliteSql(db), pepper: PEPPER };
  setAuthDeps(kit.deps);
  kit.people = {};
  kit.ip++;
}

export async function person(
  kit: Kit,
  key: string,
  opts: {
    role?: string;
    age?: number;
    suspended?: boolean;
    banned?: boolean;
    farms?: boolean;
    state?: string;
  } = {},
): Promise<Person> {
  const { user, cookie, full } = await kit.auth.signInAs(`${key}@example.test`);
  const username = `u_${key}`.slice(0, 20);
  await kit.db.query(
    'insert into public.profiles (user_id, username, farms, state) values ($1, $2, $3, $4)',
    [user.id, username, opts.farms ?? null, opts.state ?? null],
  );
  await kit.db.query(
    `insert into public.account_private (user_id, date_of_birth, terms_accepted_at)
     values ($1, ((now() at time zone 'Australia/Sydney')::date - ($2 || ' years')::interval)::date, now())`,
    [user.id, String(opts.age ?? 30)],
  );
  await kit.db.query(
    'insert into public.account_status (user_id, role, suspended_until, banned_at) values ($1, $2, $3, $4)',
    [
      user.id,
      opts.role ?? 'player',
      opts.suspended ? new Date(Date.now() + 86_400_000).toISOString() : null,
      opts.banned ? new Date().toISOString() : null,
    ],
  );
  return (kit.people[key] = { id: user.id, cookie, full, username });
}

/** A guest session row and the cookie value that names it. */
export async function guest(kit: Kit): Promise<{ id: string; cookie: string }> {
  const { createHash, randomBytes } = await import('node:crypto');
  const secret = randomBytes(16).toString('hex');
  const hash = createHash('sha256').update(secret).digest('hex');
  const r = await kit.db.query<{ id: string }>(
    'insert into public.guest_sessions (token_hash) values ($1) returning id',
    [hash],
  );
  return { id: r.rows[0]!.id, cookie: `gg_session=${secret}` };
}

export async function switches(kit: Kit, ...keys: string[]): Promise<void> {
  for (const k of keys) {
    await kit.db.query(
      `insert into public.feature_switches (key, enabled) values ($1, true)
       on conflict (key) do update set enabled = true`,
      [k],
    );
  }
  resetSwitchCache();
  resetAdCache();
}

export async function slotOnDb(kit: Kit, ...slots: AdSlotId[]): Promise<void> {
  for (const s of slots) {
    await kit.db.query('update public.ad_slots set enabled = true where slot_id = $1', [s]);
  }
  resetAdCache();
}

export interface CampaignSpec {
  house?: boolean;
  name?: string;
  slots: AdSlotId[];
  active?: boolean;
  startsAt?: string;
  endsAt?: string | null;
  targeting?: Record<string, unknown>;
  weight?: number;
  maxViews?: number | null;
  perViewerDay?: number | null;
  creatives?: {
    kind?: 'image' | 'video' | 'text' | 'logo';
    headline?: string;
    active?: boolean;
    link?: string | null;
  }[];
}

/** A campaign, its slots and its creatives, written straight into the database. */
export async function campaign(
  kit: Kit,
  spec: CampaignSpec,
): Promise<{ id: string; creatives: string[]; sponsorId: string | null }> {
  let sponsorId: string | null = null;
  if (!spec.house) {
    sponsorId = (
      await kit.db.query<{ id: string }>(
        `insert into public.sponsors (name) values ($1) returning id`,
        [`Sponsor ${spec.name ?? 'x'}`],
      )
    ).rows[0]!.id;
  }
  const c = await kit.db.query<{ id: string }>(
    `insert into public.campaigns
       (sponsor_id, is_house_ad, name, starts_at, ends_at, targeting, weight, active, max_views, max_views_per_viewer_day)
     values ($1, $2, $3, coalesce($4::timestamptz, now() - interval '1 day'), $5::timestamptz, $6::jsonb, $7, $8, $9, $10)
     returning id`,
    [
      sponsorId,
      spec.house ?? false,
      spec.name ?? 'Test campaign',
      spec.startsAt ?? null,
      spec.endsAt ?? null,
      JSON.stringify(spec.targeting ?? {}),
      spec.weight ?? 1,
      spec.active ?? true,
      spec.maxViews ?? null,
      spec.perViewerDay ?? null,
    ],
  );
  const id = c.rows[0]!.id;
  for (const s of spec.slots) {
    await kit.db.query('insert into public.campaign_slots (campaign_id, slot_id) values ($1, $2)', [
      id,
      s,
    ]);
  }
  const creatives: string[] = [];
  for (const cr of spec.creatives ?? [{ kind: 'text' as const }]) {
    const kind = cr.kind ?? 'text';
    const media = kind !== 'text';
    const r = await kit.db.query<{ id: string }>(
      `insert into public.ad_creatives (campaign_id, kind, headline, body, link_url, media_path, media_mime, active, alt)
       values ($1, $2, $3, 'One line', $4, $5, $6, $7, 'A farm') returning id`,
      [
        id,
        kind,
        cr.headline ?? 'Pasture advice',
        cr.link === undefined ? 'https://example.com.au/offer' : cr.link,
        media ? `${id}/file.${kind === 'video' ? 'mp4' : 'png'}` : null,
        media ? (kind === 'video' ? 'video/mp4' : 'image/png') : null,
        cr.active ?? true,
      ],
    );
    creatives.push(r.rows[0]!.id);
  }
  resetAdCache();
  return { id, creatives, sponsorId };
}

type Handler = (req: Request) => Promise<Response>;

/** Call a route handler the way a browser would, from a made-up address, with a cookie if given. */
export async function call(
  kit: Kit,
  handler: Handler,
  path: string,
  options: {
    method?: 'GET' | 'POST';
    body?: unknown;
    cookie?: string | null;
    headers?: Record<string, string>;
    address?: string;
  } = {},
): Promise<Response> {
  const method = options.method ?? (options.body !== undefined ? 'POST' : 'GET');
  return handler(
    new Request(`${HOST}${path}`, {
      method,
      redirect: 'manual',
      headers: {
        host: 'localhost:3000',
        'x-real-ip': options.address ?? `10.9.${kit.ip % 250}.${(kit.ip >> 8) + 1}`,
        ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(options.cookie ? { cookie: options.cookie } : {}),
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    }),
  );
}
