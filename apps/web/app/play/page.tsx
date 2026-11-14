import type { Metadata } from 'next';
import { PlayApp } from '@/components/play/PlayApp';

export const metadata: Metadata = {
  title: 'Play',
  description:
    'Play The Grazing Game in your browser. Set up a farm, move your stock, and see what your decisions do to the grass.',
  alternates: { canonical: '/play' },
};

// The game page. The farm lives on the server: this page asks for it and draws
// what comes back. The map (and PixiJS with it) loads after the page is up.
export default function PlayPage() {
  return <PlayApp />;
}
