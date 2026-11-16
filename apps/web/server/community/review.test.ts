import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { communityKit, cookieList, type Person } from '../test-support/communityKit';
import { jpegWithExif, pngWithText } from '../test-support/fakePhotos';

/**
 * The Stage 4 security review of what m4.2 built (docs/DEVELOPMENT_LOG.md, "m4.2 Community",
 * "Fixes after the security review"). Each test was written first and seen to fail.
 */
const state: { cookie: string } = { cookie: '' };
vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => cookieList(state.cookie) }),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => '/community',
}));

const kit = communityKit(['community', 'feed_posts']);

type PageFn = (p: unknown) => Promise<unknown>;
const page = async (load: () => Promise<unknown>): Promise<PageFn> =>
  ((await load()) as { default: PageFn }).default;
const as = (who: Person) => {
  state.cookie = who.cookie;
};
const props = (params: Record<string, string>, search: Record<string, string> = {}) => ({
  params: Promise.resolve(params),
  searchParams: Promise.resolve(search),
});
const html = (out: unknown) => renderToStaticMarkup(out as never);

async function postBy(who: Person, body: string, visibility = 'public'): Promise<string> {
  const r = await kit.db.query<{ id: string }>(
    'insert into public.posts (author_id, body, visibility) values ($1, $2, $3) returning id',
    [who.id, body, visibility],
  );
  return r.rows[0]!.id;
}

