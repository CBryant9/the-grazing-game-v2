'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import styles from './community.module.css';
import { useSend } from './send';

/**
 * The group forms (PRD 9.6): make or change a group, join one by its invite code, and (the owner)
 * set a group challenge. Each sends only what was typed; the server checks everything again and
 * answers in plain words right here.
 */

function Message({ text, ok }: { text: string | null; ok?: string | null }) {
  return (
    <>
      {text && (
        <p role="alert" className={styles.err}>
          {text}
        </p>
      )}
      {ok && (
        <p role="status" className={styles.ok}>
          {ok}
        </p>
      )}
    </>
  );
}

export function GroupForm({
  group,
}: {
  group?: { id: string; name: string; description: string | null; visibility: string };
}) {
  const router = useRouter();
  const { busy, message, send } = useSend();
  const [name, setName] = useState(group?.name ?? '');
  const [description, setDescription] = useState(group?.description ?? '');
  const [visibility, setVisibility] = useState(group?.visibility ?? 'private');
  const [ok, setOk] = useState<string | null>(null);
  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setOk(null);
    const r = await send<{ id?: string }>('/api/community/group', {
      action: group ? 'update' : 'create',
      groupId: group?.id,
      name,
      description,
      visibility,
    });
    if (!r.ok) return;
    if (!group && r.data?.id) router.push(`/community/groups/${r.data.id}`);
    else {
      setOk('Saved.');
      router.refresh();
    }
  };
  return (
    <form
      className={styles.card}
      onSubmit={(e) => void submit(e)}
      aria-label={group ? 'Change the group' : 'Start a group'}
    >
      <label className={styles.label} htmlFor="g-name">
        Group name
      </label>
      <input
        id="g-name"
        className={styles.input}
        maxLength={60}
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <label className={styles.label} htmlFor="g-desc">
        What it is about (optional)
      </label>
      <textarea
        id="g-desc"
        className={styles.input}
        rows={3}
        maxLength={1000}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <label className={styles.label} htmlFor="g-vis">
        Who can join
      </label>
      <select
        id="g-vis"
        className={styles.input}
        value={visibility}
        onChange={(e) => setVisibility(e.target.value)}
      >
        <option value="private">Private: with the invite code</option>
        <option value="public">Public: any member</option>
      </select>
      <div className={styles.row}>
        <button type="submit" className="btn coral" disabled={busy || name.trim().length < 3}>
          {busy ? 'Saving...' : group ? 'Save' : 'Start the group'}
        </button>
      </div>
      <Message text={message} ok={ok} />
    </form>
  );
}

export function JoinForm() {
  const router = useRouter();
  const { busy, message, send } = useSend();
  const [code, setCode] = useState('');
  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const r = await send<{ id?: string }>('/api/community/group', { action: 'join', code });
    if (r.ok && r.data?.id) router.push(`/community/groups/${r.data.id}`);
  };
  return (
    <form className={styles.card} onSubmit={(e) => void submit(e)} aria-label="Join with a code">
      <label className={styles.label} htmlFor="g-code">
        Invite code
      </label>
      <input
        id="g-code"
        className={styles.input}
        maxLength={32}
        autoComplete="off"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <div className={styles.row}>
        <button type="submit" className="btn coral" disabled={busy || code.trim() === ''}>
          {busy ? 'Joining...' : 'Join'}
        </button>
      </div>
      <Message text={message} />
    </form>
  );
}

const DISTRICT_OPTIONS: [string, string][] = [
  ['cq', 'Central Queensland'],
  ['nsw', 'Northern Tablelands NSW'],
  ['cw', 'Central West NSW'],
  ['wv', 'Western Victoria'],
];

