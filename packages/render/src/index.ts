/**
 * The map renderer (PixiJS). Built in milestone 1.6.
 *
 * It draws from a snapshot of numbers the server sends. It holds no game
 * rules. The picture must match the model (docs/VISUALS.md).
 */

/** Ground is drawn at 70% height, so standing things read as tall (VISUALS). */
export const GROUND_SQUASH = 0.7;

/** Farms are always this many squares (DATA.md). */
export const GRID_W = 40;
export const GRID_H = 26;

/** At or below this many screen pixels per square, mobs become one marker (PRD 7). */
export const LOD_SWITCH_PX_PER_SQUARE = 26;
