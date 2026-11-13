import tseslint from 'typescript-eslint';
import nextVitals from 'eslint-config-next/core-web-vitals';

const web = ['apps/web/**/*.{ts,tsx}'];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/coverage/**',
      '**/next-env.d.ts',
      'reference/**',
      'docs/**',
      'art/**',
    ],
  },
  ...tseslint.configs.recommended,
  ...nextVitals.map((config) => ({ ...config, files: web })),
  { files: web, settings: { next: { rootDir: 'apps/web' } } },
  {
    // The rules stay hidden: the browser app must never import the engine.
    // From Stage 3 the engine is reached only through server code.
    files: [
      'apps/web/components/**/*.{ts,tsx}',
      'packages/render/**/*.ts',
      'packages/shared/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@gg/engine', '@gg/engine/*'],
              message: 'The engine must not be imported into browser code (CLAUDE.md, rule 14).',
            },
          ],
        },
      ],
    },
  },
  {
    // The engine must be repeatable from a seed: no unseeded randomness, no clock.
    files: ['packages/engine/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use a seeded stream from rng.ts.' },
        { object: 'Date', property: 'now', message: 'The engine must not read the clock.' },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'localStorage'],
      // The test support loads the MVP game. Only tests may use it.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/test-support/**'],
              message: 'Engine code must not import test support. Only *.test.ts files may.',
            },
          ],
        },
      ],
    },
  },
);
