import { devPagesOn, mapFixtureText } from '@/lib/devPages';

// Serves one map fixture (a farm view, numbers only) to the map test page.
// Like the page, it returns 404 in a production build unless GG_DEV_PAGES=1.
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ name: string }> }) {
  const { name } = await context.params;
  const text = devPagesOn() ? mapFixtureText(name) : null;
  if (text === null) return new Response('Not found', { status: 404 });
  return new Response(text, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
    },
  });
}
