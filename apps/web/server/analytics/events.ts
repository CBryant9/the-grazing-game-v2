import 'server-only';
import { ANALYTICS_EVENTS, type AnalyticsEventName, type PropSpec } from '@gg/shared/analytics';

/**
 * Checking an event against the fixed list in `packages/shared` (analytics.ts). An event that
 * is not on the list, a key the event does not have, or a value outside its words or range is
 * refused: nothing a person typed can be counted or sent.
 */

export type Props = Record<string, string | number>;

export interface CheckedEvent {
  name: AnalyticsEventName;
  props: Props;
}

const isName = (v: unknown): v is AnalyticsEventName =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(ANALYTICS_EVENTS, v);

function valueOk(spec: PropSpec, v: unknown): v is string | number {
  if (Array.isArray(spec)) return typeof v === 'string' && (spec as readonly string[]).includes(v);
  const range = spec as { min: number; max: number };
  return typeof v === 'number' && Number.isInteger(v) && v >= range.min && v <= range.max;
}

/**
 * The event, if it is on the list with every property allowed. `browser` true checks it is one a
 * browser may send. Every property the event names must be there (an event with half its
 * properties would count apart from the same event with all of them).
 */
export function checkEvent(name: unknown, props: unknown, browser: boolean): CheckedEvent | null {
  if (!isName(name)) return null;
  const def = ANALYTICS_EVENTS[name];
  if (browser && !def.browser) return null;
  const given = props === undefined ? {} : props;
  if (typeof given !== 'object' || given === null || Array.isArray(given)) return null;
  const specs = def.props as Readonly<Record<string, PropSpec>>;
  const keys = Object.keys(given);
  if (keys.length !== Object.keys(specs).length) return null;
  const out: Props = {};
  for (const k of keys) {
    const spec = specs[k];
    const v = (given as Record<string, unknown>)[k];
    if (!spec || !valueOk(spec, v)) return null;
    out[k] = v;
  }
  return { name, props: out };
}

/**
 * The properties as the counts table keeps them: `key=value` pairs, sorted, joined by `;`.
 * Numbers that vary (a value, a number of days) are left out of the count's key, so the table
 * stays a few rows a day; PostHog gets them whole.
 */
export function propsKey(e: CheckedEvent): string {
  const specs = ANALYTICS_EVENTS[e.name].props as Readonly<Record<string, PropSpec>>;
  return Object.keys(e.props)
    .filter((k) => Array.isArray(specs[k]))
    .sort()
    .map((k) => `${k}=${String(e.props[k]).toLowerCase()}`)
    .join(';');
}
