import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/*
 * The JavaScript budget check must fail when a page asks for too much and
 * pass when it does not. This builds pretend pages with scripts of a known
 * size (random bytes do not compress) and runs the check on them.
 */

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'check-js-budget.mjs');
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A pretend build. `homeKb` and `playKb` are the KB of script each page asks for. */
function pretend(homeKb: number, playKb: number, missing = false, accountKb = 20) {
  const root = mkdtempSync(join(tmpdir(), 'gg-budget-'));
  dirs.push(root);
  const chunks = join(root, 'static', 'chunks');
  const app = join(root, 'app');
  const pages = join(root, 'pages');
  mkdirSync(chunks, { recursive: true });
  mkdirSync(app, { recursive: true });
  mkdirSync(pages, { recursive: true });
  writeFileSync(join(chunks, 'home.js'), randomBytes(homeKb * 1024));
  writeFileSync(join(chunks, 'play.js'), randomBytes(playKb * 1024));
  const page = (name: string) =>
    `<html><script src="/_next/static/chunks/${name}.js" async></script></html>`;
  writeFileSync(
    join(pages, 'index.html'),
    homeKb === 0 ? '<html><main>Home</main></html>' : page('home'),
  );
  writeFileSync(join(app, 'play.html'), missing ? page('gone') : page('play'));
  // The sign-in and account pages each ask for a small script of their own.
  writeFileSync(join(chunks, 'account.js'), randomBytes(accountKb * 1024));
  mkdirSync(join(app, 'sign-in'), { recursive: true });
  mkdirSync(join(app, 'sign-up'), { recursive: true });
  for (const file of [
    'sign-in.html',
    'sign-in/check-email.html',
    'sign-up/finish.html',
    'account.html',
  ]) {
    writeFileSync(join(app, file), page('account'));
  }
  return { stat: join(root, 'static'), app, pages };
}

const run = (b: { stat: string; app: string; pages: string }) =>
  spawnSync(process.execPath, [SCRIPT, '--static', b.stat, '--app', b.app, '--pages', b.pages], {
    encoding: 'utf8',
  });

describe('the JavaScript budget check', () => {
  it('passes pages under their limits', () => {
    const r = run(pretend(0, 200));
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/\/play/);
  });

  it('fails a website page that starts sending a script', () => {
    const r = run(pretend(5, 100));
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/OVER\s+\/\s/);
  });

  it('fails the game page over 250 KB', () => {
    const r = run(pretend(50, 280));
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/OVER\s+\/play/);
  });

  it('gives each sign-in and account page its own line, and fails one that grows past it', () => {
    const ok = run(pretend(0, 100, false, 20));
    expect(ok.status).toBe(0);
    for (const path of ['/sign-in', '/sign-in/check-email', '/sign-up/finish', '/account']) {
      expect(ok.stdout).toContain(path);
    }
    const over = run(pretend(0, 100, false, 200));
    expect(over.status).toBe(1);
    expect(over.stdout).toMatch(/OVER\s+\/sign-in\s/);
  });

  it('does not count the polyfills for old browsers (nomodule)', () => {
    const b = pretend(0, 10);
    writeFileSync(join(b.stat, 'chunks', 'old.js'), randomBytes(400 * 1024));
    writeFileSync(
      join(b.pages, 'index.html'),
      '<html><main>Home</main><script src="/_next/static/chunks/old.js" noModule=""></script></html>',
    );
    expect(run(b).status).toBe(0);
  });

  it('fails when a script the page names is not in the build', () => {
    const r = run(pretend(0, 10, true));
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/not in the build/);
  });
});
