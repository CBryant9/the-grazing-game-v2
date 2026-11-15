import 'server-only';
import type { WebVital } from '@gg/shared/analytics';

/**
 * Web Vitals are kept as a histogram: each reading adds one to the bucket it falls in, so no
 * single reading is kept. The 75th percentile is read back as the upper edge of the bucket where
 * three quarters of the readings are reached, so it is never under the real figure by more than
 * one bucket. LCP and INP are in milliseconds, CLS times 1000.
 */

function edges(steps: [step: number, upTo: number][], last: number): number[] {
  const out: number[] = [];
  let at = 0;
  for (const [step, upTo] of steps) {
    while (at < upTo) {
      at += step;
      out.push(at);
    }
  }
  out.push(last);
  return out;
}

const MS = edges(
  [
    [50, 1000],
    [100, 5000],
    [500, 10_000],
    [2000, 30_000],
  ],
  600_000,
);
const CLS = edges(
  [
    [10, 300],
    [50, 1000],
    [250, 5000],
  ],
  600_000,
);

export const VITAL_EDGES: Record<WebVital, readonly number[]> = { LCP: MS, INP: MS, CLS };

/** The bucket a reading falls in: the smallest edge at or above it. */
export function bucketOf(metric: WebVital, value: number): number {
  const list = VITAL_EDGES[metric];
  for (const e of list) if (value <= e) return e;
  return list[list.length - 1]!;
}

/** The 75th percentile from bucket counts, or null with no readings. */
export function p75(buckets: readonly { bucket: number; count: number }[]): number | null {
  const sorted = [...buckets].filter((b) => b.count > 0).sort((a, b) => a.bucket - b.bucket);
  const total = sorted.reduce((n, b) => n + b.count, 0);
  if (total === 0) return null;
  const want = Math.ceil(total * 0.75);
  let seen = 0;
  for (const b of sorted) {
    seen += b.count;
    if (seen >= want) return b.bucket;
  }
  return sorted[sorted.length - 1]!.bucket;
}

/** The PRD 14.10 targets at the 75th percentile, in the same units. */
export const VITAL_TARGETS: Record<WebVital, number> = { LCP: 2000, INP: 200, CLS: 50 };
