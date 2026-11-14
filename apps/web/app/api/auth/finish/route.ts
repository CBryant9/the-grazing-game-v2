import { logFailure } from '@/server/logging';
import { USERNAME, convertGuest, finishSignUp, parseDob } from '@/server/auth/accounts';
import { authRoute, requireUser } from '@/server/auth/route';
import { SESSION_COOKIE, readJson, sessionFrom } from '@/server/game/http';
import { clearCookieText } from '@/server/security';
import type { FinishResult } from '@/lib/auth/types';

export const dynamic = 'force-dynamic';

const WORDS: Record<string, string> = {
  too_young:
    'You need to be 14 or older to make an account. You can still play The Grazing Game as a guest.',
  banned: 'We can not make an account for this email address.',
  signups_closed: 'Sign-ups are not open yet.',
  already_signed_up: 'This sign-in already has an account.',
  bad_date_of_birth: 'Check your date of birth. Use the day, month and year you were born.',
  username_taken: 'That username is not available. Try another.',
  bad_username: 'Use 3 to 20 letters, numbers or underscores for your username.',
  rate_limited: 'That was a lot of tries. Wait a little and try again.',
  unavailable: 'Something went wrong on our side. Try again in a moment.',
};

/**
 * Finish sign-up: username, date of birth, and (optionally) a display name. The server
 * hashes the sign-in email with the pepper, hands the database only that hash, and calls
 * `complete_sign_up`. Under 14 the database records a refusal against this sign-in, so
 * the same sign-in gets the same answer however many times it asks, with no form shown.
 * After a successful sign-up the guest's farm moves into the account (`convert_guest`).
 */
export const POST = authRoute(
  { name: 'finish', max: 10, write: true, by: 'session' },
  async (ctx) => {
    const { deps, user } = await requireUser(ctx);
    const body = (await readJson(ctx.req, 2048)) as {
      username?: unknown;
      displayName?: unknown;
      dob?: unknown;
    } | null;
    const username = typeof body?.username === 'string' ? body.username.trim() : '';
    const dob = parseDob(body?.dob);
    if (!USERNAME.test(username)) return refuse('bad_username');
    if (!dob) return refuse('bad_date_of_birth');
    const displayName =
      typeof body?.displayName === 'string' && body.displayName.trim()
        ? body.displayName.trim().slice(0, 40)
        : undefined;
    const out = await finishSignUp(deps, user, { username, displayName, dob });
    if (out.result !== 'signed_up') return refuse(out.result);

    // The guest's farm moves in. If the account has no room, nothing moves and the player is told.
    const guest = sessionFrom(ctx.req);
    let moved = 0;
    let noRoom = false;
    if (guest) {
      try {
        ({ moved, noRoom } = await convertGuest(deps, guest, user.id));
      } catch (e) {
        logFailure({ route: 'auth-finish', reason: 'guest_move_failed' }, e);
      }
      if (moved > 0) ctx.setCookies.push(clearCookieText(ctx.req, SESSION_COOKIE));
    }
    const ok: FinishResult = { ok: true, moved, noRoom };
    return ok;
  },
);

function refuse(reason: string): Response {
  const final = reason === 'too_young';
  const result: FinishResult = {
    ok: false,
    reason,
    message: WORDS[reason] ?? WORDS.unavailable!,
    ...(final ? { final: true } : {}),
  };
  // A plain 200 with the reason: the page words it. 'unavailable' is a server fault, so 503.
  return new Response(JSON.stringify(result), {
    status: reason === 'unavailable' ? 503 : 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
