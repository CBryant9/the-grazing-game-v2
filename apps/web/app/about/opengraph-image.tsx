import { shareImage } from '@/lib/shareImage';

export const alt = 'About The Grazing Game';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return shareImage({
    heading: 'About',
    line: 'What the game is, and where its weather and price data come from.',
  });
}
