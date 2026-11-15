import { accountsWarning, proxyWarning } from './server/startup';

/**
 * Runs once when the server starts. In production with no trusted proxy
 * header named, every new player shares one farm creation limit: say so
 * plainly in the server log, without stopping the server.
 */
export function register(): void {
  const warning = proxyWarning(process.env);
  if (warning) console.warn(warning);
  const accounts = accountsWarning(process.env);
  if (accounts) console.warn(accounts);
}

/**
 * An error nothing caught while a page or route was being made (milestone 5.5). Sent to Sentry
 * when `SENTRY_DSN` is set, with the route's template (`/community/u/[username]`), never the
 * address asked for, its query, its headers or the error's message.
 */
export async function onRequestError(
  error: unknown,
  _request: unknown,
  context: { routePath?: string; routeType?: string },
): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  try {
    const { reportError } = await import('./server/errors/sentry');
    const { errorKind } = await import('./server/logging');
    await reportError({
      source: 'server',
      route: typeof context?.routePath === 'string' ? context.routePath : 'unknown',
      reason: `uncaught_${context?.routeType === 'route' ? 'route' : 'render'}`,
      errorClass: errorKind(error).error,
      stack: typeof error === 'object' && error !== null ? (error as Error).stack : undefined,
    });
  } catch {
    // Reporting must never add a failure of its own.
  }
}
