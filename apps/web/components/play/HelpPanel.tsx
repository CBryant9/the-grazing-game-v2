'use client';

import { useEffect, useRef } from 'react';
import { useHelp } from '@/lib/game/helpstore';
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
 * The help screen. On a phone it is a full screen panel like the other tabs.
 * On a PC it fills the side panel. It is never a layer over the map. Each
 * topic is a heading that opens on a tap. Escape closes it.
 */
export function HelpPanel() {
  const close = useHelp((s) => s.closeHelp);
  const replay = useHelp((s) => s.tourReplay);
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
        if (e.key === 'Escape') close();
      }}
    >
      <header className={helpStyles.head}>
        <h2 className={`px ${styles.soontitle}`}>Help</h2>
        <button type="button" className="btn" onClick={close}>
          Close help
        </button>
      </header>
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
    </section>
  );
}
