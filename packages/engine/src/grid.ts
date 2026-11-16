/**
 * The farm grid.
 *
 * Every farm is 40 squares wide and 26 deep, whatever its size in hectares.
 * A bigger farm has bigger squares. Square `i` sits at column `i % GRID_W`
 * and row `floor(i / GRID_W)`.
 */

export const GRID_W = 40;
export const GRID_H = 26;
/** Squares on a farm: 1,040. */
export const GRID_N = GRID_W * GRID_H;

/** Hectares in one square of a farm of the given size. */
export const haPerSquare = (farmHa: number): number => farmHa / GRID_N;
