import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/*
 * The bundle check must fail when engine text reaches the browser. This
 * plants a term in a pretend build, in each place the check reads, and sees
 * it fail; and sees a clean pretend build pass.
 */

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'check-browser-bundle.mjs');
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A pretend build: a script that shows "Next day", and the /play page and its data. */
function pretendBuild(
  plant: {
    script?: string;
    html?: string;
    rsc?: string;
    sw?: string;
    publicFile?: string;
    noSw?: boolean;
  } = {},
) {
  const root = mkdtempSync(join(tmpdir(), 'gg-bundle-'));
  dirs.push(root);
  const stat = join(root, 'static', 'chunks');
  const app = join(root, 'app');
  mkdirSync(stat, { recursive: true });
  mkdirSync(app, { recursive: true });
  writeFileSync(join(stat, 'a.js'), `var b="Next day";${plant.script ?? ''}`);
  writeFileSync(join(app, 'play.html'), `<html><body>Play${plant.html ?? ''}</body></html>`);
  writeFileSync(join(app, 'play.rsc'), `0:["$","div",null,{}]${plant.rsc ?? ''}`);
  // The home page, the public files and the service worker with its precache list.
  writeFileSync(join(app, 'index.html'), '<html><body>Home</body></html>');
  const pub = join(root, 'public');
  mkdirSync(pub, { recursive: true });
  writeFileSync(join(pub, 'icon.svg'), `<svg></svg>${plant.publicFile ?? ''}`);
  if (!plant.noSw) {
    mkdirSync(join(app, 'serwist'), { recursive: true });
    writeFileSync(
      join(app, 'serwist', 'sw.js.body'),
      `var g=[{url:"/_next/static/chunks/a.js",revision:null},{url:"/play",revision:"1"},{url:"/",revision:"1"},{url:"/icon.svg",revision:"1"}];${plant.sw ?? ''}`,
    );
  }
  return { stat: join(root, 'static'), app, pub };
}

const run = (b: { stat: string; app: string; pub: string }) =>
  spawnSync(process.execPath, [SCRIPT, '--static', b.stat, '--app', b.app, '--public', b.pub], {
    encoding: 'utf8',
  });

describe('the browser bundle check', () => {
  it('passes a clean build', () => {
    const r = run(pretendBuild());
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  it('fails on a district figure key in the JavaScript, even minified', () => {
    const r = run(pretendBuild({ script: 'var d={dmdMax:72,frostSen:.4};' }));
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/dmdMax/);
  });

  it('fails on an engine message in the /play HTML', () => {
    const r = run(pretendBuild({ html: 'Soil water needs a capacity above 0 mm' }));
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/play\.html/);
  });

  it('fails on a random stream name in the /play page data', () => {
    const r = run(pretendBuild({ rsc: '"gen:herd"' }));
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/play\.rsc/);
  });

  it('can not pass a scan that read nothing', () => {
    const b = pretendBuild();
    writeFileSync(join(b.stat, 'chunks', 'a.js'), 'var x=1;');
    const r = run(b);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/can not be trusted/);
  });

  it('fails on engine text in the built service worker', () => {
    const r = run(pretendBuild({ sw: 'var d={dmdMax:72};' }));
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/sw\.js\.body/);
  });

  it('fails on engine text in a file the service worker keeps', () => {
    const r = run(pretendBuild({ publicFile: '"gen:herd"' }));
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/icon\.svg/);
  });

  it('fails when the service worker file is missing after a build', () => {
    const r = run(pretendBuild({ noSw: true }));
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/service worker was not found/);
  });
});
