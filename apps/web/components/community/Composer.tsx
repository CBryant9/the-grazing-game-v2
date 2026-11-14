'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import styles from './community.module.css';
import { photoToBase64, sendJson, useSend } from './send';

const MAX_PHOTOS = 4;

/** Write a post: words, an optional link, up to four photos. Photos wait for a check before anyone else sees them. */
export function Composer() {
  const router = useRouter();
  const { busy, message, send, setMessage } = useSend();
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'followers'>('public');
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setNote(null);
    const r = await send<{ id: string }>('/api/community/post', {
      action: 'create',
      body,
      link: link.trim() || undefined,
      visibility,
    });
    if (!r.ok || !r.data) return;
    let waiting = 0;
    let failed: string | null = null;
    for (const file of files) {
      const data = await photoToBase64(file, 1600);
      const p = await sendJson<{ status: string }>('/api/community/post-photo', {
        action: 'add',
        postId: r.data.id,
        data,
      });
      if (!p.ok) failed = p.message;
      else if (p.data?.status !== 'approved') waiting++;
    }
    setBody('');
    setLink('');
    setFiles([]);
    if (fileRef.current) fileRef.current.value = '';
    setNote(
      [
        'Posted.',
        waiting > 0
          ? `${waiting} photo${waiting === 1 ? ' is' : 's are'} waiting for a check. Only you can see ${waiting === 1 ? 'it' : 'them'} until then.`
          : '',
        failed ? `A photo was not added: ${failed}` : '',
      ]
        .filter(Boolean)
        .join(' '),
    );
    router.refresh();
  };

  return (
    <form className={styles.card} onSubmit={(e) => void submit(e)} aria-label="Write a post">
      <label className={styles.label} htmlFor="post-body">
        Share a photo or a thought
      </label>
      <textarea
        id="post-body"
        className={styles.input}
        rows={3}
        maxLength={2000}
        required
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <label className={styles.label} htmlFor="post-link">
        Link (optional)
      </label>
      <input
        id="post-link"
        className={styles.input}
        type="url"
        inputMode="url"
        placeholder="https://"
        maxLength={300}
        value={link}
        onChange={(e) => setLink(e.target.value)}
      />
      <label className={styles.label} htmlFor="post-photos">
        Photos (up to {MAX_PHOTOS})
      </label>
      <input
        id="post-photos"
        ref={fileRef}
        className={styles.input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={(e) => {
          const list = Array.from(e.target.files ?? []);
          if (list.length > MAX_PHOTOS) setMessage(`A post can have up to ${MAX_PHOTOS} photos.`);
          setFiles(list.slice(0, MAX_PHOTOS));
        }}
      />
      {files.length > 0 && (
        <p className={styles.hint}>
          {files.length} photo{files.length === 1 ? '' : 's'} chosen. Each one is checked before
          anyone else sees it.
        </p>
      )}
      <label className={styles.label} htmlFor="post-vis">
        Who can see it
      </label>
      <select
        id="post-vis"
        className={styles.input}
        value={visibility}
        onChange={(e) => setVisibility(e.target.value === 'followers' ? 'followers' : 'public')}
      >
        <option value="public">Everyone</option>
        <option value="followers">Followers only</option>
      </select>
      <div className={styles.row}>
        <button type="submit" className="btn coral" disabled={busy || body.trim() === ''}>
          {busy ? 'Posting...' : 'Post'}
        </button>
      </div>
      {message && (
        <p role="alert" className={styles.err}>
          {message}
        </p>
      )}
      {note && (
        <p role="status" className={styles.ok}>
          {note}
        </p>
      )}
    </form>
  );
}

/** Share my farm: a post with a card of facts from one of the player's own farms, fixed when it is posted. */
export function ShareFarm({
  farms,
}: {
  farms: { id: string; name: string; mode: string; day: number }[];
}) {
  const router = useRouter();
  const { busy, message, send } = useSend();
  const [farm, setFarm] = useState(farms[0]?.id ?? '');
  const [text, setText] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'followers'>('public');
  const [done, setDone] = useState(false);
  if (farms.length === 0) return null;
  return (
    <form
      className={styles.card}
      aria-label="Share my farm"
      onSubmit={(e) => {
        e.preventDefault();
        setDone(false);
        void send('/api/community/share', {
          farmId: farm,
          body: text || undefined,
          visibility,
        }).then((r) => {
          if (r.ok) {
            setText('');
            setDone(true);
            router.refresh();
          }
        });
      }}
    >
      <h2 className={`px ${styles.h2}`}>Share my farm</h2>
      <p className={styles.hint}>
        Posts the facts the farm screen shows today: day, date, season, head, pasture, ground cover
        and net worth. It stays as it is now, even when the farm moves on.
      </p>
      <label className={styles.label} htmlFor="share-farm">
        Farm
      </label>
      <select
        id="share-farm"
        className={styles.input}
        value={farm}
        onChange={(e) => setFarm(e.target.value)}
      >
        {farms.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name} (Day {f.day})
          </option>
        ))}
      </select>
      <label className={styles.label} htmlFor="share-note">
        Note (optional)
      </label>
      <textarea
        id="share-note"
        className={styles.input}
        rows={2}
        maxLength={500}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <label className={styles.label} htmlFor="share-vis">
        Who can see it
      </label>
      <select
        id="share-vis"
        className={styles.input}
        value={visibility}
        onChange={(e) => setVisibility(e.target.value === 'followers' ? 'followers' : 'public')}
      >
        <option value="public">Everyone</option>
        <option value="followers">Followers only</option>
      </select>
      <div className={styles.row}>
        <button type="submit" className="btn" disabled={busy || !farm}>
          {busy ? 'Posting...' : 'Share my farm'}
        </button>
      </div>
      {message && (
        <p role="alert" className={styles.err}>
          {message}
        </p>
      )}
      {done && (
        <p role="status" className={styles.ok}>
          Shared.
        </p>
      )}
    </form>
  );
}
