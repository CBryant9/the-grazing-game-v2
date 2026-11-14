import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import robots from '../../app/robots';
import sitemap from '../../app/sitemap';
import { isCacheablePagePath } from '../../lib/pwa/cacheablePage';

const web = fileURLToPath(new URL('../../', import.meta.url));
const read = (p: string): string => readFileSync(join(web, p), 'utf8');

function walk(dir: string, match: RegExp): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(web, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(web, rel)).isDirectory()) out.push(...walk(rel, match));
    else if (match.test(name)) out.push(rel);
  }
  return out;
}

describe('the admin area is never found, cached or indexed', () => {
  it('is not named in robots.txt (that would say it exists), the api is disallowed, and the sitemap has no admin', () => {
    const r = robots();
    const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
    const disallow = rules.flatMap((x) =>
      Array.isArray(x.disallow) ? x.disallow : [x.disallow ?? ''],
    );
    expect(disallow).toContain('/api');
    expect(JSON.stringify(r)).not.toMatch(/admin/);
    for (const s of sitemap()) expect(s.url).not.toMatch(/admin/);
  });

  it('is never kept by the service worker: pages by the allow-list, the api by network only', () => {
    for (const p of [
      '/admin',
      '/admin/',
      '/admin/users',
      '/admin/users/abc',
      '/admin/switches',
      '/api/admin/switches',
      '/api/admin/users',
    ]) {
      expect(isCacheablePagePath(p), p).toBe(false);
    }
    const sw = read('app/sw.ts');
    expect(sw).toMatch(/pathname\.startsWith\('\/api\/'\)[\s\S]{0,80}new NetworkOnly\(\)/);
    expect(sw).toMatch(/isCacheablePagePath\(url\.pathname\)/);
    expect(sw).not.toMatch(/\/admin/);
  });

  it('is noindex only once the role check passes: the layout says so, and next.config sends nothing for /admin', () => {
    expect(read('app/admin/layout.tsx')).toMatch(
      /robots:\s*\{\s*index:\s*false,\s*follow:\s*false/,
    );
    // A header on /admin would tell a not found for a visitor apart from one for an unknown address.
    expect(read('next.config.ts')).not.toMatch(/admin/);
    expect(read('server/admin/route.ts')).toMatch(/if \(gated\) res\.headers\.set\('X-Robots-Tag'/);
  });

  it('checks the role in every page and the layout, and every route goes through adminRoute and exports only POST', () => {
    const pages = walk('app/admin', /^page\.tsx$/);
    expect(pages.length).toBeGreaterThanOrEqual(10);
    for (const p of [...pages, 'app/admin/layout.tsx'])
      expect(read(p), p).toMatch(/await requireAdmin\(\)/);
    const routes = walk('app/api/admin', /^route\.ts$/);
    expect(routes.length).toBeGreaterThanOrEqual(3);
    for (const r of routes) {
      const text = read(r);
      expect(text, r).toMatch(/adminRoute\(/);
      const exported = [...text.matchAll(/export (?:const|async function|function) (\w+)/g)].map(
        (m) => m[1],
      );
      expect(exported.sort(), r).toEqual(['POST', 'dynamic']);
    }
  });

  it('reads nothing the browser sends to decide the role', () => {
    const gate = read('server/admin/gate.ts') + read('server/admin/page.ts');
    expect(gate).not.toMatch(/searchParams|req\.headers|\.headers\.get|localStorage/);
  });

  it('the browser side of admin never imports the engine or the server code, and has no em dash', () => {
    const files = [
      ...walk('components/admin', /\.(tsx?|css)$/),
      ...walk('app/admin', /\.tsx$/),
      'server/admin/info.ts',
      'server/admin/settings.ts',
    ];
    for (const f of files) {
      const text = read(f);
      expect(text, f).not.toMatch(/@gg\/engine/);
      if (f.startsWith('components/admin'))
        expect(text, f).not.toMatch(/@\/server|from '\.\.\/\.\.\/server/);
      expect(text, f).not.toContain('—');
    }
  });
});
