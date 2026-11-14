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
    include: ['packages/*/src/**/*.test.ts', 'apps/*/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.next/**'],
    environment: 'node',
  },
});
