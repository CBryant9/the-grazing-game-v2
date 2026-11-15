'use client';

import type { DateParts, Snapshot } from '@/lib/game/types';
import { aboutTime, clockText, lightNote, money, num, plural, shortDate } from '@/lib/game/format';
import { useLayout } from '@/lib/game/hooks';
import { badgeText, unreadWord } from '@/lib/game/more';
import { useGame } from '@/lib/game/store';
import { useMe } from '@/lib/auth/store';
import { DailyTime, ModeTag } from './DailyBits';
import { HelpButton } from './HelpPanel';
import { Icon } from './Icon';
import { pendingTotals, useUi } from './ui';
import styles from './play.module.css';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Tue 14 Nov": the weekday of a calendar date, for the bar. */
export function dayDate(d: DateParts): string {
  return `${DAYS[new Date(Date.UTC(d.year, d.month, d.date)).getUTCDay()]} ${shortDate(d)}`;
}

/** "$2.41m" for a big figure, otherwise dollars. */
function shortMoney(n: number): string {
  return Math.abs(n) >= 1_000_000
    ? `${n < 0 ? '-' : ''}$${num(Math.abs(n) / 1_000_000, 2)}m`
    : money(n);
}

/**
 * The daylight bar: slim, with first light, a short note and last light. Light, not a
 * countdown. A job card that is open shows its slice of the day as a striped part.
 */
export function DaylightBar({
  clock,
  labels = true,
}: {
  clock: Snapshot['clock'];
  labels?: boolean;
}) {
  const card = useGame((s) =>
    s.build && (s.build.phase === 'confirm' || s.build.phase === 'applying') ? s.build.card : null,
  );
  const span = Math.max(1, clock.lastLight - clock.firstLight);
  const pos = (minutes: number): number =>
    Math.min(100, Math.max(0, ((minutes - clock.firstLight) / span) * 100));
  const jobMin = card && card.outcome !== 'free' ? card.workMin : 0;
  const note =
    jobMin > 0 ? `This job: ${aboutTime(jobMin)}` : lightNote(clock.leftMin, clock.evening);
  const now = pos(clock.now);
  return (
    <div className={styles.daylight}>
      <div
        className={styles.dltrack}
        role="img"
        aria-label={`Daylight from ${clockText(clock.firstLight)} to ${clockText(clock.lastLight)}. ${note}.`}
      >
        <span className={styles.dlused} style={{ width: `${now}%` }} />
        {jobMin > 0 && (
          <span
            className={styles.dljob}
            style={{ left: `${now}%`, width: `${pos(clock.now + jobMin) - now}%` }}
          />
        )}
        <span className={styles.dlmark} style={{ left: `${now}%` }} />
      </div>
      {labels && (
        <p className={styles.dlnote} aria-hidden="true">
          <span>{clockText(clock.firstLight)}</span>
          <b>{note}</b>
          <span>{clockText(clock.lastLight)}</span>
        </p>
      )}
    </div>
  );
}

/** Next day, +1 week, +1 month, +1 year (PRD 5.3). Next day is the main button. */
export function TimeButtons({ short = false }: { short?: boolean }) {
  const busy = useGame((s) => s.busy > 0);
  const over = useGame((s) => s.snapshot?.over != null);
  const evening = useGame((s) => s.snapshot?.clock.evening ?? false);
  const nextDay = useGame((s) => s.nextDay);
  const skip = useGame((s) => s.skip);
  const off = busy || over;
  return (
    <div className={styles.times} role="group" aria-label="Move time on">
      <button
        type="button"
        className={`${styles.tb} ${styles.tbpri} ${evening && !over ? styles.invite : ''}`}
        disabled={off}
        onClick={() => void nextDay()}
      >
        Next day <span aria-hidden="true">▸</span>
      </button>
      <button
        type="button"
        className={styles.tb}
        disabled={off}
        aria-label={short ? '+1 week' : undefined}
        onClick={() => void skip('week')}
      >
        {short ? '+1w' : '+1 week'}
      </button>
      <button
        type="button"
        className={styles.tb}
        disabled={off}
        aria-label={short ? '+1 month' : undefined}
        onClick={() => void skip('month')}
      >
        {short ? '+1m' : '+1 month'}
      </button>
      <button
        type="button"
        className={styles.tb}
        disabled={off}
        aria-label={short ? '+1 year' : undefined}
        onClick={() => void skip('year')}
      >
        {short ? '+1y' : '+1 year'}
      </button>
    </div>
  );
}

/** The farm button: the farm list for a signed-in player, or the Farm page in More. */
function useOpenFarms(): () => void {
  const me = useMe((s) => s.me);
  const showPicker = useGame((s) => s.showPicker);
  const setTab = useGame((s) => s.setTab);
  const setMoreExtra = useUi((s) => s.setMoreExtra);
  return () => {
    if (me?.accounts && me.signedIn && !me.needsSignUp) void showPicker();
    else {
      setTab('more');
      setMoreExtra('farm');
    }
  };
}

