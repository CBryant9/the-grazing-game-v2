import type { FinishResult, MeResponse } from './types';

/** An error with a plain message the player can read. */
export class AuthApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

const UNREACHABLE = 'The game could not be reached. Check your connection and try again.';
const GENERIC = 'Something went wrong. Try again in a moment.';

async function call<T>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      cache: 'no-store',
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new AuthApiError(UNREACHABLE);
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // Not JSON. Said plainly below.
  }
  if (!res.ok) {
    const e = (data as { error?: unknown } | null)?.error;
    // A sign-up reply carries its own words even on a refusal.
    if (data && typeof data === 'object' && 'ok' in data) return data as T;
    throw new AuthApiError(typeof e === 'string' ? e : GENERIC, res.status);
  }
  if (data === null) throw new AuthApiError(GENERIC);
  return data as T;
}

export const authApi = {
  me: () => call<MeResponse>('/api/auth/me', 'GET'),
  email: (email: string, next: string) =>
    call<{ ok: true; message: string }>('/api/auth/email', 'POST', { email, next }),
  google: (next: string) => call<{ url: string }>('/api/auth/google', 'POST', { next }),
  username: (name: string) => call<{ free: boolean }>('/api/auth/username', 'POST', { name }),
  finish: (input: { username: string; displayName?: string; dob: string }) =>
    call<FinishResult>('/api/auth/finish', 'POST', input),
  signOut: (everywhere: boolean) => call<{ ok: true }>('/api/auth/signout', 'POST', { everywhere }),
  deleteAccount: (confirm: string) =>
    call<{ ok: true }>('/api/account/delete', 'POST', { confirm }),
};
