import 'server-only';
import type { AuthDeps } from '../auth/accounts';
import { logFailure } from '../logging';
import { notifyDepsFor, type NotifyDeps } from '../notify/deps';
import { queueEvent } from '../notify/queue';
import type { Member } from './gate';

/*
 * The community's notifications, through the one entry point (`queueEvent`, m6 join). Each is
 * called after the change is committed, never inside it, and never fails the request: a
 * notification that can not be queued is logged and dropped. The queue applies the rules (the
 * community switch, under 16, banned or suspended accounts, the player's own switches, quiet
 * hours), so nothing here repeats them. Each has a dedupe key, so the same act twice (a follow,
 * unfollow and follow again; a like taken back and given again) tells the person once.
 *
 *   new_follower   to the person followed, when a follow goes through at once (a request is not
 *                  a follow until it is accepted, and the one accepting needs no telling)
 *   new_comment    to the post's author, when someone else comments
 *   likes          to the post's author, when someone else likes the post
 *
 * Group invites, challenges and leagues have no act that names a person to tell in this build.
 */

/** The notification dependencies for these accounts, or null with none set up. Tests replace it. */
let depsFor: (auth: AuthDeps) => NotifyDeps | null = (auth) => notifyDepsFor(auth);
export function setCommunityNotifyDeps(f: ((auth: AuthDeps) => NotifyDeps | null) | null): void {
  depsFor = f ?? ((auth) => notifyDepsFor(auth));
}

async function tell(
  auth: AuthDeps,
  userId: string | null | undefined,
  me: Member,
  event: Parameters<typeof queueEvent>[2],
  dedupeKey: string,
): Promise<void> {
  if (!userId || userId === me.userId) return;
  try {
    const nd = depsFor(auth);
    if (!nd) return;
    await queueEvent(nd, userId, event, { dedupeKey });
  } catch (e) {
    logFailure({ route: 'community-notify', reason: 'queue_failed' }, e);
  }
}

/** A follow went through at once (a public profile): tell the person followed. */
export async function notifyFollow(auth: AuthDeps, me: Member, followee: string): Promise<void> {
  await tell(
    auth,
    followee,
    me,
    { type: 'new_follower', name: me.username },
    `follow:${me.userId}:${followee}`,
  );
}

/** Someone commented on a post: tell its author. */
export async function notifyComment(
  auth: AuthDeps,
  me: Member,
  postId: string,
  commentId: string,
): Promise<void> {
  const author = await postAuthor(auth, postId);
  await tell(auth, author, me, { type: 'new_comment', name: me.username }, `comment:${commentId}`);
}

/** Someone liked a post: tell its author, once for each person and post. */
export async function notifyLike(auth: AuthDeps, me: Member, postId: string): Promise<void> {
  const author = await postAuthor(auth, postId);
  await tell(
    auth,
    author,
    me,
    { type: 'likes', count: 1, name: me.username },
    `like:${postId}:${me.userId}`,
  );
}

async function postAuthor(auth: AuthDeps, postId: string): Promise<string | null> {
  try {
    const r = await auth.sql.query<{ author_id: string }>(
      'select author_id from public.posts where id = $1 and removed_at is null',
      [postId],
    );
    return r.rows[0]?.author_id ?? null;
  } catch {
    return null;
  }
}

/** The account id for a username (server read), or null. */
export async function idOfUsername(auth: AuthDeps, username: unknown): Promise<string | null> {
  if (typeof username !== 'string' || username.length > 40) return null;
  const r = await auth.sql.query<{ user_id: string }>(
    'select user_id from public.profiles where lower(username) = lower($1)',
    [username],
  );
  return r.rows[0]?.user_id ?? null;
}
