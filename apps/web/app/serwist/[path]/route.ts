import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createSerwistRoute } from '@serwist/turbopack';

// The service worker is built here, when the site is built, and served from
// /serwist/sw.js. (Next.js 16 builds with Turbopack, which takes no plugins,
// so this route does the job of a build plugin.)
//
// The version of the two pages kept at install: it changes with every commit,
// so a new build replaces the kept pages.
const revision = (() => {
  try {
    const out = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).stdout.trim();
    return out || randomUUID();
  } catch {
    return randomUUID();
  }
})();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute(
  {
    swSrc: 'app/sw.ts',
    useNativeEsbuild: true,
    additionalPrecacheEntries: [
      { url: '/play', revision },
      { url: '/', revision },
    ],
    // Next's own script and style files, fonts and the site's public files.
    // (The default list leaves out fonts.)
    globPatterns: [
      '.next/static/**/*.{js,css,woff2,woff,ico,png,svg,webp,avif,jpg,jpeg,gif,json,webmanifest}',
      'public/**/*',
    ],
    // Never publish a source map for the worker.
    esbuildOptions: { sourcemap: false },
    maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
  },
);
