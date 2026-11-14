'use client';

import { useId, useState, type ReactNode } from 'react';
import { dateText, num, plural, priceText, shortDate } from '@/lib/game/format';
import { sellLimits } from '@/lib/game/lists';
import { useGame } from '@/lib/game/store';
import type { MobWire, SellGroupId, SimpleAction, Snapshot, SuppId } from '@/lib/game/types';
import { JobBox } from './JobBox';
import { Sheet } from './Sheet';
import styles from './play.module.css';

const signed = (n: number, places: number): string =>
  `${n > 0 ? '+' : n < 0 ? '-' : ''}${num(Math.abs(n), places)}`;

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** One husbandry button, with its reason beside it when it is off, and its job card under it. */
function Job({
  slot,
  label,
  reason,
  hint,
  onStart,
  confirmLabel,
  action,
  children,
}: {
  slot: string;
  label: string;
  /** Why the button is off, or null. */
  reason: string | null;
  hint?: string | null;
  onStart: () => void;
  confirmLabel: string;
  action: () => SimpleAction;
  children?: ReactNode;
}) {
  const job = useGame((s) => s.acts[slot]);
  const busy = useGame((s) => s.busy > 0);
  const confirmAct = useGame((s) => s.confirmAct);
  const dismissAct = useGame((s) => s.dismissAct);
  const reasonId = useId();
  return (
    <li className={styles.hrow}>
      {!job && (
        <div className={styles.hbtn}>
          <button
            type="button"
            className="btn sm"
            disabled={reason !== null}
            aria-describedby={reason ? reasonId : undefined}
            onClick={onStart}
          >
            {label}
          </button>
          {reason ? (
            <p id={reasonId} className={styles.hreason}>
              {reason}
            </p>
          ) : (
            hint && <p className={styles.hhint}>{hint}</p>
          )}
        </div>
      )}
      {!job && children}
      {job && (
        <JobBox
          title={label}
          job={job}
          confirmLabel={confirmLabel}
          busy={busy}
          onConfirm={() => void confirmAct(slot, action())}
          onCancel={() => dismissAct(slot)}
          onDismiss={() => dismissAct(slot)}
        />
      )}
    </li>
  );
}

