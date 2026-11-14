import 'server-only';
import { SALE_CLASSES, SPECIES, type CattleNote, type FarmEvent } from '@gg/engine';
import type { InboxKind } from '../../lib/game/types';
import { longDate } from './marketwords';
import { reasonWord } from './mobwords';
import { movedText } from './planwords';
import { causeWord, gameOverWord } from './words';

/**
 * The messages in the inbox: one or two plain sentences for each thing the
 * engine reports. Facts only, with the cause where there is one. Nothing
 * here praises, criticises or says what to do (CLAUDE.md, rules 2, 5 and 11).
 */

const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n.toLocaleString('en-AU')} ${n === 1 ? one : many}`;
const money = (n: number): string => `$${Math.round(Math.abs(n)).toLocaleString('en-AU')}`;
const pct = (n: number): string => `${Math.round(n * 100)}%`;
const t1 = (n: number): string => (Math.round(n * 10) / 10).toLocaleString('en-AU');
const name = (sp: keyof typeof SPECIES): string => SPECIES[sp].short;
const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export interface Message {
  kind: InboxKind;
  text: string;
}

/** What a mob's daily note says. Null for a note the inbox leaves out. */
export function noteWord(mobName: string, area: string | null, n: CattleNote): string | null {
  const where = area ? ` in ${area}` : '';
  switch (n.type) {
    case 'noWater':
      return `${mobName} has had no water for ${plural(n.days, 'day')}${where}. Cattle die on the fourth day without water.`;
    case 'shortOfFeed':
      return `${mobName}${where}: the paddock gave ${pct(n.f)} of the feed the mob wanted.`;
    case 'losingWeight': {
      const why = new Set<string>();
      for (const c of n.classes) for (const r of c.why) why.add(reasonWord(r));
      return [
        `${mobName} has been losing weight for ten days. The feed is ME ${n.me.toFixed(1)} MJ/kg and CP ${Math.round(n.cp)}%.`,
        ...[...why].slice(0, 2),
      ].join(' ');
    }
    case 'slipped':
      return `A ${n.kind} in ${mobName} lost her pregnancy. She was under CS 1.6.`;
    case 'calfLostAtBirth':
      return `A calf was lost at birth in ${mobName}${n.first ? ', a first calf' : ''}.`;
    case 'calvingStarted':
      return `Calving has started in ${mobName}.`;
    case 'toMark':
      return `${mobName} has ${plural(n.count, 'bull calf', 'bull calves')} 60 days or older that are not marked.`;
    case 'youngBullsFertile':
      return `The unmarked young bulls in ${mobName} are now fertile.`;
    case 'joiningStarted':
      return `Joining has started in ${mobName}: ${plural(n.adultBulls, 'bull')} with ${plural(n.ready, 'female')} ready to join.`;
    case 'joiningProgress':
      return `${mobName}, joining week ${n.weeks}: ${n.conceived} got in calf in the last 3 weeks. ${n.inCalf} of ${plural(n.females, 'female')} are in calf now.`;
    case 'pregTest': {
      const rest = [
        n.dry > 0 ? `${plural(n.dry, 'female')} not in calf.` : '',
        n.tooSoon > 0 ? `${plural(n.tooSoon, 'female')} calved too recently to tell.` : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `${mobName} preg test: ${n.inCalf} of ${plural(n.females, 'female')} in calf (${pct(n.rate)}). At CS ${n.cs.toFixed(1)} about ${pct(n.expected)} would be expected.${rest ? ` ${rest}` : ''}`;
    }
    case 'noBull':
      return `${mobName} has ${plural(n.ready, 'female')} ready to join and no bull.`;
    case 'lowCondition':
      return `${mobName} has an average condition of CS ${n.cs.toFixed(1)}.`;
  }
}

const sold = (e: Extract<FarmEvent, { type: 'cattle-sold' }>): string =>
  `${plural(e.head, 'head', 'head')} sold${e.booked ? ' from the booking' : ''}, averaging ${Math.round(e.avgKg)} kg. ${money(e.net)} paid into the bank after selling costs.`;

/** The message for an event, or null when the inbox does not carry it. */
export function inboxMessage(e: FarmEvent): Message | null {
  const msg = (kind: InboxKind, text: string): Message => ({ kind, text });
  switch (e.type) {
    case 'farm-started':
      return msg('farm', `The farm is set up: ${Math.round(e.farmHa).toLocaleString('en-AU')} ha.`);
    case 'new-season':
      return msg('farm', `New season: ${e.label}.`);
    case 'year-end':
      return msg('farm', `Year ${e.year.n} of the farm has ended.`);
    case 'out-of-feed':
      return msg('cattle', `The farm has about ${plural(e.daysLeft, 'day')} of feed left.`);
    case 'game-over':
      return msg('farm', gameOverWord(e.reason));
    case 'cattle': {
      const text = noteWord(e.mobName, e.area, e.note);
      return text ? msg('cattle', text) : null;
    }
    case 'births':
      return msg('cattle', `${e.mobName}: ${plural(e.count, 'calf', 'calves')} born.`);
    case 'deaths':
      return msg(
        'cattle',
        `${e.mobName}: ${plural(e.count, 'head', 'head')} died, from ${causeWord(e.cause)}.`,
      );
    case 'breakout':
      return msg(
        'cattle',
        `${e.mobName} pushed through a fence in ${e.area}, because they were ${e.reason}.`,
      );
    case 'no-water':
      return msg('water', `${e.mobName} has no water in ${e.area}.`);
    case 'water':
      return e.event.type === 'portable-empty'
        ? msg('water', `A portable trough in ${e.paddock} is empty.`)
        : msg(
            'water',
            `A portable trough in ${e.paddock} is ${Math.round(e.event.pct)}% full, about ${plural(Math.round(e.event.daysLeft), 'day')} of water.`,
          );
    case 'weaned':
      return msg(
        'cattle',
        `${plural(e.count, 'calf', 'calves')} weaned from ${e.mobName}, averaging ${Math.round(e.avgKg)} kg.${e.into ? ` They went to ${e.into.mobName}.` : ''}`,
      );
    case 'mobs-joined':
      return msg('cattle', `${e.fromName} joined ${e.intoName}${e.area ? ` in ${e.area}` : ''}.`);
    case 'calves-marked':
      return msg('cattle', `${e.mobName}: ${plural(e.count, 'calf', 'calves')} marked.`);
    case 'crop':
      return cropMessage(e.event);
    case 'crop-grazed':
      return msg(
        'crop',
        `${e.mobName} grazed ${name(e.event.sp)} at a time that costs ${e.event.type === 'grazed-before-established' ? 'stand and yield' : 'grain yield'}.`,
      );
    case 'sown':
      return msg('crop', `Sowed ${name(e.sp)} on ${t1(e.ha)} ha for ${money(e.cost)}.`);
    case 'harvested':
      return msg('crop', `Harvested ${t1(e.t)} t of ${name(e.sp)}, worth ${money(e.value)}.`);
    case 'cattle-on-the-way': {
      const what = SALE_CLASSES[e.cls]?.label.toLowerCase() ?? 'cattle';
      return msg(
        'sale',
        `Bought ${e.qty.toLocaleString('en-AU')} ${what} for ${money(e.total)}, freight included. They arrive in the stock yards at first light on ${longDate(e.arriveDate)}.`,
      );
    }
    case 'cattle-arrived':
      return msg(
        'sale',
        `${plural(e.head, 'head', 'head')} arrived in the stock yards${e.joined ? `, and joined ${e.mobName}` : ` as ${e.mobName}`}.`,
      );
    case 'sale-booked':
      return msg(
        'sale',
        `${plural(e.head, 'head', 'head')} booked onto the sale on ${longDate(e.saleDate)}. Nothing is paid until then.`,
      );
    case 'sale-cancelled':
      return msg(
        'sale',
        `${plural(e.head, 'head', 'head')} taken off the sale on ${longDate(e.saleDate)}.`,
      );
    case 'cattle-sold':
      return msg('sale', sold(e));
    case 'plan-moved':
      return msg('plan', movedText(e));
    case 'plan-waiting':
      return msg(
        'plan',
        `${e.mobName}'s grazing plan can not move it into ${e.area}, because that area has no water.`,
      );
    case 'plan-staying':
      return msg(
        'plan',
        `${e.mobName} has been in ${e.area ?? 'its paddock'} for ${plural(e.days, 'day')}. Feed there is ${Math.round(e.massKgHa / 10) * 10} kg DM/ha. The plan moves it at ${Math.round(e.moveAtKg)} kg DM/ha.`,
      );
    case 'plan-finished':
      return msg(
        'plan',
        `${e.mobName}'s grazing plan has finished: ${plural(e.report.moves, 'move')} and ${plural(e.report.rounds, 'round')}. The mob stays where it is.`,
      );
    case 'plan-set':
      return msg(
        'plan',
        `${e.mobName} is on the plan ${e.templateName}, at step ${e.step + 1} of ${e.steps}.`,
      );
    case 'plan-paused':
      return msg(
        'plan',
        `${e.mobName}'s grazing plan is paused${e.because === 'manual-move' ? ', because the mob was moved by hand' : ''}.`,
      );
    case 'plan-resumed':
      return msg('plan', `${e.mobName}'s grazing plan is running again, from step ${e.step + 1}.`);
    case 'plan-cleared':
      return msg('plan', `${e.mobName} is off its grazing plan.`);
    default:
      return null;
  }
}

