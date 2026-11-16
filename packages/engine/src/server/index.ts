/**
 * Server only: everything in the engine package that reads a file.
 *
 * Imported as `@gg/engine/server`, by server code and tests only. Browser
 * code must never import it (CLAUDE.md, rule 14).
 */

export { loadRealData, readRawTable } from './realDataFiles';
export { loadWeatherGrowth, loadWeatherTable } from './weatherFiles';
