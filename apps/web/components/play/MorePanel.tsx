'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { shortDate } from '@/lib/game/format';
import { kindName, setupFacts, unreadSeqs, unreadWord } from '@/lib/game/more';
import { useGame } from '@/lib/game/store';
import type { Snapshot } from '@/lib/game/types';
import { EmptyState } from './EmptyState';
import { HelpSection } from './HelpPanel';
import styles from './play.module.css';

/** The farm's messages, newest first. A message that was new when the inbox opened keeps its New mark until the player leaves. */
function Inbox({ snapshot }: { snapshot: Snapshot }) {
  const markRead = useGame((s) => s.markInboxRead);
  const setTab = useGame((s) => s.setTab);
  const [fresh] = useState(() => unreadSeqs(snapshot.inbox));
  useEffect(() => {
    void markRead();
  }, [markRead]);
  const messages = snapshot.inbox;
  return (
    <section aria-labelledby="inbox-title" className={styles.stack}>
      <h3 id="inbox-title" className={`px ${styles.minihead}`}>
        Inbox
      </h3>
      {messages.length === 0 ? (
        <EmptyState action="Back to the farm" onAction={() => setTab('farm')}>
          No messages yet. News about your cattle, sales, crops and water collects here.
        </EmptyState>
      ) : (
        <ul className={styles.inbox}>
          {messages.map((m) => (
            <li key={m.seq} className={styles.msg} data-new={fresh.has(m.seq)}>
              <p className={styles.msghead}>
                <span className={styles.kind}>{kindName(m.kind)}</span>
                <span className={styles.when}>
                  {shortDate(m.date)}
                  {m.time ? `, ${m.time}` : ''}
                </span>
                {fresh.has(m.seq) && <span className={styles.newtag}>New</span>}
              </p>
              <p>{m.text}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The farm's name and setup, and Start a new farm behind a confirm that says this farm will be gone. */
function Farm({ snapshot }: { snapshot: Snapshot }) {
  const restart = useGame((s) => s.restart);
  const busy = useGame((s) => s.busy > 0);
  const [asking, setAsking] = useState(false);
  const facts = setupFacts(snapshot.farm.setup);
  return (
    <section aria-labelledby="farm-title" className={styles.stack}>
      <h3 id="farm-title" className={`px ${styles.minihead}`}>
        Farm
      </h3>
      <p>
        <b>{snapshot.farm.name}</b>
      </p>
      <dl className={styles.facts}>
        {facts.map((f) => (
          <div key={f.label}>
            <dt>{f.label}</dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>
      {!asking ? (
        <div className={styles.jobbtns}>
          <button type="button" className="btn" onClick={() => setAsking(true)}>
            Start a new farm
          </button>
        </div>
      ) : (
        <div className={styles.jobcard} role="alertdialog" aria-label="Start a new farm">
          <p>
            Start a new farm? <b>This farm will be gone</b>, with its cattle, cash and history. It
            can not be brought back.
          </p>
          <div className={styles.jobbtns}>
            <button
              type="button"
              className="btn coral"
              disabled={busy}
              onClick={() => void restart()}
            >
              Yes, start a new farm
            </button>
            <button type="button" className="btn ghost" onClick={() => setAsking(false)}>
              Keep this farm
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** The More tab: the inbox, the farm, the theme and the way back to the home page. */
export function MorePanel({ snapshot }: { snapshot: Snapshot }) {
  return (
    <section className={styles.listpanel} aria-label="More">
      <h2 className={`px ${styles.soontitle}`}>More</h2>
      <p className="muted" aria-live="polite">
        {unreadWord(snapshot.inboxUnread) || 'No unread messages.'}
      </p>
      <Inbox snapshot={snapshot} />
      <HelpSection />
      <Farm snapshot={snapshot} />
      <section aria-labelledby="look-title" className={styles.stack}>
        <h3 id="look-title" className={`px ${styles.minihead}`}>
          Look and links
        </h3>
        <div className={styles.jobbtns}>
          <ThemeToggle />
          <Link href="/" className="btn ghost">
            Back to the home page
          </Link>
        </div>
      </section>
    </section>
  );
}