function cropMessage(c: Extract<FarmEvent, { type: 'crop' }>['event']): Message | null {
  const msg = (text: string): Message => ({ kind: 'crop', text });
  switch (c.type) {
    case 'self-sown':
      return msg(`Some ${name(c.sp)} came back from seed, at ${pct(c.share)} of a full stand.`);
    case 'pasture-established':
      return msg(`${capital(name(c.sp))} is established.`);
    case 'pasture-thinning':
      return msg(`${capital(name(c.sp))} is past its life and thinning.`);
    case 'crop-established':
      return msg(`${capital(name(c.sp))} is established.`);
    case 'lock-up-soon':
      return msg(`${capital(name(c.sp))} locks up for grain in ${plural(c.days, 'day')}.`);
    case 'harvest-ready':
      return msg(
        `${capital(name(c.sp))} is ready to harvest: about ${t1(c.estimate.t)} t of grain.`,
      );
    case 'grain-shedding':
      return msg(`Grain in the ${name(c.sp)} is starting to shed.`);
    case 'forage-finished':
      return msg(
        `${capital(name(c.sp))} has finished for the season.${c.mayRegrow ? ' Some may come back from seed.' : ''}`,
      );
    case 'not-harvested':
      return msg(`The ${name(c.sp)} was not harvested. The grain is gone and it is stubble now.`);
    case 'sowing-window':
      return msg(`The sowing window for ${name(c.sp)} is open.`);
  }
}
