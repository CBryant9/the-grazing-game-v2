'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import styles from './admin.module.css';

/** Add a word or phrase to the filter. The server checks it again and says plainly if it refuses. */
export function WordForm() {
  const router = useRouter();
  const [term, setTerm] = useState('');
  const [kind, setKind] = useState<'block' | 'flag'>('block');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function add() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/words', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', term, kind }),
      });
      const data = (await res.json().catch(() => null)) as { error?: unknown } | null;
      if (res.ok) {
        setTerm('');
        setMsg({ ok: true, text: 'Added.' });
        router.refresh();
      } else {
        setMsg({
          ok: false,
          text: typeof data?.error === 'string' ? data.error : 'That did not work.',
        });
      }
    } catch {
      setMsg({ ok: false, text: 'The server could not be reached. Nothing was changed.' });
    }
    setBusy(false);
  }
  return (
    <form
      className={styles.list}
      onSubmit={(e) => {
        e.preventDefault();
        void add();
      }}
    >
      <div className={styles.inline}>
        <div className={styles.field}>
          <label htmlFor="word-term">Word or phrase</label>
          <input
            id="word-term"
            type="text"
            value={term}
            maxLength={60}
            autoComplete="off"
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="word-kind">What it does</label>
          <select
            id="word-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value === 'flag' ? 'flag' : 'block')}
          >
            <option value="block">Block: the text is refused</option>
            <option value="flag">Flag: the text posts and a report opens</option>
          </select>
        </div>
        <div className={styles.btnrow}>
          <button type="submit" className={styles.primary} disabled={busy || term.trim() === ''}>
            Add
          </button>
        </div>
      </div>
      {msg && (
        <p
          className={`${styles.status} ${msg.ok ? styles.ok : styles.bad}`}
          role={msg.ok ? 'status' : 'alert'}
        >
          {msg.text}
        </p>
      )}
    </form>
  );
}