/** The farm everyone in a challenge starts with. Used by a group owner and in admin. */
export function ChallengeForm({ path, groupId }: { path: string; groupId?: string }) {
  const router = useRouter();
  const { busy, message, send } = useSend();
  const [f, setF] = useState({
    kind: 'fast_challenge',
    name: '',
    description: '',
    district: 'cq',
    size: 'small',
    enterprise: 'grazing',
    years: 'real-in-order',
    startType: 'running',
    difficulty: 'medium',
    endsOn: '',
  });
  const [ok, setOk] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setOk(null);
    const r = await send(path, {
      action: 'challenge',
      groupId,
      kind: f.kind,
      name: f.name,
      description: f.description,
      endsOn: f.endsOn || null,
      settings: {
        district: f.district,
        size: f.size,
        enterprise: f.enterprise,
        years: f.years,
        startType: f.startType,
        difficulty: f.difficulty,
      },
    });
    if (r.ok) {
      setOk('The challenge is set.');
      router.refresh();
    }
  };
  const sel = (k: keyof typeof f, label: string, options: [string, string][]) => (
    <>
      <label className={styles.label} htmlFor={`c-${k}`}>
        {label}
      </label>
      <select id={`c-${k}`} className={styles.input} value={f[k]} onChange={set(k)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </>
  );
  return (
    <form className={styles.card} onSubmit={(e) => void submit(e)} aria-label="Set a challenge">
      {sel('kind', 'Kind', [
        ['fast_challenge', 'Fast Farm challenge (same farm and seed for everyone)'],
        ['daily_league', 'Daily league (everyone starts the same farm on the same day)'],
      ])}
      <label className={styles.label} htmlFor="c-name">
        Name
      </label>
      <input
        id="c-name"
        className={styles.input}
        maxLength={80}
        required
        value={f.name}
        onChange={set('name')}
      />
      <label className={styles.label} htmlFor="c-desc">
        About it (optional)
      </label>
      <textarea
        id="c-desc"
        className={styles.input}
        rows={2}
        maxLength={1000}
        value={f.description}
        onChange={set('description')}
      />
      {sel('district', 'District', DISTRICT_OPTIONS)}
      {sel('size', 'Farm size', [
        ['small', 'Small'],
        ['medium', 'Medium'],
        ['large', 'Large'],
      ])}
      {sel('enterprise', 'Enterprise', [
        ['grazing', 'Grazing'],
        ['mixed', 'Mixed'],
      ])}
      {sel('years', 'Years', [
        ['real-in-order', 'Real years, in order'],
        ['real-random', 'Real years, at random'],
        ['random', 'Made-up seasons'],
      ])}
      {sel('startType', 'Start', [
        ['running', 'Take over a running farm'],
        ['scratch', 'From scratch'],
      ])}
      {sel('difficulty', 'Difficulty', [
        ['easy', 'Easy'],
        ['medium', 'Medium'],
        ['hard', 'Hard'],
      ])}
      <label className={styles.label} htmlFor="c-ends">
        Ends on (optional)
      </label>
      <input
        id="c-ends"
        className={styles.input}
        type="date"
        value={f.endsOn}
        onChange={set('endsOn')}
      />
      <div className={styles.row}>
        <button type="submit" className="btn coral" disabled={busy || f.name.trim() === ''}>
          {busy ? 'Setting...' : 'Set the challenge'}
        </button>
      </div>
      <Message text={message} ok={ok} />
    </form>
  );
}

/** Admin: give an ownerless group an owner, by username. */
export function OwnerForm({ groupId }: { groupId: string }) {
  const router = useRouter();
  const { busy, message, send } = useSend();
  const [username, setUsername] = useState('');
  const [ok, setOk] = useState<string | null>(null);
  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const r = await send('/api/admin/challenges', { action: 'assign_owner', groupId, username });
    if (r.ok) {
      setOk('Done.');
      router.refresh();
    }
  };
  return (
    <form onSubmit={(e) => void submit(e)} aria-label="Give it an owner">
      <label className={styles.label} htmlFor={`o-${groupId}`}>
        New owner&rsquo;s username
      </label>
      <input
        id={`o-${groupId}`}
        className={styles.input}
        maxLength={20}
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <button type="submit" className="btn coral" disabled={busy || username.trim() === ''}>
        Give it an owner
      </button>
      <Message text={message} ok={ok} />
    </form>
  );
}
