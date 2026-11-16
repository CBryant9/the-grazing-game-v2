import { randomUUID, randomBytes } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import type { AuthProvider, AuthUser, CookieJar } from '../auth/provider';

/**
 * A fake sign-in provider for tests, behind the same interface as Supabase's. It keeps links,
 * sessions and users in memory (users are also written to `auth.users` in PGlite, so the
 * database's foreign keys and rules are real). What it stands in for:
 *
 * - the emailed link: `sendLink` records the link (`sent`) instead of mailing it. A link works
 *   once, only in the browser that asked (the `fake_verifier` cookie, as PKCE does), and not
 *   after `expire()`;
 * - Google: `googleUrl` gives an address, and `googleReturn(email)` plays the way back;
 * - sessions: a `fake_session` cookie.
 *
 * What it can NOT prove: Supabase's own behaviour (its token format, email delivery, rate
 * limits, Google's consent screen, session refresh). That is owed against a real project.
 */
export class FakeAuth implements AuthProvider {
  readonly sent: { email: string; redirectTo: string; code: string }[] = [];
  readonly removed: { bucket: string; path: string }[] = [];
  readonly deleted: string[] = [];
  readonly users = new Map<string, AuthUser>();
  /** For tests: make the next provider call of this kind throw. */
  fail: Partial<
    Record<
      'sendLink' | 'googleUrl' | 'exchange' | 'deleteUser' | 'signOut' | 'removeFiles',
      boolean
    >
  > = {};
  private readonly links = new Map<
    string,
    { email: string; verifier: string; used: boolean; expired: boolean; method: string }
  >();
  private readonly sessions = new Map<string, string>();
  /**
   * Tokens signed out everywhere. Like a real access token, one keeps passing the token check
   * (`session`) until it runs out, while the server-side check (`user`) refuses it at once.
   */
  private readonly revoked = new Set<string>();
  /**
   * Access tokens that have run out, and refresh tokens, as Supabase rotates them: a refresh token
   * works once; it gives a new access token and a new refresh token, and the new pair has to reach
   * the browser. Using a spent one again ends the whole session (reuse detection).
   */
  private readonly expired = new Set<string>();
  private readonly refreshTokens = new Map<string, string>();
  private readonly spent = new Set<string>();
  /** How many refresh tokens have been spent. For tests: a request that must not refresh checks it did not move. */
  refreshed = 0;
  /** For tests: the text of the error a failing call throws (a real one may carry an address). */
  errorText: string | null = null;
  private n = 0;

  constructor(private readonly db: PGlite) {}

  private cookie(jar: CookieJar, name: string): string | undefined {
    return jar.getAll().find((c) => c.name === name)?.value;
  }

  async session(jar: CookieJar): Promise<AuthUser | null> {
    const token = this.cookie(jar, 'fake_session') ?? '';
    if (this.expired.has(token)) return this.refresh(jar);
    const id = this.sessions.get(token);
    return id ? (this.users.get(id) ?? null) : null;
  }

  async user(jar: CookieJar): Promise<AuthUser | null> {
    if (this.revoked.has(this.cookie(jar, 'fake_session') ?? '')) return null;
    return this.session(jar);
  }

  /** Checks the access token with the auth server and never refreshes: an expired token is no one. */
  async verify(jar: CookieJar): Promise<AuthUser | null> {
    const token = this.cookie(jar, 'fake_session') ?? '';
    if (this.expired.has(token) || this.revoked.has(token)) return null;
    const id = this.sessions.get(token);
    return id ? (this.users.get(id) ?? null) : null;
  }

  /** Make this cookie string's access token run out (the refresh token stays good). */
  expireAccess(cookie: string): void {
    const m = /fake_session=([^;]+)/.exec(cookie);
    if (m) this.expired.add(m[1]!);
  }

  private refresh(jar: CookieJar): AuthUser | null {
    const old = this.cookie(jar, 'fake_refresh') ?? '';
    const userId = this.refreshTokens.get(old);
    if (!userId) return null;
    if (this.spent.has(old)) {
      // A spent refresh token used again: every session of that account ends.
      for (const [t, u] of this.sessions) if (u === userId) this.sessions.delete(t);
      for (const [r, u] of this.refreshTokens) if (u === userId) this.refreshTokens.delete(r);
      return null;
    }
    this.spent.add(old);
    this.refreshed++;
    const access = randomBytes(12).toString('hex');
    const refresh = randomBytes(12).toString('hex');
    this.sessions.set(access, userId);
    this.refreshTokens.set(refresh, userId);
    jar.setAll([
      { name: 'fake_session', value: access },
      { name: 'fake_refresh', value: refresh },
    ]);
    return this.users.get(userId) ?? null;
  }

