import { defineConfig } from 'vitest/config';

// The speed benchmark runs on its own, one file at a time, so nothing else
// is using the machine while it is timed (pnpm test:speed).
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.timed.ts'],
    exclude: ['**/node_modules/**'],
    environment: 'node',
    fileParallelism: false,
  },
});
