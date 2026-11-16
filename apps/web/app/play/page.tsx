import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Vitals } from '@/components/analytics/Vitals';
import { PlayApp } from '@/components/play/PlayApp';
import { PlayBoundary } from '@/components/shell/PlayBoundary';
import { PlayOffline } from '@/components/shell/PlayOffline';
import { PwaRegister } from '@/components/shell/PwaRegister';
import { firstSetup } from '@/server/game/firstScreen';

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
//
// A visitor with none of the game's cookies can have no farm, so the setup
// screen is drawn in the HTML with its choices (server/game/firstScreen.ts):
// the first paint does not wait for the scripts and two requests.
export default async function PlayPage() {
  const setup = await firstSetup((await cookies()).getAll());
  return (
    <PlayBoundary>
      <PwaRegister />
      <Vitals page="play" />
      <PlayOffline>
        <PlayApp setup={setup} />
      </PlayOffline>
    </PlayBoundary>
  );
}
