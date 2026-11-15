import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetSwitchCache } from '../auth/accounts';
import { setAuthDeps } from '../auth/deps';
import { handleRollover } from '../daily/cronroute';
import { at, choices, database, keepThrough, rig, type Rig } from '../daily/testrig';
import { setGameServer } from '../game/game';
import { TRUSTED_IP_HEADER_ENV, resetRateLimits } from '../game/http';
import { FakeAuth } from '../test-support/fakeAuth';

/*
 * Launch check (m5.5), flow 3: a Daily Farm is started, the midnight rollover runs, and next
 * morning the farm shows the new day. The player signs up and plays through the real route
 * handlers. The rollover goes through the rollover route's own handler (secret check and all),
 * with the Daily Farm test rig's clock, data and run in place of the environment's.
 */

const PEPPER = 'pepper-for-tests-'.padEnd(48, 'x');
const HOST = 'http://localhost:3000';
const SECRET = 'launch-check-rollover-secret-for-tests';
type Handler = (req: Request) => Promise<Response>;
type Mod = { GET?: Handler; POST?: Handler };
const routes: Record<string, Mod> = {};

let r: Rig;
let auth: FakeAuth;

beforeAll(async () => {
  process.env[TRUSTED_IP_HEADER_ENV] = 'x-real-ip';
  routes.email = (await import('@/app/api/auth/email/route')) as Mod;
  routes.callback = (await import('@/app/auth/callback/route')) as Mod;
  routes.finish = (await import('@/app/api/auth/finish/route')) as Mod;
  routes.farm = (await import('@/app/api/game/farm/route')) as Mod;
  routes.act = (await import('@/app/api/game/act/route')) as Mod;
  routes.record = (await import('@/app/api/game/record/route')) as Mod;
}, 120_000);
afterAll(async () => {
  delete process.env[TRUSTED_IP_HEADER_ENV];
  setAuthDeps(undefined);
  setGameServer(undefined);
  await (await database()).close();
});

const cookies = new Map<string, string>();
async function call(route: string, method: 'GET' | 'POST', path: string, body?: unknown) {
  const res = await routes[route]![method]!(
    new Request(`${HOST}${path}`, {
      method,
      headers: {
        host: 'localhost:3000',
        'x-real-ip': '10.77.0.1',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(cookies.size ? { cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  for (const line of res.headers.getSetCookie()) {
    const [pair, ...attrs] = line.split(';');
    const eq = pair!.indexOf('=');
    const name = pair!.slice(0, eq);
    const value = pair!.slice(eq + 1);
    if (value === '' || attrs.some((a) => /max-age=0/i.test(a))) cookies.delete(name);
    else cookies.set(name, decodeURIComponent(value));
  }
  return res;
}

interface Snap {
  day: number;
  date: { year: number; month: number; date: number };
  farmVersion: string;
  daily: { timezone: string; work: string } | null;
  mobs: { id: number; supp: string; suppOptions: { id: string }[] }[];
}

const rollover = (secret: string) =>
  handleRollover(
    new Request(`${HOST}/api/daily/rollover`, { headers: { authorization: `Bearer ${secret}` } }),
    { secret: SECRET, run: () => r.roll({ feed: false }) },
  );

describe('launch flow 3: Daily Farm start, rollover, next morning', () => {
  it('a farm started today is one day on after midnight, with today kept in its diary', async () => {
    resetRateLimits();
    r = await rig({ date: '2026-11-13', time: '10:00:00' });
    await keepThrough(r, '2026-11-16');
    await r.db.exec(
      `delete from auth.users where email like 'launch.%';
       update public.feature_switches set enabled = true where key in ('signups_open', 'daily_farm');`,
    );
    resetSwitchCache();
    auth = new FakeAuth(r.db);
    setAuthDeps({ provider: auth, sql: r.sql, pepper: PEPPER });
    setGameServer(r.game);

    // Sign up.
    expect(
      (await call('email', 'POST', '/api/auth/email', { email: 'launch.daily@example.test' }))
        .status,
    ).toBe(200);
    const link = auth.sent[auth.sent.length - 1]!;
    const url = new URL(link.redirectTo);
    url.searchParams.set('code', link.code);
    expect((await call('callback', 'GET', `${url.pathname}${url.search}`)).status).toBe(303);
    const fin = await call('finish', 'POST', '/api/auth/finish', {
      username: 'launch_daily',
      dob: '1985-06-15',
    });
    expect(fin.status).toBe(200);

    // Start a Daily Farm at 10 am Sydney time on 13 November.
    const made = await call('farm', 'POST', '/api/game/farm', choices({ name: 'Launch Daily' }));
    expect(made.status).toBe(200);
    const start = ((await made.json()) as { snapshot: Snap }).snapshot;
    expect(start.day).toBe(0);
    expect(start.date).toEqual({ year: 2026, month: 10, date: 13 });
    expect(start.daily).toMatchObject({ timezone: 'Australia/Sydney', work: 'not-started' });

    // A job today.
    const mob = start.mobs.find((m) => m.suppOptions.some((o) => o.id !== m.supp))!;
    const supp = mob.suppOptions.find((o) => o.id !== mob.supp)!.id;
    const acted = await call('act', 'POST', '/api/game/act', {
      action: { type: 'setSupplement', mob: mob.id, supp },
      version: start.farmVersion,
      requestId: 'launch-daily-0001',
    });
    expect(acted.status).toBe(200);
    expect(((await acted.json()) as { ok: boolean }).ok).toBe(true);

    // Before midnight the rollover finds nothing owed.
    r.clock.now = at('2026-11-13', '23:50:00');
    const early = await rollover(SECRET);
    expect(early.status).toBe(200);
    expect(await early.json()).toMatchObject({ ok: true, daysAdvanced: 0 });

    // The cron call with a wrong secret runs nothing.
    r.clock.now = at('2026-11-14', '00:10:00');
    expect((await rollover('not-the-secret')).status).toBe(401);
    const sim = async () =>
      (
        await r.db.query<{ s: string }>(
          "select to_char(sim_through,'YYYY-MM-DD') as s from public.farms",
        )
      ).rows[0]!.s;
    expect(await sim()).toBe('2026-11-12');

    // Just after midnight, the run closes 13 November.
    const run = await rollover(SECRET);
    expect(run.status).toBe(200);
    expect(await run.json()).toMatchObject({
      ok: true,
      claimed: 1,
      farmsAdvanced: 1,
      daysAdvanced: 1,
      failed: 0,
    });
    expect(await sim()).toBe('2026-11-13');

    // Next morning the farm is on 14 November, day 1, with the job carried through.
    r.clock.now = at('2026-11-14', '07:00:00');
    const morning = (
      (await (await call('farm', 'GET', '/api/game/farm')).json()) as {
        snapshot: Snap;
      }
    ).snapshot;
    expect(morning.day).toBe(1);
    expect(morning.date).toEqual({ year: 2026, month: 10, date: 14 });
    expect(morning.daily).toMatchObject({ work: 'not-started' });
    expect(morning.mobs.find((m) => m.id === mob.id)!.supp).toBe(supp);
    const record = await call('record', 'GET', '/api/game/record');
    expect(record.status).toBe(200);
    const rec = (await record.json()) as { diary: unknown[] };
    expect(rec.diary.length).toBeGreaterThan(0);
  }, 300_000);
});
