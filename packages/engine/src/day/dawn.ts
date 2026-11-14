/**
 * What happens at first light on a new farm day, before the player can act
 * (docs/MODEL.md, section 9, "Buying and selling on sale days").
 *
 * Three things are due at first light:
 *
 *   1. Cattle bought on the day before land in the stock yards. They join
 *      the mob that is in the yards if there is one (one mob in the yards).
 *   2. Stock booked onto a sale that falls today is sold at today's price,
 *      with the usual selling costs. Animals that have died or were already
 *      sold are skipped without fuss.
 *   3. The workforce (docs/MODEL.md, section 11): wages, pay day, injuries,
 *      the hands' standing duties and contract fencing under way. Nothing
 *      at all on a farm that has never hired a hand or ordered contract
 *      fencing.
 *
 * `endDay` and `skipDays` call this for each new day, after the daily tick.
 * It is a step of its own: the daily tick (`stepDay`) never does any of it,
 * so it can not change what the tick does to grass or cattle.
 */

import { sellList, type ActionEnv } from '../actions/apply';
import { labourDawn } from '../labour/day';
import { animalLookup, type Animal } from '../cattle/types';
import type { FarmEvent } from '../sim/events';
import { newMob } from '../sim/mobs';
import { toInbox, type FarmMob, type FarmState } from '../sim/state';

/**
 * Do what is due at first light today. Changes the farm in place and
 * returns what happened, in order. The events are also put in the inbox.
 * Nothing happens on a farm whose game is over.
 */
export function dawn(farm: FarmState, env: ActionEnv = {}): FarmEvent[] {
  const events: FarmEvent[] = [];
  if (farm.over) return events;

  // 1. Cattle land in the yards.
  const due = farm.arrivals.filter((a) => a.arriveDay <= farm.day);
  if (due.length) {
    farm.arrivals = farm.arrivals.filter((a) => a.arriveDay > farm.day);
    for (const a of due) {
      let mob: FarmMob | undefined = farm.mobs.find(
        (m) => m.where.kind === 'yards' && m.animals.length > 0,
      );
      const joined = mob !== undefined;
      if (!mob) mob = newMob(farm, { kind: 'yards', since: farm.day });
      for (const animal of a.animals) mob.animals.push(animal);
      const calves = a.animals.filter((x) => x.kind === 'calf').length;
      events.push({
        type: 'cattle-arrived',
        cls: a.cls,
        head: a.animals.length - calves,
        calves,
        cost: a.cost,
        mob: mob.id,
        mobName: mob.name,
        joined,
      });
    }
  }

  // 2. Booked stock is sold.
  const sales = farm.saleBookings.filter((b) => b.saleDay <= farm.day);
  if (sales.length) {
    farm.saleBookings = farm.saleBookings.filter((b) => b.saleDay > farm.day);
    for (const booking of sales) {
      const all = animalLookup(farm.mobs);
      const list: Animal[] = [];
      for (const id of booking.animalIds) {
        const animal = all.get(id);
        if (animal && !animal.dead) list.push(animal);
      }
      if (list.length) sellList(farm, list, events, true);
    }
  }

  // 3. The workforce: wages, pay day, the hands' duties and contract fencing (milestone 2.1).
  // Nothing at all on a farm that has never hired a hand or ordered contract fencing.
  events.push(...labourDawn(farm, env));

  toInbox(farm, farm.day, events);
  return events;
}
