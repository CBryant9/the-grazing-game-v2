'use client';

import { useGame } from '@/lib/game/store';
import type { HandWire, PersonWire, Snapshot } from '@/lib/game/types';
import { ActJob } from './ActJob';
import styles from './play.module.css';

/** The facts about a person, the same for someone looking for work and for a hand on the farm. */
function Facts({ p }: { p: PersonWire }) {
  return (
    <ul className={styles.personfacts}>
      <li>{p.daysText}.</li>
      <li className={styles.skills} aria-label="Skills out of 5">
        {p.skills.map((s) => (
          <span key={s.label}>{s.text}</span>
        ))}
      </li>
      <li>{p.dogsText}</li>
      <li>{p.payText}</li>
    </ul>
  );
}

/** A person looking for work: the facts, and Hire with a card that says what it costs and when they start. */
function Seeker({ p, canHire }: { p: PersonWire; canHire: boolean }) {
  const slot = `hire:${p.id}`;
  const start = useGame((s) => s.startAct);
  const open = useGame((s) => s.acts[slot] !== undefined);
  return (
    <li className={styles.person}>
      <p className={styles.personhead}>
        <b>{p.name}</b>
        <span className="muted">
          {p.kindText}. {p.rateText}.
        </span>
      </p>
      <Facts p={p} />
      {!open && (
        <div className={styles.jobbtns}>
          <button
            type="button"
            className="btn sm"
            disabled={!canHire}
            onClick={() => void start(slot, 'Hire', { type: 'hireHand', person: p.id })}
          >
            Hire
          </button>
        </div>
      )}
      <ActJob slot={slot} title={`Hire ${p.name}`} confirmLabel={`Hire ${p.name}`} />
    </li>
  );
}

/** A hand on the farm: the facts, what they did lately, what is owed, and Let go with a card that says what is paid out today. */
function Hand({ h }: { h: HandWire }) {
  const slot = `go:${h.id}`;
  const start = useGame((s) => s.startAct);
  const open = useGame((s) => s.acts[slot] !== undefined);
  return (
    <li className={styles.person}>
      <p className={styles.personhead}>
        <b>{h.name}</b>
        <span className="muted">
          {h.kindText}. {h.rateText}.
        </span>
      </p>
      <p>{h.statusText}.</p>
      <Facts p={h} />
      {h.endText && <p>{h.endText}.</p>}
      <p>{h.owedText}</p>
      {h.recent.length > 0 && (
        <>
          <p className="muted">Lately:</p>
          <ul className={styles.recent}>
            {h.recent.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </>
      )}
      {!open && (
        <div className={styles.jobbtns}>
          <button
            type="button"
            className="btn sm ghost"
            onClick={() => void start(slot, 'Let go', { type: 'letHandGo', hand: h.id })}
          >
            Let go
          </button>
        </div>
      )}
      <ActJob
        slot={slot}
        title={`Let ${h.name} go`}
        confirmLabel="Let go"
        cancelLabel="Keep them on"
      />
    </li>
  );
}

/**
 * Results of a hire or a letting go: the person has left the list they were
 * on, so the result is shown here, where the player pressed, until dismissed.
 */
function Results({ snapshot }: { snapshot: Snapshot }) {
  const acts = useGame((s) => s.acts);
  const live = new Set([
    ...snapshot.workforce.seekers.map((p) => `hire:${p.id}`),
    ...snapshot.workforce.hands.map((h) => `go:${h.id}`),
  ]);
  const left = Object.keys(acts).filter((k) => /^(hire|go):/.test(k) && !live.has(k));
  if (!left.length) return null;
  return (
    <div className={styles.stack}>
      {left.map((k) => (
        <ActJob key={k} slot={k} title="Workforce" confirmLabel="OK" />
      ))}
    </div>
  );
}

/**
 * The Workforce panel (More): your hands, the people looking for work, pay
 * and the farm's standing in the district. Hire and Let go each confirm
 * first, saying what it costs and when. Everything is facts: skills as plain
 * numbers, days, pay. No rosters and nothing to assign: a hand works their
 * own days and everything else happens by itself.
 */
export function WorkforcePanel({ snapshot }: { snapshot: Snapshot }) {
  const w = snapshot.workforce;
  return (
    <div className={styles.stack}>
      <Results snapshot={snapshot} />
      {w.owedText && (
        <p className={styles.standing} role="status">
          {w.owedText}
        </p>
      )}
      <section aria-labelledby="standing-title" className={styles.stack}>
        <h3 id="standing-title" className={`px ${styles.minihead}`}>
          Standing in the district
        </h3>
        <div className={styles.standing}>
          <p>
            <b>{w.standing.level}.</b> {w.standing.effect}
          </p>
          <p>{w.standing.fact}</p>
        </div>
      </section>
      <section aria-labelledby="hands-title" className={styles.stack}>
        <h3 id="hands-title" className={`px ${styles.minihead}`}>
          Your hands
        </h3>
        {w.hands.length === 0 ? (
          <p className="muted">
            No hands on the farm. A hand works their own days, does the first part of your jobs from
            their own day and is paid on pay day.
          </p>
        ) : (
          <>
            {w.payText && <p>{w.payText}</p>}
            <ul className={styles.people}>
              {w.hands.map((h) => (
                <Hand key={h.id} h={h} />
              ))}
            </ul>
          </>
        )}
      </section>
      <section aria-labelledby="looking-title" className={styles.stack}>
        <h3 id="looking-title" className={`px ${styles.minihead}`}>
          Looking for work
        </h3>
        <p>{w.seekersText}</p>
        {w.seekers.length > 0 && (
          <ul className={styles.people}>
            {w.seekers.map((p) => (
              <Seeker key={p.id} p={p} canHire={w.canHire} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