describe('1. staff get the same community view as any member', () => {
  it("a moderator and an admin get the plain not found for an under-16's profile, post and follower list", async () => {
    const kid = await kit.person('kiddo', { ageYears: 15 });
    const mod = await kit.person('modder', { role: 'moderator' });
    const admin = await kit.person('adminx', { role: 'admin' });
    await kit.db.query('update public.profiles set bio = $2 where user_id = $1', [
      kid.id,
      'kid bio secret',
    ]);
    const id = await postBy(kid, 'kid post secret');
    const Profile = await page(() => import('@/app/community/u/[username]/page'));
    const List = await page(() => import('@/app/community/u/[username]/[list]/page'));
    const Post = await page(() => import('@/app/community/post/[id]/page'));
    for (const staff of [mod, admin]) {
      as(staff);
      await expect(Profile(props({ username: 'kiddo' }))).rejects.toThrow('NEXT_NOT_FOUND');
      await expect(List(props({ username: 'kiddo', list: 'followers' }))).rejects.toThrow(
        'NEXT_NOT_FOUND',
      );
      await expect(Post(props({ id }))).rejects.toThrow('NEXT_NOT_FOUND');
    }
  });

  it("staff see a private profile's card only, and no followers-only post they do not follow", async () => {
    const privy = await kit.person('privy', { privacy: 'private' });
    const folks = await kit.person('folks', { privacy: 'followers' });
    const mod = await kit.person('modder', { role: 'moderator' });
    const admin = await kit.person('adminx', { role: 'admin' });
    await kit.db.query('update public.profiles set bio = $2 where user_id = $1', [
      privy.id,
      'private bio secret',
    ]);
    const fid = await postBy(folks, 'followers secret', 'followers');
    const Profile = await page(() => import('@/app/community/u/[username]/page'));
    const Post = await page(() => import('@/app/community/post/[id]/page'));
    for (const staff of [mod, admin]) {
      as(staff);
      const out = html(await Profile(props({ username: 'privy' })));
      expect(out).toContain('This profile is private.');
      expect(out).not.toContain('private bio secret');
      await expect(Post(props({ id: fid }))).rejects.toThrow('NEXT_NOT_FOUND');
    }
  });

  it('a block hides both ways for staff too', async () => {
    const bob = await kit.person('bobby');
    const mod = await kit.person('modder', { role: 'moderator' });
    await kit.db.query('insert into public.blocks (blocker_id, blocked_id) values ($1, $2)', [
      bob.id,
      mod.id,
    ]);
    const id = await postBy(bob, 'not for the blocked');
    const Profile = await page(() => import('@/app/community/u/[username]/page'));
    const Post = await page(() => import('@/app/community/post/[id]/page'));
    as(mod);
    await expect(Profile(props({ username: 'bobby' }))).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(Post(props({ id }))).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

describe('2. a private account is seen by its owner only', () => {
  it('not in the Everyone feed, not on the post page, not in the share image', async () => {
    const privy = await kit.person('privy', { privacy: 'private' });
    const ann = await kit.person('annie');
    const id = await postBy(privy, 'private post secret');
    const Feed = await page(() => import('@/app/community/page'));
    const Post = await page(() => import('@/app/community/post/[id]/page'));
    as(ann);
    const feed = html(await Feed({ searchParams: Promise.resolve({ tab: 'everyone' }) }));
    expect(feed).not.toContain('private post secret');
    await expect(Post(props({ id }))).rejects.toThrow('NEXT_NOT_FOUND');
    const img = await import('@/app/api/community/share-image/route');
    const res = await kit.call(img, `/api/community/share-image?post=${id}`, 'GET', ann);
    expect(res.status).toBe(404);
    // The owner still sees it.
    as(privy);
    expect(html(await Post(props({ id })))).toContain('private post secret');
  });

  it('Share my farm from a private profile is refused with a plain reason', async () => {
    const privy = await kit.person('privy', { privacy: 'private' });
    const share = await import('@/app/api/community/share/route');
    const farm = await kit.db.query<{ id: string }>(
      `insert into public.farms (owner_id, mode, name, district, size, size_ha, enterprise, start_type, difficulty, engine_version)
       values ($1, 'fast', 'Hill', 'cq', 'small', 500, 'grazing', 'running', 'easy', 't') returning id`,
      [privy.id],
    );
    const r = await kit.call(share, '/api/community/share', 'POST', privy, {
      farmId: farm.rows[0]!.id,
    });
    expect(r.status).toBe(409);
    expect(((await r.json()) as { error: string }).error).toMatch(/private/);
  });
});

describe('3. hostile images', () => {
  it('refuses a JPEG with a second SOF marker', async () => {
    const { cleanImage } = await import('./image');
    const good = Buffer.from(jpegWithExif());
    const sof = Buffer.from([
      0xff, 0xc0, 0x00, 0x0b, 0x08, 0x2e, 0xe0, 0x2e, 0xe0, 0x01, 0x01, 0x11, 0x00,
    ]);
    // A huge frame header first (what a decoder reads), then the small real one (what the size check kept).
    const at = good.indexOf(Buffer.from([0xff, 0xc0]));
    const bad = new Uint8Array(Buffer.concat([good.subarray(0, at), sof, good.subarray(at)]));
    expect(() => cleanImage(bad, 1 << 20)).toThrow();
  });

  it('strips the JFIF thumbnail', async () => {
    const { cleanImage } = await import('./image');
    const good = Buffer.from(jpegWithExif());
    const thumb = Buffer.alloc(2 * 2 * 3, 0x7a);
    const app0 = Buffer.concat([
      Buffer.from([0xff, 0xe0, 0x00, 16 + thumb.length]),
      Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01'),
      Buffer.from([2, 2]),
      thumb,
    ]);
    // Swap the plain APP0 (18 bytes from offset 2) for one carrying a thumbnail.
    const withThumb = Buffer.concat([good.subarray(0, 2), app0, good.subarray(2 + 18)]);
    const out = Buffer.from(cleanImage(new Uint8Array(withThumb), 1 << 20).bytes);
    expect(out.indexOf(thumb)).toBe(-1);
    const a = out.indexOf(Buffer.from([0xff, 0xe0]));
    expect(out.readUInt16BE(a + 2)).toBe(16);
    expect(out[a + 16]).toBe(0);
    expect(out[a + 17]).toBe(0);
  });

  it('a player can not upload straight to Storage with their own token', async () => {
    const ann = await kit.person('annie');
    for (const bucket of ['avatars', 'post-photos', 'group-photos']) {
      let err: unknown = null;
      try {
        await kit.db.transaction(async (tx) => {
          await tx.exec('set local role authenticated');
          await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
            JSON.stringify({ sub: ann.id, role: 'authenticated' }),
          ]);
          await tx.query('insert into storage.objects (bucket_id, name) values ($1, $2)', [
            bucket,
            `${ann.id}/sneaky.jpg`,
          ]);
        });
      } catch (e) {
        err = e;
      }
      expect(err, bucket).not.toBeNull();
    }
  });

  it('servePhoto refuses a stored file that is not the picture type it claims', async () => {
    const ann = await kit.person('annie');
    const bob = await kit.person('bobby');
    const { servePhoto } = await import('./photos');
    const id = await postBy(ann, 'with a photo');
    const cases: [string, Uint8Array][] = [
      ['html.jpg', new Uint8Array(Buffer.from('<html><script>alert(1)</script></html>'))],
      ['svg.jpg', new Uint8Array(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))],
      ['mismatch.jpg', pngWithText()],
      ['ffstart.jpg', new Uint8Array([0xff, 0x3c, 0x68, 0x74, 0x6d, 0x6c])],
    ];
    let pos = 1;
    for (const [name, bytes] of cases) {
      const path = `${ann.id}/${name}`;
      await kit.storage.put('post-photos', path, bytes);
      const row = await kit.db.query<{ id: string }>(
        `insert into public.post_photos (post_id, storage_path, position) values ($1, $2, $3) returning id`,
        [id, path, pos++],
      );
      const { identityOf, approve } = await import('./photos');
      const file = (await identityOf(kit.deps.sql, 'post-photos', path))!;
      await approve(kit.deps.sql, 'post_photo', row.rows[0]!.id, file);
      expect(await servePhoto(kit.deps, bob.id, 'post', row.rows[0]!.id), name).toBeNull();
    }
  });
});

describe('4. uploads have a database limit', () => {
  it('a player can not add photos past the hourly rate, nor past the daily cap', async () => {
    const ann = await kit.person('annie');
    const rule = await kit.db.query<{ action: string; max_count: number }>(
      `select action, max_count from public.rate_limit_rules where action in ('photo', 'photo_day') order by action`,
    );
    expect(rule.rows.map((r) => r.action)).toEqual(['photo', 'photo_day']);
    const hourly = rule.rows[0]!.max_count;
    let refused: unknown = null;
    for (let i = 0; i <= hourly + 1 && !refused; i++) {
      const id = await postBy(ann, `post ${i}`);
      try {
        await kit.db.transaction(async (tx) => {
          await tx.exec('set local role authenticated');
          await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
            JSON.stringify({ sub: ann.id, role: 'authenticated' }),
          ]);
          await tx.query(
            'insert into public.post_photos (post_id, storage_path, position) values ($1, $2, 1)',
            [id, `${ann.id}/p${i}.jpg`],
          );
        });
      } catch (e) {
        refused = e;
      }
    }
    expect((refused as { hint?: string } | null)?.hint).toBe('rate_limited');
  });
});

