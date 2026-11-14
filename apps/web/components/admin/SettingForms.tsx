'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { DISTRICTS, DISTRICT_IDS } from '@gg/shared';
import styles from './admin.module.css';

/** Sends one setting. The server parses and checks it again and answers in plain words. */
function useSave(key: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  async function save(value: unknown) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });
      const data = (await res.json().catch(() => null)) as { error?: unknown } | null;
      if (res.ok) {
        setMessage({ ok: true, text: 'Saved.' });
        router.refresh();
      } else {
        setMessage({
          ok: false,
          text:
            typeof data?.error === 'string'
              ? data.error
              : 'That did not save. Nothing was changed.',
        });
      }
    } catch {
      setMessage({ ok: false, text: 'The server could not be reached. Nothing was changed.' });
    }
    setBusy(false);
  }
  return { busy, message, save };
}

function Frame({
  onSubmit,
  busy,
  message,
  children,
}: {
  onSubmit: () => void;
  busy: boolean;
  message: { ok: boolean; text: string } | null;
  children: ReactNode;
}) {
  return (
    <form
      className={styles.list}
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {children}
      <div className={styles.btnrow}>
        <button type="submit" className={styles.primary} disabled={busy}>
          {busy ? 'Saving' : 'Save'}
        </button>
      </div>
      {message && (
        <p
          className={`${styles.status} ${message.ok ? styles.ok : styles.bad}`}
          role={message.ok ? 'status' : 'alert'}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}

export function AnnouncementForm({
  initial,
}: {
  initial: { text: string | null; link: string | null };
}) {
  const [text, setText] = useState(initial.text ?? '');
  const [link, setLink] = useState(initial.link ?? '');
  const { busy, message, save } = useSave('announcement');
  return (
    <Frame busy={busy} message={message} onSubmit={() => void save({ text, link })}>
      <div className={styles.field}>
        <label htmlFor="ann-text">Text (up to 140 characters, one line)</label>
        <input
          id="ann-text"
          type="text"
          maxLength={140}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="ann-link">
          Link (a page on this site starting with /, or an https address)
        </label>
        <input
          id="ann-link"
          type="text"
          maxLength={200}
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
      </div>
      <p className={styles.muted}>Leave the text empty to take the announcement down.</p>
    </Frame>
  );
}

export function DistrictsForm({ initial }: { initial: string[] }) {
  const [chosen, setChosen] = useState<string[]>(initial);
  const { busy, message, save } = useSave('districts_available');
  return (
    <Frame busy={busy} message={message} onSubmit={() => void save(chosen)}>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className={styles.muted}>Keep at least one.</legend>
        {DISTRICT_IDS.map((id) => (
          <label key={id} className={styles.choice}>
            <input
              type="checkbox"
              checked={chosen.includes(id)}
              onChange={(e) =>
                setChosen((c) => (e.target.checked ? [...c, id] : c.filter((x) => x !== id)))
              }
            />
            <span>
              {DISTRICTS[id].name} ({DISTRICTS[id].town}, {DISTRICTS[id].state})
            </span>
          </label>
        ))}
      </fieldset>
    </Frame>
  );
}

export function RulesForm({ initial }: { initial: string }) {
  const [text, setText] = useState(initial);
  const { busy, message, save } = useSave('community_rules');
  return (
    <Frame busy={busy} message={message} onSubmit={() => void save({ text })}>
      <div className={styles.field}>
        <label htmlFor="rules-text">Rules text (up to 10,000 characters)</label>
        <textarea
          id="rules-text"
          maxLength={10000}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
    </Frame>
  );
}

export function WordingForm({
  initial,
  wordings,
}: {
  initial: string;
  wordings: readonly { id: string; label: string; text: string }[];
}) {
  const [id, setId] = useState(initial);
  const { busy, message, save } = useSave('maintenance_wording');
  return (
    <Frame busy={busy} message={message} onSubmit={() => void save({ id })}>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className={styles.muted}>
          Players see exactly one of these. You can not type your own.
        </legend>
        {wordings.map((w) => (
          <label key={w.id} className={styles.choice}>
            <input type="radio" name="wording" checked={id === w.id} onChange={() => setId(w.id)} />
            <span>
              <b>{w.label}.</b> {w.text}
            </span>
          </label>
        ))}
      </fieldset>
    </Frame>
  );
}
