import type { NextConfig } from 'next';

// Security headers for every page. A full Content-Security-Policy is added in
// Stage 3, once every outside source (Supabase, Stripe, PostHog) is known.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self)' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Never publish source maps: the code must not be readable (CLAUDE.md, rule 14).
  productionBrowserSourceMaps: false,
  // Workspace packages are plain TypeScript and are compiled with the app.
  transpilePackages: ['@gg/shared', '@gg/render', '@gg/engine'],
  // The game routes read the real weather and price tables from the engine's
  // data folder at run time. Make sure a hosted build ships them with the routes.
  outputFileTracingIncludes: { '/api/game/**': ['../../packages/engine/data/raw/**'] },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
