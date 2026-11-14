/**
 * Stocking units: the one figure every screen uses to turn AE into DSE.
 *
 * Call C3 (docs/SHEEP_BENCHMARKS.md), made on Claudia's behalf on 15 Nov
 * 2026: 8.4 DSE to the AE for cattle and sheep alike (MLA, "Why is
 * calculating forage demand important?", S1; WA DPIRD, "What are Animal
 * Equivalents?", S2). It is a display conversion only: no cattle or grass
 * formula reads it, so no cattle benchmark moves.
 */

/** DSE in one AE, for every display (call C3). */
export const DSE_PER_AE = 8.4;

/**
 * The MVP's figure, kept as a record only: the old game showed DSE = AE × 8
 * (docs/MODEL.md, section 3, Adult equivalents). The rebuild shows 8.4,
 * the published figure, so cattle and sheep read the same. Nothing uses it.
 */
export const MVP_DSE_PER_AE = 8;
