// The production server for the load test (scripts/load-test.mjs), run as a child process.
//
// It is `next start` written out by hand so the load test can read this process's own memory:
// every line `gc` on stdin runs a full garbage collection (the process is started with
// --expose-gc) and prints one line `MEM {"rss":...,"heapUsed":...}`. Nothing else differs from
// `next start`: the same built app, the same handlers, production mode.
//
//   node --expose-gc scripts/load/server.mjs <port>

import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '../../apps/web');
const port = Number(process.argv[2] ?? 3100);
const next = createRequire(join(WEB, 'package.json'))('next');

const app = next({ dev: false, dir: WEB, port, hostname: '127.0.0.1' });
await app.prepare();
const handle = app.getRequestHandler();
createServer((req, res) => handle(req, res)).listen(port, '127.0.0.1', () => {
  console.log(`READY ${port}`);
});

createInterface({ input: process.stdin }).on('line', (line) => {
  if (line.trim() !== 'gc') return;
  if (typeof globalThis.gc === 'function') {
    globalThis.gc();
    globalThis.gc();
  }
  const m = process.memoryUsage();
  console.log(`MEM ${JSON.stringify({ rss: m.rss, heapUsed: m.heapUsed, external: m.external })}`);
});
