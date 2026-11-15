import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SetupOptions } from '@/lib/game/types';
import { PlayApp } from './PlayApp';

/*
 * The /play speed fix (m8): what the server's HTML holds. With the setup choices sent with the
 * page (a visitor with no cookies), setup is in the HTML, so the largest paint does not wait for
 * the scripts and two requests. Without them, "Loading your farm", as before.
 */

const OPTIONS: SetupOptions = {
  districts: [],
  sizes: [],
  enterprises: [],
  years: [],
  starts: [],
  difficulties: [],
  nameMax: 40,
  daily: { state: 'off', text: 'Daily Farm needs the game database.', limit: 0, going: 0 },
} as unknown as SetupOptions;

describe('the first HTML of /play', () => {
  it('with the setup choices: the first setup step, not the loading line', () => {
    const html = renderToString(createElement(PlayApp, { setup: OPTIONS }));
    expect(html).toContain('How do you want to play?');
    expect(html).toContain('Daily Farm needs the game database.');
    expect(html).toContain('Fast Farm');
    expect(html).not.toContain('Loading your farm');
  });

  it('without them: the loading line, as before', () => {
    const html = renderToString(createElement(PlayApp));
    expect(html).toContain('Loading your farm');
    expect(html).not.toContain('How do you want to play?');
  });
});
