'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { num, shortDate } from '@/lib/game/format';
import { kindName, setupFacts, unreadSeqs, unreadWord } from '@/lib/game/more';
import { useGame } from '@/lib/game/store';
import type { Snapshot } from '@/lib/game/types';
import { DiaryPanel } from './DiaryPanel';
import { Icon } from './Icon';
import { ScoresPanel } from './ScoresPanel';
import styles from './play.module.css';

/** The farm's messages, newest first. A message that was new when the inbox opened keeps its New mark until the player leaves. */
function Inbox({ snapshot }: { snapshot: Snapshot }) {
  const markRead = useGame((s) => s.markInboxRead);
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
        <p className="muted">No messages yet.</p>
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

/** The rows that open the Scores and Diary panels. */
function Rows({ snapshot }: { snapshot: Snapshot }) {
  const open = useGame((s) => s.openMore);
  return (
    <ul className={styles.rows}>
      <li>
        <button type="button" className={styles.row} onClick={() => open('scores')}>
          <span className={styles.rowtop}>
            <b>Scores</b>
            <span aria-hidden="true">›</span>
          </span>
          <span className={styles.rowsub}>Year score {num(snapshot.score.total)}</span>
        </button>
      </li>
      <li>
        <button type="button" className={styles.row} onClick={() => open('diary')}>
          <span className={styles.rowtop}>
            <b>Diary</b>
            <span aria-hidden="true">›</span>
          </span>
          <span className={styles.rowsub}>Day by day</span>
        </button>
      </li>
    </ul>
  );
}

/** A panel opened from the More tab: a way back, a title, and the panel. */
function SubPage({ title, children }: { title: string; children: ReactNode }) {
  const open = useGame((s) => s.openMore);
  return (
    <section className={styles.listpanel} aria-label={title}>
      <div>
        <button type="button" className="btn sm ghost" onClick={() => open('menu')}>
          <Icon name="back" size={16} /> Back to More
        </button>
      </div>
      <h2 className={`px ${styles.soontitle}`}>{title}</h2>
      {children}
    </section>
  );
}

/** The More tab: Scores, Diary, the inbox, the farm, the theme and the way back to the home page. */
export function MorePanel({ snapshot }: { snapshot: Snapshot }) {
  const page = useGame((s) => s.morePage);
  if (page === 'scores') {
    return (
      <SubPage title="Scores">
        <ScoresPanel />
      </SubPage>
    );
  }
  if (page === 'diary') {
    return (
      <SubPage title="Diary">
        <DiaryPanel />
      </SubPage>
    );
  }
  return (
    <section className={styles.listpanel} aria-label="More">
      <h2 className={`px ${styles.soontitle}`}>More</h2>
      <Rows snapshot={snapshot} />
      <p className="muted" aria-live="polite">
        {unreadWord(snapshot.inboxUnread) || 'No unread messages.'}
      </p>
      <Inbox snapshot={snapshot} />
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
