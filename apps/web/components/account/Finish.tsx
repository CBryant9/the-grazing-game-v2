'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { authApi } from '@/lib/auth/api';
import { useMe } from '@/lib/auth/store';
import type { FinishResult } from '@/lib/auth/types';
import styles from './account.module.css';

const USERNAME = /^[A-Za-z0-9_]{3,20}$/;

type Check = 'idle' | 'checking' | 'free' | 'taken' | 'bad';

/** The three boxes make one date, `YYYY-MM-DD`, or nothing if they are not a real date. */
function dobOf(day: string, month: string, year: string): string | null {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y)) return null;
  if (year.length !== 4 || y < 1900) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Finish sign-up: a username (checked as you type, and the check only ever says free or not
 * available), a display name if you like, and your date of birth. Under 14 there is no account,
 * and once that answer is given for a sign-in the form does not come back.
 */
export function Finish() {
  const me = useMe((s) => s.me);
  const settled = useMe((s) => s.settled);
  const load = useMe((s) => s.load);
  const [username, setUsername] = useState('');
  const [display, setDisplay] = useState('');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  // The server's last answer, for the name it was asked about. Null means it could not say.
  const [answer, setAnswer] = useState<{ name: string; free: boolean | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Extract<FinishResult, { ok: true }> | null>(null);
  const [final, setFinal] = useState<string | null>(null);
  const ticket = useRef(0);

  useEffect(() => {
    void load();
  }, [load]);

  // The live check: a short wait after typing, and only the newest answer is used.
  useEffect(() => {
    if (!USERNAME.test(username)) return;
    const mine = ++ticket.current;
    const timer = setTimeout(() => {
      authApi
        .username(username)
        .then((r) => {
          if (mine === ticket.current) setAnswer({ name: username, free: r.free });
        })
        .catch(() => {
          if (mine === ticket.current) setAnswer({ name: username, free: null });
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [username]);

  const check: Check =
    username === ''
      ? 'idle'
      : !USERNAME.test(username)
        ? 'bad'
        : answer?.name !== username
          ? 'checking'
          : answer.free === null
            ? 'idle'
            : answer.free
              ? 'free'
              : 'taken';

  if (!settled) {
    return (
      <p className="muted" role="status">
        Loading
      </p>
    );
  }
  if (!me || !me.accounts) {
    return (
      <div className={styles.card}>
        <p>Sign-in is not set up on this copy of the game yet.</p>
        <Link href="/play" className={`btn coral ${styles.linkbtn}`}>
          Play as a guest
        </Link>
      </div>
    );
  }
  if (!me.signedIn) {
    return (
      <div className={styles.card}>
        <p>Sign in first, then come back here to finish.</p>
        <Link href="/sign-in" className={`btn coral ${styles.linkbtn}`}>
          Sign in
        </Link>
      </div>
    );
  }
  if (!me.needsSignUp || done) {
    return (
      <div className={styles.card} role="status">
        <p>
          {done ? 'Your account is ready.' : `You are all set, ${me.username}.`}
          {done && done.moved > 0 ? ' Your farm has moved into your account.' : ''}
        </p>
        {done?.noRoom && (
          <p className={`${styles.notice} ${styles.alert}`}>
            The farm you were playing as a guest could not move in, because this account already has
            the most farms it can have. It is still on this device.
          </p>
        )}
        <Link href="/play" className={`btn coral ${styles.linkbtn}`}>
          Go to your farm
        </Link>
      </div>
    );
  }
  if (me.refused || final) {
    return (
      <div className={styles.card} role="alert">
        <p>
          {final ??
            'You need to be 14 or older to make an account. You can still play The Grazing Game as a guest.'}
        </p>
        <Link href="/play" className={`btn coral ${styles.linkbtn}`}>
          Play as a guest
        </Link>
      </div>
    );
  }
  if (!me.signupsOpen) {
    return (
      <div className={styles.card} role="status">
        <p>Sign-ups are not open yet.</p>
        <Link href="/play" className={`btn coral ${styles.linkbtn}`}>
          Play as a guest
        </Link>
      </div>
    );
  }

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    const dob = dobOf(day, month, year);
    if (!USERNAME.test(username)) {
      setError('Use 3 to 20 letters, numbers or underscores for your username.');
      return;
    }
    if (!dob) {
      setError('Check your date of birth. Use the day, month and year you were born.');
      return;
    }
    setBusy(true);
    try {
      const r = await authApi.finish({
        username,
        dob,
        ...(display.trim() ? { displayName: display.trim() } : {}),
      });
      if (r.ok) {
        setDone(r);
        void load();
      } else if (r.final) setFinal(r.message);
      else setError(r.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  const status: Record<Check, string> = {
    idle: '',
    checking: 'Checking',
    free: 'That username is free.',
    taken: 'That username is not available. Try another.',
    bad: 'Use 3 to 20 letters, numbers or underscores.',
  };

  return (
    <form className={styles.card} onSubmit={(e) => void submit(e)} noValidate>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="username">
          Username
        </label>
        <input
          id="username"
          name="username"
          className={styles.input}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={20}
          value={username}
          onChange={(e) => setUsername(e.target.value.trim())}
          aria-describedby="username-hint username-status"
          required
        />
        <p id="username-hint" className={styles.hint}>
          Shown on leaderboards. 3 to 20 letters, numbers or underscores.
        </p>
        <p
          id="username-status"
          className={`${styles.hint} ${check === 'free' ? styles.ok : check === 'taken' || check === 'bad' ? styles.bad : ''}`}
          aria-live="polite"
        >
          {status[check]}
        </p>
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="display">
          Display name (if you like)
        </label>
        <input
          id="display"
          name="display"
          className={styles.input}
          autoComplete="nickname"
          maxLength={40}
          value={display}
          onChange={(e) => setDisplay(e.target.value)}
        />
      </div>
      <fieldset className={styles.field} style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className={styles.label}>Date of birth</legend>
        <div className={styles.dob}>
          <div className={styles.field}>
            <label className={styles.hint} htmlFor="dob-day">
              Day
            </label>
            <input
              id="dob-day"
              className={styles.input}
              inputMode="numeric"
              autoComplete="bday-day"
              maxLength={2}
              value={day}
              onChange={(e) => setDay(e.target.value.replace(/\D/g, ''))}
              aria-describedby="dob-hint"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.hint} htmlFor="dob-month">
              Month
            </label>
            <input
              id="dob-month"
              className={styles.input}
              inputMode="numeric"
              autoComplete="bday-month"
              maxLength={2}
              value={month}
              onChange={(e) => setMonth(e.target.value.replace(/\D/g, ''))}
              aria-describedby="dob-hint"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.hint} htmlFor="dob-year">
              Year
            </label>
            <input
              id="dob-year"
              className={styles.input}
              inputMode="numeric"
              autoComplete="bday-year"
              maxLength={4}
              value={year}
              onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))}
              aria-describedby="dob-hint"
            />
          </div>
        </div>
        <p id="dob-hint" className={styles.hint}>
          We ask once, and no one else sees it. You need to be 14 or older to make an account. If
          you are 14 or 15, you can play everything, but the community stays hidden until you turn
          16.
        </p>
      </fieldset>
      {error && (
        <p className={styles.bad} role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn coral" disabled={busy || check === 'taken'}>
        {busy ? 'Making your account' : 'Make my account'}
      </button>
    </form>
  );
}
