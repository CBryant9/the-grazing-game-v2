import { shareImage } from '@/lib/shareImage';

export const alt = 'The Grazing Game privacy';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return shareImage({
    heading: 'Privacy',
    line: 'What the game keeps about you, and why. A plain-English draft.',
  });
}
