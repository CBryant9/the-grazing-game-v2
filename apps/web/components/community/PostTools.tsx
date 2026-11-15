'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Act } from './Act';
import styles from './community.module.css';
import { useSend } from './send';

const REASONS = [
  ['spam', 'Spam'],
  ['abuse', 'Abuse or bullying'],
  ['nudity', 'Nudity'],
  ['violence', 'Violence'],
  ['hate', 'Hate'],
  ['self_harm', 'Self-harm'],
  ['impersonation', 'Pretending to be someone'],
  ['other', 'Something else'],
] as const;

/** Report a post, comment or profile. A short form that opens in place and says "Thanks" where it was tapped. */
export function ReportButton({
  target,
  id,
  username,
}: {
  target: 'post' | 'comment' | 'profile';
  id?: string;
  username?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>('spam');
  const [details, setDetails] = useState('');
  const { busy, message, done, send } = useSend();
  const key = `${target}-${id ?? username}`;
  if (done) {
    return (
      <span role="status" className={styles.ok}>
        Thanks. A moderator will look at it.
      </span>
    );
  }
  if (!open) {
    return (
      <button type="button" className="btn ghost" onClick={() => setOpen(true)}>
        Report
      </button>
    );
  }
  return (
    <form
      className={styles.inline}
      aria-label="Report"
      onSubmit={(e) => {
        e.preventDefault();
        void send('/api/community/report', {
          target,
          id,
          username,
          reason,
          details: details || undefined,
        });
      }}
    >
      <label className={styles.label} htmlFor={`rr-${key}`}>
        Why are you reporting this?
      </label>
      <select
        id={`rr-${key}`}
        className={styles.input}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      >
        {REASONS.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <label className={styles.label} htmlFor={`rd-${key}`}>
        Anything we should know (optional)
      </label>
      <textarea
        id={`rd-${key}`}
        className={styles.input}
        rows={2}
        maxLength={1000}
        value={details}
        onChange={(e) => setDetails(e.target.value)}
      />
      <div className={styles.row}>
        <button type="submit" className="btn coral" disabled={busy}>
          {busy ? 'Sending...' : 'Send report'}
        </button>
        <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {message && (
        <p role="alert" className={styles.err}>
          {message}
        </p>
      )}
    </form>
  );
}

/** Edit, delete or report a post. Your own: edit and delete. Anyone else's: report. */
export function PostTools({
  id,
  mine,
  editable,
  body,
  link,
  visibility,
  after,
}: {
  id: string;
  mine: boolean;
  editable: boolean;
  body: string | null;
  link: string | null;
  visibility: 'public' | 'followers';
  /** Where to go after a delete. */
  after?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(body ?? '');
  const [url, setUrl] = useState(link ?? '');
  const [vis, setVis] = useState(visibility);
  const { busy, message, send } = useSend();
  if (!mine) return <ReportButton target="post" id={id} />;
  if (editing) {
    return (
      <form
        className={styles.inline}
        aria-label="Edit your post"
        onSubmit={(e) => {
          e.preventDefault();
          void send('/api/community/post', {
            action: 'edit',
            id,
            body: text,
            link: url.trim() || undefined,
            visibility: vis,
          }).then((r) => {
            if (r.ok) {
              setEditing(false);
              router.refresh();
            }
          });
        }}
      >
        <label className={styles.label} htmlFor={`pe-${id}`}>
          Your post
        </label>
        <textarea
          id={`pe-${id}`}
          className={styles.input}
          rows={3}
          maxLength={2000}
          required
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <label className={styles.label} htmlFor={`pl-${id}`}>
          Link (optional)
        </label>
        <input
          id={`pl-${id}`}
          className={styles.input}
          type="url"
          maxLength={300}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <label className={styles.label} htmlFor={`pv-${id}`}>
          Who can see it
        </label>
        <select
          id={`pv-${id}`}
          className={styles.input}
          value={vis}
          onChange={(e) => setVis(e.target.value === 'followers' ? 'followers' : 'public')}
        >
          <option value="public">Everyone</option>
          <option value="followers">Followers only</option>
        </select>
        <div className={styles.row}>
          <button type="submit" className="btn coral" disabled={busy}>
            {busy ? 'Saving...' : 'Save'}
          </button>
          <button type="button" className="btn ghost" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
        {message && (
          <p role="alert" className={styles.err}>
            {message}
          </p>
        )}
      </form>
    );
  }
  return (
    <span className={styles.row}>
      {editable && (
        <button type="button" className="btn ghost" onClick={() => setEditing(true)}>
          Edit
        </button>
      )}
      <Act
        path="/api/community/post"
        body={{ action: 'delete', id }}
        label="Delete"
        confirm="Delete this post for good?"
        tone="danger"
        after={after ?? 'refresh'}
      />
    </span>
  );
}

export function LikeButton({
  target,
  id,
  liked,
  count,
}: {
  target: 'post' | 'comment';
  id: string;
  liked: boolean;
  count: number;
}) {
  return (
    <span className={styles.actwrap}>
      <Act
        path="/api/community/like"
        body={{ action: liked ? 'unlike' : 'like', target, id }}
        label={`${liked ? 'Liked' : 'Like'} (${count})`}
        tone={liked ? 'coral' : 'ghost'}
      />
    </span>
  );
}

/** Add a comment, or a reply to one. Says where it went wrong, right under the box. */
export function CommentForm({ postId, parentId }: { postId: string; parentId?: string }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const { busy, message, send } = useSend();
  const key = parentId ?? postId;
  return (
    <form
      className={styles.inline}
      aria-label={parentId ? 'Reply' : 'Add a comment'}
      onSubmit={(e) => {
        e.preventDefault();
        void send('/api/community/comment', { action: 'create', postId, parentId, body }).then(
          (r) => {
            if (r.ok) {
              setBody('');
              router.refresh();
            }
          },
        );
      }}
    >
      <label className={styles.label} htmlFor={`c-${key}`}>
        {parentId ? 'Reply' : 'Add a comment'}
      </label>
      <textarea
        id={`c-${key}`}
        className={styles.input}
        rows={2}
        maxLength={1000}
        required
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className={styles.row}>
        <button type="submit" className="btn coral" disabled={busy || body.trim() === ''}>
          {busy ? 'Sending...' : parentId ? 'Reply' : 'Comment'}
        </button>
      </div>
      {message && (
        <p role="alert" className={styles.err}>
          {message}
        </p>
      )}
    </form>
  );
}

/** Edit, delete or report a comment. */
export function CommentTools({
  id,
  mine,
  body,
}: {
  id: string;
  mine: boolean;
  body: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(body ?? '');
  const { busy, message, send } = useSend();
  if (!mine) return <ReportButton target="comment" id={id} />;
  if (editing) {
    return (
      <form
        className={styles.inline}
        aria-label="Edit your comment"
        onSubmit={(e) => {
          e.preventDefault();
          void send('/api/community/comment', { action: 'edit', id, body: text }).then((r) => {
            if (r.ok) {
              setEditing(false);
              router.refresh();
            }
          });
        }}
      >
        <label className={styles.label} htmlFor={`ce-${id}`}>
          Your comment
        </label>
        <textarea
          id={`ce-${id}`}
          className={styles.input}
          rows={2}
          maxLength={1000}
          required
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className={styles.row}>
          <button type="submit" className="btn coral" disabled={busy}>
            Save
          </button>
          <button type="button" className="btn ghost" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
        {message && (
          <p role="alert" className={styles.err}>
            {message}
          </p>
        )}
      </form>
    );
  }
  return (
    <span className={styles.row}>
      <button type="button" className="btn ghost" onClick={() => setEditing(true)}>
        Edit
      </button>
      <Act
        path="/api/community/comment"
        body={{ action: 'delete', id }}
        label="Delete"
        confirm="Delete this comment?"
        tone="danger"
      />
    </span>
  );
}
