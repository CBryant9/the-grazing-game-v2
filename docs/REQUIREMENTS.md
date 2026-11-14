# Requirements: what Claudia asked for

Every requirement and correction Claudia gave while building v1 to v15, grouped by topic and written as rules. **Each line must still be true after any change or rebuild.** Where she changed her mind, only the final decision is a rule, and the reversal is noted so nobody brings the old version back.

Her own words are in quotes. The how-it-works detail is in [MODEL.md](MODEL.md), the look in [VISUALS.md](VISUALS.md), and the figures in [DATA.md](DATA.md).

## The point of the game

- [ ] It shows how real grazing decisions affect pasture, cattle and money in Australian native pasture, "using realistic factors". Realism comes before everything else.
- [ ] The player gets choices, not a philosophy. "We're giving them the choice to graze how they want."

## Grass

- [ ] Each district follows its own real growth curve, growing "only in their seasons" (summer or winter rainfall).
- [ ] Grass goes through phases: short regrowth, then leafy (phase 2, best quality), then mature, then hayed off. "Grazing it in phase 2 can keep it green and highly nutritious for longer."
- [ ] Ungrazed grass bulks up but loses quality. "The total kilograms of dry matter go up, but the quality will go down."
- [ ] Grass left to go to seed goes rank and "will kind of stay like that" the next year "until it's been smashed down quite low and can get some sun on the roots".
- [ ] Knock-down depends on density. A big mob on a small area (for example tape strips) can take 5,000 kg DM/ha down to 1,500; a light mob barely touches it.
- [ ] Timing matters as well as amount. "It's not about, overall, how much something's been grazed… It's also about when." Short plants come back greener faster.
- [ ] Ground cover starts going below about 1,500 kg DM/ha. Height is a separate thing from mass.
- [ ] Paddocks start in different conditions from an uneven grazing history, not all the same.
- [ ] Heading and staleness run on realistic timelines for the season and rainfall.

## Cattle and nutrition

- [ ] Intake differs by class and by feed. "They eat lots more when they're eating green feed, and they also put on more weight."
- [ ] Too many cattle "smash the paddock down". Stocking rate is shown as AE and DSE per ha against carrying capacity, and is realistic for the district. Don't let a player think 59 head on 260 ha of Central Qld native is normal.
- [ ] Weight gain follows the grass phase and quality. You can look at an animal and see if it's fat or thin.
- [ ] Animals die when they don't get the nutrition they need, mostly the very poor ones.
- [ ] **Water:** every animal dies after 4 days without water, not just the poor ones. Warn before +1 week or +1 month if any mob has no water, and stop the clock.
- [ ] **Warnings explain why.** Never just "losing weight". Give the cause: not enough feed, low ME, protein under 7%, milking for a calf, or late pregnancy. "We need to know why."
- [ ] Supplements (lick, hay, pellets) and a feedlot are available, and they cost money.
- [ ] Profit is shown per animal, and you can see which cattle are making money. The stock book is in Herd.

## Breeding

- [ ] Bulls join with cows. Condition score drives the chance each cow gets back in calf, on a realistic cycle and timeline, with some random dry cows.
- [ ] Bull calves stay entire until marked. You are prompted to mark them. Unmarked young bulls get cows in calf ("you wouldn't have any dry cows").
- [ ] With no bull: "Your cows are ready to get back in calf. You need a bull."
- [ ] Joining reports every 3 weeks, then a preg test result compared with what you'd expect for their condition ("fewer getting in calf than you would expect"). *(Reversed 14 Nov 2026: no preg test; a cow shows as PTIC on the record by herself from 50 days in calf. See "pregnancy on the record".)*

## Water and fencing

