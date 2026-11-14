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
//   /sign-in, /sign-in/check-email, /sign-up/finish, /account
//                            sign-in and account pages (milestone 3.2), each its own line
//
// gzip is a little larger than the brotli that Vercel serves, so a pass here
// is a pass there. For its own test the folders and limits can be given:
//   --static <dir> --app <dir> --pages <dir> --limit-home <KB> --limit-play <KB> --limit-account <KB>

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
  // The sign-in and account pages (milestone 3.2) are app-router pages and send the page shell
  // and a small form. Each has its own line, so a page that grows is seen on its own. The limit is
  // the measured size with room to spare, never raised to make a change pass.
  ...[
    ['/sign-in', 'sign-in.html'],
    ['/sign-in/check-email', 'sign-in/check-email.html'],
    ['/sign-up/finish', 'sign-up/finish.html'],
    ['/account', 'account.html'],
  ].map(([path, file]) => ({
    path,
    dir: APP,
    file,
    targetKb: 100,
    limitKb: Number(arg('--limit-account', '150')),
    mayHaveNoScripts: false,
  })),
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
      `ok   ${page.path.padEnd(20)} 0.0 KB compressed in 0 scripts (limit ${page.limitKb} KB)`,
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
    `${ok ? 'ok  ' : 'OVER'} ${page.path.padEnd(20)} ${kb.toFixed(1)} KB compressed in ${srcs.length} scripts (limit ${page.limitKb} KB)`,
  );
  if (ok && kb >= page.targetKb) {
    console.log(`     note: above the PRD 14.10 target of ${page.targetKb} KB, held at the limit.`);
  }
  if (!ok) failed = true;
}

// ---- /admin (milestone 3.5). Admin pages are rendered on demand, so there is no built HTML to
// read the scripts from. The scripts each page needs are in its build manifest (the shared
// files every page starts with) and its client reference manifest (the files of the client
// components it uses). The heaviest admin page is the line. The limit is the measured size with
// room to spare, never raised to make a change pass.
// Each group is one line in the report. /admin is the original five pages; the ad screens
// (milestone 5.1) have their own line so a new page never hides in another's limit.
const ADMIN_GROUPS = [
  {
    path: '/admin',
    limitKb: Number(arg('--limit-admin', '150')),
    pages: ['admin/switches', 'admin/settings', 'admin/users/[id]', 'admin/users', 'admin'],
  },
  {
    path: '/admin/ads',
    limitKb: Number(arg('--limit-admin-ads', '150')),
    pages: [
      'admin/ads',
      'admin/ads/sponsors',
      'admin/ads/campaigns',
      'admin/ads/campaigns/[id]',
      'admin/ads/campaigns/[id]/report',
      'admin/ads/stats',
    ],
  },
];

function adminScripts(rel) {
  const dir = join(APP, rel);
  const build = join(dir, 'page', 'build-manifest.json');
  const refs = join(dir, 'page_client-reference-manifest.js');
  if (!existsSync(build) || !existsSync(refs)) return null;
  const files = new Set();
  // The shared files every page starts with. The polyfills are for old browsers (nomodule): not counted.
  for (const f of JSON.parse(readFileSync(build, 'utf8')).rootMainFiles ?? []) {
    files.add(`/_next/${f}`);
  }
  // The files of the client components this page and its layouts use.
  for (const m of readFileSync(refs, 'utf8').matchAll(/"(\/_next\/static\/[^"]+\.js)"/g)) {
    files.add(m[1]);
  }
  return [...files];
}

for (const group of ADMIN_GROUPS) {
  let worst = { kb: 0, page: '', count: 0 };
  for (const rel of group.pages) {
    const srcs = adminScripts(rel);
    if (srcs === null) {
      console.error(`/${rel}: no build manifest. Run \`pnpm build\` first.`);
      process.exit(1);
    }
    let bytes = 0;
    for (const src of srcs) {
      const file = join(STATIC, src.replace(/^\/_next\/static\//, '').split('?')[0]);
      if (!existsSync(file)) {
        console.error(`/${rel}: the manifest names ${src}, which is not in the build.`);
        process.exit(1);
      }
      bytes += gzipSync(readFileSync(file), { level: 9 }).length;
    }
    if (bytes / 1024 > worst.kb) worst = { kb: bytes / 1024, page: rel, count: srcs.length };
  }
  const ok = worst.kb < group.limitKb;
  console.log(
    `${ok ? 'ok  ' : 'OVER'} ${group.path.padEnd(20)} ${worst.kb.toFixed(1)} KB compressed in ${worst.count} scripts (limit ${group.limitKb} KB, heaviest page /${worst.page})`,
  );
  if (ok && worst.kb >= 100) {
    console.log('     note: above the PRD 14.10 target of 100 KB, held at the limit.');
  }
  if (!ok) failed = true;
}
if (failed) {
  console.error('A page sends more JavaScript than its budget (PRD 14.10).');
  process.exit(1);
}
