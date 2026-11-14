import { shareImage } from '@/lib/shareImage';

export const alt = 'The Grazing Game: a real grazing game, free on your phone or PC';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return shareImage({
    heading: 'A real grazing game',
    line: 'Real seasons, real prices, real decisions. Free on your phone or PC.',
  });
}
