import { describe, expect, it } from 'vitest';
import { fixtureFeed, liveFeed, parseMlaDay, parseSiloDay } from './feed';

const HEADER =
  'latitude,longitude,YYYY-MM-DD,daily_rain,daily_rain_source,max_temp,max_temp_source,min_temp,min_temp_source,radiation,radiation_source,evap_comb,evap_comb_source,et_short_crop,et_short_crop_source,metadata';

describe('the feeds', () => {
  it('reads one day of SILO by column name, and says "not in yet" when the day is not there', () => {
    const body = `${HEADER}\n-23.55,148.2,2026-11-14,3.2,25,31.4,25,19.1,25,22.4,42,7.1,26,5.6,26,`;
    expect(parseSiloDay(body, '2026-11-14')).toEqual({
      rain: 3.2,
      tmax: 31.4,
      tmin: 19.1,
      rad: 22.4,
      evap: 7.1,
      et0: 5.6,
    });
    expect(parseSiloDay(body, '2026-11-15')).toBeNull();
    // Without rain or evapotranspiration the growth model has nothing to read: the day is not in.
    expect(parseSiloDay(`${HEADER}\n-23.55,148.2,2026-11-14,,25,31,25,19,25,22,42,7,26,5.6,26,`, '2026-11-14')).toBeNull();
    expect(() => parseSiloDay('nothing useful', '2026-11-14')).toThrow();
  });

  it('reads one day of an MLA indicator, and treats no row as no row', () => {
    const body = { data: [{ calendar_date: '2026-11-14', indicator_value: 612.345, head_count: 4021 }] };
    expect(parseMlaDay(body, '2026-11-14')).toEqual({ value: 612.35, head: 4021 });
    expect(parseMlaDay(body, '2026-11-15')).toBeNull();
    expect(() => parseMlaDay({ nope: 1 }, '2026-11-14')).toThrow();
  });

  it('asks SILO with the contact address from the environment and never anywhere else', async () => {
    const urls: string[] = [];
    const fetcher = (async (url: string) => {
      urls.push(url);
      return new Response(
        url.includes('longpaddock')
          ? `${HEADER}\n-23.55,148.2,2026-11-14,0,25,31,25,19,25,22,42,7,26,5,26,`
          : JSON.stringify({ data: [{ calendar_date: '2026-11-14', indicator_value: 600, head_count: 10 }] }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const feed = liveFeed({ siloUser: 'test-user-not-real', fetch: fetcher });
    expect(await feed.weather('cq', '2026-11-14')).toMatchObject({ rain: 0, et0: 5 });
    expect(await feed.prices({ indicator: 'feeder-steer', saleyard: 'GME' }, '2026-11-14')).toEqual({ value: 600, head: 10 });
    expect(await feed.prices({ indicator: 'feeder-steer', saleyard: 'national' }, '2026-11-14')).toEqual({ value: 600, head: 10 });
    expect(urls[0]).toContain('start=20261114&finish=20261114');
    expect(urls[1]).toContain('report/6?indicatorID=3');
    expect(urls[2]).toContain('report/5?indicatorID=3');
    // Without the address, SILO is not asked at all.
    await expect(liveFeed({ siloUser: undefined, fetch: fetcher }).weather('cq', '2026-11-14')).rejects.toThrow(
      /SILO_CONTACT_EMAIL/,
    );
    expect(urls).toHaveLength(3);
    // A service that answers badly waits for the next run.
    const bad = liveFeed({ siloUser: 'x', fetch: (async () => new Response('no', { status: 503 })) as unknown as typeof fetch });
    await expect(bad.weather('cq', '2026-11-14')).rejects.toThrow();
  });

  it('the fixture feed serves what it was given and remembers what it was asked', async () => {
    const feed = fixtureFeed({ weather: { 'cq 2026-11-14': { rain: 1, tmax: null, tmin: null, rad: null, evap: null, et0: 4 } } });
    expect(await feed.weather('cq', '2026-11-14')).toMatchObject({ rain: 1 });
    expect(await feed.weather('cq', '2026-11-15')).toBeNull();
    expect(feed.asked).toHaveLength(2);
  });
});
