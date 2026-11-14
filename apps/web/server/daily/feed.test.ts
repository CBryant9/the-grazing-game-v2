import { describe, expect, it } from 'vitest';
import { fixtureFeed, liveFeed, parseMla, parseSilo, parseYardings } from './feed';

const HEADER =
  'latitude,longitude,YYYY-MM-DD,daily_rain,daily_rain_source,max_temp,max_temp_source,min_temp,min_temp_source,radiation,radiation_source,evap_comb,evap_comb_source,et_short_crop,et_short_crop_source,metadata';
const ROW = (date: string, rain = '3.2', et0 = '5.6'): string =>
  `-23.55,148.2,${date},${rain},25,31.4,25,19.1,25,22.4,42,7.1,26,${et0},26,`;

describe('the feeds', () => {
  it('reads the days SILO gives by column name, and leaves out a day without rain or evapotranspiration', () => {
    const body = [
      HEADER,
      ROW('2026-11-13'),
      ROW('2026-11-14', '', '5.6'),
      ROW('2026-11-15', '0', '4.8'),
    ].join('\n');
    const rows = parseSilo(body, '2026-11-13', '2026-11-15');
    expect(rows.map((r) => r.date)).toEqual(['2026-11-13', '2026-11-15']);
    expect(rows[0]!.row).toEqual({
      rain: 3.2,
      tmax: 31.4,
      tmin: 19.1,
      rad: 22.4,
      evap: 7.1,
      et0: 5.6,
    });
    expect(parseSilo(body, '2026-11-20', '2026-11-21')).toEqual([]);
    expect(() => parseSilo('nothing useful', '2026-11-13', '2026-11-15')).toThrow();
  });

  it('reads the days of an MLA indicator in the range, and the sale days of a yard by type', () => {
    const body = {
      data: [
        { calendar_date: '2026-11-13', indicator_value: 612.345, head_count: 4021 },
        { calendar_date: '2026-11-14', indicator_value: 0, head_count: 10 },
        { calendar_date: '2026-11-30', indicator_value: 600, head_count: 10 },
      ],
    };
    expect(parseMla(body, '2026-11-13', '2026-11-20')).toEqual([
      { date: '2026-11-13', row: { value: 612.35, head: 4021 } },
    ]);
    expect(() => parseMla({ nope: 1 }, '2026-11-13', '2026-11-20')).toThrow();
    const yard = {
      data: [
        { result_date: '2026-11-13', tranx_type_id: 'Store ', head_count: 80 },
        { result_date: '2026-11-13', tranx_type_id: 'Prime', head_count: 300 },
        { result_date: '2026-11-13', tranx_type_id: 'Other', head_count: 5 },
      ],
    };
    expect(parseYardings(yard, '2026-11-13', '2026-11-20')).toEqual([
      { date: '2026-11-13', row: { type: 'Prime', head: 300 } },
      { date: '2026-11-13', row: { type: 'Store', head: 80 } },
    ]);
  });

  it('asks SILO and MLA a range at a time, with the contact address from the environment and nowhere else', async () => {
    const urls: string[] = [];
    const fetcher = (async (url: string) => {
      urls.push(url);
      return new Response(
        url.includes('longpaddock')
          ? [HEADER, ROW('2026-11-13'), ROW('2026-11-14')].join('\n')
          : JSON.stringify({
              data: [{ calendar_date: '2026-11-14', indicator_value: 600, head_count: 10 }],
            }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const feed = liveFeed({ siloUser: 'test-user-not-real', fetch: fetcher });
    expect(await feed.weather('cq', '2026-11-13', '2026-11-14')).toHaveLength(2);
    expect(
      await feed.prices({ indicator: 'feeder-steer', saleyard: 'GME' }, '2026-11-13', '2026-11-14'),
    ).toEqual([{ date: '2026-11-14', row: { value: 600, head: 10 } }]);
    await feed.prices(
      { indicator: 'feeder-steer', saleyard: 'national' },
      '2026-11-13',
      '2026-11-14',
    );
    await feed.yardings('GME', '2026-11-13', '2026-11-14');
    expect(urls[0]).toContain('start=20261113&finish=20261114');
    expect(urls[1]).toContain('report/6?indicatorID=3');
    expect(urls[2]).toContain('report/5?indicatorID=3');
    expect(urls[3]).toContain('report/4?category=Cattle&saleyardID=GME');
    // Without the address, SILO is not asked at all.
    await expect(
      liveFeed({ siloUser: undefined, fetch: fetcher }).weather('cq', '2026-11-13', '2026-11-14'),
    ).rejects.toThrow(/SILO_CONTACT_EMAIL/);
    expect(urls).toHaveLength(4);
    // A service that answers badly is asked again at the next run.
    const bad = liveFeed({
      siloUser: 'x',
      fetch: (async () => new Response('no', { status: 503 })) as unknown as typeof fetch,
    });
    await expect(bad.weather('cq', '2026-11-13', '2026-11-14')).rejects.toThrow();
  });

  it('gives every request a short timeout', async () => {
    let signal: AbortSignal | undefined;
    const fetcher = (async (_url: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    await liveFeed({ siloUser: 'x', fetch: fetcher }).yardings('GME', '2026-11-13', '2026-11-14');
    expect(signal).toBeDefined();
    expect(signal!.aborted).toBe(false);
  });

  it('the fixture feed serves what it was given, a range at a time, and remembers what it was asked', async () => {
    const feed = fixtureFeed({
      weather: {
        'cq 2026-11-14': { rain: 1, tmax: null, tmin: null, rad: null, evap: null, et0: 4 },
      },
    });
    expect(await feed.weather('cq', '2026-11-13', '2026-11-15')).toEqual([
      {
        date: '2026-11-14',
        row: { rain: 1, tmax: null, tmin: null, rad: null, evap: null, et0: 4 },
      },
    ]);
    expect(await feed.weather('cq', '2026-11-20', '2026-11-21')).toEqual([]);
    expect(feed.asked).toHaveLength(2);
  });
});
