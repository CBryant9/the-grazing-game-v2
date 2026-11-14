'use client';

import { useId, useMemo, useState } from 'react';
import { dateText, money, num, plural, shortDate } from '@/lib/game/format';
import { changeShort, changeText, chartGeometry, chartSummary } from '@/lib/game/marketchart';
import { clampQty } from '@/lib/game/lists';
import { useGame } from '@/lib/game/store';
import type { MarketWire, MobWire, SellGroupId, SimpleAction, Snapshot } from '@/lib/game/types';
import { ActJob } from './ActJob';
import { QtyField } from './QtyField';
import styles from './play.module.css';

type View = 'prices' | 'buy' | 'sell';

/** The classes the chart starts with. The player can show any of them. */
const START_SHOWN = ['wean', 'feed', 'cow'];

/** Line styles, so a line is never told apart by colour alone. */
const DASHES = ['', '7 3', '2 3', '8 3 2 3', '', '7 3', '2 3', '8 3 2 3'];

const BOX = { width: 320, height: 170, left: 34, right: 10, top: 8, bottom: 22 };

function PriceChart({ chart }: { chart: MarketWire['chart'] }) {
  const [shown, setShown] = useState<string[]>(START_SHOWN);
  const geo = useMemo(() => chartGeometry(chart, shown, BOX), [chart, shown]);
  const summary = chartSummary(chart, shown);
  const toggle = (id: string): void =>
    setShown((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const index = (id: string): number => chart.classes.findIndex((c) => c.id === id);
  const days = Math.max(0, ...chart.classes.map((c) => c.points.length - 1));
  return (
    <div className={styles.chartbox}>
      <div className={styles.chartchips} role="group" aria-label="Classes on the chart">
        {chart.classes.map((c) => {
          const i = index(c.id);
          const on = shown.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              className={styles.chartchip}
              aria-pressed={on}
              onClick={() => toggle(c.id)}
            >
              <svg width="22" height="8" aria-hidden="true" className={styles.swatch}>
                <line
                  x1="1"
                  x2="21"
                  y1="4"
                  y2="4"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={DASHES[i] || undefined}
                  stroke={`var(--chart-${i + 1})`}
                  opacity={on ? 1 : 0.35}
                />
              </svg>
              {c.label}
            </button>
          );
        })}
      </div>
      <svg
        className={styles.chart}
        viewBox={`0 0 ${BOX.width} ${BOX.height}`}
        role="img"
        aria-label={summary}
      >
        {geo.ticks.map((t) => (
          <g key={t.label}>
            <line
              x1={BOX.left}
              x2={BOX.width - BOX.right}
              y1={t.y}
              y2={t.y}
              className={styles.gridline}
            />
            <text x={BOX.left - 4} y={t.y + 3} textAnchor="end" className={styles.axis}>
              {t.label}
            </text>
          </g>
        ))}
        {geo.lines.map((l) => {
          const i = index(l.id);
          return (
            <g key={l.id}>
              {l.d && (
                <path
                  d={l.d}
                  fill="none"
                  strokeWidth="2.25"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray={DASHES[i] || undefined}
                  stroke={`var(--chart-${i + 1})`}
                />
              )}
              {l.end && <circle cx={l.end.x} cy={l.end.y} r="3.5" fill={`var(--chart-${i + 1})`} />}
            </g>
          );
        })}
        {chart.from && (
          <text x={BOX.left} y={BOX.height - 6} className={styles.axis}>
            {shortDate(chart.from)}
          </text>
        )}
        {chart.to && days > 0 && (
          <text
            x={BOX.width - BOX.right}
            y={BOX.height - 6}
            textAnchor="end"
            className={styles.axis}
          >
            {shortDate(chart.to)}
          </text>
        )}
      </svg>
      <p className={styles.hhint}>
        c/kg live weight.{' '}
        {days > 0 ? `The last ${plural(days + 1, 'day')} of prices.` : 'Today only so far.'} Tap a
        class to show or hide it.
      </p>
    </div>
  );
}

function PricesView({ market }: { market: MarketWire }) {
  return (
    <div className={styles.stack}>
      <PriceChart chart={market.chart} />
      <table className={styles.classtable}>
        <caption className="sr-only">Prices today by class</caption>
        <thead>
          <tr>
            <th scope="col">Class</th>
            <th scope="col">c/kg</th>
            <th scope="col">A head</th>
            <th scope="col">Change</th>
          </tr>
        </thead>
        <tbody>
          {market.prices.map((p) => (
            <tr key={p.id}>
              <th scope="row">{p.label}</th>
              <td>{num(p.cKg)}</td>
              <td>
                {p.perHead === null ? (
                  '-'
                ) : (
                  <>
                    {money(p.perHead)}
                    <small className={styles.kgnote}> at {num(p.typicalKg ?? 0)} kg</small>
                  </>
                )}
              </td>
              <td>
                {p.changeCKg === null ? (
                  '-'
                ) : (
                  <span title={changeText(p.changeCKg, p.changeDays)}>
                    {changeShort(p.changeCKg)}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.hhint}>
        c/kg is live weight. A head is for a typical beast of the class, before selling costs.
        Change is since the first day on the chart.
      </p>
      {market.credit && <p className={styles.credit}>{market.credit}</p>}
    </div>
  );
}

function BuyView({ market }: { market: MarketWire }) {
  const startAct = useGame((s) => s.startAct);
  const job = useGame((s) => s.acts['market:buy']);
  const [cls, setCls] = useState(market.buy.classes[0]?.id ?? '');
  const [qty, setQty] = useState(10);
  const reasonId = useId();
  const picked = market.buy.classes.find((c) => c.id === cls);
  const off = market.buy.reason !== null;
  const action: SimpleAction = { type: 'buyCattle', cls, qty: clampQty(qty, market.buy.maxQty) };
  return (
    <div className={styles.stack}>
      {market.onTheWay.length > 0 && (
        <ul className={styles.notes} aria-label="Cattle on the way">
          {market.onTheWay.map((a) => (
            <li key={`${a.date.date}-${a.cls}`}>
              {plural(a.head, 'head', 'head')} of {a.cls.toLowerCase()} arrive{' '}
              {a.daysAway <= 1 ? 'tomorrow morning' : `on ${dateText(a.date)}`} in the stock yards.
            </li>
          ))}
        </ul>
      )}
      {off && (
        <p id={reasonId} className={styles.hreason}>
          {market.buy.reason}
        </p>
      )}
      <ul className={styles.pickrows} aria-label="Class to buy">
        {market.buy.classes.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className={styles.pickrow}
              aria-pressed={cls === c.id}
              disabled={!!job}
              onClick={() => setCls(c.id)}
            >
              <span className={styles.pickname}>
                <b>{c.label}</b>
                <span className="muted">{c.weightText}</span>
              </span>
              <span className={styles.pickfacts}>
                {c.cKg === null ? 'Priced by the head' : `${num(c.cKg)} c/kg`}, about{' '}
                {money(c.perHead)} {c.perText} with fees
              </span>
            </button>
          </li>
        ))}
      </ul>
      {!job && (
        <>
          <QtyField label="How many" value={qty} max={market.buy.maxQty} onChange={setQty} />
          <div className={styles.jobbtns}>
            <button
              type="button"
              className="btn coral"
              disabled={off || !picked}
              aria-describedby={off ? reasonId : undefined}
              onClick={() => void startAct('market:buy', 'Buy', action)}
            >
              Check the buy
            </button>
          </div>
        </>
      )}
      <ActJob slot="market:buy" title="Buy cattle" confirmLabel="Confirm" />
    </div>
  );
}

/** Mobs with stock free to sell, by group. */
function sellableMobs(mobs: readonly MobWire[]): MobWire[] {
  return mobs.filter((m) => m.sellGroups.length > 0);
}

function SellForm({ snapshot }: { snapshot: Snapshot }) {
  const { market, mobs } = snapshot;
  const startAct = useGame((s) => s.startAct);
  const job = useGame((s) => s.acts['market:sell']);
  const [by, setBy] = useState<'class' | 'mob'>('class');
  const [cls, setCls] = useState(market.sell.classes[0]?.id ?? '');
  const [mobId, setMobId] = useState<number>(sellableMobs(mobs)[0]?.id ?? 0);
  const [group, setGroup] = useState<string>('');
  const [qty, setQty] = useState(1);
  const clsId = useId();
  const mobSel = useId();
  const groupSel = useId();

  const classRow = market.sell.classes.find((c) => c.id === cls) ?? market.sell.classes[0];
  const mobRow = sellableMobs(mobs).find((m) => m.id === mobId) ?? sellableMobs(mobs)[0];
  const groupRow = mobRow?.sellGroups.find((g) => g.id === group) ?? mobRow?.sellGroups[0];
  const max = by === 'class' ? (classRow?.head ?? 0) : (groupRow?.head ?? 0);
  const n = clampQty(qty, max);
  const action: SimpleAction | null =
    by === 'class'
      ? classRow
        ? { type: 'sellClass', cls: classRow.id, qty: n }
        : null
      : mobRow && groupRow
        ? { type: 'sellGroup', mob: mobRow.id, group: groupRow.id as SellGroupId, qty: n }
        : null;

  if (job) return <ActJob slot="market:sell" title="Sell cattle" confirmLabel="Confirm" />;
  const none = market.sell.classes.length === 0;
  return (
    <div className={styles.stack}>
      {none ? (
        <p className="muted">No cattle on the farm are free to sell.</p>
      ) : (
        <>
          <div className={styles.seg} role="group" aria-label="Sell by">
            <button type="button" aria-pressed={by === 'class'} onClick={() => setBy('class')}>
              By class
            </button>
            <button type="button" aria-pressed={by === 'mob'} onClick={() => setBy('mob')}>
              By mob
            </button>
          </div>
          {by === 'class' ? (
            <div className={styles.picker}>
              <label htmlFor={clsId}>Class, across the farm</label>
              <select
                id={clsId}
                className={styles.field}
                value={classRow?.id ?? ''}
                onChange={(e) => setCls(e.target.value)}
              >
                {market.sell.classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}, {num(c.head)} free to sell, {num(c.cKg)} c/kg
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className={styles.picker}>
              <label htmlFor={mobSel}>Mob</label>
              <select
                id={mobSel}
                className={styles.field}
                value={mobRow?.id ?? ''}
                onChange={(e) => {
                  setMobId(Number(e.target.value));
                  setGroup('');
                }}
              >
                {sellableMobs(mobs).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}, {plural(m.head, 'head', 'head')}
                  </option>
                ))}
              </select>
              <label htmlFor={groupSel}>Group</label>
              <select
                id={groupSel}
                className={styles.field}
                value={groupRow?.id ?? ''}
                onChange={(e) => setGroup(e.target.value)}
              >
                {(mobRow?.sellGroups ?? []).map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}, {num(g.head)} free to sell
                  </option>
                ))}
              </select>
            </div>
          )}
          <QtyField label="How many" value={n} max={max} onChange={setQty} />
          <div className={styles.jobbtns}>
            <button
              type="button"
              className="btn coral"
              disabled={!action || max < 1}
              onClick={() => action && void startAct('market:sell', 'Sell', action)}
            >
              Check the sale
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Stock booked onto the next sale, with a Cancel for each booking. */
function Bookings({ snapshot }: { snapshot: Snapshot }) {
  const acts = useGame((s) => s.acts);
  const startAct = useGame((s) => s.startAct);
  const rows = snapshot.mobs.filter((m) => m.booked > 0 || acts[`market:cancel:${m.id}`]);
  if (!rows.length) return null;
  return (
    <>
      <h3 className={`px ${styles.minihead}`}>Booked for the next sale</h3>
      <ul className={styles.hlist}>
        {rows.map((m) => {
          const slot = `market:cancel:${m.id}`;
          return (
            <li key={m.id} className={styles.hrow}>
              {!acts[slot] && m.booked > 0 && m.bookedDate && (
                <div className={styles.hbtn}>
                  <p className={styles.hhint}>
                    <b>{m.name}</b>: {plural(m.booked, 'head', 'head')} booked for{' '}
                    {shortDate(m.bookedDate)}. Nothing is paid until then.
                  </p>
                  <button
                    type="button"
                    className="btn sm"
                    aria-label={`Cancel the booking for ${m.name}`}
                    onClick={() =>
                      void startAct(slot, 'Cancel booking', { type: 'cancelSale', mob: m.id })
                    }
                  >
                    Cancel
                  </button>
                </div>
              )}
              <ActJob
                slot={slot}
                title={`Take ${m.name} off the sale`}
                confirmLabel="Take off the sale"
                cancelLabel="Keep the booking"
              />
            </li>
          );
        })}
      </ul>
    </>
  );
}

function SellView({ snapshot }: { snapshot: Snapshot }) {
  return (
    <div className={styles.stack}>
      <p className={styles.hreason}>{snapshot.market.sell.note}</p>
      <SellForm snapshot={snapshot} />
      <Bookings snapshot={snapshot} />
    </div>
  );
}

/**
 * The Market tab. Whether there is a sale, the prices with a small chart of
 * the last month, and Buy and Sell. Every card shows what the server worked
 * out: the money, where the cattle go, and what is left in the bank.
 */
export function MarketPanel({ snapshot }: { snapshot: Snapshot }) {
  const [view, setView] = useState<View>('prices');
  const { market } = snapshot;
  return (
    <section className={styles.listpanel} aria-label="Market">
      <h2 className={`px ${styles.soontitle}`}>Market</h2>
      <p className={styles.saleline}>{market.saleLine}</p>
      <div className={styles.seg3} role="group" aria-label="Market view">
        {(['prices', 'buy', 'sell'] as const).map((v) => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
            {v === 'prices' ? 'Prices' : v === 'buy' ? 'Buy' : 'Sell'}
          </button>
        ))}
      </div>
      {view === 'prices' && <PricesView market={market} />}
      {view === 'buy' && <BuyView market={market} />}
      {view === 'sell' && <SellView snapshot={snapshot} />}
    </section>
  );
}
