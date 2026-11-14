'use client';

import { useEffect, useRef } from 'react';
import { useHelp } from '@/lib/game/helpstore';
import { useLayout } from '@/lib/game/hooks';
import { Sheet } from './Sheet';
import { HELP_TERMS, HELP_TOPICS } from './helptopics';
import helpStyles from './help.module.css';
import styles from './play.module.css';

/** The Help button in the top bar. It has its own word, and opens and closes the help screen. */
export function HelpButton() {
  const open = useHelp((s) => s.helpOpen);
  const openHelp = useHelp((s) => s.openHelp);
  const closeHelp = useHelp((s) => s.closeHelp);
  return (
    <button
      type="button"
      className="btn ghost"
      aria-expanded={open}
      onClick={open ? closeHelp : openHelp}
    >
      Help
    </button>
  );
}

/** Help and the tour, in the More tab. */
export function HelpSection() {
  const openHelp = useHelp((s) => s.openHelp);
  const replay = useHelp((s) => s.tourReplay);
  return (
    <section aria-labelledby="help-title" className={styles.stack}>
      <h3 id="help-title" className={`px ${styles.minihead}`}>
        Help
      </h3>
      <p className="muted">Short answers about how the game works, and a tour of the first day.</p>
      <div className={styles.jobbtns}>
        <button type="button" className="btn" onClick={openHelp}>
          Open help
        </button>
        <button type="button" className="btn ghost" onClick={replay}>
          Show the tour again
        </button>
      </div>
    </section>
  );
}

/**
 * The help screen. On a phone (and a phone on its side) it opens in the same
 * sheet the paddock uses, so the map stays visible above it on a phone held
 * upright. On a PC it fills the side panel. Each topic is a heading that opens
 * on a tap. It takes focus, Escape closes it, and focus goes back.
 */
export function HelpPanel() {
  const close = useHelp((s) => s.closeHelp);
  const layout = useLayout();
  if (layout !== 'pc') {
    return (
      <Sheet title="Help" onClose={close}>
        <HelpContent />
      </Sheet>
    );
  }
  return <HelpSidePanel onClose={close} />;
}

function HelpSidePanel({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLElement>(null);

  // Take focus when it opens, and hand it back to what opened it.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => {
      if (before && before !== document.body && document.contains(before)) before.focus();
    };
  }, []);

  return (
    <section
      ref={ref}
      tabIndex={-1}
      className={styles.listpanel}
      aria-label="Help"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <header className={helpStyles.head}>
        <h2 className={`px ${styles.soontitle}`}>Help</h2>
        <button type="button" className="btn" onClick={onClose}>
          Close help
        </button>
      </header>
      <HelpContent />
    </section>
  );
}

function HelpContent() {
  const replay = useHelp((s) => s.tourReplay);
  return (
    <>
      <p className="muted">Short answers about how the game works. Tap a topic to open it.</p>
      <div className={helpStyles.tourbox}>
        <button type="button" className="btn sm ghost" onClick={replay}>
          Show the tour again
        </button>
      </div>
      <ul className={helpStyles.topics}>
        {HELP_TOPICS.map((t, i) => (
          <li key={t.id}>
            <details className={helpStyles.topic} open={i === 0}>
              <summary>
                <h3 className={`px ${helpStyles.topictitle}`}>{t.title}</h3>
              </summary>
              <div className={helpStyles.topicbody}>
                {t.lines.map((l) => (
                  <p key={l}>{l}</p>
                ))}
              </div>
            </details>
          </li>
        ))}
        <li>
          <details className={helpStyles.topic}>
            <summary>
              <h3 className={`px ${helpStyles.topictitle}`}>What the terms mean</h3>
            </summary>
            <div className={helpStyles.topicbody}>
              <dl className={helpStyles.terms}>
                {HELP_TERMS.map((t) => (
                  <div key={t.term}>
                    <dt>{t.term}</dt>
                    <dd>{t.means}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </details>
        </li>
      </ul>
    </>
  );
}
