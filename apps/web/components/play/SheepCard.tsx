'use client';

import { useId, useState } from 'react';
import { dateText, num, plural, priceText } from '@/lib/game/format';
import { useGame } from '@/lib/game/store';
import type { MobWire, SheepFeedId, Snapshot } from '@/lib/game/types';
import { JobBox } from './JobBox';
import { Fact, Job, WhereLine } from './MobParts';
import { Sheet } from './Sheet';
import styles from './play.module.css';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
/** Days in each month of a year with no 29 February (a shearing day comes every year). */
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Sell sheep: a class and a number, on a sale day. The server words the card. */
function SheepSell({ mob, snapshot }: { mob: MobWire; snapshot: Snapshot }) {
  const startAct = useGame((s) => s.startAct);
  const sheep = mob.sheep!;
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(sheep.sell[0]?.id ?? '');
  const [qty, setQty] = useState(1);
  const pickId = useId();
  const qtyId = useId();
  const { market } = snapshot;
  const max = sheep.sell.find((s) => s.id === pick)?.head ?? 0;
  const n = Math.max(1, Math.min(max, Math.round(qty) || 1));
  const reason =
    sheep.sellReason ??
    (market.isSaleDay
      ? null
      : market.nextSale
        ? `Sheep are sold on a sale day. The next is ${dateText(market.nextSale.date)}.`
        : 'Sheep are sold on a sale day, and none is coming up soon.');
  return (
    <Job
      slot={`${mob.id}:sell`}
      label="Sell"
      reason={reason}
      hint={open ? null : 'Today is a sale day. Sheep sold today are paid today.'}
      confirmLabel="Sell"
      onStart={() => setOpen(!open)}
    >
      {open && (
        <div className={styles.picker} role="group" aria-label="Sell: pick sheep and a number">
          <label htmlFor={pickId}>Sheep</label>
          <select
            id={pickId}
            className={styles.field}
            value={pick}
            onChange={(e) => setPick(e.target.value)}
          >
            {sheep.sell.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}, {num(g.head)} head
              </option>
            ))}
          </select>
          <label htmlFor={qtyId}>How many (up to {num(max)})</label>
          <input
            id={qtyId}
            className={styles.field}
            type="number"
            inputMode="numeric"
            min={1}
            max={max}
            value={n}
            onChange={(e) => setQty(Number(e.target.value))}
          />
          <p className={styles.hhint}>Ewes with lambs at foot take their lambs with them.</p>
          <div className={styles.jobbtns}>
            <button
              type="button"
              className="btn sm coral"
              disabled={max < 1}
              onClick={() => {
                setOpen(false);
                void startAct(`${mob.id}:sell`, 'Sell', {
                  type: 'sellSheep',
                  mob: mob.id,
                  pick,
                  qty: n,
                });
              }}
            >
              Check the sale
            </button>
            <button type="button" className="btn sm ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </Job>
  );
}

/** What the mob is fed: none, lick, grain or hay, each with its cost a day. */
function SheepFeed({ mob }: { mob: MobWire }) {
  const sheep = mob.sheep!;
  const startAct = useGame((s) => s.startAct);
  const job = useGame((s) => s.acts[`${mob.id}:feed`]);
  const busy = useGame((s) => s.busy > 0);
  const confirmAct = useGame((s) => s.confirmAct);
  const dismissAct = useGame((s) => s.dismissAct);
  const [picked, setPicked] = useState<SheepFeedId>(sheep.feed);
  const labelOf = (id: SheepFeedId): string =>
    sheep.feedOptions.find((o) => o.id === id)?.label ?? id;
  return (
    <li className={styles.hrow}>
      <div className={styles.supp} role="group" aria-label="Feed">
        <p className={styles.supptitle}>
          Feed: <b>{labelOf(sheep.feed)}</b>
        </p>
        {sheep.feedReason ? (
          <p className={styles.hreason}>{sheep.feedReason}</p>
        ) : (
          <div className={styles.suppopts}>
            {sheep.feedOptions.map((o) => (
              <button
                key={o.id}
                type="button"
                className={`${styles.suppbtn} ${o.id === sheep.feed ? styles.suppon : ''}`}
                aria-pressed={o.id === picked}
                disabled={busy}
                onClick={() => {
                  setPicked(o.id);
                  dismissAct(`${mob.id}:feed`);
                  if (o.id === sheep.feed) return;
                  void startAct(
                    `${mob.id}:feed`,
                    o.id === 'none' ? 'Stop feeding' : `Feed ${o.label.toLowerCase()}`,
                    { type: 'setSheepFeed', mob: mob.id, feed: o.id },
                  );
                }}
              >
                <span>{o.label}</span>
                <small>{o.id === 'none' ? 'no cost' : `${priceText(o.perDay)} a day`}</small>
              </button>
            ))}
          </div>
        )}
        {job && (
          <JobBox
            title="Feed"
            job={job}
            confirmLabel={job.text}
            busy={busy}
            onConfirm={() => void confirmAct(`${mob.id}:feed`)}
            onCancel={() => {
              setPicked(sheep.feed);
              dismissAct(`${mob.id}:feed`);
            }}
            onDismiss={() => {
              setPicked(sheep.feed);
              dismissAct(`${mob.id}:feed`);
            }}
          />
        )}
      </div>
    </li>
  );
}

