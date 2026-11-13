import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MapLab, type MapLabStart } from '@/components/dev/MapLab';
import { devPagesOn, mapFixtures } from '@/lib/devPages';

// A builders' page for looking at the map. It is not part of the live site:
// it is left out of the sitemap, marked noindex, and returns 404 in a
// production build unless GG_DEV_PAGES=1.
export const metadata: Metadata = {
  title: 'Map test page',
  robots: { index: false, follow: false },
};

// Decided when the page is asked for, so the flag works without a rebuild.
export const dynamic = 'force-dynamic';

type Query = Record<string, string | string[] | undefined>;

const LAYER_IDS = ['waterReach', 'quality', 'grazed', 'arable', 'pipe', 'labels'] as const;

/**
 * Where the page starts, from the address. For example:
 * /dev/map?fixture=cq-4000-head&theme=light&zoom=40&at=12,8&controls=0&bench=1
 */
function startFrom(query: Query): MapLabStart {
  const one = (key: string): string | undefined => {
    const v = query[key];
    return Array.isArray(v) ? v[0] : v;
  };
  const num = (key: string): number | undefined => {
    const v = Number(one(key));
    return Number.isFinite(v) && v > 0 ? v : undefined;
  };
  const theme = one('theme');
  const weather = one('weather');
  const layers = (one('layers') ?? '').split(',');
  // at=column,row
  const at = (one('at') ?? '').split(',').map(Number);
  return {
    fixture: one('fixture'),
    theme: theme === 'light' || theme === 'dark' ? theme : undefined,
    zoom: num('zoom'),
    at:
      at.length === 2 && at.every((v) => Number.isInteger(v) && v >= 0)
        ? at[1]! * 40 + at[0]!
        : undefined,
    controls: one('controls') !== '0',
    bench: one('bench') === '1',
    everyBeast: one('all') === '1',
    weather:
      weather === 'overcast' || weather === 'rain' || weather === 'clear' ? weather : undefined,
    time: num('time'),
    layers: LAYER_IDS.filter((id) => layers.includes(id)),
  };
}

export default async function DevMapPage({ searchParams }: { searchParams: Promise<Query> }) {
  if (!devPagesOn()) notFound();
  return <MapLab fixtures={mapFixtures()} start={startFrom(await searchParams)} />;
}
