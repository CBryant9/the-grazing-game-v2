import 'server-only';
import { SPECIES, type CattleNote, type FarmEvent, PTIC_DAYS } from '@gg/engine';
import type { InboxKind } from '../../lib/game/types';
import { isLabourEvent, labourMessage, type DateOf } from './labourwords';
import { longDate, saleClassLabel } from './marketwords';
import { reasonWord } from './mobwords';
import { movedText, waitWhyWord } from './planwords';
import { isSheepEvent, sheepMessage } from './sheepwords';
import { UNDER_FLOOR, bankWords, causeWord, gameOverWord } from './words';

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
/** A planting as a noun that takes "is": "Phalaris pasture", "The oats crop". */
const planting = (sp: keyof typeof SPECIES): string =>
  SPECIES[sp].type === 'pasture' ? `${capital(name(sp))} pasture` : `The ${name(sp)} crop`;

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
      // Only a female that was PTIC on the record: before PTIC_DAYS nothing said she was in calf.
      return n.days >= PTIC_DAYS
        ? `A PTIC ${n.kind} in ${mobName} lost her pregnancy. She was under CS 1.6.`
        : null;
    case 'calfLostAtBirth':
      return `A calf was lost at birth in ${mobName}${n.first ? ', a first calf' : ''}.`;
    case 'calvingStarted':
      return `Calving has started in ${mobName}.`;
    case 'toMark':
      return `${mobName} has ${plural(n.count, 'bull calf', 'bull calves')} 60 days or older that are not marked.`;
    case 'youngBullsFertile':
      return `The unmarked young bulls in ${mobName} are now fertile.`;
    case 'joiningStarted':
      return `Joining has started in ${mobName}: ${plural(n.adultBulls, 'bull')} with ${plural(n.readyOnRecord, 'female')} of joining age not PTIC.`;
    // No preg test and no count of cows in calf (Claudia, 14 Nov 2026): the record shows a
    // female as PTIC from the engine's PTIC_DAYS in calf, on the mob card and the herd list.
    case 'joiningProgress':
    case 'pregTest':
      return null;
    case 'noBull':
      return `${mobName} has ${plural(n.readyOnRecord, 'female')} of joining age not PTIC, and no bull.`;
    case 'lowCondition':
      return `${mobName} has an average condition of CS ${n.cs.toFixed(1)}.`;
  }
}

const sold = (e: Extract<FarmEvent, { type: 'cattle-sold' }>): string =>
  `${plural(e.head, 'head', 'head')} sold${e.booked ? ' from the booking' : ''}, averaging ${Math.round(e.avgKg)} kg. ${money(e.net)} paid into the bank after selling costs.`;

/**
 * The whole farm eaten out: the fact, in the paddock sheet's words for feed under the floor, and
 * what happens if it stays that way. Never "days of feed left".
 */
export function outOfFeedWords(daysLeft: number): string {
  return `The whole farm is eaten out with stock on it. Feed averages ${UNDER_FLOOR.replace('Under', 'under')}. The game ends if it stays that way for ${plural(daysLeft, 'more day')}.`;
}

/**
 * The "bull calves to mark" notes that repeat within one drop of calves, by inbox number. The
 * engine notes unmarked bull calves every 45 days, as the old game did; the player is told once
 * for each drop, the rule Things to do follows (REQUIREMENTS, "marking once per drop"). A drop
 * starts with "calving has started" in the mob; marking the mob also ends the drop's note.
 */
export function repeatMarkNotes(inbox: readonly { seq: number; event: FarmEvent }[]): Set<number> {
  const told = new Set<number>();
  const hide = new Set<number>();
  for (const m of inbox) {
    const e = m.event;
    if (e.type === 'calves-marked') told.delete(e.mob);
    if (e.type !== 'cattle') continue;
    if (e.note.type === 'calvingStarted') told.delete(e.mob);
    if (e.note.type !== 'toMark') continue;
    if (told.has(e.mob)) hide.add(m.seq);
    else told.add(e.mob);
  }
  return hide;
}

/**
 * The message for an event, or null when the inbox does not carry it. Every
 * workforce event has one (`labourMessage` is exhaustive over them), and says
 * its dates with `dateOf`.
 */
export function inboxMessage(e: FarmEvent, dateOf: DateOf): Message | null {
  const msg = (kind: InboxKind, text: string): Message => ({ kind, text });
  if (isLabourEvent(e)) return msg('work', labourMessage(e, dateOf));
  // Every sheep event has words (`sheepMessage` is exhaustive over them).
  if (isSheepEvent(e)) return sheepMessage(e, dateOf);
  switch (e.type) {
    case 'farm-started':
      return msg('farm', `The farm is set up: ${Math.round(e.farmHa).toLocaleString('en-AU')} ha.`);
    case 'new-season':
      return msg('farm', `New season: ${e.label}.`);
    case 'year-end':
      return msg('farm', `Year ${e.year.n} of the farm has ended.`);
    case 'out-of-feed':
      // Feed under the floor is never put as days of feed left (the paddock sheet's own words).
      return msg('cattle', outOfFeedWords(e.daysLeft));
    case 'game-over':
      return msg('farm', gameOverWord(e.reason));
    case 'bank':
      return msg('farm', bankWords(e.level, e.cash, e.limit, e.head));
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
      const what = saleClassLabel(e.cls)?.toLowerCase() ?? 'cattle';
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
        `${e.mobName}'s grazing plan can not move it into ${e.area}, because ${waitWhyWord(e.why)}.`,
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
      return msg(`${planting(c.sp)} is established.`);
    case 'pasture-thinning':
      return msg(`${planting(c.sp)} is past its life and thinning.`);
    case 'crop-established':
      return msg(`${planting(c.sp)} is established.`);
    case 'lock-up-soon':
      return msg(`${planting(c.sp)} locks up for grain in ${plural(c.days, 'day')}.`);
    case 'harvest-ready':
      return msg(`${planting(c.sp)} is ready to harvest: about ${t1(c.estimate.t)} t of grain.`);
    case 'grain-shedding':
      return msg(`Grain in the ${name(c.sp)} is starting to shed.`);
    case 'forage-finished':
      return msg(
        `${planting(c.sp)} has finished for the season.${c.mayRegrow ? ' Some may come back from seed.' : ''}`,
      );
    case 'not-harvested':
      return msg(`The ${name(c.sp)} was not harvested. The grain is gone and it is stubble now.`);
    case 'sowing-window':
      return msg(`The sowing window for ${name(c.sp)} is open.`);
  }
}
