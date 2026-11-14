import 'server-only';
import { sqlFromEnv } from '../db/sql';
import type { AuthDeps } from './accounts';
import { PEPPER_MIN } from './email';
import { supabaseProvider } from './supabase';

let override: AuthDeps | null | undefined;

/** For tests: use this provider and database, or `null` for no accounts. `undefined` goes back to the environment. */
export function setAuthDeps(deps: AuthDeps | null | undefined): void {
  override = deps;
  globalThis.__ggAuth = undefined;
}

declare global {
  var __ggAuth: AuthDeps | null | undefined;
}

/**
 * Accounts are on only when every key they need is set: the project address,
 * the publishable key, the secret key, the database connection and the ban
 * pepper. Missing any one, `null`: the game runs as guest play with files, and
 * sign-in is simply not offered. Nothing complains about it.
 */
export function authDeps(): AuthDeps | null {
  if (override !== undefined) return override;
  if (globalThis.__ggAuth !== undefined) return globalThis.__ggAuth;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  const pepper = process.env.BAN_HASH_PEPPER?.trim();
  const sql = sqlFromEnv();
  const on = Boolean(url && publishable && secret && sql && pepper && pepper.length >= PEPPER_MIN);
  globalThis.__ggAuth = on
    ? { provider: supabaseProvider(url!, publishable!, secret!), sql: sql!, pepper: pepper! }
    : null;
  return globalThis.__ggAuth;
}
