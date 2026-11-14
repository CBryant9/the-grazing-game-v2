import 'server-only';

/**
 * Failure logging that says what failed without ever carrying a person's data. A line is the
 * route, a fixed reason code that names the step, and the error's class and (when it is a plain
 * code) its code. Never the error's message, which a provider can fill with an email address, a
 * token or a link.
 *
 *   failed route=auth-email reason=send_link_failed error=AuthApiError code=over_email_send_rate_limit
 */

/** A code that can only be a code: an SQLSTATE (23505), a Node code (ECONNREFUSED) or a snake_case word. */
const PLAIN_CODE = /^(?:[0-9A-Z]{5}|E[A-Z0-9_]{2,24}|[a-z][a-z0-9_]{2,48})$/;

export interface Failure {
  /** The route, for example `auth-email` or `game-act`. */
  route: string;
  /** What step failed, a fixed word such as `send_link_failed`. */
  reason: string;
}

/** The class name and plain code of an error, or `unknown`. Safe to log. */
export function errorKind(e: unknown): { error: string; code?: string } {
  if (typeof e !== 'object' || e === null) return { error: typeof e };
  const name = (e as { constructor?: { name?: unknown } }).constructor?.name;
  const error = typeof name === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(name) ? name : 'unknown';
  const code = (e as { code?: unknown }).code;
  return typeof code === 'string' && PLAIN_CODE.test(code) ? { error, code } : { error };
}

/** The text of a failure line. */
export function failureLine(f: Failure, e?: unknown): string {
  const k = e === undefined ? null : errorKind(e);
  return [
    'failed',
    `route=${f.route}`,
    `reason=${f.reason}`,
    ...(k ? [`error=${k.error}`, ...(k.code ? [`code=${k.code}`] : [])] : []),
  ].join(' ');
}

/** Log a failure to the server log. */
export function logFailure(f: Failure, e?: unknown): void {
  console.error(failureLine(f, e));
}