  private newPair(userId: string): { access: string; refresh: string } {
    const access = randomBytes(12).toString('hex');
    const refresh = randomBytes(12).toString('hex');
    this.sessions.set(access, userId);
    this.refreshTokens.set(refresh, userId);
    return { access, refresh };
  }

  private boom(what: string): Error {
    return new Error(this.errorText ?? `${what} is down`);
  }

  async sendLink(jar: CookieJar, email: string, redirectTo: string): Promise<void> {
    if (this.fail.sendLink) throw this.boom('mail');
    const code = `link-${++this.n}`;
    const verifier = randomBytes(8).toString('hex');
    this.links.set(code, {
      email: email.toLowerCase(),
      verifier,
      used: false,
      expired: false,
      method: 'email',
    });
    this.sent.push({ email, redirectTo, code });
    jar.setAll([{ name: 'fake_verifier', value: `${code}:${verifier}` }]);
  }

  async googleUrl(jar: CookieJar, redirectTo: string): Promise<string> {
    if (this.fail.googleUrl) throw this.boom('google');
    const verifier = randomBytes(8).toString('hex');
    jar.setAll([{ name: 'fake_verifier', value: `google:${verifier}` }]);
    return `https://accounts.example/google?to=${encodeURIComponent(redirectTo)}`;
  }

  /** Play the way back from Google for this email: the code the callback gets. */
  googleReturn(jar: CookieJar, email: string): string {
    const code = `g-${++this.n}`;
    const verifier = (this.cookie(jar, 'fake_verifier') ?? '').split(':')[1] ?? '';
    this.links.set(code, {
      email: email.toLowerCase(),
      verifier,
      used: false,
      expired: false,
      method: 'google',
    });
    return code;
  }

  expire(code: string): void {
    const l = this.links.get(code);
    if (l) l.expired = true;
  }

  async exchange(jar: CookieJar, code: string): Promise<AuthUser | null> {
    if (this.fail.exchange) throw this.boom('auth');
    const l = this.links.get(code);
    if (!l || l.used || l.expired) return null;
    const mine = (this.cookie(jar, 'fake_verifier') ?? '').split(':')[1];
    if (mine !== l.verifier) return null;
    l.used = true;
    const user = await this.upsert(l.email, l.method);
    const pair = this.newPair(user.id);
    jar.setAll([
      { name: 'fake_session', value: pair.access },
      { name: 'fake_refresh', value: pair.refresh },
      { name: 'fake_verifier', value: '', maxAge: 0 },
    ]);
    return user;
  }

  /** Make (or find) a signed-in user without a link, for tests that need one. Returns the cookie. */
  async signInAs(
    email: string,
    method = 'email',
  ): Promise<{ user: AuthUser; cookie: string; full: string }> {
    const user = await this.upsert(email.toLowerCase(), method);
    const pair = this.newPair(user.id);
    // `cookie` is the access token alone (what most tests send). `full` also carries the refresh token.
    return {
      user,
      cookie: `fake_session=${pair.access}`,
      full: `fake_session=${pair.access}; fake_refresh=${pair.refresh}`,
    };
  }

  private async upsert(email: string, method: string): Promise<AuthUser> {
    for (const u of this.users.values()) if (u.email === email) return u;
    const user: AuthUser = { id: randomUUID(), email, method, anonymous: false };
    await this.db.query('insert into auth.users (id, email, aud, role) values ($1, $2, $3, $4)', [
      user.id,
      email,
      'authenticated',
      'authenticated',
    ]);
    this.users.set(user.id, user);
    return user;
  }

  async signOut(jar: CookieJar, scope: 'local' | 'global'): Promise<void> {
    if (this.fail.signOut) throw new Error('auth is down');
    const token = this.cookie(jar, 'fake_session') ?? '';
    const id = this.sessions.get(token);
    if (scope === 'global' && id) {
      for (const [t, u] of this.sessions) if (u === id) this.revoked.add(t);
    } else this.sessions.delete(token);
    jar.setAll([
      { name: 'fake_session', value: '', maxAge: 0 },
      { name: 'fake_refresh', value: '', maxAge: 0 },
    ]);
  }

  async deleteUser(userId: string): Promise<void> {
    if (this.fail.deleteUser) throw new Error('auth is down');
    await this.db.query('delete from auth.users where id = $1', [userId]);
    this.deleted.push(userId);
    this.users.delete(userId);
    for (const [t, u] of this.sessions) if (u === userId) this.sessions.delete(t);
  }

  async emailOf(userId: string): Promise<string | null> {
    return this.users.get(userId)?.email ?? null;
  }

  async removeFiles(files: { bucket: string; path: string }[]): Promise<void> {
    if (this.fail.removeFiles) throw new Error('storage is down');
    this.removed.push(...files);
  }
}
