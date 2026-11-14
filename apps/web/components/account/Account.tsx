'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { authApi } from '@/lib/auth/api';
import { useMe } from '@/lib/auth/store';
import { goTo } from '@/lib/auth/nav';
import { clearAllLastFarms } from '@/lib/game/offline';
import styles from './account.module.css';

const METHOD: Record<string, string> = { email: 'Emailed link', google: 'Google' };

/**
 * Your account: username, how you sign in, a download of your data, sign out (here or everywhere)
 * and delete. Deleting says what goes and what stays, and asks for the username to be typed.
 */
export function Account() {
  const me = useMe((s) => s.me);
  const settled = useMe((s) => s.settled);
  const load = useMe((s) => s.load);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState('');
  const [gone, setGone] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  if (!settled) {
    return (
      <p className="muted" role="status">
        Loading
      </p>
    );
  }
  if (gone) {
    return (
      <div className={styles.card} role="status">
        <p>Your account has been deleted.</p>
        <Link href="/" className={`btn coral ${styles.linkbtn}`}>
          Back to the home page
        </Link>
      </div>
    );
  }
  if (!me || !me.accounts) {
    return (
      <div className={styles.card}>
        <p>Sign-in is not set up on this copy of the game yet, so there are no accounts.</p>
        <Link href="/play" className={`btn coral ${styles.linkbtn}`}>
          Play as a guest
        </Link>
      </div>
    );
  }
  if (!me.signedIn || me.needsSignUp) {
    return (
      <div className={styles.card}>
        <p>{me.signedIn ? 'Finish setting up your account first.' : 'You are not signed in.'}</p>
        <Link
          href={me.signedIn ? '/sign-up/finish' : '/sign-in?next=%2Faccount'}
          className={`btn coral ${styles.linkbtn}`}
        >
          {me.signedIn ? 'Finish setting up' : 'Sign in'}
        </Link>
      </div>
    );
  }

  const signOut = async (everywhere: boolean): Promise<void> => {
    setWorking(everywhere ? 'everywhere' : 'here');
    setError(null);
    try {
      await authApi.signOut(everywhere);
      // This browser forgets every farm it kept, so nobody else on this device sees it.
      clearAllLastFarms();
      goTo('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again in a moment.');
      setWorking(null);
    }
  };

  const remove = async (): Promise<void> => {
    setWorking('delete');
    setError(null);
    try {
      await authApi.deleteAccount(typed);
      clearAllLastFarms();
      useMe.getState().reset();
      setGone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again in a moment.');
      setWorking(null);
    }
  };

  return (
    <>
      <dl className={`${styles.card} ${styles.facts}`}>
        <div>
          <dt>Username</dt>
          <dd>{me.username}</dd>
        </div>
        <div>
          <dt>You sign in with</dt>
          <dd>{METHOD[me.method ?? 'email'] ?? 'Emailed link'}</dd>
        </div>
      </dl>

      <div className={styles.card}>
        <h2 className={`px ${styles.label}`}>Your data</h2>
        <p className={styles.small}>
          A file of what we keep about you: your profile, your farms and their history, and your
          settings. It does not include the game&apos;s own workings.
        </p>
        <a href="/api/account/data" download className={`btn ${styles.linkbtn}`}>
          Download my data
        </a>
      </div>

      <div className={styles.card}>
        <h2 className={`px ${styles.label}`}>Sign out</h2>
        <div className={styles.actions}>
          <button
            type="button"
            className="btn"
            disabled={working !== null}
            onClick={() => void signOut(false)}
          >
            Sign out
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={working !== null}
            onClick={() => void signOut(true)}
          >
            Sign out everywhere
          </button>
        </div>
        <p className={styles.small}>
          Everywhere signs you out on every phone and computer you used.
        </p>
      </div>

      <div className={`${styles.card} ${styles.danger}`}>
        <h2 className={`px ${styles.label}`}>Delete my account</h2>
        {!deleting ? (
          <button type="button" className="btn ghost" onClick={() => setDeleting(true)}>
            Delete my account
          </button>
        ) : (
          <>
            <p>
              <b>This can not be undone.</b> It deletes your account, your profile, your farms with
              their saves and history, your posts, comments, likes and follows, your notifications
              and your moderation history.
            </p>
            <p className={styles.small}>
              What stays: your scores on the leaderboards stay, with no name or farm, as
              &quot;Former player&quot;. Records of purchases stay, with nothing linking them to
              you. A group you own passes to its longest-standing member, or is deleted if no one
              else is in it. If a ban or suspension is still running, we keep a scrambled code made
              from your email address (never the address itself) until it ends.
            </p>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="confirm">
                Type your username, {me.username}, to confirm
              </label>
              <input
                id="confirm"
                className={styles.input}
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
              />
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                className="btn coral"
                disabled={working !== null || typed.trim() !== me.username}
                onClick={() => void remove()}
              >
                {working === 'delete' ? 'Deleting' : 'Delete my account for good'}
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setDeleting(false);
                  setTyped('');
                }}
              >
                Keep my account
              </button>
            </div>
          </>
        )}
      </div>
      {error && (
        <p className={styles.bad} role="alert">
          {error}
        </p>
      )}
      <Link href="/play" className={`btn ghost ${styles.linkbtn}`}>
        Back to your farm
      </Link>
    </>
  );
}
