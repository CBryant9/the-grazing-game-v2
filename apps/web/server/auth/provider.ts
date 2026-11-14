import 'server-only';

/**
 * The sign-in provider, behind a small interface. The real one is Supabase
 * Auth's server-side flow for Next.js (supabase.ts). The tests use a fake
 * (server/test-support/fakeAuth.ts), so what they prove about sign-in is the
 * game's own handling, not Supabase's service. One run against a real
 * project is still owed (docs/DEVELOPMENT_LOG.md, "m3.2 Accounts and saves").
 */

export interface AuthUser {
  id: string;
  /** The sign-in email. Null only for a provider that does not give one. */
  email: string | null;
  /** How they signed in: `email` or `google`. */
  method: string;
  /** An anonymous session is never an account. */
  anonymous: boolean;
}

export interface CookieToSet {
  name: string;
  value: string;
  maxAge?: number;
}

/**
 * The request's cookies in, and the cookies the provider wants set out. The
 * route turns the second into Set-Cookie headers (HttpOnly, SameSite=Lax,
 * path /, Secure in production) on whatever it answers.
 */
export interface CookieJar {
  getAll(): { name: string; value: string }[];
  setAll(cookies: CookieToSet[]): void;
}

export type SignInFailure = 'bad_code' | 'unavailable';

export interface AuthProvider {
  /**
   * Who is signed in, checked by the signature on the token (no round trip), so
   * every game request can ask. Good for "which farms are theirs". Account changes
   * (delete, download) use `user`, which asks the auth server. Null for none.
   */
  session(jar: CookieJar): Promise<AuthUser | null>;
  /** The signed-in user, checked with the auth server (never taken from the cookie alone). Null for none. */
  user(jar: CookieJar): Promise<AuthUser | null>;
  /** Send a sign-in link. Resolves the same whether or not the address has an account. */
  sendLink(jar: CookieJar, email: string, redirectTo: string): Promise<void>;
  /** The address to send the player to for Google. */
  googleUrl(jar: CookieJar, redirectTo: string): Promise<string>;
  /** Turn the one-use code on the callback into a session. Null when the code is wrong, used or expired. */
  exchange(jar: CookieJar, code: string): Promise<AuthUser | null>;
  /** End this device's session (`local`) or every session (`global`). */
  signOut(jar: CookieJar, scope: 'local' | 'global'): Promise<void>;
  /** Remove the account from Auth. The database cascades the rest. */
  deleteUser(userId: string): Promise<void>;
  /** Remove files from Storage buckets (before an account is deleted). */
  removeFiles(files: { bucket: string; path: string }[]): Promise<void>;
}

/** The cookie jar for a request, collecting what the provider sets. */
export function jarFor(req: Request): CookieJar & { out: CookieToSet[] } {
  const parsed: { name: string; value: string }[] = [];
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const name = part.slice(0, i).trim();
    let value = part.slice(i + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      // Keep it as it came.
    }
    parsed.push({ name, value });
  }
  const out: CookieToSet[] = [];
  return {
    out,
    getAll: () => parsed,
    setAll(list) {
      for (const c of list) {
        const at = out.findIndex((o) => o.name === c.name);
        if (at >= 0) out.splice(at, 1);
        out.push(c);
        const seen = parsed.findIndex((p) => p.name === c.name);
        if (seen >= 0) parsed.splice(seen, 1);
        if (c.value !== '' && c.maxAge !== 0) parsed.push({ name: c.name, value: c.value });
      }
    },
  };
}
