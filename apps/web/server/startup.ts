/**
 * Start-up checks. Plain functions of the environment, so they can be
 * tested. Imports nothing from the engine.
 */

/**
 * The warning for production with `GG_TRUSTED_IP_HEADER` unset, or null.
 * Without it no header is trusted, so every caller with no session shares
 * one farm creation limit (see apps/web/server/game/http.ts).
 */
export function proxyWarning(env: Record<string, string | undefined>): string | null {
  if (env.NODE_ENV !== 'production') return null;
  if (env.GG_TRUSTED_IP_HEADER?.trim()) return null;
  return (
    'GG_TRUSTED_IP_HEADER is not set: every new player shares one farm creation limit ' +
    '(5 farms in 10 minutes). Set it to the header your trusted proxy writes the ' +
    "caller's address to (for example x-real-ip on Vercel)."
  );
}