- [ ] There is a bore at a random spot, and a trough on the bore needs no pipe. Pipe joins the bore, other pipe or troughs.
- [ ] Fences are permanent, electric (cheaper) or temporary tape (cheap). Fencing and water give higher density, more even grazing and better utilisation.
- [ ] Temporary tape is reusable: $45 for a new length, $10 to roll it up and $10 to put it back out. Show metres on the roll, with new tape to buy shown in red.
- [ ] Portable troughs need no pipe. They empty with a visible level, cost $45 to refill, and can be moved.
- [ ] Water hubs: a trough with 4 gates on a square, or a hub on a fence line or corner that waters the 2–4 paddocks touching it.
- [ ] Any area fully enclosed by fences or gates is a paddock ("it needs to know when it's fully enclosed"). Open gates join paddocks for grazing only.
- [ ] Gates go only on fences, and they can be removed. Every starting paddock has at least one gate.
- [ ] Fences snap to the drawn wire and show whether each end is on a fence. Splitting an existing paddock works.
- [ ] Cattle stay inside their paddock and never look like they're on the wrong side of a fence.
- [ ] **Breakouts only through temporary tape**, only when the mob is actually hungry or thirsty ("not for no reason"), one tape at a time. *(Reversed: v3 let cattle break electric fences. Claudia: "cattle shouldn't get out of the permanent fencing… They should only get through the temporary tape.")*
- [ ] **One mob per paddock.** Cattle that share a grazing area (including through open gates) become one mob. You move some of them by class and number.
- [ ] A small fee to move a trough.

## Market and money

