import { shareImage } from '@/lib/shareImage';

export const alt = 'The Grazing Game terms of use';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return shareImage({
    heading: 'Terms of use',
    line: 'The terms for using the game, in plain English. A draft.',
  });
}
