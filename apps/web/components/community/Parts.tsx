import Link from 'next/link';
import type { ReactNode } from 'react';
import { DISTRICTS, type DistrictId } from '@gg/shared';
import type {
  Author,
  Card,
  CommentView,
  FeedTab,
  PersonCard,
  PostView,
} from '@/lib/community/types';
import { FEED_TABS } from '@/lib/community/types';
import { CommentForm, CommentTools, LikeButton, PostTools } from './PostTools';
import styles from './community.module.css';

/**
 * Parts of the community pages that are drawn on the server and send no script. Everything a player
 * typed is a plain string in a React child, so it is escaped on output: it can not become markup.
 * Links are real links only when they are still safe https addresses (`safeHref`), with `rel` set.
 */

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function Avatar({
  who,
  size = 40,
}: {
  who: Pick<Author, 'id' | 'username' | 'hasAvatar'>;
  size?: number;
}) {
  return (
    <span className={styles.avatar} style={{ width: size, height: size }} aria-hidden="true">
      <span className={styles.letter}>{[...who.username][0]?.toUpperCase() ?? '?'}</span>
      {who.hasAvatar && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={styles.avatarimg}
          src={`/api/community/photo?k=avatar&id=${who.id}`}
          alt=""
          width={size}
          height={size}
          loading="lazy"
        />
      )}
    </span>
  );
}

export function Name({ who }: { who: Author | PersonCard }) {
  const display = who.displayName;
  return (
    <span className={styles.name}>
      <Link href={`/community/u/${who.username}`} className={styles.namelink}>
        {display ?? who.username}
      </Link>
      <small className={styles.handle}>@{who.username}</small>
    </span>
  );
}

