// JavaScript size budget (PRD 14.10, "Downloads").
//
//   pnpm build && pnpm check:js-budget
//
// Adds up the compressed size (gzip, level 9) of the script files each page
// asks for in its own HTML, which is what the browser must download before
// the page is usable. Scripts the page loads later (the map, PixiJS) are
// not in the page's HTML and are not counted here.
//
//   /        website page    PRD target 100 KB. The public pages are built with the pages
//                            router and send no script file at all (limit 1 KB)
//   /play    game page       under 250 KB before the art and map load
//
// gzip is a little larger than the brotli that Vercel serves, so a pass here
// is a pass there. For its own test the folders and limits can be given:
//   --static <dir> --app <dir> --pages <dir> --limit-home <KB> --limit-play <KB>

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const STATIC = resolve(arg('--static', join(ROOT, 'apps/web/.next/static')));
const APP = resolve(arg('--app', join(ROOT, 'apps/web/.next/server/app')));
const PAGES_DIR = resolve(arg('--pages', join(ROOT, 'apps/web/.next/server/pages')));

// `targetKb` is the PRD 14.10 figure. `limitKb` is what the check enforces.
// The public website pages are pages-router pages with the runtime switched off
// (apps/web/pages), so `/` sends no script file: its limit is 1 KB, there only
// so a script that creeps back in is caught. The game page is an app-router
// page and its limit is the PRD figure. Over the target but under the limit
// prints a note.
const PAGES = [
  {
    path: '/',
    dir: PAGES_DIR,
    file: 'index.html',
    targetKb: 100,
    limitKb: Number(arg('--limit-home', '1')),
    // A website page with no script file is the aim. It must still be a real page.
    mayHaveNoScripts: true,
  },
  {
    path: '/play',
    dir: APP,
    file: 'play.html',
    targetKb: 250,
    limitKb: Number(arg('--limit-play', '250')),
    mayHaveNoScripts: false,
  },
];

/** The script files a page's HTML names, once each. */
function scriptsOf(html) {
  const found = new Set();
  for (const m of html.matchAll(/<script\b[^>]*>/g)) {
    const src = /\ssrc="([^"]+)"/.exec(m[0]);
    // A nomodule script is the polyfills for old browsers. No current phone downloads it.
    if (src && !/\snomodule\b/i.test(m[0])) found.add(src[1]);
  }
  return [...found];
}

let failed = false;
for (const page of PAGES) {
  const htmlFile = join(page.dir, page.file);
  if (!existsSync(htmlFile)) {
    console.error(`Missing ${htmlFile}. Run \`pnpm build\` first.`);
    process.exit(1);
  }
  const html = readFileSync(htmlFile, 'utf8');
  const srcs = scriptsOf(html);
  if (srcs.length === 0 && page.mayHaveNoScripts && /<main[\s>]/.test(html)) {
    console.log(
      `ok   ${page.path.padEnd(6)} 0.0 KB compressed in 0 scripts (limit ${page.limitKb} KB)`,
    );
    continue;
  }
  if (srcs.length === 0) {
    console.error(
      `${page.path}: no scripts found in the page, so the check can not mean anything.`,
    );
    process.exit(1);
  }
  let bytes = 0;
  for (const src of srcs) {
    const rel = src.replace(/^\/_next\/static\//, '').split('?')[0];
    const file = join(STATIC, rel);
    if (!existsSync(file)) {
      console.error(`${page.path}: the page names ${src}, which is not in the build.`);
      process.exit(1);
    }
    bytes += gzipSync(readFileSync(file), { level: 9 }).length;
  }
  const kb = bytes / 1024;
  const ok = kb < page.limitKb;
  console.log(
    `${ok ? 'ok  ' : 'OVER'} ${page.path.padEnd(6)} ${kb.toFixed(1)} KB compressed in ${srcs.length} scripts (limit ${page.limitKb} KB)`,
  );
  if (ok && kb >= page.targetKb) {
    console.log(`     note: above the PRD 14.10 target of ${page.targetKb} KB, held at the limit.`);
  }
  if (!ok) failed = true;
}
if (failed) {
  console.error('A page sends more JavaScript than its budget (PRD 14.10).');
  process.exit(1);
}
