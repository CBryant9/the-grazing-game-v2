import { shareImage } from '@/lib/shareImage';

export const alt = 'The Grazing Game pricing';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return shareImage({
    heading: 'Pricing',
    line: 'Free to play. See what is free today and what is for sale.',
  });
}
