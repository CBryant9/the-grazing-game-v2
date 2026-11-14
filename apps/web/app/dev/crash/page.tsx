import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Crash } from '@/components/dev/Crash';
import { PlayBoundary } from '@/components/shell/PlayBoundary';
import { devPagesOn } from '@/lib/devPages';

// A builders' page for looking at the error screens. Like the other /dev
// pages it returns 404 in a production build unless GG_DEV_PAGES=1.
export const metadata: Metadata = {
  title: 'Crash test page',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

type Query = Record<string, string | string[] | undefined>;

/**
 * /dev/crash?where=page    the page fails on the server (the page error screen)
 * /dev/crash?where=client  the page fails in the browser (the page error screen)
 * /dev/crash?where=play    a crash inside the play screen's boundary
 */
export default async function CrashPage({ searchParams }: { searchParams: Promise<Query> }) {
  if (!devPagesOn()) notFound();
  const q = await searchParams;
  const where = Array.isArray(q.where) ? q.where[0] : q.where;
  if (where === 'page') throw new Error('Crash test: this error is on purpose.');
  if (where === 'play') {
    return (
      <PlayBoundary>
        <Crash />
      </PlayBoundary>
    );
  }
  return <Crash />;
}
