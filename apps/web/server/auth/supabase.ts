import 'server-only';
import { combineChunks, createServerClient, stringFromBase64URL } from '@supabase/ssr';
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

/**
 * The name supabase-js gives the sign-in cookie for a project: `sb-<first label of the host>-auth-token`
 * (its default storage key, read in `@supabase/supabase-js` dist/index.mjs on 15 Nov 2026).
 */
export function sessionCookieName(url: string): string {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    // A bad address names no cookie.
  }
  return `sb-${host.split('.')[0]}-auth-token`;
}

/** True for the project's sign-in cookie or one of its numbered chunks, and nothing else. */
export function isSessionCookie(name: string, base: string): boolean {
  return (
    name === base || (name.startsWith(`${base}.`) && /^\d{1,2}$/.test(name.slice(base.length + 1)))
  );
}

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

  // The project's own sign-in cookie: supabase-js names it `sb-<project ref>-auth-token`, split
  // into `.0`, `.1` chunks when it is long. Any other `sb-*` cookie is not ours and is ignored.
  const authCookie = sessionCookieName(url);
  return {
    async session(jar) {
      // Players with no sign-in cookie are the great majority: they cost nothing here. Nor does a
      // made-up cookie under another name (the rate limit asks this on every account request).
      if (!jar.getAll().some((c) => isSessionCookie(c.name, authCookie))) return null;
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
    async verify(jar) {
      // Read the access token out of the sign-in cookie (one cookie, or chunks of it) and ask the
      // auth server about that token alone. Nothing here can refresh the session or spend the
      // refresh token: a page can not write cookies, so a refresh there would lose the new tokens.
      // Supabase's docs (supabase.com/docs/guides/auth/server-side/nextjs, read 15 Nov 2026) keep
      // refreshing in the proxy for that reason.
      try {
        const all = jar.getAll();
        const base = all.some((c) => isSessionCookie(c.name, authCookie)) ? authCookie : null;
        if (!base) return null;
        const raw = await combineChunks(base, (name) => all.find((c) => c.name === name)?.value);
        if (!raw) return null;
        const text = raw.startsWith('base64-') ? stringFromBase64URL(raw.slice(7)) : raw;
        const token = (JSON.parse(text) as { access_token?: unknown }).access_token;
        if (typeof token !== 'string') return null;
        const payload = JSON.parse(stringFromBase64URL(token.split('.')[1] ?? '')) as {
          exp?: unknown;
        };
        if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) return null;
        const checker = createClient(url, publishableKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data, error } = await checker.auth.getUser(token);
        return error || !data.user ? null : toUser(data.user);
      } catch {
        return null;
      }
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