function SellPicker({ mob, snapshot }: { mob: MobWire; snapshot: Snapshot }) {
  const startAct = useGame((s) => s.startAct);
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<string>(mob.sellGroups[0]?.id ?? '');
  const [qty, setQty] = useState(1);
  const groupId = useId();
  const qtyId = useId();
  const { market } = snapshot;
  const sale = market.isSaleDay
    ? 'Today is a sale day. Stock sold today are paid today.'
    : market.nextSale
      ? `No sale today. Stock go down for the next sale on ${dateText(market.nextSale.date)}. Nothing is paid until then.`
      : 'No sale is coming up soon.';
  const lim = sellLimits(mob.sellGroups, group, qty);

  return (
    <Job
      slot={`${mob.id}:sell`}
      label="Sell"
      reason={mob.sellReason}
      hint={open ? null : sale}
      confirmLabel="Sell"
      onStart={() => setOpen(!open)}
      action={() => ({
        type: 'sellGroup',
        mob: mob.id,
        group: group as SellGroupId,
        qty: lim.qty,
      })}
    >
      {open && mob.sellGroups.length > 0 && (
        <div className={styles.picker} role="group" aria-label="Sell: pick a group and a number">
          <p className={styles.hhint}>{sale}</p>
          <label htmlFor={groupId}>Group</label>
          <select
            id={groupId}
            className={styles.field}
            value={group}
            onChange={(e) => {
              setGroup(e.target.value);
              setQty((q) => sellLimits(mob.sellGroups, e.target.value, q).qty);
            }}
          >
            {mob.sellGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}, {plural(g.head, 'head', 'head')} free to sell
              </option>
            ))}
          </select>
          <label htmlFor={qtyId}>How many (up to {num(lim.max)})</label>
          <input
            id={qtyId}
            className={styles.field}
            type="number"
            inputMode="numeric"
            min={1}
            max={lim.max}
            value={lim.qty}
            onChange={(e) => setQty(Number(e.target.value))}
          />
          <div className={styles.jobbtns}>
            <button
              type="button"
              className="btn sm coral"
              disabled={lim.max < 1}
              onClick={() => {
                setOpen(false);
                void startAct(`${mob.id}:sell`, 'Sell', {
                  type: 'sellGroup',
                  mob: mob.id,
                  group: group as SellGroupId,
                  qty: lim.qty,
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

function SuppSwitch({ mob }: { mob: MobWire }) {
  const startAct = useGame((s) => s.startAct);
  const job = useGame((s) => s.acts[`${mob.id}:supp`]);
  const busy = useGame((s) => s.busy > 0);
  const confirmAct = useGame((s) => s.confirmAct);
  const dismissAct = useGame((s) => s.dismissAct);
  const [picked, setPicked] = useState<SuppId>(mob.supp);
  const labelOf = (id: SuppId): string => mob.suppOptions.find((o) => o.id === id)?.label ?? id;
  const action = (id: SuppId) => ({ type: 'setSupplement' as const, mob: mob.id, supp: id });
  return (
    <li className={styles.hrow}>
      <div className={styles.supp} role="group" aria-label="Supplement">
        <p className={styles.supptitle}>
          Supplement: <b>{labelOf(mob.supp)}</b>
        </p>
        {mob.suppReason ? (
          <p className={styles.hreason}>{mob.suppReason}</p>
        ) : (
          <div className={styles.suppopts}>
            {mob.suppOptions.map((o) => (
              <button
                key={o.id}
                type="button"
                className={`${styles.suppbtn} ${o.id === mob.supp ? styles.suppon : ''}`}
                aria-pressed={o.id === picked}
                disabled={busy}
                onClick={() => {
                  setPicked(o.id);
                  if (o.id === mob.supp) {
                    dismissAct(`${mob.id}:supp`);
                    return;
                  }
                  dismissAct(`${mob.id}:supp`);
                  void startAct(
                    `${mob.id}:supp`,
                    o.id === 'none' ? 'Switch off' : `Switch on ${o.label}`,
                    action(o.id),
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
            title="Supplement"
            job={job}
            confirmLabel={job.text}
            busy={busy}
            onConfirm={() => void confirmAct(`${mob.id}:supp`, action(picked))}
            onCancel={() => {
              setPicked(mob.supp);
              dismissAct(`${mob.id}:supp`);
            }}
            onDismiss={() => {
              setPicked(mob.supp);
              dismissAct(`${mob.id}:supp`);
            }}
          />
        )}
      </div>
    </li>
  );
}

/** Where the mob is, as words. */
function WhereLine({ mob, snapshot }: { mob: MobWire; snapshot: Snapshot }) {
  const openPaddock = useGame((s) => s.openPaddock);
  if (mob.where === 'yards') return <span>In the stock yards</span>;
  if (mob.where === 'lot') return <span>In the feedlot</span>;
  const p = snapshot.paddocks.find((x) => x.mobs.includes(mob.id));
  if (!p) return <span>{mob.area ?? 'On pasture'}</span>;
  return (
    <button type="button" className={styles.linkbtn} onClick={() => openPaddock(p.id)}>
      {p.name}
    </button>
  );
}

/**
 * The mob card. Quick view first: name, where, head, AE and DSE, weight, CS
 * and daily gain, with a plain sentence on why when the mob is losing weight
 * or short of feed or water. Details open with one tap. Husbandry is one
 * button each, done where the mob is, with the job card shown right there.
 */
export function MobCard({
  snapshot,
  mobId,
  onClose,
}: {
  snapshot: Snapshot;
  mobId: number;
  onClose: () => void;
}) {
  const startAct = useGame((s) => s.startAct);
  const startMove = useGame((s) => s.startMove);
  // The cancel result stays on the card after the booking is gone.
  const cancelling = useGame((s) => s.acts[`${mobId}:cancel`] !== undefined);
  const mob = snapshot.mobs.find((m) => m.id === mobId);
  if (!mob) return null;
  const gain = mob.adgKg;
  return (
    <Sheet title={mob.name} onClose={onClose}>
      <p className={styles.padline}>
        <WhereLine mob={mob} snapshot={snapshot} />
        {!mob.hasWater && mob.where === 'paddock' && (
          <span className={styles.warntag}>No water</span>
        )}
      </p>
      <dl className={styles.facts}>
        <Fact
          label="Head"
          value={`${num(mob.head)}${mob.calves > 0 ? `, ${plural(mob.calves, 'calf', 'calves')}` : ''}`}
        />
        <Fact label="Stock" value={`${num(mob.ae, 1)} AE, ${num(mob.dse)} DSE`} />
        <Fact
          label="Average weight"
          value={mob.weightKg === null ? '-' : `${num(mob.weightKg)} kg`}
        />
        <Fact label="Condition" value={mob.cs === null ? '-' : `CS ${num(mob.cs, 1)}`} />
        <Fact label="Daily gain" value={gain === null ? '-' : `${signed(gain, 2)} kg/head/day`} />
      </dl>
      {mob.why.length > 0 && (
        <div className={styles.why} role="note" aria-label={`Why, for ${mob.name}`}>
          <h3 className={`px ${styles.minihead}`}>Why</h3>
          {mob.why.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}

      <h3 className={`px ${styles.minihead}`}>Jobs</h3>
      <ul className={styles.hlist}>
        <Job
          slot={`${mob.id}:mark`}
          label="Mark calves"
          reason={mob.markReason}
          hint={`${plural(mob.markCount, 'bull calf or young bull', 'bull calves and young bulls')} to mark`}
          confirmLabel="Mark calves"
          onStart={() =>
            void startAct(`${mob.id}:mark`, 'Mark calves', { type: 'markCalves', mob: mob.id })
          }
          action={() => ({ type: 'markCalves', mob: mob.id })}
        />
        <Job
          slot={`${mob.id}:wean`}
          label="Wean"
          reason={mob.weanReason}
          hint={`${plural(mob.weanCount, 'calf', 'calves')} old enough to wean`}
          confirmLabel="Wean"
          onStart={() => void startAct(`${mob.id}:wean`, 'Wean', { type: 'wean', mob: mob.id })}
          action={() => ({ type: 'wean', mob: mob.id })}
        />
        <SellPicker mob={mob} snapshot={snapshot} />
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
        <SuppSwitch key={`${mob.id}:${mob.supp}`} mob={mob} />
      </ul>

      {((mob.booked > 0 && mob.bookedDate) || cancelling) && (
        <div className={styles.booked}>
          {mob.booked > 0 && mob.bookedDate && (
            <p>
              {plural(mob.booked, 'head', 'head')} booked onto the sale on{' '}
              {shortDate(mob.bookedDate)}. Nothing is paid until then.
            </p>
          )}
          <ul className={styles.hlist}>
            <Job
              slot={`${mob.id}:cancel`}
              label="Cancel sale"
              reason={null}
              confirmLabel="Cancel sale"
              onStart={() =>
                void startAct(`${mob.id}:cancel`, 'Cancel sale', {
                  type: 'cancelSale',
                  mob: mob.id,
                })
              }
              action={() => ({ type: 'cancelSale', mob: mob.id })}
            />
          </ul>
        </div>
      )}

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
            value={mob.intakeKg === null ? '-' : `${num(mob.intakeKg, 1)} kg DM/head/day`}
          />
          <Fact
            label="Intake, of live weight"
            value={mob.intakePct === null ? '-' : `${num(mob.intakePct, 1)}%`}
          />
          <Fact label="Diet energy" value={mob.me === null ? '-' : `ME ${num(mob.me, 1)} MJ/kg`} />
          <Fact label="Diet protein" value={mob.cp === null ? '-' : `CP ${num(mob.cp, 1)}%`} />
          <Fact label="In calf (PTIC)" value={`${num(mob.ptic)} head`} />
          <Fact
            label="On the sale"
            value={mob.booked > 0 ? `${num(mob.booked)} head booked` : 'None booked'}
          />
        </dl>
        {mob.joining && <p className={styles.joinline}>{mob.joining}</p>}
      </details>
    </Sheet>
  );
}
