import type { Metadata } from 'next';
import { PlayApp } from '@/components/play/PlayApp';
import { PlayBoundary } from '@/components/shell/PlayBoundary';
import { PlayOffline } from '@/components/shell/PlayOffline';
import { PwaRegister } from '@/components/shell/PwaRegister';

export const metadata: Metadata = {
  title: 'Play',
  description:
    'Play The Grazing Game in your browser. Set up a farm, move your stock, and see what your decisions do to the grass.',
  alternates: { canonical: '/play' },
};

// The game page. The farm lives on the server: this page asks for it and draws
// what comes back. The map (and PixiJS with it) loads after the page is up.
// Around it: a boundary so a crash shows two buttons, the offline view, and
// the install and service worker setup.
export default function PlayPage() {
  return (
    <PlayBoundary>
      <PwaRegister />
      <PlayOffline>
        <PlayApp />
      </PlayOffline>
    </PlayBoundary>
  );
}
