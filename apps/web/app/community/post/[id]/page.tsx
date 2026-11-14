import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CommentItem, Empty, More, PostCard, SubNav } from '@/components/community/Parts';
import { CommentForm } from '@/components/community/PostTools';
import styles from '@/components/community/community.module.css';
import { asUser } from '@/server/auth/accounts';
import { commentsPage, getPost } from '@/server/community/data';
import { requireMember } from '@/server/community/page';

export const dynamic = 'force-dynamic';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cursor?: string; thread?: string }>;
}) {
  // The post's own switch: with posts off there is no post page.
  const { me, deps } = await requireMember('feed_posts');
  const { id } = await params;
  const q = await searchParams;
  const data = await asUser(deps.sql, me.userId, async (tx) => {
    const post = await getPost(tx, me.userId, id);
    if (!post) return null;
    return {
      post,
      comments: post.removed
        ? null
        : await commentsPage(tx, me.userId, post.id, q.cursor ?? null, q.thread ?? null),
    };
  });
  if (!data) notFound();
  const { post, comments } = data;
  return (
    <>
      <SubNav here="feed" />
      <p>
        <Link href="/community">Back to the feed</Link>
      </p>
      <PostCard post={post} detail />
      {comments && (
        <section aria-labelledby="cm" className={styles.stack}>
          <h2 id="cm" className={`px ${styles.h2}`}>
            Comments
          </h2>
          <CommentForm postId={post.id} />
          {comments.items.length === 0 ? (
            <Empty>No comments yet.</Empty>
          ) : (
            <ul className={styles.comments}>
              {comments.items.map((c) => (
                <CommentItem key={c.id} c={c} postId={post.id} />
              ))}
            </ul>
          )}
          {comments.next && (
            <More
              href={`/community/post/${post.id}?cursor=${comments.next}`}
              label="More comments"
            />
          )}
        </section>
      )}
    </>
  );
}