describe('5. the word filter', () => {
  it('refuses a banned word in profile links', async () => {
    const ann = await kit.person('annie');
    await kit.db.query(`insert into public.word_filter (term) values ('badword')`);
    const profile = await import('@/app/api/community/profile/route');
    const r = await kit.call(profile, '/api/community/profile', 'POST', ann, {
      links: { website: 'https://example.com/badword' },
    });
    expect(r.status).toBe(400);
  });
});

describe('5b. the word filter on Share my farm', () => {
  it("refuses a farm whose name holds a banned word, because the card carries the farm's name", async () => {
    const ann = await kit.person('annie');
    const farm = await kit.farmFor(ann, { name: 'Badword Downs' });
    await kit.db.query(`insert into public.word_filter (term) values ('badword')`);
    const share = await import('@/app/api/community/share/route');
    const r = await kit.call(share, '/api/community/share', 'POST', ann, { farmId: farm });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { code?: string }).code).toBe('word_filter');
  });
});

describe('6. hidden characters', () => {
  it('removes the Hangul fillers, the invisible maths signs, tag characters and the grapheme joiner', async () => {
    const { cleanText } = await import('./text');
    for (const c of [
      'ㅤ',
      'ᅟ',
      'ᅠ',
      'ﾠ',
      '⁡',
      '⁢',
      '⁣',
      '⁤',
      '͏',
      '\u{e0001}',
      '\u{e0041}',
      '\u{e007f}',
    ]) {
      expect(cleanText(`ba${c}d`), c.codePointAt(0)!.toString(16)).toBe('bad');
    }
  });

  it('refuses a display name that renders blank', async () => {
    const ann = await kit.person('annie');
    const profile = await import('@/app/api/community/profile/route');
    const r = await kit.call(profile, '/api/community/profile', 'POST', ann, {
      displayName: 'ㅤㅤ',
    });
    expect(r.status).toBe(400);
  });
});

describe('7. cheap-to-trigger slow queries', () => {
  const plan = async (sql: string): Promise<string> => {
    const out: string[] = [];
    await kit.db.transaction(async (tx) => {
      await tx.exec('set local enable_seqscan = off');
      const r = await tx.query<{ 'QUERY PLAN': string }>(`explain ${sql}`);
      out.push(...r.rows.map((x) => x['QUERY PLAN']));
    });
    return out.join('\n');
  };

  it('username search uses the prefix index', async () => {
    expect(
      await plan(`select 1 from public.profiles where lower(username) like 'ab%' escape '\\'`),
    ).toMatch(/profiles_username_prefix/);
  });

  it('the Friends tab reads by followed author, with an index for it', async () => {
    const { friendsSql } = await import('./data');
    expect(friendsSql).toMatch(/lateral/);
    expect(
      await plan(
        `select 1 from public.posts p where p.author_id = '00000000-0000-4000-8000-000000000001'
           and p.group_id is null and p.removed_at is null order by p.created_at desc, p.id desc limit 21`,
      ),
    ).toMatch(/posts_author_feed/);
  });

  it('like counts come from one safe count, not a rule per like row', async () => {
    const ann = await kit.person('annie');
    const bob = await kit.person('bobby');
    const id = await postBy(ann, 'like me');
    await kit.db.query('insert into public.likes (user_id, post_id) values ($1, $2)', [bob.id, id]);
    const { postSelectSql, getPost } = await import('./data');
    expect(postSelectSql).not.toMatch(/count\(\*\)::int from public\.likes/);
    const { asUser } = await import('../auth/accounts');
    const seen = await asUser(kit.deps.sql, ann.id, (tx) => getPost(tx, ann.id, id));
    expect(seen!.likes).toBe(1);
  });
});

