import { afterAll, describe, expect, it } from 'vitest';
import type { NotifyDeps } from '../notify/deps';
import { FakePush } from '../test-support/fakeNotify';
import { communityKit, type Person, type RouteModule } from '../test-support/communityKit';
import { setCommunityNotifyDeps } from './notices';

/*
 * The community's notifications go through the notifications entry point (m6 join): a follow, a
 * comment and a like each tell the other person once, never the person who acted, and the queue's
 * own rules (the community switch) still decide.
 */

const kit = communityKit(['community', 'feed_posts']);
afterAll(() => setCommunityNotifyDeps(null));

const route = async (name: string): Promise<RouteModule> =>
  (await import(`@/app/api/community/${name}/route.ts`)) as RouteModule;

async function call(name: string, who: Person, body: unknown): Promise<Response> {
  const res = await kit.call(await route(name), `/api/community/${name}`, 'POST', who, body);
  expect(res.status, await res.clone().text()).toBe(200);
  return res;
}

const inbox = async (who: Person): Promise<string[]> =>
  (
    await kit.db.query<{ title: string }>(
      'select title from public.notifications where user_id = $1 order by created_at, title',
      [who.id],
    )
  ).rows.map((r) => r.title);

describe('community notifications', () => {
  it('a follow, a comment and a like tell the other person once, through queueEvent', async () => {
    setCommunityNotifyDeps((auth): NotifyDeps => ({
      sql: auth.sql,
      emailOf: async () => null,
      integrations: {
        push: new FakePush(),
        vapidPublicKey: 'BPublicKeyForTests',
        mail: null,
        from: null,
        site: 'https://game.example.test',
        tokenSecret: null,
        cronSecret: null,
        now: () => Date.now(),
      },
      switchOn: async () => true,
    }));
    const ann = await kit.person('ann');
    const ben = await kit.person('ben');
    await call('follow', ben, { action: 'follow', username: 'ann' });
    // Follow, unfollow and follow again: told once.
    await call('follow', ben, { action: 'unfollow', username: 'ann' });
    await call('follow', ben, { action: 'follow', username: 'ann' });
    const made = await call('post', ann, { action: 'create', body: 'Rain at last' });
    const postId = ((await made.json()) as { id: string }).id;
    await call('comment', ben, { action: 'create', postId, body: 'Good to hear' });
    await call('like', ben, { action: 'like', target: 'post', id: postId });
    await call('like', ben, { action: 'unlike', target: 'post', id: postId });
    await call('like', ben, { action: 'like', target: 'post', id: postId });
    // Ann acting on her own post tells nobody.
    await call('comment', ann, { action: 'create', postId, body: 'Thanks' });
    await call('like', ann, { action: 'like', target: 'post', id: postId });
    expect(await inbox(ann)).toEqual([
      'ben followed you.',
      'ben commented on your post.',
      'ben liked your post.',
    ]);
    expect(await inbox(ben)).toEqual([]);
  });

  it('the queue still decides: with the community switch off at queue time nothing is made', async () => {
    const ann = await kit.person('ann');
    const ben = await kit.person('ben');
    const made = await call('post', ann, { action: 'create', body: 'Dry again' });
    const postId = ((await made.json()) as { id: string }).id;
    // The routes are open (the switch is read once by the gate); the queue reads the database.
    await kit.db.query(
      `update public.feature_switches set enabled = false where key = 'community'`,
    );
    const { notifyLike } = await import('./notices');
    await notifyLike(kit.deps, { userId: ben.id, username: ben.username }, postId);
    expect(await inbox(ann)).toEqual([]);
  });
});