export function Tabs({ tab }: { tab: FeedTab }) {
  return (
    <nav className={styles.tabs} aria-label="Feed">
      {FEED_TABS.map((t) => (
        <Link
          key={t.id}
          href={`/community?tab=${t.id}`}
          className={`${styles.tab} ${tab === t.id ? styles.taboon : ''}`}
          aria-current={tab === t.id ? 'page' : undefined}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}

export function More({ href, label = 'Older' }: { href: string; label?: string }) {
  return (
    <p className={styles.more}>
      <Link href={href} className="btn ghost">
        {label}
      </Link>
    </p>
  );
}

function FactCard({ card }: { card: Card }) {
  return (
    <div className={styles.factcard} role="group" aria-label={card.title}>
      <b className={styles.facttitle}>{card.title}</b>
      <dl className={styles.facts}>
        {card.facts.map((f, i) => (
          <div key={i} className={styles.fact}>
            {f.label ? (
              <>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </>
            ) : (
              <dd className={styles.line}>{f.value}</dd>
            )}
          </div>
        ))}
      </dl>
    </div>
  );
}

export function PostCard({ post, detail = false }: { post: PostView; detail?: boolean }) {
  const label =
    post.kind === 'day_card' ? 'Day card' : post.kind === 'share_farm' ? 'Shared farm' : null;
  return (
    <article className={styles.post} aria-label={`Post by ${post.author.username}`}>
      <header className={styles.phead}>
        <Avatar who={post.author} />
        <div className={styles.pwho}>
          <Name who={post.author} />
          <small className={styles.when}>
            {label ? `${label} · ` : ''}
            {timeAgo(post.createdAt)}
            {post.editedAt ? ' · edited' : ''}
            {post.visibility === 'followers' ? ' · Followers only' : ''}
          </small>
        </div>
      </header>
      {post.removed ? (
        <p className={styles.removed} role="status">
          This post was removed by a moderator. Only you can see that it was here.
        </p>
      ) : (
        <>
          {post.body && <p className={styles.body}>{post.body}</p>}
          {post.card && <FactCard card={post.card} />}
          {post.linkUrl &&
            (post.linkHref ? (
              <p className={styles.linkline}>
                <a href={post.linkHref} target="_blank" rel="noopener noreferrer nofollow ugc">
                  {post.linkUrl}
                </a>
              </p>
            ) : (
              <p className={styles.linkline}>{post.linkUrl}</p>
            ))}
          {post.photos.length > 0 && (
            <div className={styles.photos}>
              {post.photos.map((p) =>
                p.status === 'approved' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={p.id}
                    className={styles.photo}
                    src={`/api/community/photo?k=post&id=${p.id}`}
                    alt={`Photo posted by ${post.author.username}`}
                    loading="lazy"
                  />
                ) : p.status === 'pending' ? (
                  <p key={p.id} className={styles.pending} role="status">
                    A photo is waiting for a check. Only you can see that it is here.
                  </p>
                ) : (
                  <p key={p.id} className={styles.pending} role="status">
                    A photo did not pass the check and is not shown.
                  </p>
                ),
              )}
            </div>
          )}
          <footer className={styles.acts}>
            <LikeButton target="post" id={post.id} liked={post.liked} count={post.likes} />
            {!detail && (
              <Link href={`/community/post/${post.id}`} className="btn ghost">
                {post.comments === 1 ? '1 comment' : `${post.comments} comments`}
              </Link>
            )}
            {post.visibility === 'public' && !post.groupId && (
              <a
                className="btn ghost"
                href={`/api/community/share-image?post=${post.id}`}
                download={`post-${post.id}.png`}
              >
                Save as picture
              </a>
            )}
            <details className={styles.menu}>
              <summary className="btn ghost">More</summary>
              <div className={styles.menubody}>
                <PostTools
                  id={post.id}
                  mine={post.mine}
                  editable={post.kind !== 'day_card'}
                  body={post.body}
                  link={post.linkUrl}
                  visibility={post.visibility}
                  after={detail ? '/community' : 'refresh'}
                />
              </div>
            </details>
          </footer>
        </>
      )}
      {post.removed && post.mine && (
        <p className={styles.hint}>It stays on record, so it can not be deleted.</p>
      )}
    </article>
  );
}

export function CommentItem({ c, postId }: { c: CommentView; postId: string }) {
  return (
    <li className={`${styles.comment} ${c.parentId ? styles.reply : ''}`}>
      <div className={styles.phead}>
        <Avatar who={c.author} size={32} />
        <div className={styles.pwho}>
          <Name who={c.author} />
          <small className={styles.when}>
            {timeAgo(c.createdAt)}
            {c.editedAt ? ' · edited' : ''}
          </small>
        </div>
      </div>
      {c.removed ? (
        <p className={styles.removed} role="status">
          This comment was removed by a moderator.
        </p>
      ) : (
        <>
          <p className={styles.body}>{c.body}</p>
          <div className={styles.acts}>
            <LikeButton target="comment" id={c.id} liked={c.liked} count={c.likes} />
            <details className={styles.menu}>
              <summary className="btn ghost">More</summary>
              <div className={styles.menubody}>
                <CommentTools id={c.id} mine={c.mine} body={c.body} />
              </div>
            </details>
          </div>
        </>
      )}
      {!c.parentId && !c.removed && (
        <details className={styles.menu}>
          <summary className="btn ghost">Reply</summary>
          <div className={styles.menubody}>
            <CommentForm postId={postId} parentId={c.id} />
          </div>
        </details>
      )}
    </li>
  );
}

export function PersonRow({ p, children }: { p: PersonCard; children?: ReactNode }) {
  return (
    <li className={styles.person}>
      <Avatar who={p} />
      <div className={styles.pwho}>
        <Name who={p} />
        {p.district && (
          <small className={styles.when}>{DISTRICTS[p.district as DistrictId]?.name ?? ''}</small>
        )}
      </div>
      {children}
    </li>
  );
}

export function SubNav({ here }: { here: 'feed' | 'people' | 'me' | 'requests' }) {
  const items: [typeof here, string, string][] = [
    ['feed', '/community', 'Feed'],
    ['people', '/community/people', 'Find people'],
    ['requests', '/community/requests', 'Requests'],
    ['me', '/community/me', 'Your profile'],
  ];
  return (
    <nav className={styles.subnav} aria-label="Community">
      {items.map(([id, href, label]) => (
        <Link
          key={id}
          href={href}
          className={`${styles.subitem} ${here === id ? styles.subon : ''}`}
          aria-current={here === id ? 'page' : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