describe('8. smaller', () => {
  it('a banned or suspended player is not shown the Community link', async () => {
    const me = await import('@/app/api/auth/me/route');
    const banned = await kit.person('banned', { banned: true });
    const susp = await kit.person('susp', { suspended: true });
    const fine = await kit.person('finey');
    const ask = async (who: Person) =>
      ((await (await kit.call(me, '/api/auth/me', 'GET', who)).json()) as { community: boolean })
        .community;
    expect(await ask(fine)).toBe(true);
    expect(await ask(banned)).toBe(false);
    expect(await ask(susp)).toBe(false);
  });

  it('replies past the first few are behind a "show more" link', async () => {
    const ann = await kit.person('annie');
    const id = await postBy(ann, 'thread');
    const top = await kit.db.query<{ id: string }>(
      `insert into public.comments (post_id, author_id, body) values ($1, $2, 'top') returning id`,
      [id, ann.id],
    );
    for (let i = 0; i < 12; i++) {
      await kit.db.query(
        `insert into public.comments (post_id, author_id, parent_id, body, created_at)
         values ($1, $2, $3, $4, now() + ($5 || ' seconds')::interval)`,
        [id, ann.id, top.rows[0]!.id, `reply ${i}`, String(i)],
      );
    }
    const Post = await page(() => import('@/app/community/post/[id]/page'));
    as(ann);
    const out = html(await Post(props({ id })));
    expect(out).toContain('reply 0');
    expect(out).not.toContain('reply 11');
    expect(out).toContain('Show more replies');
    const all = html(await Post(props({ id }, { thread: top.rows[0]!.id })));
    expect(all).toContain('reply 11');
  });

  it('the admin photo queue shows previews as served images, not data addresses', async () => {
    const ann = await kit.person('annie');
    const admin = await kit.person('adminx', { role: 'admin' });
    const id = await postBy(ann, 'photo post');
    const path = `${ann.id}/x.png`;
    await kit.storage.put('post-photos', path, pngWithText(), 'image/png');
    const ph = await kit.db.query<{ id: string }>(
      `insert into public.post_photos (post_id, storage_path, position) values ($1, $2, 1) returning id`,
      [id, path],
    );
    as(admin);
    const Queue = await page(() => import('@/app/admin/photos/page'));
    const out = html(await (Queue as () => Promise<unknown>)());
    expect(out).not.toContain('data:image');
    expect(out).toContain(`/api/admin/photo-preview?kind=post_photo&amp;row=${ph.rows[0]!.id}`);
    const preview = await import('@/app/api/admin/photo-preview/route');
    const ok = await kit.call(
      preview,
      `/api/admin/photo-preview?kind=post_photo&row=${ph.rows[0]!.id}`,
      'GET',
      admin,
    );
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('image/png');
    const mod = await kit.person('modder', { role: 'moderator' });
    const kid = await kit.person('kiddo', { ageYears: 15 });
    for (const who of [null, ann, mod, kid]) {
      const no = await kit.call(
        preview,
        `/api/admin/photo-preview?kind=post_photo&row=${ph.rows[0]!.id}`,
        'GET',
        who,
      );
      expect(no.status, who?.username ?? 'visitor').toBe(404);
      expect(no.headers.get('x-robots-tag')).toBeNull();
    }
    // A photo that is no longer waiting is not served here.
    await kit.db.query(
      `update public.post_photos set moderation_status = 'rejected' where id = $1`,
      [ph.rows[0]!.id],
    );
    expect(
      (
        await kit.call(
          preview,
          `/api/admin/photo-preview?kind=post_photo&row=${ph.rows[0]!.id}`,
          'GET',
          admin,
        )
      ).status,
    ).toBe(404);
    const { setAuthDeps } = await import('../auth/deps');
    setAuthDeps(null);
    expect(
      (
        await kit.call(
          preview,
          `/api/admin/photo-preview?kind=post_photo&row=${ph.rows[0]!.id}`,
          'GET',
          admin,
        )
      ).status,
    ).toBe(404);
  });
});
