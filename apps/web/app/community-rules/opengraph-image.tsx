import { shareImage } from '@/lib/shareImage';

export const alt = 'The Grazing Game community rules';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return shareImage({
    heading: 'Community rules',
    line: 'How people treat each other here. A draft.',
  });
}
