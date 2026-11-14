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

/** A plain origin: `https://host` or `http://host:port`, with no path, query or fragment. */
const ORIGIN = /^https?:\/\/[^/?#\s]+$/;

/**
 * What stops accounts from turning on in production, as variable names (empty when nothing does).
 * Accounts fail closed without them:
 * - `GG_TRUSTED_IP_HEADER`: without it no caller's address is known, so the sign-in limits could
 *   only be one count for everyone, and ten requests a minute would lock every player out.
 * - `GG_SITE_URL`: every sign-in link comes back to it. Taken from the Host header instead, a
 *   forged Host could aim a link somewhere else.
 * Outside production (a developer's machine, the tests) neither is needed.
 */
export function accountsBlockers(env: Record<string, string | undefined>): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const out: string[] = [];
  if (!env.GG_TRUSTED_IP_HEADER?.trim()) out.push('GG_TRUSTED_IP_HEADER');
  if (!ORIGIN.test(env.GG_SITE_URL?.trim() ?? '')) out.push('GG_SITE_URL');
  return out;
}

/** The start-up line when every account key is set but accounts stay off for want of the above, or null. */
export function accountsWarning(env: Record<string, string | undefined>): string | null {
  const keys = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_SECRET_KEY',
    'SUPABASE_DB_POOLER_URL',
    'BAN_HASH_PEPPER',
  ];
  if (!keys.every((k) => env[k]?.trim())) return null;
  const missing = accountsBlockers(env);
  if (missing.length === 0) return null;
  return (
    `Accounts are OFF: ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} not set. ` +
    'In production sign-in needs the header that carries the address of the caller (so a limit is ' +
    'per caller, not one count for everyone) and the address of the site itself (so sign-in links can ' +
    'not be aimed elsewhere). Guest play carries on.'
  );
}
