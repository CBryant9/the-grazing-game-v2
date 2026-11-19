'use client';

import { useEffect, useRef, type Ref } from 'react';
import { isLineTool } from '@/lib/game/build';
import { aboutTime, cardLines, money, num } from '@/lib/game/format';
import { lineFacts } from '@/lib/game/linecard';
import { useGame } from '@/lib/game/store';
import type { BuildWire, JobCardWire, TeamOptionWire } from '@/lib/game/types';
import styles from './play.module.css';

/**
 * Who builds a permanent fence: yourself, a 1-man team or a 2-man team. Each
 * says what it costs and when it is done, and that a team uses none of your
 * day. The pink swatch is the colour the team's fence has on the map while it
 * is going up. Picking one asks for that card.
 */
function TeamChoice({
  teams,
  team,
  disabled,
  onPick,
}: {
  teams: TeamOptionWire[];
  team: 0 | 1 | 2;
  disabled: boolean;
  onPick: (team: 0 | 1 | 2) => void;
}) {
  // A Fast Farm has no daylight limit: nothing here talks about the player's day.
  const lit = useGame((s) => s.snapshot?.clock.daylightLimit !== false);
  return (
    <>
      <div className={styles.teamchoice} role="group" aria-label="Who builds it">
        <button
          type="button"
          className={styles.teambtn}
          aria-pressed={team === 0}
          disabled={disabled}
          onClick={() => onPick(0)}
        >
          <b>Yourself</b>
          <small>{lit ? 'Uses your day' : 'Built now'}</small>
        </button>
        {teams.map((o) => (
          <button
            key={o.team}
            type="button"
            className={styles.teambtn}
            aria-pressed={team === o.team}
            disabled={disabled || o.reason !== null}
            onClick={() => onPick(o.team)}
          >
            <b>
              <span className={styles.contractswatch} aria-hidden="true" /> {o.label}
            </b>
            <small>{o.reason === null ? o.price : 'Not available'}</small>
            {o.reason === null && <small>{o.lines[1]}</small>}
          </button>
        ))}
      </div>
      {teams.map(
        (o) =>
          o.reason !== null && (
            <p key={o.team} className="muted">
              {o.label}: {o.reason}
            </p>
          ),
      )}
      <p className="muted">
        {lit ? 'A team uses none of your day.' : 'A team builds it over the coming working days.'}
      </p>
    </>
  );
}

/** A key and value row on the job card, as the mockup. */
function Kv({ k, v, cls }: { k: string; v: string; cls?: string }) {
  return (
    <div className={styles.kv}>
      <dt>{k}</dt>
      <dd className={cls}>{v}</dd>
    </div>
  );
}

/** The cost of a line card in a few words: what the part that fits costs, or what it pays back. */
function costWords(card: JobCardWire, part: boolean): string {
  if (card.cost < 0 || card.costToday < 0)
    return `Pays ${money(-Math.min(card.cost, card.costToday))}`;
  if (card.cost === 0 && card.costToday === 0) return 'None';
  return part ? `${money(card.costToday)} for the part that fits` : money(card.cost);
}

/**
 * The card beside the line or the thing picked: what it is, how long, what
 * it costs, and what does not fit today. Then Build and Cancel. After it is
 * done the result shows right here, and the tool is back to Look. On a PC it
 * floats beside the line; on a phone it sits above the tool bar. The part
 * that does not fit is red on the map, and said in words here, so colour is
 * never the only signal.
 */
