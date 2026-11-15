'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { InstallEntry } from '@/components/shell/InstallEntry';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useMe } from '@/lib/auth/store';
import { num, plural, shortDate } from '@/lib/game/format';
import { useLayout } from '@/lib/game/hooks';
import { badgeText, kindName, setupFacts, unreadSeqs, unreadWord } from '@/lib/game/more';
import { useGame } from '@/lib/game/store';
import type { InboxKind, Snapshot } from '@/lib/game/types';
import { AccountSection } from './AccountSection';
import { DiaryPanel } from './DiaryPanel';
import { EmptyState } from './EmptyState';
import { HelpSection } from './HelpPanel';
import { Icon, type IconName } from './Icon';
import { ScoresPanel } from './ScoresPanel';
import { WorkforcePanel } from './WorkforcePanel';
import { useUi, type MoreExtra } from './ui';
import styles from './play.module.css';

/** The icon beside each kind of message. */
const KIND_ICON: Record<InboxKind, IconName> = {
  cattle: 'cow',
  sheep: 'cow',
  sale: 'tag',
  crop: 'grass',
  plan: 'plan',
  water: 'drop',
  farm: 'house',
  work: 'user',
};

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
      <h3 id="inbox-title" className="sr-only">
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
                <span className={styles.kindicon} aria-hidden="true">
                  <Icon name={KIND_ICON[m.kind] ?? 'dots'} size={16} />
                </span>
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
      <h3 id="farm-title" className="sr-only">
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

interface MoreRow {
  key: string;
  icon: IconName;
  title: string;
  sub: string;
  count?: number;
  open: () => void;
}

/** The More menu as the mockup: a list of rows, each with its icon, a line under it and a way in. */
function Rows({ snapshot }: { snapshot: Snapshot }) {
  const open = useGame((s) => s.openMore);
  const setTab = useGame((s) => s.setTab);
  const setExtra = useUi((s) => s.setMoreExtra);
  const me = useMe((s) => s.me);
  const extra = (page: MoreExtra) => () => setExtra(page);
  const rows: MoreRow[] = [
    {
      key: 'plans',
      icon: 'plan',
      title: 'Plans',
      sub: 'Grazing plans and reports',
      open: () => setTab('plans'),
    },
    // Feed: a row here once the Feed panel exists (it is being built on its own branch).
    {
      key: 'scores',
      icon: 'trophy',
      title: 'Scores',
      sub: `Year score ${num(snapshot.score.total)}`,
      open: () => open('scores'),
    },
    { key: 'diary', icon: 'book', title: 'Diary', sub: 'Day by day', open: () => open('diary') },
    {
      key: 'inbox',
      icon: 'bell',
      title: 'Inbox',
      sub: unreadWord(snapshot.inboxUnread) || 'Reports and reminders',
      count: snapshot.inboxUnread,
      open: extra('inbox'),
    },
    {
      key: 'workforce',
      icon: 'user',
      title: 'Workforce',
      sub:
        snapshot.workforce.hands.length > 0
          ? plural(snapshot.workforce.hands.length, 'hand')
          : 'Hire farm hands',
      open: () => open('workforce'),
    },
    {
      key: 'help',
      icon: 'help',
      title: 'Help',
      sub: 'How the game works, and the tour',
      open: extra('help'),
    },
    { key: 'farm', icon: 'house', title: 'Farm', sub: snapshot.farm.name, open: extra('farm') },
    ...(me?.accounts
      ? [
          {
            key: 'account',
            icon: 'lock' as IconName,
            title: 'Account',
            sub: me.signedIn && me.username ? `Signed in as ${me.username}` : 'Playing as a guest',
            open: extra('account'),
          },
        ]
      : []),
    {
      key: 'settings',
      icon: 'dots',
      title: 'Settings',
      sub: 'Light or dark, install, links',
      open: extra('settings'),
    },
  ];
  return (
    <ul className={styles.morelist}>
      {rows.map((r) => (
        <li key={r.key}>
          <button type="button" className={styles.moreitem} onClick={r.open}>
            <span className={styles.moreicon} aria-hidden="true">
              <Icon name={r.icon} size={16} />
            </span>
            <span className={styles.moretext}>
              <b>{r.title}</b>
              <span className={styles.rowsub}>{r.sub}</span>
            </span>
            {r.count ? (
              <span className="badge coral" aria-hidden="true">
                {badgeText(r.count)}
              </span>
            ) : (
              <span aria-hidden="true">›</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** A panel opened from the More tab: a way back, a title, and the panel. */
function SubPage({ title, children }: { title: string; children: ReactNode }) {
  const open = useGame((s) => s.openMore);
  const setExtra = useUi((s) => s.setMoreExtra);
  return (
    <section className={styles.listpanel} aria-label={title}>
      <div className={styles.panelhead}>
        <button
          type="button"
          className="iconbtn"
          aria-label="Back to More"
          onClick={() => {
            setExtra(null);
            open('menu');
          }}
        >
          <Icon name="back" size={16} />
        </button>
        <h2 className={`px ${styles.soontitle}`}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

/** Light or dark, the app install, and the way back to the home page. */
function Settings() {
  return (
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
      <InstallEntry />
    </section>
  );
}

/** The More tab: a menu of rows, and the page each opens. */
export function MorePanel({ snapshot }: { snapshot: Snapshot }) {
  const page = useGame((s) => s.morePage);
  const extra = useUi((s) => s.moreExtra);
  const layout = useLayout();
  const setTab = useGame((s) => s.setTab);
  // A PC's Scores · Diary tab: both in one panel, as the mockup.
  if (layout === 'pc' && (page === 'scores' || page === 'diary')) {
    return (
      <section className={styles.listpanel} aria-label="Scores and diary">
        <h2 className={`px ${styles.soontitle}`}>Scores</h2>
        <ScoresPanel />
        <h2 className={`px ${styles.soontitle}`}>Diary</h2>
        <DiaryPanel />
      </section>
    );
  }
  if (page === 'scores') {
    return (
      <SubPage title="Scores">
        <ScoresPanel />
      </SubPage>
    );
  }
  if (page === 'workforce') {
    return (
      <SubPage title="Workforce">
        <WorkforcePanel snapshot={snapshot} />
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
  if (extra === 'inbox') {
    return (
      <SubPage title="Inbox">
        <Inbox snapshot={snapshot} />
      </SubPage>
    );
  }
  if (extra === 'help') {
    return (
      <SubPage title="Help">
        <HelpSection />
      </SubPage>
    );
  }
  if (extra === 'farm') {
    return (
      <SubPage title="Farm">
        <Farm snapshot={snapshot} />
      </SubPage>
    );
  }
  if (extra === 'account') {
    return (
      <SubPage title="Account">
        <AccountSection />
      </SubPage>
    );
  }
  if (extra === 'settings') {
    return (
      <SubPage title="Settings">
        <Settings />
      </SubPage>
    );
  }
  return (
    <section className={`${styles.listpanel} ${styles.moresheet}`} aria-label="More">
      <div className={styles.grab} aria-hidden="true" />
      <div className={styles.panelhead}>
        <h2 className={`px ${styles.soontitle}`}>More</h2>
        <button
          type="button"
          className={`iconbtn sm ${styles.panelclose}`}
          aria-label="Close More"
          onClick={() => setTab('farm')}
        >
          <Icon name="close" size={16} />
        </button>
      </div>
      <Rows snapshot={snapshot} />
    </section>
  );
}
