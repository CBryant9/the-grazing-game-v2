/**
 * Frame time figures for the map's bench mode (PRD 14.10: 60 frames a
 * second with 4,000+ head, no frame over 50 ms).
 */

export interface FrameStats {
  frames: number;
  /** Milliseconds: the average frame, the middle frame, and the slow ends. */
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  /** Frames a second, from the average frame. */
  fps: number;
  /** Share of frames slower than 60 a second allows (over 17.7 ms), 0 to 1. */
  slowShare: number;
  /** Frames over 50 ms. */
  over50: number;
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** Sum up a list of frame times, in milliseconds. */
export function frameStats(times: readonly number[]): FrameStats {
  if (!times.length) {
    return {
      frames: 0,
      meanMs: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      maxMs: 0,
      fps: 0,
      slowShare: 0,
      over50: 0,
    };
  }
  const sorted = [...times].sort((a, b) => a - b);
  const at = (p: number): number =>
    sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
  const mean = sorted.reduce((t, v) => t + v, 0) / sorted.length;
  return {
    frames: sorted.length,
    meanMs: round2(mean),
    p50Ms: round2(at(0.5)),
    p95Ms: round2(at(0.95)),
    p99Ms: round2(at(0.99)),
    maxMs: round2(sorted[sorted.length - 1]!),
    fps: mean > 0 ? round2(1000 / mean) : 0,
    // 16.7 ms is one frame at 60 a second. A millisecond of slack allows for timer jitter.
    slowShare: round2(sorted.filter((v) => v > 17.7).length / sorted.length),
    over50: sorted.filter((v) => v > 50).length,
  };
}

export interface BenchResult {
  /** Time from one frame to the next, as the screen showed them. */
  frame: FrameStats;
  /** Time the map spent drawing each frame on the processor. */
  draw: FrameStats;
  /** What was on the map. */
  cattleDrawn: number;
  head: number;
  tuftPieces: number;
  /** Screen pixels per CSS pixel the map drew at. */
  pixelRatio: number;
  width: number;
  height: number;
  seconds: number;
}
