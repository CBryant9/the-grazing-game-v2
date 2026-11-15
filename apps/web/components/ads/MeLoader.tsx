'use client';

import { useEffect } from 'react';
import { useMe } from '@/lib/auth/store';

/**
 * Asks the server once who the player is, so `<AdSlot>` on a page outside the game (the
 * community pages, m6 join) knows which slots are on. Draws nothing. With every ad switch off the
 * answer lists no slots and no ad code is downloaded.
 */
export function MeLoader() {
  const settled = useMe((s) => s.settled);
  const load = useMe((s) => s.load);
  useEffect(() => {
    if (!settled) void load();
  }, [settled, load]);
  return null;
}