function Bell({ small }: { small?: boolean }) {
  const unread = useGame((s) => s.snapshot?.inboxUnread ?? 0);
  const setTab = useGame((s) => s.setTab);
  const setMoreExtra = useUi((s) => s.setMoreExtra);
  return (
    <button
      type="button"
      className={`iconbtn ${small ? 'sm' : ''} ${styles.bell}`}
      aria-label={`Inbox${unread > 0 ? `, ${unreadWord(unread)}` : ''}`}
      onClick={() => {
        setTab('more');
        setMoreExtra('inbox');
      }}
    >
      <Icon name="bell" size={16} />
      {unread > 0 && (
        <b className={styles.bellcount} aria-hidden="true">
          {badgeText(unread)}
        </b>
      )}
    </button>
  );
}

function Cash({ snapshot, worth }: { snapshot: Snapshot; worth?: boolean }) {
  const { cash, netWorth } = snapshot.totals;
  const limit = snapshot.totals.bankLimit;
  return (
    <div className={styles.cashbox}>
      <p className={styles.cash} aria-label={`Cash ${money(cash)}`}>
        {money(cash)}
      </p>
      {cash < 0 && <p className={styles.cashsub}>Bank limit {money(limit)}</p>}
      {worth && <p className={styles.cashsub}>net worth {shortMoney(netWorth)}</p>}
    </div>
  );
}

/**
 * The top of the game. On a phone held upright, a card floating over the map (farm,
 * date, cash, the bell, Help, daylight and a line of facts). On its side, one slim row.
 * On a PC, the game header under the website header.
 */
export function TopBar({ snapshot }: { snapshot: Snapshot }) {
  const layout = useLayout();
  const busy = useGame((s) => s.busy > 0);
  const openFarms = useOpenFarms();
  const { farm, date, season, totals, clock } = snapshot;
  const daily = snapshot.daily ?? null;
  const day = `Day ${num(snapshot.day + 1)}`;
  const year = `Year ${num(snapshot.score.year)}`;
  const rain = pendingTotals(snapshot).rainMm;
  const times = daily ? (
    <DailyTime daily={daily} />
  ) : (
    <TimeButtons short={layout === 'landscape'} />
  );
  const farmBtn = (
    <button
      type="button"
      className={`iconbtn ${layout === 'phone' ? '' : 'sm'} ${styles.farmbtn}`}
      aria-label="Your farms"
      onClick={openFarms}
    >
      <Icon name="house" size={16} />
    </button>
  );

  if (layout === 'pc') {
    return (
      <header className={styles.top} aria-busy={busy}>
        <button type="button" className={styles.farmbox} onClick={openFarms}>
          <span className={styles.farmicon} aria-hidden="true">
            <Icon name="house" size={16} />
          </span>
          <span className={styles.farmboxtext}>
            <b className={`px ${styles.fname}`}>{farm.name}</b>
            <ModeTag daily={daily} />
          </span>
          <span className="sr-only">: your farms</span>
        </button>
        <h1 className="sr-only">{farm.name}</h1>
        <div className={styles.topname}>
          <p className={styles.topdate}>
            {year} · {dayDate(date)}
          </p>
          <p className={styles.sub}>
            {farm.setup.districtName} · {num(farm.setup.farmHa)} ha ·{' '}
            {plural(totals.head, 'head', 'head')} · <span className={styles.season}>{season}</span>
          </p>
        </div>
        <div className={styles.topdl}>
          <DaylightBar clock={clock} />
        </div>
        <div className={styles.toptimes}>{times}</div>
        <div className={styles.topextra}>
          <HelpButton />
        </div>
        <Cash snapshot={snapshot} worth />
        {busy && <span className={styles.busybar} role="status" aria-label="Working" />}
      </header>
    );
  }

  if (layout === 'landscape') {
    return (
      <header className={styles.top} aria-busy={busy}>
        {farmBtn}
        <div className={styles.topname}>
          <h1 className={`px ${styles.fname}`}>{farm.name}</h1>
          <p className={styles.sub}>
            <ModeTag daily={daily} /> · {daily ? day : year} · {dayDate(date)}
          </p>
        </div>
        <div className={styles.topdl}>
          <DaylightBar clock={clock} labels={false} />
        </div>
        <div className={styles.toptimes}>{times}</div>
        <div className={styles.topextra}>
          <HelpButton />
          <Bell small />
        </div>
        <Cash snapshot={snapshot} />
        {busy && <span className={styles.busybar} role="status" aria-label="Working" />}
      </header>
    );
  }

  return (
    <header className={styles.top} aria-busy={busy}>
      <div className={styles.hudrow}>
        {farmBtn}
        <div className={styles.topname}>
          <h1 className={`px ${styles.fname}`}>{farm.name}</h1>
          <p className={styles.sub}>
            {day} · {dayDate(date)} · <ModeTag daily={daily} />
          </p>
        </div>
        <Cash snapshot={snapshot} />
        <Bell />
        <HelpButton />
      </div>
      <DaylightBar clock={clock} />
      <p className={styles.meta}>
        {typeof rain === 'number' && (
          <span>
            <Icon name="drop" size={8} /> {num(rain)} mm last night
          </span>
        )}
        <span>
          {farm.setup.town}, {farm.setup.state}
        </span>
        <span className={styles.season}>{season}</span>
        <span>{plural(totals.head, 'head', 'head')}</span>
      </p>
      <div className={styles.toptimes}>{times}</div>
      {busy && <span className={styles.busybar} role="status" aria-label="Working" />}
    </header>
  );
}
