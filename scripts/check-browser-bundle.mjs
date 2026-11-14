// Proves the rules stay hidden (CLAUDE.md, rule 14).
//
//   pnpm build && pnpm check:browser-bundle
//
// Searches what the build sends to the browser for text that exists only in
// the engine and its data: the JavaScript in apps/web/.next/static, and the
// HTML and page data (React Server Component payloads) the server sends for
// /play, from apps/web/.next/server/app. If any is found, the engine or its
// tables have leaked into the browser, and this fails.
//
// The terms are ones a minifier can not rename: string literals, and property
// names that are data (district figure keys). Each term is also looked for in
// the engine's own source, so the list can not go stale: a term that has been
// renamed away fails the check until someone picks a new one. And a term the
// browser is meant to hold ("Next day") is looked for in the JavaScript, so a
// scan that found no files can not pass.
//
// For its own test (scripts/check-browser-bundle.test.ts) the folders can be
// given: --static <dir> --app <dir>.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE_SRC = join(ROOT, 'packages/engine/src');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? resolve(process.argv[i + 1]) : fallback;
};
const STATIC = arg('--static', join(ROOT, 'apps/web/.next/static'));
const APP = arg('--app', join(ROOT, 'apps/web/.next/server/app'));

/**
 * Text that exists only in the engine, chosen to survive minifying:
 * - district figure keys, property names in the district table
 *   (src/data/districts.ts), which a minifier leaves as they are;
 * - the names of the farm's random streams (src/farm/generate.ts,
 *   src/sim/create.ts), string literals;
 * - messages the engine throws inside the server that a player never sees
 *   (src/save/save.ts, src/season/weatherGrowth.ts, src/season/realYears.ts).
 */
const ENGINE_ONLY = [
  'dmdMax',
  'frostSen',
  'dmdDead',
  'cpMax',
  'gen:herd',
  'gen:fertility',
  'gen:pasture',
  'saveFarm: an array of a kind that cannot be saved',
  'Soil water needs a capacity above 0 mm',
  'The real years must be whole numbers, oldest first',
];

/** Text the browser code does hold. Seeing it proves the scan read the right files. */
const BROWSER_HAS = 'Next day';

function files(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files(path, out);
    else out.push(path);
  }
  return out;
}

let engineText = '';
for (const f of files(ENGINE_SRC)) {
  if (f.endsWith('.ts') && !f.endsWith('.test.ts')) engineText += readFileSync(f, 'utf8');
}
const stale = ENGINE_ONLY.filter((t) => !engineText.includes(t));
if (stale.length) {
  console.error(`These search terms are not in the engine source any more: ${stale.join(', ')}.`);
  console.error(
    'Pick current names from packages/engine/src and update scripts/check-browser-bundle.mjs.',
  );
  process.exit(1);
}

let all;
try {
  all = files(STATIC);
} catch {
  console.error('There is no build to check. Run pnpm build first.');
  process.exit(1);
}
const scripts = all.filter((f) => f.endsWith('.js'));
const maps = all.filter((f) => f.endsWith('.map'));
if (!scripts.length) {
  console.error(`No JavaScript was found in ${relative(ROOT, STATIC)}.`);
  process.exit(1);
}

// The HTML and page data the server sends for /play: play.html, play.rsc and
// the segment payloads under play/ (whichever this Next.js version writes).
const pages = [];
if (existsSync(APP)) {
  for (const f of files(APP)) {
    const rel = relative(APP, f).replaceAll('\\', '/');
    const isPlay = rel === 'play.html' || rel.startsWith('play.') || rel.startsWith('play/');
    if (isPlay && /\.(html|rsc|body|txt|json|meta)$/.test(f)) pages.push(f);
  }
}
if (!pages.length) {
  console.error(
    `No HTML or page data for /play was found in ${relative(ROOT, APP)}. Build the site first.`,
  );
  process.exit(1);
}

const found = [];
let sawBrowserText = false;
for (const f of [...scripts, ...pages]) {
  const text = readFileSync(f, 'utf8');
  if (scripts.includes(f) && text.includes(BROWSER_HAS)) sawBrowserText = true;
  for (const term of ENGINE_ONLY) {
    if (text.includes(term)) found.push(`${term}  in  ${relative(ROOT, f)}`);
  }
}

if (maps.length) found.push(`source maps were published: ${relative(ROOT, maps[0])}`);
if (!sawBrowserText) {
  console.error(
    `The scan did not find "${BROWSER_HAS}" in the browser JavaScript, so it can not be trusted.`,
  );
  process.exit(1);
}
if (found.length) {
  console.error('What the browser is sent holds engine text. The rules are not hidden:');
  for (const line of found) console.error(`  ${line}`);
  process.exit(1);
}
console.log(
  `Browser bundle clean: ${scripts.length} script files and ${pages.length} /play page files searched for ${ENGINE_ONLY.length} engine-only terms, none found.`,
);
