import { proxyWarning } from './server/startup';

/**
 * Runs once when the server starts. In production with no trusted proxy
 * header named, every new player shares one farm creation limit: say so
 * plainly in the server log, without stopping the server.
 */
export function register(): void {
  const warning = proxyWarning(process.env);
  if (warning) console.warn(warning);
}
