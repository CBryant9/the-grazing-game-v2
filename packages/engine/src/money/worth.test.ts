import { describe, expect, it } from 'vitest';
import { act, openFarm } from '../../test-support/wholeFarm';
import { EDGE, cloneFences, hEdge, setEdge, vEdge } from '../farm/topology';
import { netSaleValue } from '../market/prices';
import { pricesOf } from '../sim/derived';
import { mobSummaries } from '../sim/summary';
import { infraInPlace, netWorth, netWorthParts, stockWorth, tapeOwned } from './worth';

describe('the tape a farm owns', () => {
  it('is counted standing, knocked down and on the roll, on lines across and down the farm', () => {
    let farm = openFarm('nsw');
    const across = [hEdge(5, 3), hEdge(5, 4), hEdge(5, 5)];
    const down = [vEdge(8, 6), vEdge(9, 6), vEdge(10, 6), vEdge(11, 6)];
    farm = act(farm, { type: 'buildFence', edges: [...across, ...down], fence: 'tape' });
    expect(tapeOwned(farm)).toBe(7);
    // One segment of each line knocked down, and three more on the roll.
    const fences = cloneFences(farm.layout.fences);
    setEdge(fences, across[1]!, EDGE.tapeDown);
    setEdge(fences, down[2]!, EDGE.tapeDown);
    farm.layout = { ...farm.layout, fences, tapeOnRoll: 3 };
    expect(tapeOwned(farm)).toBe(10);
    expect(infraInPlace(farm)).toBe(10 * 45);
    // Rolled up, it is all still the farm's.
    const rolled = act(farm, { type: 'rollUpTape', edge: down[0]! });
    expect(rolled.layout.tapeOnRoll).toBe(7);
    expect(tapeOwned(rolled)).toBe(10);
    // Permanent and electric fence are not tape.
    const fenced = act(rolled, { type: 'buildFence', edges: [vEdge(3, 9)], fence: 'electric' });
    expect(tapeOwned(fenced)).toBe(10);
  });
});

describe('cattle in net worth', () => {
  it('a beast never counts below $0', () => {
    let farm = openFarm('nsw');
    farm = act(farm, {
      type: 'buyCattle',
      cls: 'cowCalf',
      qty: 4,
      to: { cell: farm.layout.water.bore },
    });
    const prices = pricesOf(farm);
    const m = farm.mobs[0]!;
    // Two calves so small they would cost more to sell than they make.
    const tiny = m.animals.filter((a) => a.kind === 'calf').slice(0, 2);
    for (const c of tiny) c.wt = 4;
    for (const c of tiny) expect(netSaleValue(c, prices)).toBeLessThan(0);
    let stock = 0;
    for (const a of m.animals) {
      if (!tiny.includes(a)) {
        expect(netSaleValue(a, prices)).toBeGreaterThan(0);
        stock += netSaleValue(a, prices);
      }
    }
    expect(stockWorth(farm, prices)).toBeCloseTo(stock, 9);
    expect(netWorth(farm)).toBeCloseTo(farm.cash + stock, 6);
    expect(netWorthParts(farm).stock).toBeCloseTo(stock, 9);
    expect(mobSummaries(farm)[0]!.saleValue).toBeCloseTo(stock, 9);
  });
});
