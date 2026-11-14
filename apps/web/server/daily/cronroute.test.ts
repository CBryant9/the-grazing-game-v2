import { describe, expect, it, vi } from 'vitest';
import { handleRollover, type RolloverDeps } from './cronroute';

const SECRET = 'a-long-random-test-secret-not-a-real-one';
const call = (headers: Record<string, string> = {}): Request =>
  new Request('http://localhost/api/daily/rollover', { headers });
const report = {
  ranAt: '2026-11-15T00:00:00.000Z',
  fetched: [],
  dataWaiting: [],
  claimed: 0,
  farmsAdvanced: 0,
  daysAdvanced: 0,
  farmsWaiting: 0,
  failed: 0,
  more: false,
};

describe('the rollover route and its secret', () => {
  it('is shut (404) when no secret is set, and runs nothing', async () => {
    const run = vi.fn(async () => report);
    const res = await handleRollover(call({ authorization: `Bearer ${SECRET}` }), {
      secret: undefined,
      run,
    });
    expect(res.status).toBe(404);
    expect(run).not.toHaveBeenCalled();
  });

  it('refuses a missing, wrong or badly made secret with 401 and no detail, and runs nothing', async () => {
    const run = vi.fn(async () => report);
    const deps: RolloverDeps = { secret: SECRET, run };
    const bad: Record<string, string>[] = [
      {},
      { authorization: 'Bearer nope' },
      { authorization: SECRET },
      { authorization: `Basic ${SECRET}` },
      { authorization: `Bearer ${SECRET}x` },
      { authorization: `bearer ${SECRET}` },
    ];
    for (const headers of bad) {
      const res = await handleRollover(call(headers), deps);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Not allowed.' });
    }
    expect(run).not.toHaveBeenCalled();
  });

  it('runs once for the right secret and answers with what it did', async () => {
    const run = vi.fn(async () => ({ ...report, daysAdvanced: 3 }));
    const res = await handleRollover(call({ authorization: `Bearer ${SECRET}` }), {
      secret: SECRET,
      run,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toMatchObject({ ok: true, daysAdvanced: 3 });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('answers a run that did nothing because Daily Farm is off or there is no database', async () => {
    for (const skipped of ['daily_farm_off', 'no_database'] as const) {
      const res = await handleRollover(call({ authorization: `Bearer ${SECRET}` }), {
        secret: SECRET,
        run: async () => ({ skipped }),
      });
      expect(await res.json()).toEqual({ ok: true, skipped });
    }
  });

  it('a run that throws is a plain 500 with no stack and no secret in it', async () => {
    const res = await handleRollover(call({ authorization: `Bearer ${SECRET}` }), {
      secret: SECRET,
      run: async () => {
        throw new Error(`boom ${SECRET}`);
      },
    });
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain(SECRET);
    expect(text).not.toMatch(/boom|stack/);
  });
});
