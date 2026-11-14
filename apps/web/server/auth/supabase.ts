import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient, type User } from '@supabase/supabase-js';
import type { AuthProvider, AuthUser, CookieJar } from './provider';

/**
 * Supabase Auth, through the server-side flow for Next.js
 * (`@supabase/ssr`'s `createServerClient`, with the cookies read from and
 * written to the request and response). The browser never holds a Supabase
 * client: every sign-in step is a request to this site.
 *
 * Checked against the Supabase docs on 15 Nov 2026
 * (supabase.com/docs/guides/auth/server-side/nextjs and the reference pages for
 * signInWithOtp, signInWithOAuth and signOut):
 * - `createServerClient(url, publishableKey, { cookies: { getAll, setAll } })`
 * - `auth.getClaims()` checks the token's signature and refreshes a token near expiry
 *   (used for the game's per-request identity); `auth.getUser()` asks the Auth server, so it can be trusted (`getSession()`
 *   reads the cookie and can not be)
 * - `auth.signInWithOtp({ email, options: { emailRedirectTo } })` sends the link
 * - `auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect } })`
 * - `auth.exchangeCodeForSession(code)` on the callback (PKCE: the code only works
 *   in the browser that asked, which holds the matching verifier cookie)
 * - `auth.signOut({ scope: 'local' | 'global' | 'others' })`
 * - `auth.admin.deleteUser(id)` and `storage.from(bucket).remove(paths)` with the secret key
 */

const toUser = (u: User): AuthUser => ({
  id: u.id,
  email: u.email ?? null,
  method: typeof u.app_metadata?.provider === 'string' ? u.app_metadata.provider : 'email',
  anonymous: u.is_anonymous === true,
});

export function supabaseProvider(
  url: string,
  publishableKey: string,
  secretKey: string,
): AuthProvider {
  const client = (jar: CookieJar) =>
    createServerClient(url, publishableKey, {
      cookies: {
        getAll: () => jar.getAll(),
        setAll(list) {
          jar.setAll(
            list.map((c) => ({ name: c.name, value: c.value, maxAge: c.options?.maxAge })),
          );
        },
      },
      // The server holds the session. Nothing here is ever kept for the browser to read.
      auth: { flowType: 'pkce' },
    });
  const admin = () =>
    createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

  return {
    async session(jar) {
      // Players with no sign-in cookie are the great majority: they cost nothing here.
      if (!jar.getAll().some((c) => c.name.startsWith('sb-'))) return null;
      const { data, error } = await client(jar).auth.getClaims();
      const c = data?.claims;
      if (error || !c || typeof c.sub !== 'string') return null;
      const meta = c.app_metadata as { provider?: unknown } | undefined;
      return {
        id: c.sub,
        email: typeof c.email === 'string' ? c.email : null,
        method: typeof meta?.provider === 'string' ? meta.provider : 'email',
        anonymous: c.is_anonymous === true,
      };
    },
    async user(jar) {
      const { data, error } = await client(jar).auth.getUser();
      return error || !data.user ? null : toUser(data.user);
    },
    async sendLink(jar, email, redirectTo) {
      const { error } = await client(jar).auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
    },
    async googleUrl(jar, redirectTo) {
      const { data, error } = await client(jar).auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error || !data.url) throw error ?? new Error('No address for Google.');
      return data.url;
    },
    async exchange(jar, code) {
      const { data, error } = await client(jar).auth.exchangeCodeForSession(code);
      return error || !data.user ? null : toUser(data.user);
    },
    async signOut(jar, scope) {
      await client(jar).auth.signOut({ scope });
    },
    async deleteUser(userId) {
      const { error } = await admin().auth.admin.deleteUser(userId);
      if (error) throw error;
    },
    async emailOf(userId) {
      const { data, error } = await admin().auth.admin.getUserById(userId);
      return error ? null : (data.user?.email ?? null);
    },
    async removeFiles(files) {
      const byBucket = new Map<string, string[]>();
      for (const f of files) byBucket.set(f.bucket, [...(byBucket.get(f.bucket) ?? []), f.path]);
      for (const [bucket, paths] of byBucket) {
        for (let i = 0; i < paths.length; i += 100) {
          const { error } = await admin()
            .storage.from(bucket)
            .remove(paths.slice(i, i + 100));
          if (error) throw error;
        }
      }
    },
  };
}
