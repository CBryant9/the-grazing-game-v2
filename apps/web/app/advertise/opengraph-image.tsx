import { shareImage } from '@/lib/shareImage';

export const alt = 'Advertise in The Grazing Game';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return shareImage({
    heading: 'Advertise',
    line: 'Where in-house ad slots go, and how to get in touch.',
  });
}
