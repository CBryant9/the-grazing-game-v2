'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react';
import { authApi } from '@/lib/auth/api';
import { useMe } from '@/lib/auth/store';
import styles from './account.module.css';

export const EMAIL_KEY = 'gg-signin-email';
const NEXT_PAGES = ['/', '/play', '/account', '/about', '/pricing'];

/** The page to go to after signing in, only ever one of the pages the server also allows. */
function nextFromUrl(): string {
  try {
    const n = new URLSearchParams(window.location.search).get('next');
    return n && NEXT_PAGES.includes(n) ? n : '/play';
  } catch {
    return '/play';
  }
}

/**
 * Sign in or make an account: an emailed link or Google. With no sign-in set up on this copy of
 * the game, one plain line says so and guest play carries on. Nothing here asks for a password.
 */
export function SignIn() {
  const router = useRouter();
  const me = useMe((s) => s.me);
  const settled = useMe((s) => s.settled);
  const load = useMe((s) => s.load);
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'google'>('idle');
  const [error, setError] = useState<string | null>(null);
  // Read from the address when this runs in the browser. Nothing here is drawn until the server
  // has said who the player is, so the first paint matches the server's.
  const [problem] = useState(() =>
    typeof window === 'undefined'
      ? false
      : new URLSearchParams(window.location.search).get('problem') === 'link',
  );
  const [next] = useState(() => (typeof window === 'undefined' ? '/play' : nextFromUrl()));

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
  if (!me || !me.accounts) {
    return (
      <div className={styles.card}>
        <p>Sign-in is not set up on this copy of the game yet.</p>
        <p className={styles.small}>
          You can still play as a guest. Your farm is kept on this device.
        </p>
        <Link href="/play" className={`btn coral ${styles.linkbtn}`}>
          Play as a guest
        </Link>
      </div>
    );
  }
  if (me.signedIn) {
    return (
      <div className={styles.card}>
        <p>
          {me.needsSignUp
            ? 'You are signed in. One more step to finish.'
            : `You are signed in as ${me.username}.`}
        </p>
        <div className={styles.actions}>
          {me.needsSignUp ? (
            <Link href="/sign-up/finish" className={`btn coral ${styles.linkbtn}`}>
              Finish setting up
            </Link>
          ) : (
            <Link href="/play" className={`btn coral ${styles.linkbtn}`}>
              Go to your farm
            </Link>
          )}
          {!me.needsSignUp && (
            <Link href="/account" className={`btn ghost ${styles.linkbtn}`}>
              Your account
            </Link>
          )}
        </div>
      </div>
    );
  }

  const sendLink = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setState('sending');
    try {
      await authApi.email(email.trim(), next);
      try {
        sessionStorage.setItem(EMAIL_KEY, email.trim());
      } catch {
        // The next page then says it without the address.
      }
      router.push('/sign-in/check-email');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again in a moment.');
      setState('idle');
    }
  };

  const google = async (): Promise<void> => {
    setError(null);
    setState('google');
    try {
      const { url } = await authApi.google(next);
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again in a moment.');
      setState('idle');
    }
  };

  return (
    <>
      {problem && (
        <p className={`${styles.notice} ${styles.alert}`} role="alert">
          That link did not work. It may have been used already, it may have run out, or it was
          opened on a different phone or computer from the one you asked on. Ask for a new link
          below and open it on this device.
        </p>
      )}
      {!me.signupsOpen && (
        <p className={styles.notice} role="status">
          Sign-ups are not open yet. If you already have an account, sign in below.
        </p>
      )}
      <form className={styles.card} onSubmit={(e) => void sendLink(e)} noValidate>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="email">
            Your email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            className={styles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-describedby="email-hint email-error"
            aria-invalid={error ? true : undefined}
            required
          />
          <p id="email-hint" className={styles.hint}>
            We email you a link. Open it on this device to sign in. There is no password.
          </p>
        </div>
        {error && (
          <p id="email-error" className={`${styles.bad}`} role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="btn coral"
          disabled={state !== 'idle' || email.trim() === ''}
        >
          {state === 'sending' ? 'Sending' : 'Email me a link'}
        </button>
      </form>
      <div className={styles.card}>
        <button
          type="button"
          className="btn"
          disabled={state !== 'idle'}
          onClick={() => void google()}
        >
          {state === 'google' ? 'Opening Google' : 'Continue with Google'}
        </button>
      </div>
      <p className={styles.small}>
        New here? The same link makes your account. You can also{' '}
        <Link href="/play">play as a guest</Link> without one.
      </p>
    </>
  );
}

/** "Check your email": shown after the link is sent. It never says whether the address has an account. */
export function CheckEmail() {
  const email = useSyncExternalStore(
    () => () => undefined,
    () => {
      try {
        return sessionStorage.getItem(EMAIL_KEY);
      } catch {
        return null;
      }
    },
    () => null,
  );
  return (
    <>
      <div className={styles.card} role="status">
        <p>
          {email ? (
            <>
              If <b>{email}</b> can sign in, a link is on its way.
            </>
          ) : (
            'If that address can sign in, a link is on its way.'
          )}
        </p>
        <p>
          Open the link <b>on this phone or computer</b>. It works once and runs out after a while.
          Check your spam folder if it does not turn up in a few minutes.
        </p>
      </div>
      <div className={styles.actions}>
        <Link href="/sign-in" className={`btn ghost ${styles.linkbtn}`}>
          Use a different address
        </Link>
        <Link href="/play" className={`btn ghost ${styles.linkbtn}`}>
          Play as a guest
        </Link>
      </div>
    </>
  );
}
