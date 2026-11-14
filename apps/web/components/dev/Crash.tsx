'use client';

/**
 * Breaks on purpose, in the browser only, to look at the error screens
 * (/dev/crash). It draws nothing on the server, so the page is sent and then
 * fails while the browser shows it, which is how a real crash on the play
 * screen happens.
 */
export function Crash(): null {
  if (typeof window !== 'undefined') throw new Error('Crash test: this error is on purpose.');
  return null;
}