/** Move the shearing day: the contractors come on it each year by themselves. */
function ShearDate({ mob }: { mob: MobWire }) {
  const startAct = useGame((s) => s.startAct);
  const sheep = mob.sheep!;
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(sheep.shearOn?.month ?? 10);
  const [date, setDate] = useState(sheep.shearOn?.date ?? 1);
  const monthId = useId();
  const dateId = useId();
  const day = Math.max(1, Math.min(DAYS[month]!, Math.round(date) || 1));
  return (
    <Job
      slot={`${mob.id}:shear`}
      label="Move shearing"
      reason={null}
      hint={open ? null : (sheep.shearing ?? 'No shearing is booked.')}
      confirmLabel="Move shearing"
      onStart={() => setOpen(!open)}
    >
      {open && (
        <div className={styles.picker} role="group" aria-label="Shearing day">
          <label htmlFor={monthId}>Month</label>
          <select
            id={monthId}
            className={styles.field}
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i}>
                {m}
              </option>
            ))}
          </select>
          <label htmlFor={dateId}>Day</label>
          <input
            id={dateId}
            className={styles.field}
            type="number"
            inputMode="numeric"
            min={1}
            max={DAYS[month]}
            value={day}
            onChange={(e) => setDate(Number(e.target.value))}
          />
          <div className={styles.jobbtns}>
            <button
              type="button"
              className="btn sm coral"
              onClick={() => {
                setOpen(false);
                void startAct(`${mob.id}:shear`, 'Move shearing', {
                  type: 'setShearing',
                  mob: mob.id,
                  month,
                  date: day,
                });
              }}
            >
              Check the day
            </button>
            <button type="button" className="btn sm ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </Job>
  );
}

/**
 * The sheep mob card (milestone 2.8). Quick view first: where, head and lambs at foot, DSE and
 * AE, weight, CS, daily gain, where the mob is up to, its wool and the contractors' days, with
 * the reasons when it is losing weight or short of feed or water. Joining, marking, weaning,
 * shearing and crutching happen by themselves; the player moves, feeds, sells and can move the
 * shearing day.
 */
export function SheepCard({
  snapshot,
  mob,
  onClose,
}: {
  snapshot: Snapshot;
  mob: MobWire;
  onClose: () => void;
}) {
  const startMove = useGame((s) => s.startMove);
  const sheep = mob.sheep!;
  const gain = mob.adgKg;
  return (
    <Sheet title={mob.name} onClose={onClose}>
      <p className={styles.padline}>
        <WhereLine mob={mob} snapshot={snapshot} />
        {!mob.hasWater && mob.where === 'paddock' && (
          <span className={styles.warntag}>No water</span>
        )}
      </p>
      <p className={styles.joinline}>{sheep.stage}</p>
      <dl className={styles.facts}>
        <Fact
          label="Head"
          value={`${num(mob.head)}${mob.calves > 0 ? `, ${plural(mob.calves, 'lamb')} at foot` : ''}`}
        />
        <Fact label="Stock" value={`${num(mob.dse)} DSE, ${num(mob.ae, 1)} AE`} />
        <Fact
          label="Average weight"
          value={mob.weightKg === null ? '-' : `${num(mob.weightKg, 1)} kg`}
        />
        <Fact label="Condition" value={mob.cs === null ? '-' : `CS ${num(mob.cs, 1)}`} />
        <Fact
          label="Daily gain"
          value={
            gain === null
              ? '-'
              : `${gain > 0 ? '+' : gain < 0 ? '-' : ''}${num(Math.abs(gain) * 1000)} g/head/day`
          }
        />
      </dl>
      {sheep.wool && <p className={styles.joinline}>{sheep.wool}</p>}
      {sheep.shearing && <p className={styles.joinline}>{sheep.shearing}</p>}
      {sheep.crutching && <p className={styles.joinline}>{sheep.crutching}</p>}
      {(mob.why.length > 0 || sheep.fence) && (
        <div className={styles.why} role="note" aria-label={`Why, for ${mob.name}`}>
          <h3 className={`px ${styles.minihead}`}>Why</h3>
          {mob.why.map((w) => (
            <p key={w}>{w}</p>
          ))}
          {sheep.fence && <p>{sheep.fence}</p>}
        </div>
      )}

      <h3 className={`px ${styles.minihead}`}>Jobs</h3>
      <ul className={styles.hlist}>
        <SheepSell mob={mob} snapshot={snapshot} />
        <li className={styles.hrow}>
          <div className={styles.hbtn}>
            <button
              type="button"
              className="btn sm"
              onClick={() => void startMove({ mobId: mob.id })}
            >
              Move
            </button>
            <p className={styles.hhint}>Pick the paddock on the map or from a list.</p>
          </div>
        </li>
        <SheepFeed key={`${mob.id}:${sheep.feed}`} mob={mob} />
        <ShearDate mob={mob} />
      </ul>
      <p className={styles.hhint}>
        Joining, marking, weaning, shearing and crutching happen by themselves on their dates.
      </p>

      <details className={styles.details}>
        <summary>Details</summary>
        <table className={styles.classtable}>
          <caption className="sr-only">Head by class</caption>
          <thead>
            <tr>
              <th scope="col">Class</th>
              <th scope="col">Head</th>
              <th scope="col">Weight</th>
              <th scope="col">CS</th>
            </tr>
          </thead>
          <tbody>
            {mob.classes.map((c) => (
              <tr key={c.id}>
                <th scope="row">{c.label}</th>
                <td>{num(c.head)}</td>
                <td>{num(c.weightKg)} kg</td>
                <td>{num(c.cs, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className={styles.facts}>
          <Fact
            label="Intake"
            value={mob.intakeKg === null ? '-' : `${num(mob.intakeKg, 2)} kg DM/head/day`}
          />
          <Fact label="Diet energy" value={mob.me === null ? '-' : `ME ${num(mob.me, 1)} MJ/kg`} />
          <Fact label="Diet protein" value={mob.cp === null ? '-' : `CP ${num(mob.cp, 1)}%`} />
        </dl>
        {sheep.joining.map((line) => (
          <p key={line} className={styles.joinline}>
            {line}
          </p>
        ))}
      </details>
    </Sheet>
  );
}
