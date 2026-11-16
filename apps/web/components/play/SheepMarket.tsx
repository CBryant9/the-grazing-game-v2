'use client';

import { useId, useState } from 'react';
import { money, num } from '@/lib/game/format';
import { clampQty } from '@/lib/game/lists';
import { useGame } from '@/lib/game/store';
import type { SimpleAction, Snapshot } from '@/lib/game/types';
import { ActJob } from './ActJob';
import { QtyField } from './QtyField';
import styles from './play.module.css';

/**
 * The sheep side of the Market tab (milestone 2.8): the MLA indicators and wool prices, buying
 * a class of sheep and selling sheep from a mob on a sale day. Every card shows the server's
 * money lines before anything is spent. Wool sells by itself at shearing.
 */
export function SheepMarket({ snapshot }: { snapshot: Snapshot }) {
  const sm = snapshot.market.sheep!;
  const startAct = useGame((s) => s.startAct);
  const buyJob = useGame((s) => s.acts['market:sheep-buy']);
  const sellJob = useGame((s) => s.acts['market:sheep-sell']);
  const [cls, setCls] = useState(sm.buy[0]?.id ?? '');
  const [qty, setQty] = useState(50);
  const flocks = snapshot.mobs.filter((m) => m.species === 'sheep' && m.sheep!.sell.length > 0);
  const [mobId, setMobId] = useState<number>(flocks[0]?.id ?? 0);
  const [pick, setPick] = useState('');
  const [sellQty, setSellQty] = useState(1);
  const reasonId = useId();
  const mobSel = useId();
  const pickSel = useId();

  const flock = flocks.find((m) => m.id === mobId) ?? flocks[0];
  const row = flock?.sheep!.sell.find((g) => g.id === pick) ?? flock?.sheep!.sell[0];
  const sellMax = row?.head ?? 0;
  const sellN = clampQty(sellQty, sellMax);
  const off = sm.reason !== null;
  const buy: SimpleAction = { type: 'buySheep', cls, qty: clampQty(qty, sm.maxQty) };
  const sell: SimpleAction | null =
    flock && row ? { type: 'sellSheep', mob: flock.id, pick: row.id, qty: sellN } : null;

  return (
    <div className={styles.stack}>
      <table className={styles.classtable}>
        <caption className={styles.hhint}>{sm.dated}</caption>
        <thead>
          <tr>
            <th scope="col">Indicator</th>
            <th scope="col">c/kg</th>
          </tr>
        </thead>
        <tbody>
          {sm.prices.map((p) => (
            <tr key={p.id}>
              <th scope="row">{p.label}</th>
              <td>{num(p.cKg)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.hhint}>
        Clean wool:{' '}
        {sm.wool.map((w, i) => `${i ? ', ' : ''}${num(w.micron)} micron ${num(w.cKg)} c/kg`)}.
      </p>
      <ul className={styles.notes}>
        {sm.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>

      <h3 className={`px ${styles.minihead}`}>Buy sheep</h3>
      {off && (
        <p id={reasonId} className={styles.hreason}>
          {sm.reason}
        </p>
      )}
      <ul className={styles.pickrows} aria-label="Sheep to buy">
        {sm.buy.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className={styles.pickrow}
              aria-pressed={cls === c.id}
              disabled={!!buyJob}
              onClick={() => setCls(c.id)}
            >
              <span className={styles.pickname}>
                <b>{c.label}</b>
              </span>
              <span className={styles.pickfacts}>about {money(c.perHead)} a head with fees</span>
            </button>
          </li>
        ))}
      </ul>
      {!buyJob && (
        <>
          <QtyField label="How many" value={qty} max={sm.maxQty} onChange={setQty} />
          <div className={styles.jobbtns}>
            <button
              type="button"
              className="btn coral"
              disabled={off || !cls}
              aria-describedby={off ? reasonId : undefined}
              onClick={() => void startAct('market:sheep-buy', 'Buy', buy)}
            >
              Check the buy
            </button>
          </div>
        </>
      )}
      <ActJob slot="market:sheep-buy" title="Buy sheep" confirmLabel="Confirm" />

      <h3 className={`px ${styles.minihead}`}>Sell sheep</h3>
      {sellJob ? (
        <ActJob slot="market:sheep-sell" title="Sell sheep" confirmLabel="Confirm" />
      ) : flocks.length === 0 ? (
        <p className="muted">No sheep on the farm to sell.</p>
      ) : (
        <>
          <div className={styles.picker}>
            <label htmlFor={mobSel}>Mob</label>
            <select
              id={mobSel}
              className={styles.field}
              value={flock?.id ?? ''}
              onChange={(e) => {
                setMobId(Number(e.target.value));
                setPick('');
              }}
            >
              {flocks.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}, {num(m.head)} head
                </option>
              ))}
            </select>
            <label htmlFor={pickSel}>Sheep</label>
            <select
              id={pickSel}
              className={styles.field}
              value={row?.id ?? ''}
              onChange={(e) => setPick(e.target.value)}
            >
              {(flock?.sheep!.sell ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}, {num(g.head)} head
                </option>
              ))}
            </select>
          </div>
          <QtyField label="How many" value={sellN} max={sellMax} onChange={setSellQty} />
          <div className={styles.jobbtns}>
            <button
              type="button"
              className="btn coral"
              disabled={off || !sell || sellMax < 1}
              aria-describedby={off ? reasonId : undefined}
              onClick={() => sell && void startAct('market:sheep-sell', 'Sell', sell)}
            >
              Check the sale
            </button>
          </div>
        </>
      )}
    </div>
  );
}
