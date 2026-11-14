import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAINTENANCE_HEADER, MAINTENANCE_WORDINGS } from '@gg/shared';
import { api, onMaintenance } from './api';
import { setMaintenance, useOffline } from './offlineWatch';
import { useGame } from './store';

/**
 * Maintenance mode on the play screen (PRD 11.7: the game is read only and the message shows). The
 * server marks every game answer with the wording's id; the game holds its buttons off the way it
 * does offline, shows the fixed wording, and lets go when the marker stops.
 */
afterEach(() => {
  setMaintenance(null);
  onMaintenance(null);
  vi.unstubAllGlobals();
});

const answer = (marker: string | null) =>
  new Response(JSON.stringify({ snapshot: null }), {
    status: 200,
    headers: marker ? { [MAINTENANCE_HEADER]: marker } : {},
  });

describe('maintenance on the play screen', () => {
  it('tells the watcher about the marker on every answer, and null when it is not there', async () => {
    const seen: (string | null)[] = [];
    onMaintenance((id) => seen.push(id));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(answer('update')).mockResolvedValueOnce(answer(null)),
    );
    await api.farm();
    await api.farm();
    expect(seen).toEqual(['update', null]);
  });

  it('holds the buttons off and shows the fixed wording, then lets go', () => {
    const before = useGame.getState().busy;
    setMaintenance('longer');
    expect(useOffline.getState().maintenance).toBe(MAINTENANCE_WORDINGS[2].text);
    expect(useGame.getState().busy).toBe(before + 1);
    // The same marker again changes nothing; it never holds twice.
    setMaintenance('longer');
    expect(useGame.getState().busy).toBe(before + 1);
    setMaintenance(null);
    expect(useOffline.getState().maintenance).toBeNull();
    expect(useGame.getState().busy).toBe(before);
  });

  it('an id that is not on the list shows the first wording, never the id', () => {
    setMaintenance('<b>Buy now</b>');
    expect(useOffline.getState().maintenance).toBe(MAINTENANCE_WORDINGS[0].text);
  });
});
