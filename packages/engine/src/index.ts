/**
 * The Grazing Game engine.
 *
 * Pure TypeScript, seeded, no DOM. It runs on the server and in tests. It
 * must never be shipped to the browser in anything public (CLAUDE.md, rule 14).
 */

export { ENGINE_VERSION, SAVE_FORMAT_VERSION } from './version';
export { hash32, rngFromState, rngStream } from './rng';
export type { Rng, RngState } from './rng';