- [ ] The market moves over time following real yearly prices (2019–2025), then a realistic random path.
- [ ] Each class has its own price, and an animal's price changes as it moves class (weaner to yearling and so on). Chart classes match the buy list exactly.
- [ ] Buy: a modal with a price per class. Your own cattle and their profit sit beside it for selling.
- [ ] **Confirm before spending, then show the result right where you clicked**: "You have bought these cows. You'll now see them on the map." No double buys into debt on a narrow screen.
- [ ] Saleyard buttons: "Close" and "Keep shopping" / "Keep selling", not "Watch".
- [ ] Net worth is explained (cash, plus stock at sale value after costs, plus 80% of what's been spent on infrastructure).
- [ ] Money, overdraft and the game-over level scale with district and farm size, set by difficulty (easy/medium/hard). The setup screen shows no dollar figures; they appear once you take the farm. *(History: $20k in the brief, then $50k, then scaled. Game over was always the bank limit or running completely out of feed.)*
- [ ] Scoring covers profit, utilisation (kg of grass eaten), weight gained, ground cover and deaths.

## Crops and pastures

- [ ] Each district offers only what is realistic to plant there ("you're not going to plant rye and clover in the NT"). Options include a multi-species mix, cheaper monocultures, annual forage and crops, with realistic $/ha establishment costs.
- [ ] Improved pasture thins out and needs renovating (about every 5 years for temperate pastures).
- [ ] An annual forage gives one good year. About 10% may come back from seed the next year, for one year only.
- [ ] Cattle prefer crop or improved pasture over native in a mixed paddock, and the warning says so in plain words ("This paddock is a mix… cattle will go for the crop first").
- [ ] Grazing affects grain: grazing after lock-up eats the heads, grain-only crops lose yield if grazed, and grazing before establishment damages the stand. Warn first, with an option to go ahead.
- [ ] Harvest costs money. An on-map **Harvest** button appears when the crop is ready.
- [ ] **Fallow only appears when a crop finishes** (or on rotation blocks at the start). Never at random. It looks like "brown, kind of bare paddock, maybe with a few dots".
- [ ] **After harvest there is stubble:** a set amount of low-value feed that breaks down to fallow. *(Reversed: first "later", then wanted now.)* Message along the lines of "you're putting them on stubble that's not very nutritious, but go for it".
- [ ] **A finished crop never regrows.** No warnings about a crop once it's harvested.
- [ ] Sowing prompts when a window opens ("If you want to plant oats, now's the time").
- [ ] A feed graph forecasts the rest of the year, with crops showing as spikes.
- [ ] Mixed-farm setup: choose grazing or mixed, then % arable land (realistic per district, tiny in the NT), then % actively cropped. Warn that more cropping means more of the farm starts in fallow. Converting pasture to cropping costs extra and asks first. Plant only on arable land, and highlight it.
- [ ] Arable land is a natural patch, "not just small bits everywhere". The rotation sits in square blocks, at a stage that suits the start month.

## Map and pictures (detail in VISUALS.md)

- [ ] An angled 3D view so height can be seen ("not pure top view"). The bore is easy to find. Fences are easy to see. Zoom in and out.
- [ ] Grass visibly changes height and colour: short or tall, green or mature, rank grass tall with "the green only down the bottom".
- [ ] Ungrazed paddocks must not look bare. Dry grass shows as straw.
- [ ] Rank grass looks clearly taller ("towards hitting 40 cm… that is better than just hitting 20").
- [ ] Hover a paddock name for a side-view picture. Click a paddock for "then vs now". Crop + pasture paddocks show a split picture.
- [ ] A pasture-quality layer shows the best feed by quality, not quantity.
- [ ] Big mobs don't hide the pasture.

## Controls and screens

- [ ] Help is hidden by default behind a help button, in an info section that can be reopened. It never covers the map on a small screen.
- [ ] The Paddocks tab shows the quick list first (with water ✓/✗), and details and sorting on demand.
- [ ] Tools snap back to Look after each build.
- [ ] Clicking the map opens the paddock, never a cow ("I don't want to be able to click on the cows at this point").
- [ ] One "Move cattle in here" chooser by class and number, not long per-mob button lists. It shows a no-water warning before you move them.
- [ ] A status panel after each time skip shows nutrition, gain and pasture changes, so it's "quick, fast, and easy to see what happened".
- [ ] On-map buttons for ready jobs (Harvest, Mark calves), each with a confirm.
- [ ] Feedback appears where you clicked on narrow screens. No horizontal scroll.
- [ ] Day by day, +1 week, +1 month, and fast-forward with plans running.

## Grazing plans

- [ ] Plans have their own tab. Click paddocks in order, then pick an obvious rule: move every N days (down to 4 moves a day), or move when grazed down to X kg DM/ha (for example 1,500), with an optional maximum.
- [ ] It reports when they didn't move and why ("didn't get to 1,500").
- [ ] It checks water when you save ("Do you want to change it?") and warns about weight or condition loss.
- [ ] Legs: "keep going in this block until… then go to these ones". Rounds per leg, then repeat or stay.
- [ ] A plan report: what they ate, how many rounds and moves, and kg gained.

## Setup

- [ ] Each district offers small, medium and large farms at realistic sizes. The NT is huge.
- [ ] Two obvious start modes: take over a running business (random paddocks and waters, at least one water, a random herd), or start from scratch (minimal fencing, one water, no cattle).
- [ ] Game-like steps with picture cards, where the next step is obvious.

## Wording

- [ ] Plain Australian English, short sentences, no jargon without explanation, no em-dash asides. Use her terms: kg DM/ha, AE, DSE, CS, PTIC, ME (MJ/kg), CP %, weaners, joining, marking, lick, stubble, fallow.
- [ ] "Paddock 1", not "P1", in anything a player reads first.
- [ ] **Neutral paddock labels: Green, Mixed, Dry & rank, Short.** No "green zone / buffer / haystack" or any three-zone wording or commentary. *(Rejected: "that's kind of enforcing the three-zone adaptive grazing". "Buffer" was also wrong; it sat on short dry pasture.)*
- [ ] **Don't say "overgrazed"** until rest history is modelled ("you can graze it short as long as it has a long rest"). Say short or very short. Say "bare" only when ground cover is actually being lost.
- [ ] Commentary describes, it doesn't judge, and it only appears on paddocks with cattle in them. For example: "The grass is growing away from them", "They're having a high impact", grazing evenly or patchily, picking the best bits, down to eating what they'd normally leave, getting short.

## Not built yet (raised by Claudia or offered)

- An "overgrazed" judgement that combines grazing pressure with rest periods. Claudia: "which we'll build in later."
- Stubble detail: value by crop, and cattle not choosing it over pasture.
- Phone and touch testing.
- A gate added automatically when a new fence closes a paddock (offered; no answer).
- Heading timing by species (medics, ryegrass about 3 months to seed). This is currently per district for natives.
- Real MLA market data to replace the approximate price series.

## Rebuild requests (13 Nov 2026, detail in PRD.md)

These came from planning the phone and PC rebuild. Full detail and open questions are in [PRD.md](PRD.md).

- [ ] Two ways to play: a real-time daily mode ("what you could achieve on a farm in the day") and the current self-paced game ("the fast version with a better name"), with up to 3 self-paced farms going.
- [ ] Jobs take realistic time. The day starts at first light and "the time only moving as you did things". If you only look, it stays first light. You can only do what fits before dark, so "they can't just build all their fencing in one day". This applies to both modes.
- [ ] Daily mode: at midnight in the player's time zone the day is simulated with the cattle where they were left. Daily dry matter, intake and gain must be "as dialed in as we can get it to reality", especially at high density and with several moves a day.
- [ ] Self-paced mode keeps +1 day, +1 week, +1 month skips, with the time controls along the top and the paddock filling the screen.
- [ ] Game over means starting again.
- [ ] Visuals more polished: "that retro feel but not be so pixelly", like the Ship or Die art in docs/reference/.
- [ ] Grass, saleyard, messages and paddock views must work well on every screen size.
- [ ] Anyone can join; date of birth at sign-up; the social side is hidden for under 16s.
- [ ] Ad slots (banners, videos between days and years, sponsor cards) are built in-house so Claudia can run her own business's ads or sell them. No Google game video ads for now.
- [ ] Build everything now (ads, Stripe, subscriptions, community) and turn each on from an admin back end when ready. The admin shows analytics, connects Stripe, sets subscriptions and manages ads.
- [ ] Community: overall leaderboard, groups to compete with friends, profiles (photo, where from, years farming, education, what and how much they farm, real farm, links to socials and website), posts with photos, comments and likes, a feed of friends and others, friends' daily activity (daily mode only), a view of anyone's farm as it is now, and a live activity ticker like Ship or Die ("Tom1998 moved 4000 head into a 4ha paddock").
- Later, not now: hiring workers or contractors to get more done in a day.
- [ ] Fast and solid, "not glitchy", ideally a 100 Lighthouse score.
- [ ] No saleyard or feedlot drawn on the map ("we don't need that").
- [ ] Phones can be flipped to landscape, "likely how it will be played". Farms stay wide rectangles; in portrait you move left to right. In landscape the panels go full screen "because they need to be tall enough to read".
- [ ] Cattle and grass in a less pixelly style: with lots of grass and cows "it's really hard to tell and it's all blurry together".
- [ ] Activity pop-ups on the website pages, not in the game view.
- [ ] Ads in different spots on different pages "so it doesn't feel too spammy"; on the farm view, ads on the left.
- [ ] On PC the game header sits at the top of the game and the website header at the top of the site; they must not blend together. Community and other pages get big headings and sensible spacing.
- [ ] Light and dark versions.
- [ ] Map style: the "clear map with detail on zoom" (S5 in the mockups). Clean paddocks and one marker per mob when zoomed out, individual cattle and grass when zoomed in.

## Rebuild requests, second round (13 Nov 2026, after the first build plan)

Given while talking through `BUILD_PLAN.md`. Where these differ from the PRD or from rules above, these win, and the reversal is noted. Items marked *(details open)* still need figures or a decision; see BUILD_PLAN section 9.

### How to treat the MVP

- [ ] The rebuild is built "to our needs". The MVP "was a quick start", so its code and display can change, and "prices and things" can change to suit. Keep "the same data and lessons from v1".
- [ ] "The grass, cows and all that should be as real as possible whilst maintaining good gameplay."

### Markets, years and weather

- [ ] Prices should be real market data for the years they stand for. *(The MVP series was approximate, written from memory. It must be replaced with real data, LESSONS 13.)*
- [ ] Fast Farm uses real years. The player chooses to play the years in order or at random ("we might take 1997 and then do 2006 in the following year"), so regular players "can't predict what the market is going to do". The label shows the real year it represents, but it counts as year 2, year 3 and so on for their score.
- [ ] Leaderboards also rank by real year: "who came out the best of that year", taking the starting and ending position into account, because "someone who started with a lot vs nothing is different".
- [ ] Daily Farm: connect to real market and weather conditions for the player's chosen location if it can be done simply ("that would be cool"). Use the baked-in years until a live feed is ready. Record the wish for live data from real yards near the player, and later "today's prices".
- [ ] Saleyards are called just "Saleyards" for now (generic name). Research the best real yard for each district, especially ones with data we can get automatically.
- [ ] Freight in proportion to distance is not a priority.
- [ ] The yards found for each district "work": Gracemere (Central Qld), Armidale (Northern Tablelands), Dubbo (Central West), Mortlake for cattle and Hamilton for sheep (Western Vic).
- [ ] The Top End has no yard of its own: "find a northern equivalent somehow", possibly north Queensland or live export. *(Charters Towers is in the MLA service with current prices. Whether the district itself moves is still open.)*
- [ ] "Just hook up to MLA and ask them later." Build on the MLA service now; the permission email comes before launch.
- [ ] Wool: "use a stand-in for now".
- [ ] Northern cattle are drawn Brahman style, not British cattle.
- [ ] Where sheep aren't appropriate, don't offer them.

### Jobs, time and the farm's buildings

- [ ] Permanent ("proper") fence: 500 m a day on your own. *(Changed: the PRD had about 250 m a day.)*
- [ ] Permanent fence has a contractor option in the fencing tool: a 1-man team costs more and gets double done in a day; a 2-man team more again. Time and cost depend on the option chosen. *(details open)*
- [ ] Other fence types scale sensibly: rolling out tape and putting it on posts takes about as long as walking it; electric fence needs posts hit in, so it sits between tape and permanent.
- [ ] Every farm has a house and yards. How long a job takes depends on "driving the cruiser out there and back". *(Reversed 14 Nov 2026: no house and no driving. The yards stay, for bought cattle. See "The working day made simpler".)*
- [ ] Moving stock takes time by distance. The paddock next door "shouldn't take long at all". Cattle walk at about 1.5 km/h. *(Changed: the PRD had about 3 km/h.)* *(Reversed 14 Nov 2026: moving a mob is "pick the paddock, done". No walking time.)*
- [ ] On a day a mob has "a bit of a walk", assume they didn't eat much for weight gain. Walking through other paddocks has no effect on those paddocks. *(Reversed 14 Nov 2026, for now: there is no walk.)*
- [ ] Gates: consider doing gate types now so it is realistic (a cheap gate, a real gate, a pull-up tape gate). *(details open)* *(Reversed 14 Nov 2026, for now: one kind of gate.)*
- [ ] Supplements are stock you hold. A lick block gets low and needs topping up; how fast it goes depends on the stock on it. A lick run takes time. *(Changed 14 Nov 2026: this holds for Daily Farm. In Fast Farm a supplement is switched on at a daily price with no daylight cost.)*
- [ ] Feeding out means loading at a feed bin, shed or silo and driving out from there. Players can build sheds and silos closer to the stock, or build a feedlot and feed them there. *(Earlier rule: no feedlot drawn on the map. A feedlot the player builds on the farm is new; confirm how it shows.)* *(Reversed 14 Nov 2026: no sheds, silos or driving. A feeder or lick block in the paddock is filled where it is, and no feeder has to be bought.)*

### Buying and selling

- [ ] Sale days and delivery days apply in both modes. The Market tab shows days until the next sale. Clicking Sell books the stock onto the next sale.
- [ ] Bought stock is generally delivered the following day, into the stock yards on the farm. On delivery day the player moves them out and chooses their paddock. *(Changed: the PRD default was a 2-day delivery.)*

### Farm hands and the workforce

- [ ] Players can hire farm hands, on a salary or a contract. The people available change over time, and people leave.
- [ ] Workers have skills and stats that change how fast and how far jobs get: the days they work, their rate, what they improve, and "how hard you can work them before they quit". Some are good at fencing. Some have a team of dogs and make moving stock quick. Farm hands can do all tasks (fencing, moving stock, troughs, pipe).
- [ ] With a farm hand on, one-man fencing assumes the farmer and the worker are both there, so about 800 m a day instead of 500 m.
- [ ] Some only want short contracts (for example 3 months at a day rate). Salaried workers don't work weekends. Others on long terms might.
- [ ] Messages keep the player up to date ("John's contract finished, consider hiring someone else").
- [ ] Workers occasionally get hurt and go on workers comp (rare).
- [ ] If the player can't pay them or treats them badly, their reputation in the workforce drops and the choice of workers gets worse.
- *(Changed: the PRD listed workers and contractors as "later".)*

### Sheep

- [ ] Add sheep, with their own figures, and wool as income. *(Changed: the PRD had cattle only at launch.)*
- [ ] At setup the player chooses cattle, sheep or a mix, so the markets shown aren't too busy. In play they can still buy either, "because they might change their minds".

### Protecting the rules

- [ ] The code and rules of both modes should be hidden from everyone: "we don't want anything to be able to copy our rules". This is to become a business. *(If Fast Farm runs on the server to achieve this, it reverses offline Fast Farm in the PRD; confirm.)*

### Farms, payments and game over

- [ ] Free accounts get 2 Daily Farms and 2 Fast Farms ("one where they start from 0 and one where they start with a lot"). *(Changed: the PRD had 1 Daily and 3 Fast.)*
- [ ] One-off payments, not a subscription: about $30 for 5 of each farm plus perks; about $50 for 5 of each farm, no ads and more perks. *(Changed: the PRD had a monthly or yearly subscription.)*
- [ ] Nothing in the game can be bought for an advantage: "they can't pay for perks in the game".
- [ ] On game over, a player can pay to keep going. It clears the debt and puts the farm back to "small modest funds", with a penalty that fits their situation (for example they may have had to sell all their stock). The offer shows exactly what they get for the money.
- [ ] Price to keep going: $5 on a Fast Farm. On a Daily Farm it scales with how long the farm has run: about $25 at 6 months, $50 at 1 year, $100 over 2 years. *(details open: the price under 6 months, and whether $35 is a minimum.)*
- [ ] A Daily Farm shouldn't reach game over within the first 3 to 6 months of ordinary play. *(To be tested with the engine.)*

### Grazing plans in each mode

*(Changed: the PRD default was no grazing plans in Daily Farm.)*

- [ ] Fast Farm: the plan moves the stock around as set, "because we assume the farmer is doing it".
- [ ] Daily Farm with a worker: the worker does the planned moves, and it doesn't use the farmer's daylight. When the player comes in, a worker character pops up with a speech bubble, like a retro game ("like Pokemon"): "I moved the cows from here to here as planned", so they know a move already happened and may not need to do anything.
- [ ] Daily Farm with no staff: setting up a plan says "you have no staff, so you will need to remember to move them. We will send you a notification." The player gets "Time to move your stock".
- [ ] When they come in, a grazing plan card says: "Your grazing plan said today you would move from X to Y. Would you like to do that now?" Yes moves them. Not yet leaves a plan strip along the bottom with a quick Move button, "because they might want to have a look at the pastures first and then decide".
- [ ] If they move stock and break the plan, they reset it themselves, or pick a template and resume from a step ("this is paddock 3 of the template", then on to 4, 5 and 6).
- [ ] Several moves a day without staff are played in one sitting, not with several reminders: "less pressure". The card says "this was your plan, do it", and the player watches the day pass from sunrise to sunset, with the cows moving, stopping, then going again. A short run of moves leaves daylight over.
- [ ] Reminders: one reminder at a time the player picks, then one more later if they haven't played, "so they don't miss a day". Notification settings let them change this.
- [ ] Show time changing across the day on the map. "It would be cool to see how we could simulate that change of time across the day."

### Answers given on the question list (13 Nov 2026)

- [ ] **Remove the Top End for now.** "It's super hard and super large", and it is "better to build it out with specifics of northern in the future". Four districts at launch. *(Changed: the MVP and PRD v1.0 had five. The Top End figures stay in DATA.md for later.)*
- [ ] A Daily Farm runs on today's real date.
- [ ] Sale days match the real yard's timing, including yards that sell fortnightly: "that adds to the reality of it".
- [ ] "Electric fencing is really fast if it's just one wire or tape."
- [ ] Contractor fencing: a 1-man team does 500 m a day and a 2-man team 1,000 m a day, and neither takes the farmer's daylight. Any workers could be helping them. The farmer can draw their own extra fence as well, shown in a different colour from the team's.
- [ ] Workers helping on a fence the farmer draws: the first part of the line is the workers' share and uses none of the farmer's daylight (about 500 m for a worker, more or less by their skills). Then the line continues and uses the farmer's daylight.
- [ ] The line stops drawing when the day is used up, with a warning that this is the full day, and that to move cows as well they need to do less fence. *(Kept, and made firmer on 14 Nov 2026: the part that fits is built, the rest shows red and is drawn again another day.)*
- [ ] Driving on the farm is faster than 25 km/h in real life, but 25 works for the game's scale. *(Reversed 14 Nov 2026: no driving.)*
- [ ] Nobody under 14 can make an account. No community under 16. *(Changed: PRD v1.0 had 13.)*
- [ ] For everything else on the list, Claudia accepted the suggested defaults "for now": "better to get this in and then scale and adapt as we go". They are listed in PRD section 21.

### Security

- [ ] Claudia is "worried about this security and stuff". The rules, players' data and payments must all be safe, and she wants it explained in plain words.

## 14 Nov 2026: the working day made simpler

Given after the first cut of the working day (milestone 1.5a) was built with driving, a homestead, contractor bookings and jobs that carried over. Where these differ from the PRD or from rules above, these win. The earlier lines they reverse are marked "Reversed 14 Nov 2026" where they stand.

Her words: "Let's take the driving and all of that part out." "The drive home is just adding too much of an element into the time." "I don't think we want to be putting too much emphasis on them watching the time. Obviously, we want them to have little notes and be aware of it, but we don't want them thinking about it too much." "The yard stuff and the driving from the house and all of that really, really overcomplicates it."

### Time and jobs

- [ ] **No driving and no drive home.** A job's time is its work only. *(Reverses: travel at 25 km/h, "driving the cruiser out there and back", PRD 5.1 and 5.4.)*
- [ ] **Time is shown lightly.** The player has "little notes" and is aware of the day, but is not made to watch the clock or think about it much.
- [ ] **A fence or pipe line too long for today:** the part that fits is built. The rest shows red with "You don't have enough time to do this today" and is drawn again another day. A line that takes the whole day says so: "this would use up your full day". **No half-built jobs that carry on by themselves.** *(Reverses PRD 5.1 "job in progress".)*
- [ ] Any other job is done if it fits in the light left, and is not done if it does not.
- [ ] **At last light the farm goes dark but can still be looked at, and the Next day button invites a click.**
- [ ] **Harvest and sowing happen at once:** "they can straight up just go and harvest." They cost money and take none of the day. *(Reverses the contractor's wait, PRD 5.4.)*

### The farm

- [ ] **No homestead.** "I think we don't need to have a cellar, yards, or a house", then, on the yards: "the yards can stay for buying them so they will place them but they don't have to come in for husbandry." *(Reverses: "Every farm has a house and yards".)*
- [ ] **The stock yards stay** as the place bought cattle arrive. The player moves them out to a paddock. Stock never have to come to the yards for husbandry.
- [ ] No sheds, silos or other buildings for now. *(Reverses: sheds and silos closer to the stock, and a feedlot the player builds.)*

### Stock work

- [ ] **Husbandry is a button on the mob, done where the mob is.** "The animal husbandry and stuff should happen, and they don't need to take them into the yards." "Make clicking the button easy. It would come up with the banner and say, 'You need to mark your calves,' and then they go and do it, or you look in the mob."
- [ ] **A banner and the mob card say what needs doing** (calves to mark, calves to wean, a mob with no water, a crop ready). They state facts.
- [ ] **Moving a mob is "pick the paddock, done".** No route through gates, no walking time, no gate needed on the way. *(Reverses: moving stock takes time by distance, cattle walk at 1.5 km/h, a long walk costs the day's gain, PRD 5.13 routes, and the three gate types, for now.)*

### Feed

- [ ] **Fast Farm:** "in the fast game they just turn it on", at a daily price that "doesn't cut their daylight".
- [ ] **Daily Farm:** supplements are stock on hand. "Each supplement has a capacity like 100 animals for 5 days for lick (find realistic)", "they would feed grain each day as part of their tasks", with "a warning if things needed filling". There is "a lick block with an amount used or a feeder and we could see if it's empty", "you tap on it to replenish it on that day and it has a cost obviously and uses some of their daylight". A notification like "Paddock X is out of lick block or feed". Levels keep falling on days the player misses. The player can "put a different ration in the feeder" or put out a new lick block, and can "remove the feeder" to stop the empty warning. "I'm happy for them to not have to buy a feeder."
- *(Changes: "supplements are stock you hold" now holds for Daily Farm only. Loading at a shed or silo and driving out is reversed.)*

### Fences and water (after the screens review)

- [ ] **Fence materials are kept, and reused fence is half price.** "If they remove a fence, they can have so many discounted fence fees because they would already have some of the materials, but they still don't get the full amount. They would get some discount on fencing for using stuff that they already had." On the figure: "half price is fine." *(Built in the engine: permanent and electric fence taken down is kept by the metre and by kind, and fence of that kind uses it first at half price. MODEL section 5 and 8, DATA "Fence materials kept and reused".)*
- [ ] **Water hubs can be removed and moved.** "Water hub can be removed or moved." Both kinds: the hub on a fence line or corner, and the hub on a square. *(Built in the engine.)*
- [ ] **The default fence is the permanent one.** "A normal fence is the one that they would go for. They have to specifically choose electrical." *(Built in milestone 1.7f: the fence tool starts on permanent fence.)*
- [ ] **The pipe tool does not zoom the map.** "They should be able to zoom it to where they want and then draw the pipe." *(For the screens.)* *(Built in milestone 1.7f: no tool changes the zoom by itself; pinch and wheel zoom work in every tool.)*
- [ ] **Red means one thing.** Her words: red "means doesn't fit today when building, so use other colours for other stuff". On the map and the cards, red on a line or a square is used only for the part of a line that does not fit today. A knocked-down fence is amber with its "!" marker. New tape is white and dashed, never red. The no-water salmon stays for words and markers, not as a red line. *(Built in milestone 1.7f. Reverses the red knocked-down fence, the red new tape and the red remove mark in VISUALS.)*
  - *(Narrowed 14 Nov 2026, later the same day.)* Her words: "I still wanted the same colours across the site and all that to stay red. It was more just the red within the [map] where we're drawing stuff. That's what it would probably be saved for. Red is like an error, or a can't go any further, within the picture." So the rule is for the map picture only: there, red is saved for "can't do this" while drawing (the part of a line that does not fit today, a refused line). The site's colours stay as designed, red included: the panels, cards, tags, the Short chip and the main button. On the map, no water (the label text and the pickable outline) is purple; in the panels it keeps the site colour.
- [ ] **A line where none of it fits today** says "You don't have enough time to do this today. Draw it again another day." It is drawn again on another day, not drawn a different way. *(Built in milestone 1.7f.)*

## 14 Nov 2026: build it all, with a list of calls at the end

Her words (as typed): "ok yeah hook in- I would like them all done and would prefer a list of clals at the ends that yu explain and i could say if i wnated something diffferent - let sjust focu son getting this done, maybe you should open some chats unde ryou to get it done faster pleas"

- [ ] Every stage is built without stopping for decisions. Each call is logged with its reason. Claudia gets one explained list at the end, and can change any of them.

## 14 Nov 2026: pregnancy on the record, no preg test

Her words: "I think we're probably not going to pretest the mobs or need that animal husbandry, but we obviously do need to know in our mob lists that they would show as PTIC if they were X amount of time and how far along they were on the record. Whatever the kind of general time that is, I'm happy for that to show up as PTIC. They would just be cows before that, then they're PTIC, and before that, they're dry, I guess. I guess what they're considered is dry until they are progested. That's fine. What you pay in the calf sale premium is only for cows known to be... You only get PTIC price if that cow is confirmed to be pregnant. They would just be sold as cows. That's correct." (dictated; 'pretest' and 'progested' mean preg test and preg tested)

- [ ] **No preg test job.** Not on the screens, the to-do list, the banner or the help.
- [ ] **A cow or heifer is PTIC on the record by herself once she is a set number of days in calf** (the engine's `PTIC_DAYS`, 50: the day the price starts paying the in-calf premium; DATA "When a cow shows as PTIC"). Before that she is a cow or heifer (dry with no calf at foot), whether or not she is really in calf.
- [ ] **PTIC price only for cows on the record as PTIC.** All others sell as cows.
- [ ] **The mob lists show head PTIC and how far along**, in whole months ("31 PTIC, 2 to 4 months in calf"), the months for PTIC cows only. Nothing calls a cow "empty".
- [ ] **Every class and group the player sees or picks from uses the one rule**: selling, booking a sale, moving part of a mob, the map, the herd list.
- *(Reverses: earlier on 14 Nov 2026 the player was told only what a joining report or preg test had said, with the joining reports, the preg test and "known in calf" on the mob card. Built in engine 0.10.0 and 0.11.0; replaced by engine 0.12.0.)*

### For the game screens milestone

- [ ] An information panel explains how the day works.
- [ ] Onboarding and a tour show how things work, with help available at any time.
