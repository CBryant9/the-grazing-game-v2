import { it } from 'vitest';
import { AVERAGE_YEAR } from '../../test-support/calibration';
import { createFarm } from '../sim/create';
import { stepDay } from '../sim/tick';
import { sheepMobsOf } from './farm';
import { headOf } from './simFlock';
import { netWorth } from '../money/worth';

it('probe', { timeout: 900_000 }, () => {
  const env = { seasons: AVERAGE_YEAR };
  for (const district of ['nsw', 'cw', 'wv'] as const) {
    const farm = createFarm({ seed: 7, district, size: 'medium', start: { year: 2021, month: 8 }, startType: 'running', difficulty: 'easy', stock: 'sheep' }, env);
    const m0 = sheepMobsOf(farm)[0]!;
    const lambs0 = m0.sheep.filter((s) => !s.weaned).reduce((t, s) => t + s.n, 0);
    const preg0 = m0.sheep.filter((s) => s.preg >= 0).reduce((t, s) => t + s.n, 0);
    const head0 = headOf(m0.sheep);
    const w0 = netWorth(farm);
    let born = 0;
    const shorn: string[] = [];
    let feed = 0;
    for (let d = 0; d < 365; d++) {
      const r = stepDay(farm, env);
      for (const e of r.events) {
        if (e.type === 'lambs-born') born += e.count;
        if (e.type === 'sheep-shorn') shorn.push(`d${d} ${e.head}hd ${(e.cleanKg / e.head).toFixed(2)}kg ${e.micron.toFixed(1)}um $${Math.round(e.woolIncome)} cost $${Math.round(e.cost)}`);
      }
    }
    feed = farm.years[0]?.feed ?? 0;
    const y = farm.years[0]!;
    console.log(district, `head0 ${head0} lambs0 ${lambs0} preg0 ${preg0} born ${born} | shorn ${shorn.join('; ')} | profit ${Math.round(y.score.profit)} worth0 ${Math.round(w0)} sales ${Math.round(y.sales)} wool ${Math.round(y.wool ?? 0)} running ${Math.round(y.running)} feed ${Math.round(feed)} deaths ${y.sheepDeaths} score ${y.score.total} head1 ${headOf(sheepMobsOf(farm).flatMap((m) => m.sheep))}`);
  }
});
