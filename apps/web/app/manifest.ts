import type { MetadataRoute } from 'next';
import { SITE } from '@gg/shared';

// The installed app opens straight into the game (PRD 14.1).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.name,
    short_name: 'Grazing Game',
    description: SITE.description,
    lang: 'en-AU',
    start_url: '/play',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0b1220',
    theme_color: '#0a1120',
    categories: ['games', 'simulation', 'education'],
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
