'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import accountStyles from '@/components/account/account.module.css';
import { useMe } from '@/lib/auth/store';
import { notifyApi, NotifyApiError } from '@/lib/notify/api';
import { deviceSupport, forgetThisDevice, permission, turnOnThisDevice } from '@/lib/notify/device';
import { KIND_INFO, NOTIFY_KINDS, isSafeLink, type NotifyKind } from '@/lib/notify/kinds';
import { useNotify } from '@/lib/notify/store';
import styles from './notify.module.css';

const when = (iso: string): string =>
  new Date(iso).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

/**
 * Your notifications: the inbox, then the settings. Nothing here asks the browser for permission
 * until the player taps "Turn on notifications on this device", and a refusal is never asked
 * again by this page: the button then explains where to change it.
 */
export function Notifications() {
  const me = useMe((s) => s.me);
  const settled = useMe((s) => s.settled);
  const loadMe = useMe((s) => s.load);
  const state = useNotify((n) => n.state);
  const inbox = useNotify((n) => n.inbox);
  const error = useNotify((n) => n.error);
  const here = useNotify((n) => n.here);
  const guide = useNotify((n) => n.guide);
  const refresh = useNotify((n) => n.load);
  const setInbox = useNotify((n) => n.setInbox);
  const fail = useNotify((n) => n.fail);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  const signedIn = Boolean(me?.accounts && me.signedIn && !me.needsSignUp);

  useEffect(() => {
    if (signedIn) void refresh();
  }, [signedIn, refresh]);

  async function act(fn: () => Promise<unknown>, done?: string): Promise<void> {
    setBusy(true);
    setNote(null);
    try {
      await fn();
      if (done) setNote(done);
      await refresh();
    } catch (e) {
      fail(
        e instanceof NotifyApiError ? e.message : 'Something went wrong. Try again in a moment.',
      );
    }
    setBusy(false);
  }

  if (!settled) {
    return (
      <p className="muted" role="status">
        Loading
      </p>
    );
  }
  if (!me || !me.accounts) {
    return (
      <div className={accountStyles.card}>
        <p>
          Sign-in is not set up on this copy of the game yet, so there are no accounts and no
          notifications.
        </p>
        <Link href="/play" className={`btn coral ${accountStyles.linkbtn}`}>
          Play as a guest
        </Link>
      </div>
    );
  }
  if (!signedIn) {
    return (
      <div className={accountStyles.card}>
        <p>Sign in to see your notifications.</p>
        <Link href="/sign-in?next=%2Faccount" className={`btn coral ${accountStyles.linkbtn}`}>
          Sign in
        </Link>
      </div>
    );
  }
  if (!state || !inbox) {
    return error ? (
      <p className={accountStyles.bad} role="alert">
        {error}
      </p>
    ) : (
      <p className="muted" role="status">
        Loading
      </p>
    );
  }

  const prefOf = (k: NotifyKind) => state.prefs.find((p) => p.kind === k)!;
  const kinds = NOTIFY_KINDS.filter((k) => state.community || !KIND_INFO[k].community);
  const support = deviceSupport();
  const hereDevice = state.devices.find((d) => d.ref === here);
  const perm = permission();

  async function openItem(id: string, wasRead: boolean): Promise<void> {
    if (wasRead) return;
    await notifyApi.read({ ids: [id] }).catch(() => undefined);
    void refresh();
  }

  return (
    <>
      {error && (
        <p className={accountStyles.bad} role="alert">
          {error}
        </p>
      )}
      {note && (
        <p className={accountStyles.ok} role="status">
          {note}
        </p>
      )}

      <section className={accountStyles.card} aria-labelledby="inbox-h">
        <h2 id="inbox-h" className={`px ${accountStyles.label}`}>
          Your inbox{inbox.unread > 0 ? ` (${inbox.unread} unread)` : ''}
        </h2>
        {inbox.items.length === 0 ? (
          <p className={accountStyles.small}>
            Nothing here yet. Notices about your account and farms appear here.
          </p>
        ) : (
          <ul className={styles.list}>
            {inbox.items.map((m) => (
              <li key={m.id} className={m.read ? styles.read : styles.unread}>
                <div className={styles.itemhead}>
                  <span className={styles.when}>{when(m.at)}</span>
                  {!m.read && <span className={styles.dot}>Unread</span>}
                </div>
                <p className={styles.title}>{m.title}</p>
                {m.body && <p className={accountStyles.small}>{m.body}</p>}
                <div className={accountStyles.actions}>
                  {m.link && isSafeLink(m.link) && (
                    <Link
                      href={m.link}
                      className="btn ghost"
                      onClick={() => void openItem(m.id, m.read)}
                    >
                      Open
                    </Link>
                  )}
                  {!m.read && (
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={busy}
                      onClick={() => void act(() => notifyApi.read({ ids: [m.id] }))}
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className={accountStyles.actions}>
          {inbox.unread > 0 && (
            <button
              type="button"
              className="btn ghost"
              disabled={busy}
              onClick={() => void act(() => notifyApi.read({ all: true }))}
            >
              Mark all read
            </button>
          )}
          {inbox.next && (
            <button
              type="button"
              className="btn ghost"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const more = await notifyApi.inbox(inbox.next);
                  setInbox({ ...more, items: [...inbox.items, ...more.items] });
                })
              }
            >
              Show older
            </button>
          )}
        </div>
        <p className={accountStyles.small}>
          The messages about your farm itself (joining reports, deaths, market moves) are in the
          bell inside the game.
        </p>
      </section>

      <section className={accountStyles.card} aria-labelledby="where-h">
        <h2 id="where-h" className={`px ${accountStyles.label}`}>
          Notifications on this device
        </h2>
        {!state.available.switchOn ? (
          <p className={accountStyles.notice}>
            Notifications are switched off for now. Your inbox above still works.
          </p>
        ) : !state.available.push ? (
          <p className={accountStyles.notice}>
            Notifications to phones and computers are not set up on this copy of the game yet. Your
            inbox above still works.
          </p>
        ) : hereDevice ? (
          <p>
            This device is on.{' '}
            {perm === 'granted' ? '' : 'Your browser has notifications turned off for this site.'}
          </p>
        ) : support === 'needs_install' ? (
          <p>
            To get notifications on an iPhone or iPad, add the game to your Home Screen first (steps
            below).
          </p>
        ) : support === 'no' ? (
          <p>Notifications are not available in this browser yet.</p>
        ) : perm === 'denied' ? (
          <p>
            Notifications are blocked for this site in your browser settings. Allow them there to
            use this button.
          </p>
        ) : (
          <>
            <p>
              Notifications from The Grazing Game would appear on this device. Your browser will ask
              you to allow them. You choose which ones below.
            </p>
            <button
              type="button"
              className="btn coral"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const r = await turnOnThisDevice(state.vapidPublicKey!);
                  if (!r.ok) throw new NotifyApiError(r.message);
                }, 'This device is on.')
              }
            >
              Turn on notifications on this device
            </button>
          </>
        )}
        {guide && state.available.push && (
          <div className={accountStyles.notice}>
            <b>Add to Home Screen (iPhone and iPad)</b>
            <ol className={styles.steps}>
              <li>Open this page in Safari and tap the Share button.</li>
              <li>Choose Add to Home Screen, then Add.</li>
              <li>
                Open The Grazing Game from your Home Screen, then come back to this page and tap the
                button above.
              </li>
            </ol>
          </div>
        )}
        {!state.available.email && state.available.switchOn && (
          <p className={accountStyles.small}>Email notifications are not set up yet.</p>
        )}
      </section>

      <section className={accountStyles.card} aria-labelledby="types-h">
        <h2 id="types-h" className={`px ${accountStyles.label}`}>
          What to send
        </h2>
        <ul className={styles.list}>
          {kinds.map((k) => {
            const p = prefOf(k);
            const info = KIND_INFO[k];
            return (
              <li key={k}>
                <p className={styles.title}>{info.label}</p>
                <p className={accountStyles.small}>{info.help}</p>
                <label className={styles.row}>
                  <input
                    type="checkbox"
                    checked={p.push}
                    disabled={busy || !state.available.push}
                    onChange={(e) => void act(() => notifyApi.pref(k, { push: e.target.checked }))}
                  />
                  <span>To this account&apos;s devices</span>
                </label>
                {state.available.email && (
                  <label className={styles.row}>
                    <input
                      type="checkbox"
                      checked={p.email}
                      disabled={busy}
                      onChange={(e) =>
                        void act(() => notifyApi.pref(k, { email: e.target.checked }))
                      }
                    />
                    <span>By email when push is not available or fails</span>
                  </label>
                )}
              </li>
            );
          })}
        </ul>
        <div className={accountStyles.actions}>
          <button
            type="button"
            className="btn ghost"
            disabled={busy}
            onClick={() => void act(() => notifyApi.off(), 'Everything is off.')}
          >
            Turn everything off
          </button>
        </div>
      </section>

      <section className={accountStyles.card} aria-labelledby="times-h">
        <h2 id="times-h" className={`px ${accountStyles.label}`}>
          Times
        </h2>
        <div className={accountStyles.field}>
          <label className={accountStyles.label} htmlFor="rt">
            Daily Farm reminder time
          </label>
          <input
            id="rt"
            type="time"
            className={accountStyles.input}
            value={state.settings.reminderTime}
            disabled={busy}
            onChange={(e) =>
              e.target.value && void act(() => notifyApi.settings({ reminderTime: e.target.value }))
            }
          />
          <p className={accountStyles.hint}>In your farm&apos;s own time zone.</p>
        </div>
        <label className={styles.row}>
          <input
            type="checkbox"
            checked={state.settings.quietStart !== null}
            disabled={busy}
            onChange={(e) =>
              void act(() =>
                notifyApi.settings(
                  e.target.checked
                    ? { quietStart: '21:00', quietEnd: '06:00' }
                    : { quietStart: null, quietEnd: null },
                ),
              )
            }
          />
          <span>Quiet hours</span>
        </label>
        {state.settings.quietStart !== null && state.settings.quietEnd !== null && (
          <div className={styles.pair}>
            <div className={accountStyles.field}>
              <label className={accountStyles.label} htmlFor="qs">
                From
              </label>
              <input
                id="qs"
                type="time"
                className={accountStyles.input}
                value={state.settings.quietStart}
                disabled={busy}
                onChange={(e) =>
                  e.target.value &&
                  void act(() =>
                    notifyApi.settings({
                      quietStart: e.target.value,
                      quietEnd: state.settings.quietEnd,
                    }),
                  )
                }
              />
            </div>
            <div className={accountStyles.field}>
              <label className={accountStyles.label} htmlFor="qe">
                Until
              </label>
              <input
                id="qe"
                type="time"
                className={accountStyles.input}
                value={state.settings.quietEnd}
                disabled={busy}
                onChange={(e) =>
                  e.target.value &&
                  void act(() =>
                    notifyApi.settings({
                      quietStart: state.settings.quietStart,
                      quietEnd: e.target.value,
                    }),
                  )
                }
              />
            </div>
          </div>
        )}
        <p className={accountStyles.small}>
          Nothing is sent to a phone or by email in quiet hours. Reminders and the evening warning
          are not sent at all if they fall inside them. Everything else waits until they end. Your
          inbox always has everything.
        </p>
      </section>

      <section className={accountStyles.card} aria-labelledby="dev-h">
        <h2 id="dev-h" className={`px ${accountStyles.label}`}>
          Your devices
        </h2>
        {state.devices.length === 0 ? (
          <p className={accountStyles.small}>No devices yet.</p>
        ) : (
          <ul className={styles.list}>
            {state.devices.map((d) => (
              <li key={d.id}>
                <p className={styles.title}>
                  {d.label}
                  {d.ref === here ? ' (this device)' : ''}
                </p>
                <p className={accountStyles.small}>
                  Added {when(d.addedAt)}
                  {d.lastUsedAt ? `. Last used ${when(d.lastUsedAt)}` : ''}
                </p>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      if (d.ref === here) await forgetThisDevice();
                      else await notifyApi.removeDevice({ id: d.id });
                    }, 'Device removed.')
                  }
                >
                  Remove this device
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