export function BuildCard({
  build,
  innerRef,
  floating,
}: {
  build: BuildWire;
  innerRef: Ref<HTMLDivElement>;
  floating: boolean;
}) {
  const b = useGame((s) => s.build);
  const busy = useGame((s) => s.busy > 0);
  const snapshot = useGame((s) => s.snapshot);
  const confirm = useGame((s) => s.buildConfirm);
  const end = useGame((s) => s.buildEnd);
  const setTeam = useGame((s) => s.setTeam);
  const ok = useGame((s) => s.buildOk);
  const refill = useGame((s) => s.chooseRefill);
  const remove = useGame((s) => s.chooseRemove);
  const move = useGame((s) => s.chooseMove);
  const doneRef = useRef<HTMLButtonElement>(null);
  const phase = b?.phase;

  // A result takes focus, so a keyboard reader hears it and OK is one key away.
  useEffect(() => {
    if (phase === 'done') doneRef.current?.focus();
  }, [phase]);

  if (!b) return null;
  const sideM = snapshot?.view.scale.sideM ?? 100;
  const line = isLineTool(b.tool);
  const wrap = (children: React.ReactNode, label: string) => (
    <div
      ref={innerRef}
      className={`${styles.buildcard} ${floating ? styles.buildfloat : ''}`}
      role="group"
      aria-label={label}
    >
      {children}
    </div>
  );

  // ---- A trough was tapped: what to do with it.
  if (b.choice) {
    const portable = b.choice.kind === 'portable';
    const hub = b.choice.kind === 'hub' || b.choice.kind === 'squareHub';
    return wrap(
      <>
        <h3 className={styles.cardhead}>
          {portable ? 'Portable trough' : hub ? 'Water hub' : 'Trough'}
        </h3>
        <div className={styles.jobbtns}>
          {portable && (
            <button type="button" className="btn sm" onClick={() => void refill()}>
              Refill
            </button>
          )}
          <button type="button" className="btn sm" onClick={move}>
            Move
          </button>
          <button type="button" className="btn sm" onClick={() => void remove()}>
            {portable ? 'Sell back' : 'Take out'}
          </button>
          <button type="button" className="btn sm ghost" onClick={end}>
            Cancel
          </button>
        </div>
      </>,
      hub ? 'Water hub choices' : 'Trough choices',
    );
  }
  if (b.moving) {
    return wrap(
      <>
        <p>
          {b.moving.kind === 'hub'
            ? 'Tap the corner to move it to.'
            : 'Tap the square to move it to.'}
        </p>
        <div className={styles.jobbtns}>
          <button type="button" className="btn sm ghost" onClick={end}>
            Cancel
          </button>
        </div>
      </>,
      'Move a trough',
    );
  }

  // ---- A line is drawn, or a thing is picked: nothing else to show before that.
  if (line && b.phase === 'pick') return null;
  if (!line && !b.picked) return null;

  const title = line
    ? b.tool === 'pipe'
      ? 'Pipe'
      : `${build.fences.find((f) => f.id === b.fence)?.name ?? 'Fence'} fence${b.team ? `, ${b.team}-man team` : ''}`
    : b.picked!.title;
  const choose =
    line && b.tool === 'fence' && b.teams?.length ? (
      <TeamChoice
        teams={b.teams}
        team={b.team}
        disabled={b.phase === 'previewing' || b.phase === 'applying'}
        onPick={setTeam}
      />
    ) : null;

  if (b.phase === 'previewing') {
    const metres = line
      ? `${num(Math.max(0, (b.tool === 'fence' ? b.corners.length : b.cells.length) - 1) * sideM)} m. `
      : '';
    return wrap(
      <>
        <h3 className={styles.cardhead}>{title}</h3>
        <p role="status" className="muted">
          {metres}Checking
        </p>
        {choose}
        <div className={styles.jobbtns}>
          <button type="button" className="btn sm ghost" onClick={end}>
            Cancel
          </button>
        </div>
      </>,
      `${title}: job card`,
    );
  }

  if (b.phase === 'done') {
    return wrap(
      <>
        <h3 className={styles.cardhead}>Done</h3>
        <p role="status">{b.message}</p>
        <div className={styles.jobbtns}>
          <button ref={doneRef} type="button" className="btn sm" onClick={ok}>
            OK
          </button>
        </div>
      </>,
      `${title}: result`,
    );
  }

  if (b.phase === 'blocked') {
    return wrap(
      <>
        <h3 className={styles.cardhead}>{title}</h3>
        <p role="alert" className={styles.cardreason}>
          {line && b.allLate && b.team === 0 ? build.noneFits : b.message}
        </p>
        {choose}
        <div className={styles.jobbtns}>
          <button type="button" className="btn sm coral" disabled>
            {line ? (b.team ? 'Order the team' : 'Build') : b.picked!.confirm}
          </button>
          {line ? (
            <button type="button" className="btn sm ghost" onClick={end}>
              Cancel
            </button>
          ) : (
            <button type="button" className="btn sm ghost" onClick={ok}>
              OK
            </button>
          )}
        </div>
      </>,
      `${title}: job card`,
    );
  }

  // ---- confirm or applying
  const card = b.card;
  const facts = card ? lineFacts(card) : null;
  const working = b.phase === 'applying';
  const canBuild = !working && !busy && (!facts || !facts.nothingFits);
  return wrap(
    <>
      <h3 className={styles.cardhead}>
        {title}
        {facts && <span className={styles.cardlength}>{facts.length}</span>}
      </h3>
      {choose}
      {card && facts ? (
        <>
          <dl className={styles.kvlist}>
            <Kv k="Takes" v={aboutTime(card.workMin)} />
            <Kv k="Cost" v={costWords(card, facts.lateM > 0)} />
            {/* A Fast Farm has no daylight limit: no light rows (Claudia, 19 Nov 2026). */}
            {card.onClock && (
              <>
                <Kv
                  k="Fits in today's light"
                  v={facts.lateM > 0 ? `${num(facts.fitsM)} m of ${facts.length}` : '✓'}
                  cls={facts.lateM > 0 ? styles.cardlate : 'ok'}
                />
                <Kv
                  k="Daylight left after"
                  v={card.usesRestOfDay ? 'None' : aboutTime(card.leftAfterMin)}
                />
              </>
            )}
          </dl>
          <ul className={styles.joblines}>
            {facts.notFit.map((w) => (
              <li key={w} className={styles.cardlate}>
                {w}
              </li>
            ))}
            {facts.fullDay && <li>{facts.fullDay}</li>}
            {card.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </>
      ) : card ? (
        <ul className={styles.joblines}>
          {cardLines(card).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : null}
      <div className={styles.cardbtns}>
        <button type="button" className="btn ghost" disabled={working} onClick={end}>
          Cancel
        </button>
        <button
          type="button"
          className="btn coral"
          disabled={!canBuild}
          onClick={() => void confirm()}
        >
          {working
            ? 'Working'
            : line
              ? b.team
                ? 'Order the team'
                : 'Build it'
              : b.picked!.confirm}
        </button>
      </div>
    </>,
    `${title}: job card`,
  );
}
