import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // `server-only` throws outside a Next.js server build. In tests we are the server.
      'server-only': here('./apps/web/server/test-support/server-only.ts'),
      '@/': here('./apps/web') + '/',
    },
  },
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/*/**/*.test.ts', 'scripts/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.next/**'],
    environment: 'node',
    // The engine's long tests (29 years of days, year-long herds) take a few
    // seconds each alone and longer with a hundred files running beside them.
    // The default 5 seconds made them fail at random under load.
    testTimeout: 30_000,
  },
});
