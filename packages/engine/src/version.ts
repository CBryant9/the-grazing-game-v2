/**
 * Every farm records the engine version it runs on. Any change to the model
 * or its data bumps this, re-runs calibration and is logged in
 * docs/MODEL.md and docs/CALIBRATION.md.
 */
export const ENGINE_VERSION = '0.4.0';

/** The shape of a saved farm. Old saves are upgraded with defaults. */
export const SAVE_FORMAT_VERSION = 1;
