/**
 * The help topics. Each is a heading and a few short sentences about what the
 * player sees and can do. Nothing here says how a number is worked out, and
 * no real-world figure is quoted. Each line is checked against what the game
 * on this branch does (see docs/DEVELOPMENT_LOG.md, "Help and the first day").
 * Plain Australian English, short sentences, no em-dash asides.
 */

export interface HelpTopic {
  id: string;
  title: string;
  /** Short paragraphs. */
  lines: string[];
}

export interface HelpTerm {
  term: string;
  means: string;
}

export const HELP_TOPICS: readonly HelpTopic[] = [
  {
    id: 'day',
    title: 'How the day works',
    lines: [
      'Each day runs from first light to last light. The daylight bar at the top shows how much of the light is used.',
      'Jobs use light. Before you confirm a job, its card says how long it takes and how much light is left after it. A job that fits in the light left is done. A job that does not fit is not done.',
      'Some jobs, like sowing, take none of the day.',
      'When there is not enough light left for a job, the farm goes dark. You can still look around. Next day is the way on.',
      'Next day moves on to the next morning and shows what changed overnight. +1 week, +1 month and +1 year run the days one after another. A skip stops early and says why if something needs you, such as a mob with no water.',
    ],
  },
  {
    id: 'move',
    title: 'Moving cattle',
    lines: [
      'Tap a paddock on the map to open it, then tap Move a mob here. Or open a mob from the Herd tab and tap Move.',
      'Pick the paddock on the map or from the list, check the card, then press Move. Moving a mob is pick the paddock, done.',
      'You can move the whole mob or part of it, by class and number. Calves go with their mothers.',
      'There is one mob to a paddock. If a mob is already there, the two join. The card says so before you confirm. It also says when the paddock has no water.',
      'Tapping the map opens a paddock, never a cow.',
    ],
  },
  {
    id: 'build',
    title: 'Building',
    lines: [
      'Open the build tools (the Build button on a phone). The tools are Fence, Gate, Pipe, Trough, Portable trough, Water hub and Remove. Look goes back to just looking.',
      'Fence: pick permanent, electric or tape, then drag along the paddock lines. Gate: tap a fence to put a gate in it, and tap a gate to open or shut it. Pipe: drag across squares, starting from the bore, a trough, a hub or pipe that is already there. Trough: tap a square that water reaches. Water hub: tap a fence corner or a square.',
      'Every job shows a card first, with its cost and the light it uses. You confirm, and the tool goes back to Look.',
      'Red on the map means one thing: this part does not fit in today. A line that does not fit is not built. Only the part that fits is built, and the red part is drawn again another day.',
    ],
  },
  {
    id: 'water',
    title: 'Water',
    lines: [
      'Cattle need water in their paddock, or through an open gate to a paddock that has it. A paddock with none shows No water.',
      'Water comes from the bore, along pipe, to a trough or a water hub. A pipe that does not reach water says it is not joined to water yet.',
      'A portable trough can be set down on any square. It holds a set amount, so it needs refilling. Things to do says when one is low or empty.',
      'A mob with no water shows in Things to do, with the days without so far.',
    ],
  },
  {
    id: 'market',
    title: 'Buying and selling',
    lines: [
      'The Market tab shows the prices, with Buy and Sell. The top line says if there is a sale today, or when the next one is.',
      'Cattle can only be bought on a sale day. Bought cattle arrive in the stock yards the next morning. They stay there until you move them out to a paddock. Things to do has a Move out button for them.',
      'On a sale day, cattle you sell are paid for that day. On any other day, selling books them onto the next sale. Nothing is paid until then, and the price is set on the day.',
      'A booking can be cancelled from the Market tab, or from the mob.',
    ],
  },
  {
    id: 'husbandry',
    title: 'Husbandry',
    lines: [
      'Stock work is done where the mob is. The cattle never have to come to the yards for it.',
      'Things to do says what needs doing, such as calves to mark or a mob with no water. It is a banner over the map on a phone. Where there is a job, its button sits right there. Open mob goes to the mob card.',
      'The mob card has the jobs as buttons: Mark calves, Wean, Sell, Move and the supplement. A button that is off says why.',
      'There is no preg testing. A cow goes on the record as PTIC by herself, once she is far enough along. The mob card shows how many head are known in calf.',
    ],
  },
  {
    id: 'plans',
    title: 'Grazing plans',
    lines: [
      'A grazing plan moves a mob round the paddocks by itself each day. Plans have their own tab.',
      'Tap paddocks in the order the mob will visit them. Then pick the rule: move every few days, move a few times a day, or move when the feed is down to a level in kg DM/ha, with an optional most days.',
      'Pick the rounds: a number of rounds, or keep going. After the last round the mob starts again or stays put.',
      'Moving a mob by hand pauses its plan. A plan can be paused, resumed, changed or cleared. If a plan cannot move a mob, because the next paddock has no water, it says so and tries again the next day.',
    ],
  },
  {
    id: 'feed',
    title: 'Lick and feed',
    lines: [
      'Open a mob and look at Supplement. The choices are None, Lick, Hay and Pellets, each with what it costs a day for that mob.',
      'Pick one and a card shows the cost first. Confirm to switch it on. Pick None to switch it off.',
      'Supplements are for mobs in a paddock. A mob in the stock yards does not get one.',
      'When a mob is not gaining, the Why part of its card says what is behind it.',
    ],
  },
  {
    id: 'crops',
    title: 'Crops',
    lines: [
      'Crops are on mixed farms only. A paddock with arable land has a Crops part on its sheet.',
      'To sow, pick what to sow, then choose all the arable land or pick squares on the map. Each choice shows its cost a hectare and the months it can be sown. A card checks it first. Sowing happens at once.',
      'Each planting shows where it is up to. When it is ready, a Harvest button shows on the sheet and in Things to do.',
    ],
  },
  {
    id: 'paddock',
    title: 'Reading a paddock',
    lines: [
      'Each paddock has a label that describes its feed. Green: mostly green feed. Mixed: green and dry feed together. Dry & rank: tall, dry, mature grass. Short: not much feed standing. A label describes. It does not say what to do.',
      'kg DM/ha is the feed on offer: kilograms of dry matter on each hectare. The paddock sheet shows it next to the label.',
      'The side-view picture on the sheet is the paddock seen from the side. It shows how tall the grass is, how green it is, and any green at the base of tall dry grass. A paddock that is part crop and part pasture shows two pictures.',
      'Details has the rest: green share, height, feed energy and protein, ground cover, and how many days of feed there are with stock on it.',
    ],
  },
];

export const HELP_TERMS: readonly HelpTerm[] = [
  {
    term: 'AE',
    means:
      'Adult equivalent. A standard animal, so stock of different sizes can be counted together.',
  },
  {
    term: 'DSE',
    means: 'Dry sheep equivalent. Another way to count stock together, with a dry sheep as one.',
  },
  { term: 'CS', means: 'Condition score, from 1 to 5. How lean or fat an animal is.' },
  { term: 'PTIC', means: 'Preg tested in calf. A female the game has on the record as in calf.' },
  { term: 'ME', means: 'Metabolisable energy, in MJ/kg. How much energy is in the feed.' },
  { term: 'CP', means: 'Crude protein, as a % of the feed. How much protein is in the feed.' },
  { term: 'kg DM/ha', means: 'Kilograms of dry matter on each hectare. The feed on offer.' },
];
