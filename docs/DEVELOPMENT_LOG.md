# Development log

How The Grazing Game got to where it is, round by round: what Claudia asked for, what was built, and what was learned. Artifact version numbers refer to the published page at https://claude.ai/artifact/KpkSthPfYtYf7uPVpXVVva.

## The original brief

A simple retro pixel game simulating years on a farm and using grass well:

- A big rectangular paddock with a bore. Start with money to spend on fencing (permanent, cheaper electric, cheap temporary), water (pipe, troughs, a pipe layer to toggle, a fee to move troughs) and livestock.
- Choose a location (native grass systems, summer or winter rainfall), which changes growth and nutrition across the year.
- Grass follows a seasonal growth curve, hays off and loses quality unless grazed. Grazing in phase 2 keeps it green and nutritious longer.
- Each class of animal eats different amounts. Too many cows smash a paddock. Fencing and water give higher density, more even grazing and better utilisation.
- A market that moves over time (following real yearly data), buying and selling by class and weight.
- Day-by-day play with planned rotations, and fast-forward by day, week and month.
- Grass visibly changing in height and colour. Inspect cattle for fatness.
- Supplements, feedlot, deaths from poor nutrition, breeding with bulls (conception driven by condition score).
- Scoring on profit, utilisation, kg gained; game over below -$100,000.

## v1: first build

Single-file canvas game: 40×26 grid of 50 m squares (260 ha), per-square pasture model (green, dead, leaf age), five districts (Central Qld, Top End NT, Northern Tablelands, Central West NSW, Western Vic), individual cattle with an energy model (ME intake vs maintenance, pregnancy, lactation), condition score, conception by CS, calving, weaning. Fences, pipe, troughs, rotations, supplements, feedlot, market from 2019–2025 restocker prices, yearly scoring, save/load. Tuned so gains per head matched real ranges.

## v2: angled view, bore, feedback

- "P1" renamed to "Paddock 1".
- Map redrawn as an angled 3/4 view with standing grass tufts so height shows.
- The bore became a tall windmill with a pulsing ring and a "put a trough here" sign.
- Every action now shows a toast on the map (actions had only been logged in the diary, off-screen).

## v3: gates, hubs, breakouts, profit

Zoom and pan; gates (open and shut); bolder fences; water hub (trough with 4 gates); cattle pushing through electric and tape when hungry, with "strays" mobs; click a paddock to move mobs in; per-animal profit tracking; stock book; picking individuals; starting money options; random starting farm; game over when cash goes past the limit or the farm is eaten out for 10 days.

## v4–v9: smaller fixes

- Default start money $50,000.
- An area closed by fences or gates (open or shut) is always its own paddock; open gates only join paddocks for grazing.
- Starting paddocks always have at least one gate.
- Water hubs on fence lines and corners, watering 2–4 paddocks.
- Every beast dies on day 4 without water; a warning before running time if any mob has no water.
- Pipe can connect from troughs and hubs, not just the bore.
- Ungrazed paddocks were looking bare: litter now draws as straw, and dead grass breaks down more slowly.

## v10: the big realism and usability round

- Gates only on existing fences; only tape gets pushed through; fence snapping to the drawn wire, with green "on a fence" dots; cattle can't walk through fences; help hints hidden behind "?".
- Rankness model: grass left ungrazed through flowering goes to head and stays stale until knocked down hard. Knock-down depends on density. Uneven grazing history at start.
- Green at the base of rank tussocks on the map; pasture quality layer.
- Side-view pictures (hover a paddock name, click a paddock, then vs now).
- Paddock overview with stocking rate vs carrying capacity.
- Grazing plans (schedule or grazed-down residual) with water checks and predicted gains.
- Reusable temporary tape ($10 to roll up or out); portable troughs that empty and cost $45 to refill.
- Saleyard window with class prices and your cattle with profit.
- One mob per paddock (merging), "bring some" by class.

## v11: breeding and realism of numbers

- Bull calves born entire; "mark them" notices; unmarked young bulls become fertile at about 10 months.
- Joining progress every 3 weeks and preg tests after 9 weeks, with expected vs actual by condition score; dry-cow / "needs a bull" alerts; realistic post-calving anoestrus; about 4% of cows never get in calf.
- Intake by class shown on each mob; feed budget per paddock (growing vs eating); farm scale shown.

## v12: farm size, starting herd, confirmations, commentary

- Realistic farm sizes per district (small, medium, large; Top End 15,000–150,000 ha). Squares scale with the farm, and so do costs per metre and water reach.
- Start from scratch or take over a running business with a matched herd.
- Saleyard buy/sell confirm inline and show the result where you clicked (narrow-screen fix; stops accidental double buys).
- Grazing impact commentary on stocked paddocks ("growing away from them", "patchy", "picking the best bits").
- Lick made cheaper and seasonal; milk falls on poor feed; northern places start on lick.

## v13: crops, pastures, difficulty

- Easy/medium/hard scale money, overdraft and game-over level to the place.
- Mixed farm option with arable land at realistic shares per district.
- Sown pastures, oversowing, annual forages and grain crops per district with sowing windows, costs per ha, convert-to-cropping cost, establishment, lock-up, heading, harvest, damage warnings, renovation, self-sown annual regen.
- Feed tab: 12-month growth vs herd demand and standing feed projection.

## v14: Top End survival tuning

Weaner mobs had been losing their lick, cattle stayed too close to water on big paddocks, and deaths started too early. Fixed all three; drought advice added to the season message. Deaths now 2–5% in normal years.

## v15: land layout, setup flow, controls, plans (latest)

- Arable land as one natural patch; rotation as square blocks; plain fallow; stubble after harvest (low quality, no regrowth); finished crops don't regrow.
- Step-by-step setup with picture cards; "start from scratch" vs "take over an established farm" as two modes; difficulty shown without dollar figures (shown once you take the farm).
- Neutral labels (Green, Mixed, Dry & rank, Short); three-zone wording removed; "overgrazed" removed.
- Paddocks tab: quick water list first, details on demand.
- Tools snap back to Look after building; clicking the map opens the paddock (no more selecting cows); one "Move cattle in here" chooser; red no-water warnings.
- Split crop/pasture pictures; clearer mixed-paddock and stubble warnings.
- Status panel ("since you last ran the clock"); on-map buttons for harvest, mark calves, no water.
- Plans tab: multi-leg plans, moves as often as 4 a day, rounds per leg, repeat or stay, plan report.
- Weight-loss warnings explain the cause.
- Breakouts only when actually hungry; taller rank grass in pictures; market class names match the saleyard; "Keep shopping" / "Keep selling".
- Established farms get enough waters per paddock (about one per 2,500 ha).

## 13 Nov 2026: project memory for the rebuild

No game changes. Recorded everything learned so far in `docs/`:

- requirements as rules (REQUIREMENTS)
- visuals and colours (VISUALS)
- exact model formulas (MODEL)
- all datasets (DATA)
- benchmarks and results (CALIBRATION)
- mistakes (LESSONS)

Also added:

- `tests/calibrate.js`, a reusable calibration run. Its first results are in CALIBRATION.md: Central West steers run a little high, and a Top End drought-type year gives 7% deaths.
- a `game` local server config
- the `realism-guardian` project agent

## The rebuild (this repo)

### 13 Nov 2026: planning

- `BUILD_PLAN.md` written, then widened with Claudia: four districts (Top End removed for now), the simulation on the server for both modes, real years with MLA prices and SILO weather, new job times, farm hands, contractor fencing, sheep, a homestead and yards, gate types, feed as stock, plans in both modes, one-off purchases. PRD moved to v1.1.
- A line-by-line check of `MODEL.md` and `DATA.md` against the MVP code found 15 mismatches and several MVP faults (BUILD_PLAN 2.4).

### 13 Nov 2026: milestone 1.0, scaffold

Built:

- pnpm monorepo: `apps/web` (Next.js 16, App Router), `packages/engine`, `packages/render`, `packages/shared`. Strict TypeScript 6.0, ESLint 10, Prettier, Vitest 5, Lighthouse CI, a GitHub Actions workflow.
- Design tokens, the three fonts (self-hosted), buttons, chips, badges and cards from the mockups, in light and dark. The theme follows the device and a choice is remembered.
- Landing page shell and `/play` shell, with the separate website and game headers.
- Seeded random numbers with named streams, and 8 tests.
- Lint rules that stop browser code importing the engine, and stop the engine using unseeded randomness, the clock or the DOM.
- Security headers, no source maps, manifest, robots and sitemap.

Tested: type check, lint, 8 unit tests and the production build pass. Checked in the browser at 375 x 812 and 812 x 375 in both themes: no sideways scroll, fonts load, the theme toggle works, no console errors.

Lighthouse (mobile, local): Accessibility 100, Best Practices 100, SEO 100 on both pages in every run. Performance 97 to 100 in clean runs, with two outliers (74 and 84) when this PC was busy.

Not done, and why:

- Performance is not a steady 100 on the landing shell. First-load JavaScript is 141 KB compressed, over the PRD's 100 KB budget for website pages. Most of it is the framework's own runtime. To be dealt with in milestone 5.4 (LESSONS R1).
- TypeScript is held at 6.0, because the lint tooling does not support 7 yet.
- Playwright end-to-end tests come with the game screens (1.7).

### 13 Nov 2026: milestone 1.1, grass

Built, all in `packages/engine`:

- District figures for the four launch districts (`data/districts.ts`).
- The pasture on each of the 1,040 squares, in the same number sizes as the MVP (`pasture/state.ts`).
- Growth potential for a day (`pasture/potential.ts`) and the daily pasture step for native pasture, sown pasture, crops, fallow and stubble (`pasture/grow.ts`).
- Feed quality (`pasture/quality.ts`), phase labels (`pasture/phase.ts`), and the paddock, grazing area and ground cover summaries (`pasture/summary.ts`).
- Seasons behind one interface (`season/factors.ts`), with the MVP's random seasons drawn from the farm's seed behind it (`season/randomSeasons.ts`). Real weather takes its place in 1.4.
- The engine version is now 0.2.0.

How it was proven: the tests load the MVP script from `reference/mvp/grazing-game.html` in memory, with stand-ins for the browser, and call the MVP's own functions with the same inputs as the engine (`packages/engine/test-support/`). The MVP file is not changed. Every result is exactly equal, with no tolerance: bit for bit on the stored arrays, and the same number on every returned figure. Covered: the four districts, every month, seven season and month factors from drought to wet, 17 kinds of square at seven fertilities, sown pasture, every crop stage, fallow, stubble, one day and 400 days in a row. 80 new tests, 88 in all. As a check on the tests, 47 figures in the engine were nudged one at a time. Six were missed at first, each fixed by adding or changing a sample square, and all 47 are now caught.

What was left for later:

- Sown pastures and crops need a "what is it doing today" record for each planting. The crop model that makes it is milestone 1.2. For now the tests take that record from the MVP's own `fieldState`.
- The paddock summary takes the cattle figures (AE, head, feed eaten) as inputs. The cattle model in 1.2 supplies them.
- Random seasons can't be matched number for number, because the MVP was unseeded. The draw itself is matched exactly for the same random number. The rest is tested by its spread and limits.

Where the docs and the MVP code disagreed in these parts (docs corrected, MODEL.md and DATA.md):

- Fallow and stubble have their own path: no growth, 3% and 0.4% of the dead breaking down each day. The "+0.006" in the code is only for a planting on a square still marked fallow, which sowing never leaves behind.
- Haying off follows the time of year, not the month factor. `wet` and `dry` use the district curve before the month factor.
- Sown pastures and crops use the district's `wet`, `dry` and frost, not their own curves. Frost does not apply to crops.
- The dead-feed quality rule in MODEL.md is for native pasture only.
- The run-up wobble is 0.7 to 1.3 held between 0.2 and 1.8, and it starts on the first 1st of a month in the run-up.
- The month factor is redrawn on the farm's first day. The season is not redrawn if the farm starts on 1 July.

Things in the MVP that look odd, kept as they are, for Claudia:

- A poor month slows growth but does not make green feed hay off any faster. Only a season under 0.8 does.
- Sown pasture and crops hay off by the native pasture's calendar.
- Stubble and fallow report a "green feed" quality (DMD 0.45, CP 4) though there is no green. It is never used, because the green share is 0.
- The run-up season keeps its drawn name (say "Drought") even when the factor is lifted to 0.85. It is never shown.
- The month limits (0.15 to 1.9, and 0.2 to 1.8) can never be reached with the six seasons.
- Some phase wording leans towards a judgement ("best quality", "stale", "losing ground cover"). It is the MVP's wording, kept for now.

### 13 Nov 2026: milestone 1.2a, cattle

Half of milestone 1.2. The farm half (paddocks, fences, water, crops, layout) is 1.2b, built alongside on its own branch. Branch `m1.2a-cattle`, cut from `m1.1-grass`.

Built, all in `packages/engine`:

- Feed and cattle tables (`data/feed.ts`, `data/cattle.ts`): supplement and feedlot figures, saleyard classes without prices, class and group names, health and marking costs.
- Animals and mobs (`cattle/types.ts`, `cattle/animal.ts`): making an animal and a bought batch, class names, groups, market classes, adult equivalents, water need per head.
- Diet selection, intake and grazing (`cattle/graze.ts`): where a mob grazes, what each animal eats, and what that does to each square, including trampling, the 250 kg DM/ha residual and the 4 passes.
- Breeding (`cattle/breeding.ts`): cycling, conception by condition, bull cover, calving, weaning, marking, the joining notes and the preg test.
- Expected gains and the reasons for a loss (`cattle/gains.ts`).
- The daily cattle step and the end-of-day deaths (`cattle/simMob.ts`), with several shifts a day, the feedlot and every supplement. It stops no clock and writes no diary line. It returns deaths, births, weanings, notes, the mob's figures, the feed cost and the planted squares grazed (`cattle/notes.ts`).

How it was proven: the same way as the grass. The tests load the MVP in memory and give it the same herd on the same farm as the engine. The MVP's own code works out the grazing areas and the distance to water from test fences and troughs. After every day, every animal, every mob figure, the pasture, the year totals, the deaths and the notes must be exactly equal, with no tolerance. The engine's notes are put into the MVP's words by the test and compared with the MVP's diary line for line.

The random parts (conception, slipped calves, calving losses, calf sex, barren females, deaths, orphans) were compared by giving both sides the same numbers: a fixed value (0.999999 so nothing random happens, 0 so everything does, and sweeps of values in between), a scripted list, or the same seeded sequence. The MVP also drew a random spot on the map for each new animal. The test tells those draws apart by which MVP function asked, gives them a fixed value, and checks both sides finish having drawn the same count.

Covered: every class, weights and ages across the range, CS 1 to 5, dry, pregnant early and late, milking with young and old calves; the four districts on green, dry, rank, short and bare pasture and on sown pasture and crops; 4 head to 500 head on 4 ha; water near and over 3 km out; 1 to 4 days with no water; each supplement; the feedlot; 1, 2 and 4 shifts a day; and herds run for 150 to 240 days in a row with the grass growing.

As a check on the tests, 265 figures in the cattle code were nudged one at a time. 19 were missed at first, most of them chances and limits that a random run only meets by luck. Tests were added that go looking for each (`cattle/thresholds.test.ts` and extra samples). 264 are now caught. The last one changes no result: milk is at its full rate on day 60 whichever side of the step it falls.

Direct benchmarks from CALIBRATION.md are tested too: intake on green and dry feed, conception by condition, the 9-week joining rate and anoestrus. Two need Claudia's eye and are logged in CALIBRATION.md: heavier dry cattle eat a smaller share of live weight than the intake ranges, and the 9-week rate at CS 3 is 84%, a point under the 85 to 95% range.

MVP faults fixed, each with a test (BUILD_PLAN 2.4): the no-water count clears in the feedlot; a cow whose calf dies is dried off; weaning dries off a dam in another mob; making an animal draws no map position. In the long runs, when a calf dies the test checks the engine has dried the cow off and the MVP has not, then dries her off in the MVP so the two carry on side by side.

Where the docs and the MVP code disagreed in these parts (docs corrected, MODEL.md and DATA.md):

- The low-protein penalty uses the CP of pasture plus hay or pellets, and applies on hay and pellets too.
- Calves get 40% of the hay and pellet ration.
- Only calves 90 days or older are weaned with the drop.
- Trampling counts calves in the head per hectare, never works on less than 0.25 ha, and can take a square below the residual.
- Open females for bull cover include barren females and heifers too young to cycle.
- The 2.4% appetite band starts at 450 kg, not above it.
- The calf with a bought cow and calf unit is a steer or heifer calf (already marked), 36 kg plus 0.8 kg a day.

What was left for later:

- The farm side supplies the grazing areas, the distance to water, and where weaners go. The daily tick that joins the two halves is the next step.
- Notes and reasons are data. Their wording for players belongs to the screens (1.7).
- Prices, feed as stock on hand, and plans are later milestones. The cattle step returns the figures they need.
- The engine version was not bumped here, to keep clear of the farm branch. Bump it when the two halves are joined.

Things in the MVP that look odd, kept as they are, for Claudia: listed in MODEL.md, section 3, "MVP behaviour kept as it is".
### 13 Nov 2026: milestone 1.2b, the farm

The farm half of milestone 1.2 (paddocks, fences, water, crops and the layout at the start). The cattle half is milestone 1.2a, built alongside on its own branch. All in `packages/engine`:

- Farm sizes and scale, the 15 species the four districts can plant, and the cropping tables (`data/farms.ts`, `data/species.ts`, `data/crops.ts`).
- Fences and gates on the lines between squares, paddocks, grazing areas and their names (`farm/topology.ts`).
- The bore, pipe, troughs, water hubs and portable troughs, where water reaches, the watered squares and the distance to water on every square, and how portable troughs drain (`farm/water.ts`).
- Every change to the layout as a job that returns a new layout and a report, or a refusal with the reason: build and pull down fence, roll up tape, hang, open, shut and remove a gate, fix a knocked-down fence, lay pipe, place, move and remove a trough, both kinds of water hub, and place, move, refill and remove a portable trough (`farm/layout.ts`). Money is left out. Each job reports lengths and counts.
- Sown pastures, forages and crops: what a planting is doing today, sowing, grazing damage, yield, harvest, stubble, self-sown regrowth and the daily crop step with its events (`crops/fields.ts`, `crops/tick.ts`).
- Arable land as a natural patch, and the starting rotation (`crops/arable.ts`).
- A whole farm from a seed: soil, the bore, the 540-day run-up, fences, gates and water for a from-scratch or running farm, arable land, the rotation, and the new homestead and stock yards (`farm/generate.ts`).

How it was proven: the same way as the grass. The tests load the MVP in memory and call its own functions with the same inputs. For fences and water, 23 hand-made and 300 random layouts must give the same paddock and area id on every square, the same watered squares and the same distance to water, exactly. For the layout jobs, 6,000 random jobs on 40 farms are done in both and everything is compared after each one. For crops, every species at every day of its life in every month is compared, and eight mixed farms are run for 800 days each, day by day, with sowing, grazing at the wrong time, harvest and crops left standing. For the farm at the start, the MVP's random numbers are fed from a seeded stream and the engine's pieces are given the same numbers, so soil, bore, run-up pasture, fences, water, arable land and rotation come out exactly equal. Whole farms from the engine's own streams are checked by their rules on 48 farms of each start type (every paddock has a gate, water in every paddock over 2% of the farm, the 2,500 ha and 2 km water rules, arable share, one or two patches, square rotation blocks, bore position, soil range and smoothness, homestead and yards).

Tested: type check, lint, format check and all tests pass. 179 new tests, 267 in all.

As a check on the tests, 323 figures and rules in the new code were nudged one at a time. 288 were caught straight away. 35 were missed. 26 of those are now caught by added cases (for example a crop grazed on the very day it locks up, seed coming up on fallow and on native pasture, a harvest on the day the grain is ready, a rotation started on every day of a year, and farms as big as the Top End's so a paddock gets 8 waters). The other 9 can't change any result, so no test can catch them:

- Sorting an area's paddock ids, which are already in order.
- The extra link between the squares a fence hub touches, which are already next to each other.
- Stand strength on the exact day a pasture reaches its life (1 either way).
- The "before lock-up" damage rule at lock-up to the day, which the rule above it has already taken.
- Checking that a square has no planting before seed comes up, when its land use already says so.
- Checking that a planting is a grain crop before the shedding notice, when only grain crops have a maturity day.
- Keeping the standing feed when the starting rotation is sown, when the next lines set the feed anyway.
- The rule that a paddock under 2% of the farm gets no trough. The smallest paddock the fence lines can make is 3.5% of the farm.
- The rule that waters stop being added once no point is 2 km from one. The count by area is always reached first (DATA.md, Established farm layout).

Differences from the MVP, on purpose:

- No yards strip, saleyard or feedlot on the grid.
- Layout jobs carry no money. They report what was built or removed.
- Strays are not decided from where cattle are drawn. A fence change reports which grazing areas were split and joined.
- Diary lines and clock stops are events.
- Every farm gets a homestead and stock yards, from their own random stream.
- Each piece of a new farm draws from its own named stream. The MVP drew everything from one unseeded source, in one order, so an engine farm is not the farm the MVP would have made, though each piece is the same given the same numbers. The run-up's season and month factors come from the seeded seasons (`randomSeasons`), each from its own stream, where the MVP drew them in between its other numbers.
- Trees are not placed. They are only drawn, and come with the map (1.6).
- Plantings have their own id counter. The MVP shared one counter with cattle and stored planting ids in a 16-bit array, so a long game with many cattle could lose track of a new planting.

One MVP fault fixed: rotation blocks left off the arable land when they were as big as the arable land asked for (MODEL.md, section 4).

Where the docs and the MVP code disagreed in these parts (docs corrected, MODEL.md and DATA.md):

- Old sown pasture loses at most 0.045 DMD and 3.6 CP points, not "down to 0.1 and 8 points".
- Ripe grain sheds 0.2% a day from the day after maturity, as well as 3% a day from day 31.
- The grain crop ceilings (`bmax`) were missing from DATA.md.
- A crop loses an extra 1.5% of its green a day while heading and 4% a day once finished.
- A portable trough gives up the area's need divided by the number of watered squares.
- A hub on a square turns every side that is not the boundary or a gate into an open gate, fence or no fence, so it is not always 4 gates.
- Grazing before establishment damages any planting, not only perennial pasture.
- A finished annual becomes stubble 30 days after it finishes, and only on arable land. Off arable land a finished planting goes back to native pasture.
- Stubble from an unharvested crop or finished annual is max(800, dead + green), which was not written down.
- The lock-up warning is for dual-purpose crops only.
- A from-scratch farm has one old fence line half the time. DATA.md did not say so.
- Stylo's dead feed is CP 7%, and it thins with age without losing quality.

Things in the MVP that look odd, kept as they are, for Claudia:

- Tape under a new permanent or electric fence is lost, not rolled up. A gate hung in tape takes that segment of tape with it.
- Pulling down the trough on the bore is allowed, and pipe can never be pulled up.
- A fixed trough keeps giving water wherever it stands once it is in. Only placing or moving one checks for pipe.
- On an 80% arable farm the second arable patch can be boxed in by the first, so the farm comes out with a little less arable land than asked for.
- The rule that a finished crop off arable land goes back to native pasture could only come up through the MVP fault above, since crops are only sown on arable land.
- A pasture sown over part of an older pasture takes those squares from it without a word.
- The starting rotation can put a crop in the ground that is already ripe (sown up to its whole life plus 10 days ago). That crop can be harvested straight away but never gives its "ready to harvest" notice.
- A crop that has not been sown yet read "ready to harvest" in the MVP's stage text. It can't happen in play. The engine reads it as not sown.
- Some species blurbs lean towards a judgement ("Excellent for fattening", "Top-quality feed"). They are the MVP's wording, kept for now.

### 13 Nov 2026: milestone 1.2c, the whole farm

The third part of milestone 1.2: the farm as one object, the daily tick, the market, money, the actions and saves. Branch `m1.2c-whole-farm`, cut from `m1.2-cattle-and-farm` (the cattle and farm halves joined). The engine version is now 0.4.0.

Built, all in `packages/engine/src`:

- **The farm's state** (`sim/state.ts`): one object that can be saved. Pasture, crops, fences, water, buildings, mobs (each on pasture, in the feedlot or in the yards), id counters, the market, the saved state of each random stream, the year's totals and past years, the ledger of infrastructure spending, the inbox as data, the days-eaten-out count, game over, and the action log.
- **Making a farm** (`sim/create.ts`): district, size, start month and year, from scratch or running, mixed farming, difficulty. Money by the MVP's rules. A running farm gets its herd by the MVP's rules, from its own random stream.
- **The daily tick** (`sim/tick.ts`): the MVP's `stepDay`, in its order. It returns every event as data and never stops a clock.
- **Mobs** (`sim/mobs.ts`): one mob to a grazing area, where weaners go, and the seeded rule for a fence through a mob.
- **The market** (`market/`): what an animal is worth, and the MVP's price mechanism as a stand-in behind a `PriceSource` interface.
- **Money** (`money/`): every cost, the money a farm starts with, net worth by the rebuild's rule, and the yearly score.
- **Actions** (`actions/`): 29 actions, each checked and carried out by `applyAction`, which never changes the farm it is given.
- **Saves and the farm hash** (`save/`).
- **Summaries** (`sim/summary.ts`): each mob, each paddock with its stock, the whole farm, and what a calibration run reads.

How it was proven:

- **Whole farms against the MVP, day by day.** The engine makes a farm and the MVP is given the same one. Each day the MVP's own `stepDay` runs, then the engine's. After every day the pasture arrays, plantings, fences and water, every mob and every animal, cash, the year's totals, the market and the game-over counters must be equal exactly, with no tolerance. Each side must also have drawn the same count of random numbers from each stream. The MVP's draws are sent to the matching engine stream by which part of the MVP asked (its functions are wrapped in memory to mark their draws; the file on disk is never changed).
  - A running farm with its breeding herd in each of the four districts for 380 days: calving, joining, preg tests, weaning into another paddock, deaths, the new season on 1 July, and the year's end with its score and net worth. Central Queensland on its lick, the others without.
  - Breeding herds for 150 days on the other supplement (Central Queensland off the lick, Western Victoria on it).
  - Steers in each district (Central Queensland twice, on the lick and off it) for 150 days: bought in two lots, some sold, a week in the feedlot, pipe and a trough, a portable trough behind a box of tape in a dry paddock, most of the mob moved in by class and number, breakouts through the tape, the trough running low and dry and refilled once, then the mob left without water and dead on day 4.
  - A mixed Central West farm for 300 days with steers on the crops: grazing damage, three harvests and a sowing.
  - The market on its own for six years from 2024, into the random walk after 2025.
  - Game over at the bank's limit, and after 10 days eaten out, on the same day in both.
  - The starting herd on 12 farms, every cost and money figure, every valuing rule, and every paddock summary figure, each against the MVP's own function.
- **The rules as tests:** no water kills everything on day 4; breakouts only through tape and only when hungry or thirsty, one segment at a time, with the 21-day wait and the MVP's odds on both sides of each threshold; one mob to an area after 150 random fence and gate jobs in each district; fallow only after a crop and no growth on a finished crop over two years on mixed farms; the overdraft held to the cent on every job the bank is asked about; game over at the limit and at 10 days; the same seed and actions giving the same hash at every step; a year in each district with no figure that is not a finite number.
- **Saves:** a farm saved, sent through JSON, loaded and carried on every 3 days is the same farm, by its hash, as one that ran straight through for 200 days, in each district.

Where the rebuild differs from the MVP on purpose, the comparison either keeps off that path or checks the difference and brings the MVP into line: a cow dried off when her calf dies; net worth (the MVP's sum is given the engine's infrastructure figure, so the year's score can still be compared); the price of tape (checked: the MVP charged $910 more, then its cash is set level); and a fence through a mob (never done in a comparison run; tested on its own).

What could not be compared with the MVP exactly, and why:

- **Seasons.** The MVP drew them in between its other numbers from one unseeded source. In the comparison it is fed the engine's own season numbers, so both run the same seasons. The draw itself was matched in milestone 1.1.
- **A fence through a mob**, and gates shut on a mob. The MVP went by where cattle were drawn.
- **Net worth with infrastructure**, and so the profit part of a year's score when anything has been built or removed. The rebuild's rule is different on purpose.
- **Tape costs and the energiser.** Different on purpose.
- **Grazing plans.** A later milestone. No comparison run has a plan.
- **Picking cattle by class and number.** In the MVP that sort was screen code. The engine's order (heaviest steers first, lowest-condition cows first) is tested on its own. The move that follows is compared.
- **Tag numbers after a new planting or portable trough.** The MVP shares one counter. Those runs compare everything but the next tag number.

Tested: type check, lint, format check and all tests pass. 226 new tests, 706 in all.

As a check on the tests, 330 figures and rules in the new code were nudged one at a time (every cost, every market figure, the score, the breakout odds and limits, the herd rules, each ledger entry, each sort order, each line that moves money). 303 were caught straight away, 17 of them only by the whole-farm comparison with the MVP. 27 were missed. 24 of those are now caught by added tests: a sweep of farm sizes across each $10,000 step of the cash base; a class's drift at exactly 20%; tape knocked down on a line down the farm; a beast worth less than $0; a mob that got 85.5% and one that got 84.5% of its feed; the 21-day wait written as 21; tape beside electric fence; the new season on 1 July and not on the first day; the tick's events in the inbox; strays of a mob taken off the lick; herds on farms too small for 10 cows; the market stream after it opens past 2025; tape run over a fence the player built; a run that takes in fence the farm came with; cows of the same condition, heifers and bulls sold in the right order; a harvest and a farm summary on the day the season changes; a paddock summary while a crop's quality is changing; and the action log's own copy. The other 3 can't change any result, so no test can catch them:

- Utilisation of exactly 60% scores 1,000 on either side of the step.
- Empty mobs are dropped twice at the end of the day (once when mobs join, once after). The MVP did the same.
- Clearing a calf's dam when the dam is sold: her calf is always sold with her.

Two lessons came out of it (LESSONS W10 and W11): a test that reads the engine's own figure can't catch a change to it, and a made-up herd must not let two orders agree by accident.

Speed: 2.1 to 3.0 ms a simulated day with 4,300 to 4,900 head (plus calves) in three mobs on a large Central Queensland farm, run on its own. The target is under 5 ms. With the whole test suite running beside it the same test reads about 15 ms, so the test prints the figure and checks only a loose limit (LESSONS W6).

MVP faults fixed here, each with tests (BUILD_PLAN 2.4): the energiser is charged for electric fence only, once; the $10 tape fee is for rolling up and for running out tape from the roll, never on all-new tape; net worth counts only what was spent on infrastructure still in place, and falls when it is removed; sowing, removing troughs, hubs and portable troughs, and changing a supplement are engine actions; a fence through a mob uses a seeded rule.

The two chores in the same change: the lint rule that keeps the engine out of browser code now also stops relative paths into the engine's `src` and `data` (checked: it fires on `../../engine/src/...` from the renderer and on `../../../packages/engine/...` from the web components). The contact address in BUILD_PLAN section 8 is replaced with words.

Where the docs and the MVP code disagreed in these parts (docs corrected, MODEL.md and DATA.md):

- A fence or pipe segment's price is rounded to a whole dollar before it is multiplied.
- Bulls are priced by the head whenever they are bought, not only in the starting herd.
- Buying has freight: $30 a head and $100 for each cow and calf unit. DATA.md had no buying costs.
- The MVP charged the $10 tape fee on every tape job and an energiser on the first tape. DATA.md described the rule Claudia asked for, which the rebuild now follows.
- Net worth in the MVP counted the farm's starting improvements at full price, half the cost of sown pasture, and $555 of a portable trough. Only "80% of infrastructure spend" was written down.
- Animal health is charged on calves too. Interest is worked before the day's running costs come off.
- The year closes every 365 farm days. The ground cover in the score is read on the 1st of each month.
- The price series holds its first value before 2019, and each month of the random walk is rounded to a whole c/kg.
- The starting herd has floors (10 cows, 1 bull, 4 weaners) that were not written down.

Things in the MVP that look odd, kept as they are, for Claudia: listed in MODEL.md, section 8, "MVP behaviour kept as it is".

What is not done:

- **The stock yards are a stand-in.** A mob can be recorded as in the yards, and the tick gives it water and the yards' own square to graze, but no action puts a mob there. Deliveries and yard work are milestone 1.5.
- **Grazing plans.** The tick has the place for them and nothing else.
- **The market is still the approximate series.** Real prices are milestone 1.4.
- **Calibration.** The whole-farm benchmarks (steer gains, deaths, the Central West tune) are milestone 1.3. Nothing here changed a formula.
- The `realism-guardian` agent was not run by the builder of this part. It is for the reviewer before the pull request.

### 14 Nov 2026: milestone 1.3, calibration

Branch `m1.3-calibration`, cut from `m1.2c-whole-farm`. The engine version is now 0.5.0.

Built:

- `packages/engine/test-support/calibration.ts`: the MVP's steers and herds suites as runs on fixed seeds, in the average year or with the farm's random seasons.
- `packages/engine/src/calibration/steers.test.ts`: the five steer cases on twelve seeds.
- `packages/engine/src/calibration/herds.test.ts`: established herds in the four districts on eight seeds and two start months: deaths, preg tests, gain.
- `packages/engine/src/calibration/crops.test.ts`: Central West barley and wheat yields, and steers on oats.
- `packages/engine/src/calibration/density.test.ts`: 500 head on 4 ha moved daily in each district, and the same mob left on one cell.
- `packages/engine/src/calibration/speed.timed.ts`, `vitest.speed.config.ts`, `pnpm test:speed` and a CI step: the speed benchmark on its own.
- **The Central West tune:** peak green digestibility 0.70 to 0.68 (`data/districts.ts`). The MVP copy used by the comparison tests is given the same figure in memory (`REBUILD_TUNES` in `test-support/mvp.ts`), and loading stops if the MVP file no longer holds 0.70.

Results, with before and after, are in CALIBRATION.md. Lessons K1 to K5 are in LESSONS.md.

**The milestone's done condition is not met as the build plan words it.** Every benchmark is a test and the Central West tune is in, but four benchmarks pass only on a reading that is Claudia's to decide: steer bands held on the average of twelve blocks, Central Qld with lick 1 kg over, the oats figures held to one fortnight, and herd deaths counted over all herds together. The `realism-guardian` check found that the first write-up stated those readings as settled. They are now marked as proposed, in the tests and in CALIBRATION.md.

One existing test changed: `cattle/simMob.test.ts`, "500 head on 4 ha, moved on to the next 16 ha". It said the 16 ha runs short within four days. In Central West it is now five, because the feed is a little less digestible and the steers eat a little less of it. The test now finds the day and holds it to four (five in Central West).

PRD defaults used: none new.

Not done:

- Several moves a day and a long walk at whole-farm level, real dry and wet years, and the 180-day run (BUILD_PLAN section 3). They need grazing plans, walking times and real weather (milestones 1.4 and 1.5).
- Central Qld with lick is 1 kg over its band in the average year. Not tuned. Listed for Claudia in CALIBRATION.md with ten other questions.

### 13 Nov 2026: milestone 1.4a, real data pulled (groundwork for 1.4)

Built:

- `scripts/data/pull-mla.mjs` and `scripts/data/pull-silo.mjs` (`pnpm data:mla`, `pnpm data:silo`). One request at a time, every answer cached in the untracked `.data-cache/`, so a stopped run carries on and a second run fetches nothing twice.
- Tables in `packages/engine/data/raw/` (23 files, 4.2 MB) with a `manifest.json`, and a test that checks every table against it.
- `docs/DATA.md` has a new "Real data sources" section with the credit lines, licence notes, dates, row counts and gaps.

Pulled:

- SILO weather, all four districts, 1 Jan 1990 to 12 Nov 2026, in four requests.
- MLA: seven national cattle indicators from 1996 (2003 for the feeder ones), the restocker yearling steer indicator at Gracemere, Armidale, Dubbo and Mortlake, and cattle yardings and sale days at those four yards.

Not done, and why:

- The MLA pull is about one fifth done. The service gives 100 rows a page and a yard's indicator has a row for every day, so the full list is about 7,000 requests. About 7 in 100 requests also failed on MLA's side and had to wait. The pull was stopped after about 105 minutes with the most useful series in hand. Left to pull: the National Young Cattle Indicator, the six national sheep indicators, the other yard indicators, sheep yardings, and the fill-in yards (Emerald, Inverell, Ballarat). The list and sizes are in `DATA.md`.
- Nothing is wired into the engine. The mapping from indicators to the game's classes, the fill-in rules for missing years and the soil-water growth factor are milestone 1.4.

Found on the way (for 1.4):

- Gracemere has no sale days on the service before 8 Nov 1999 or from 17 Aug 2004 to 9 Oct 2014, and its restocker prices start in October 2014. Mortlake has nothing before 29 Jan 2018.
- Feeder steer and heifer indicators start in June 2003.
- Armidale's own restocker steer indicator has no rows from June to November 2026 though the yard kept selling. A yard series can go quiet while the yard is open.
- The last three days of SILO evaporation are long-term averages until the observations arrive.

Questions for Claudia:

- The brief named Emerald, IRLX Inverell and CVLX Ballarat as nearby yards to fill short histories. They are not in the PRD or the build plan. Are they the right ones? Armidale's own history is long, so Inverell may not be needed.
- Are the four SILO grid points where the district's weather should be taken from (town or airport)? They came from the brief and were not checked against a map here.
- Should the rest of the MLA pull (about 6 to 9 more hours at a polite pace) run in one go, or only the series milestone 1.4 turns out to need?

### 13 Nov 2026: milestone 1.4b, growth from real weather

Built, all in `packages/engine`:

- `season/weatherTable.ts`: a district's daily weather as plain data, and a reader for the text of a SILO table that stops on a missing day, a blank or negative figure or a date out of order.
- `season/weatherGrowth.ts`: the soil-water tally, the growth index, and the scaling that turns it into a growth factor averaging 1 in every calendar month of 1997 to 2025.
- `season/realYears.ts`: the real years a game can play, a plan for playing them in order or shuffled from the farm's seed, and the real date behind each farm day.
- `season/weatherSeasons.ts`: the second `GrowthFactorSource`. It gives the month factor, a season factor looking back 365 days, the season label, and the real rain for a day.
- `server/weatherFiles.ts`: the one place the engine package reads a file. Server code and tests import it as `@gg/engine/server`. Lint now stops model code from importing `node:fs` or this helper.
- `averageYear` in `season/factors.ts`: both factors 1 every day, the standard that calibration runs are judged against.
- `growGrass` and every calibrated formula are untouched.

How it was tested:

- 747 tests pass: the 558 from before, and 189 new ones in `packages/engine/src/season`.
- The month factor averages 1 for every calendar month of 1997 to 2025 in all four districts, to better than one part in a billion.
- The real `growGrass` was run for each whole year of 1997 to 2025 in each district and for the average year, from the same starting pasture. The 29-year average is within 2.2% of the average year with no stock and within 3.8% with a steady daily take. The run, year by year, with the five driest and five wettest years by SILO rain, is in `CALIBRATION.md`.
- Compared with the AussieGRASS shire series for the four districts (rank correlation of the years: 0.60 Central Queensland, 0.61 Northern Tablelands, 0.97 Central West, 0.56 Western Victoria).
- 38 nudge checks: 36 caught at once, one after a test was added, one that changes nothing. Three more by lint.
- `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm format:check` pass.

Defaults used (each one line to change):

- A game year is the 12 months from the farm's start month. With years at random, the change of year falls on the farm's anniversary, so a growing season is never cut in two.
- In order, after the newest year the game goes back to 1997.
- At random, every year is played once before any comes round again, and the first year can be picked or drawn.
- The pasture run-up uses the real weather before the start, lifted to 85% of average if it grew less (the MVP's rule, LESSONS 7).
- Earliest real year 1997 (PRD section 21, row 32).

Not done, and why:

- **Not wired into a game.** `generateFarm` and the daily step still take whatever source they are given. Nothing chooses the weather source for a real-year farm yet, and the dates passed to `growGrass` still come from the farm's own calendar. That is the same date in order, until the years run out and the game goes back to 1997. After that, and at random, it is the same month and day in another year, which is all `growGrass` reads.
- **The engine version was not bumped** (still 0.3.0), to keep clear of the other 1.4 branches, as 1.2a did. Bump it when 1.4 is joined.
- **The calibration suites (milestone 1.3) have not been run on real years.** They are not built yet. The run here is grass only, with no cattle.
- **Temperature is not in the factor.** A warm winter or a cold spring grows the same as an average one.
- **The SILO credit line has not been changed** to say that figures are worked out from the data. The wording is Claudia's call (`DATA.md`).
- **The AussieGRASS licence is not confirmed.** The figures are used for checking only and are not in the engine.
- **`realism-guardian` was not run.** It runs before the pull request.
- Not looked at on a screen. There is nothing to see yet.

Found on the way:

- Sown pastures and crops are multiplied by the same month factor as native pasture. That is why the ceiling stays at the MVP's 1.9.
- AussieGRASS spreads the year's growth differently from the district curves in places (Armidale: 72% from September to December, against the curve's 47%). The curves were not touched.
- AussieGRASS has Central Queensland at about half of average in 2003, 2004 and 2020, each after very dry years. The weather factor has no memory of last year. The pasture a player carries has.
- The merge of the cattle and farm branch with the real data branch left two lessons numbered R5.

Questions for Claudia:

- **The soil.** One soil of 100 mm for all four districts, picked against AussieGRASS. The comparison leans to a smaller soil for Western Victoria and a larger one for Central Queensland. Should each district have its own, and what water-holding figures would you trust for each?
- **The ceiling.** Rain out of season can lift growth to at most 1.9 times the curve for that time of year. So a wet Central Queensland winter and spring (1998, 2022) grows little, and about a third of Central Queensland days sit at the ceiling. Is that how those years went? Raising the ceiling for native pasture only is possible, but it is a change to how the factor is used.
- **Starting after a dry time.** Should a farm that starts on 1 January 2003 start on the pasture the 2002 season really left, or on the lifted run-up (at least 85% of average) as built?
- **Years at random.** Is the farm's anniversary the right place to change year? And should the first year be the player's pick or a surprise?
- **In order, after the newest year:** back to 1997, or stop?
- **Season labels.** The six labels are the MVP's, "Drought" among them, set by the last 12 months' growth (under 60% of average is "Drought"). Are the edges right, and is "Drought" a fair word for the label?
- **Western Victoria** varies least (year factors 0.71 to 1.25, and a season factor under 0.8 on 9% of days). Does that match the district?
- **The dry and wet year tables** in `CALIBRATION.md`: do the years you remember look right?

### 14 Nov 2026: milestone 1.4, real years wired in

Engine 0.6.0. Engine work only, no screens. Branch `m1.4c-real-years-wiring`, on top of `m1.4-real-years`.

Built, all in `packages/engine` unless said:

- **A farm can play real years.** `createFarm(options, env)` takes `years: { kind: 'real', order: 'in-order' | 'random' }`, with the first year in `start.year` or left out. Left out, or `{ kind: 'random' }`, is the MVP's random seasons with the stand-in market, unchanged. The farm keeps its order, first year, the years that could be played, a data version and today's prices (`farm.seasons`, `farm.market`).
- **One way for the engine to get the tables** (`real/realData.ts`, `server/realDataFiles.ts`). The server builds one bundle with `loadRealData()` from `@gg/engine/server` and passes it as `data` in the `env` of `createFarm`, `stepDay`, `applyAction` and the summaries. Model code still reads no file, and a save holds no table. A real-year farm with no bundle, or one of another data version, stops with an error and nothing changes.
- **The real market** (`market/priceTable.ts`, `realPrices.ts`, `realMarket.ts`): the second `PriceSource`. MLA's six cattle indicators mapped to the game's eight classes, the district yard's own figure where it has one, the national figure times the yard's premium where it has not, and a stand-in for the two feeder indicators before June 2003.
- **Inflation** (`market/cpi.ts`): past prices in today's dollars by the Consumer Price Index, with one switch. The ABS table is in `data/raw/abs/`, pulled by the new `pnpm data:cpi` (`scripts/data/pull-cpi.mjs`).
- **Real sale calendars** (`market/saleCalendar.ts`, `data/yards.ts`): for each district's cattle yard, whether there is a sale on a real date and of what type, with a weekly stand-in for the stretches MLA has nothing for. `saleDayOn` and `nextSaleDay` answer for a farm day.
- **The calendar.** The date the game reports is the real date. On a real-year farm the year closes when the real year ends (365 or 366 days), and the year's record carries its real year. A farm with random seasons still closes every 365 days.
- **Calibration on real years** (`test-support/realYearSteers.ts`, `realYearHerds.ts`, and one small test file a case in `src/calibration`): the 1.3 steers and herds suites through every start year from 1997 to 2025, on the wired-in farm.
- The save format is now 2. A format 1 save loads as it is.

How it was tested:

- 1,417 tests pass in 63 files: the 1,219 from before, and 198 new ones.
- **A farm with random seasons is unchanged.** Every test from before passes with no expected figure changed. The only edits to old tests are five places that now say which market they read (`asStandIn`), and one type cast.
- **Seeded and repeatable.** The same seed, options and data give the same farm hash. A second bundle built from the same tables gives the same farm. Save, load and carry on equals running straight through, on four real-year farms (in order and at random, over a year end, with buying and selling), reloading every 7 days for 480 days.
- **Failing loudly.** Stepping, acting on and summing up a real-year farm with no bundle each stop with an error and leave the farm hash as it was. So does a bundle with one rain figure changed.
- **Prices.** Every class has a price above 0 on every day from 1997 to 2025 in all four districts. The fill-in rules are each tested either side of their figure on made-up tables (19 and 20 head, 14 and 15 days, 729 and 730 days, 21 and 22 days). The yard premiums and stand-in multiples are pinned.
- **The CPI.** All 147 quarters match the Reserve Bank's table G1 to two decimal places (checked by hand on the day, not by a test). Six figures are pinned in a test.
- **Sale days.** Every day in each yard's sales table is a sale day in the calendar with the same head, and no other day is unless it is a stand-in.
- **Calibration.** 435 steer runs and 232 herd runs. The tables and what the tests hold are in `CALIBRATION.md`.
- **42 break-it checks** across the new code (a figure or a rule changed, the tests run, the change put back): 41 failed a test at once. One did not: leaving the class prices out of the CPI lift, with the indicator still lifted. The wiring tests compared the farm's prices with the same function that makes them. `market/realMarket.test.ts` now works the lift out from the CPI figures written in the test, and the check fails (LESSONS W10 again).
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:speed` and `pnpm format:check` pass.

PRD defaults and builder's defaults used (each one line to change):

- Earliest real year 1997 (PRD section 21, row 32). Years in order or at random, picked at setup (PRD 5.14).
- **Inflation: prices in today's dollars by the CPI.** PRD section 21 gives no default, so this is the brief's. "Today" is fixed at the September quarter 2026. `REAL_PRICE_DOLLARS` switches it.
- The mapping from indicators to classes, and its four multiples (weaners 1.08, bulls 0.906 of cows, calves 1.10), carried from the MVP's own spread.
- Fill-in figures: a yard row needs 20 head, holds for 14 days, and a yard series needs 730 usable days. The premium is worked out over 1997 to 2025.
- The feeder stand-in before June 2003: a multiple of the geometric mean of the restocker and heavy steer indicators.
- Sale day stand-ins: a prime sale every Monday at Gracemere and Mortlake where there are no records, none from 16 December to 7 January.
- A real-year farm's scored year is the real year. Running costs are still a 365th a day.
- Any change to any table a district reads changes its data version, and a farm will not run on another version.
- With no first year given: in order starts in 1997, at random draws the first year from the seed.

Not done, and why:

- **Nothing uses the sale calendar yet.** Buying and selling are still instant. Booking stock onto a sale and delivery are milestone 1.5, as the brief said.
- **Sheep prices and sheep sale days** are not read. The tables are pulled and listed, and the bundle has room for them.
- **Moving a running farm to new data** is not built. Until it is, a new pull stops every running real-year farm. That is a server milestone decision. The data versions are pinned in a test so a pull can't slip through.
- **Daily Farm's "today" prices and weather** (fetched daily) are not built. This is past years only.
- **The MLA credit line and the CPI credit line** are in the manifest and the docs. Nothing shows them on a screen yet.
- **The calibration suites were run in order only**, on three steer blocks and two herds a year. Years at random are tested in the wiring tests, not in the suites.
- **The real-year herd test does not hold the 1.5 to 3.6% deaths benchmark.** It first did, and failed on the Northern Tablelands (3.7%), because two herds are too few. It now holds real years against the same herds' average year (LESSONS Y2). The lead should look at this.
- **The eight capital cities wording for the CPI series was not confirmed.** The ABS service labels the series "Australia". The figures match the Reserve Bank's "Consumer price index; All groups".
- **Whether MLA's indicator weights were the same back to 1997** was not checked. The sheet read is dated December 2024.
- **`realism-guardian` was not run.** It runs before the pull request.
- Not looked at on a screen. There is nothing to see yet.
- No more MLA or SILO data was pulled. The fill-in yards are not used.

Found on the way:

- A yard's own figure jumps from week to week with who turned up. Dubbo restocker steers read 114 and then 58 c/kg two days apart in October 2002, on 136 and 81 head.
- Mortlake's restocker steer and heifer rows are too few to use (182 and 371 usable days) and read about 20% under the national figure.
- Gracemere sold on Mondays to August 2004 and on Fridays when its records start again in October 2014. The day it sold on between is not in the data.
- The season label is for the 12 months as a whole, so it can read "Below average" on a year in which unsupplemented steers lost 41% (LESSONS Y6).
- Central West is the district the real years move most: four of 29 years lose steers heavily when nothing is done.

Questions for Claudia:

- **The class mapping** (`DATA.md`, "Real prices: indicators to classes"). Is each class on the right indicator? In particular: weaners at 1.08 times the restocker yearling figure, heifers of 280 kg and over on the feeder heifer figure, and bulls at 0.906 of the cow price when sold.
- **Yard or national?** The yard's own weekly figure jumps about. Should a district play its yard's figure as it is, or the national figure shifted by the yard's usual premium, which is smoother?
- **Western Victoria's young cattle** play on national prices, because Mortlake's own rows are too thin. Is that acceptable, or is Ballarat wanted?
- **Central Queensland before October 2014 and Western Victoria before 2018** play on national prices times the yard's later premium. Is that acceptable, or are Emerald and Ballarat wanted?
- **Today's dollars.** Should past prices be lifted by the CPI, as built, so a 1997 sale reads about 200 c/kg and not 90? The other choice is the prices of the day, with the game's costs left at today's level.
- **Sale days where there are no records:** Mondays at Gracemere from 1997 to 1999 and from 2004 to 2014, and at Mortlake before 2018. Do you know the days those yards really sold?
- **The dry and wet years.** Do the steer and herd tables in `CALIBRATION.md` look right, year by year? Central West from April 2002, 2006, 2018 and 2019 first.
- **Central West with nothing done** loses 5 to 54% of set-stocked weaners in its four worst years. Is that the right size?
- **Western Victoria** never drops under its band, even from April 2006. Is that right?
- **The season label** reads the whole 12 months. Should it lean on the last few months?
- **A 366-day year** costs one more day of overheads than a 365-day year. Leave it?
- Still open from 1.3 and 1.4b: what a band is held on, the soil, the ceiling, and starting after a dry time.

After the realism check (same milestone, before the push):

- **Fixed: a real year was scored on the next year's prices.** The year closed after the market had moved to the next day. With years at random, or in order after the newest year, that day is another real year. The year now closes on its own last prices and the next opens on its own first prices (`sim/tick.ts`, MODEL.md section 1A). Tested in order past 2025 and at random.
- **Fixed: thin national price rows were used.** The 20-head rule covered yard rows only. National rows under 20 head are now passed over, in the daily figure, the yard premiums and the feeder stand-ins. The stand-in multiples moved to 1.0169 and 0.9990. The premiums are unchanged to three places.
- **The real-year herd deaths test now holds the band** (1.5 to 3.6%) on six herds over the years with fair weather, in place of only comparing two herds with their own average year.
- Each fix was taken out again to confirm a test fails without it.
- More questions for Claudia, all written up in CALIBRATION.md (real years, CHECK 8 to 10) and DATA.md: how a farm's data version should work once Daily Farm fetches data every day; which quarter "today's dollars" should be; whether a farm starting in 1997 can pay its way; and how the 1 July "new season" message should read on a real-year farm, where it reports the 12 months just gone.
- Known gap, older than this change: the lint rule that keeps the engine out of browser code covers `apps/web/components` and `packages/render`, not `apps/web/app`. Nothing in `apps/web` imports the engine today. It is closed properly in milestone 3.2, when the browser build is tested to hold no engine.

### 14 Nov 2026: milestone 1.6a, map core

The first half of milestone 1.6: the map itself and the numbers it is drawn from. Branch `m1.6a-map-core`, cut from `m1.4-real-years`. Not wired into `/play`: the game screens are milestone 1.7.

Built:

- **The farm view.** A `FarmView` type in `packages/shared` and `farmView()` in the engine (`sim/view.ts`, a new file; no existing engine file was changed but for one export added to `index.ts`). It carries what the map draws and nothing about the rules: for each square its land use, height, green share, cover, leaf age, weathering, seed heads, neutral label, planting, diet energy, recent grazing, distance to water and arable flag. Then fences by line, gates (open or shut, with a `kind` ready for the three gate types), pipe, troughs with their level, hubs, the bore, a buildings list (homestead and yards now; sheds, silos and feed bins later), paddocks, grazing areas, plantings and mobs. Cattle are counted by kind, with how many look thin and fat. Each mob has a seed for the map, made from the mob's id alone. An optional `jobs` list is typed for the next milestone. The view for a farm with 4,141 head is 42 KB as JSON.
- **The map** (`packages/render`, PixiJS 8). `createFarmMap(host, options)` gives a handle with `setView`, `setLayers`, `setTheme`, `setTimeOfDay`, `setWeather`, `setHighlight`, `fitFarm`, `zoomTo`, `panBy`, `centreOn`, `squareToScreen`, `resize`, `bench`, `stats`, `destroy`, and `on('tap' | 'hover' | 'camera')`. Touch: one finger pans, two pinch. Mouse: drag and wheel at the pointer. Keyboard: arrows, plus, minus, 0.
- **Clear map zoomed out, detail zoomed in**, as `docs/VISUALS.md` now sets out in its new last section: each square one colour raised by its grass height and one marker for each mob zoomed out; grass tufts built from each square's figures and individual cattle zoomed in.
- **Art drawn in code** behind a sprite registry of 54 named sprites. Any one can be swapped for exported art with `registry.replace(name, image)`.
- **Layers** (water reach, pasture quality, recently grazed, arable land, pipe, labels), **time-of-day light**, **weather** (clear, overcast, rain), **reduce motion**, **both themes** from one palette file.
- **Side-view pasture pictures** (`drawSward`, `swardParts`, `swardCaption`), plain canvas, loadable without PixiJS from `@gg/render/sward`.
- **Two small changes outside the map:** `.prettierignore` now leaves out `apps/web/dev-fixtures/map` (the fixtures are written on one line each to stay small), and the root `package.json` has the `dev:map-fixtures` script. `next dev` writes an `apps/web/AGENTS.md` for coding tools. The project does not need it, so it was left out of the repo.
- **A builders' page** at `/dev/map`: pick a farm, a screen size, layers, theme, time of day, weather, and read the bench. It lazy-loads the renderer and reads fixture files. In a production build it returns 404 unless `GG_DEV_PAGES=1`. It is not in the sitemap, is marked noindex, and `/dev` is in the robots file.
- **Fixtures:** `pnpm dev:map-fixtures` builds 13 farms with the engine and writes their views to `apps/web/dev-fixtures/map/` (views only, 0.5 MB in all): the four districts small and large, from scratch and running, a mixed farm with a ripe crop, fallow and stubble, a dry season, a green season, tape cells with a portable trough, gates, a hub and a length of tape lying down, and the 4,000 head farm.

How it was tested:

- 1,474 tests pass: the 1,219 from before with no expected number changed, and 255 new ones. 31 on the farm view (it holds only the fields listed in the test, is plain JSON, is the same for the same farm, changes when a paddock is grazed, a fence built or a mob moved, carries no seed or random stream state, and is under 64 KB with more than 4,000 head). 141 on the renderer's arithmetic: the camera and its limits, taps to a square and a paddock (against the raised squares when zoomed out), level of detail, where cattle stand, layers, light, the grass drawing rules, the ground picture, the sprite sheet and the palette. 83 that run the renderer's placement and grass code over every fixture.
- **Cattle against grass:** the dark outline or the pale rim stands out at 3 to 1 or better (the WCAG figure for graphics) against every ground and grass colour the map can draw, at midday, first light, last light, under cloud, in rain, and in rain at first and last light. Labels and markers hold 4.5 to 1 in both themes.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm format:check` and `pnpm build` pass.
- **The production build was checked by hand:** `/dev/map` and its fixture route return 404 with no flag and 200 with `GG_DEV_PAGES=1`. PixiJS is in 7 lazy chunks (490 KB before compression) and in none of the scripts the home page, `/play` or even `/dev/map` load first.
- **Looked at in a browser** (the in-app browser pane, Chrome): Western Victoria small, Central Queensland large and 4,000 head, the mixed farm, the dry season, the green season and the tape cells farm; at 375 by 667, 667 by 375, 812 by 375 and about 1,024 by 768; dark and light; zoomed out and in to the closest zoom; the water reach and pipe layers; first light with rain. A tap opened the paddock with its split crop and pasture pictures. Screenshots were taken but the pane cropped and scaled them unevenly, so they were not kept.
- **Frame rate was not measured.** The browser pane was a background tab, which the browser holds to about one frame a second. What was measured, in the production build on the build PC at 664 by 768: the processor time for a frame with all 4,409 beasts and 22,664 grass pieces drawn was 0.2 ms in the middle, 1.0 ms at 95% and 3.2 ms at 99%, with one first frame of 288 ms. With a wait for the graphics card after every frame it was 12.6 ms in the middle and 19.5 ms at 95%, but that wait alone was 7 to 12 ms on a nearly empty map in that tab, so it is an upper limit and not a frame time. A whole new farm's view took 29 to 92 ms to apply. Nothing was measured on a phone.

Defaults used (each one easy to change):

- Level of detail switches at 26 pixels a square (PRD 7). The fade is in time, about a fifth of a second.
- Zoom from the whole farm to 96 pixels a square. Held upright the farm fills the height.
- A cow is about 0.42 of a square long. Grass of 90 cm stands 0.62 of a square, taller than the cattle, so height reads.
- On open country a mob stands on four squares in ten of its area at most, three to a square. On eight squares or fewer it uses them all, six to a square. Past that it is sampled.
- Cattle stand 0.3 of a square back from a fence at the side and 0.55 below one.
- Pixel ratio capped at 2, stepping down by a half when 45 frames in a row have a middle time over 25 ms.
- Ambient motion (the windmill turning, the bore's ring pulsing) is off unless asked for, so a still map draws nothing.
- Brahman colours for Central Queensland and British-breed colours elsewhere, by class.
- PRD section 21 defaults: none new.

Not done, and why:

- **Not on a real phone, and frame rate not measured** (above).
- **Trees:** the model has none, so none are drawn. The sprite is there.
- **The bore's gold ring and pointer were not seen:** every fixture farm starts with a trough on the bore, so the case never came up. The code is there.
- **The profit layer, the selected mob, picked animals, the Harvest, Mark calves and No water buttons, the fence drag preview and snap dots:** these belong to the game screens and tools (1.7). The view carries what the buttons need (`ready` on a planting, `toMark` and `noWater` on a mob) and the map gives screen positions for them.
- **Cattle walking and grazing, the ute, time-lapse, frost, dust, heat haze, storm clouds:** the second half of 1.6.
- **Half-built fence lines:** the view has a `jobs` field for them. Nothing draws it yet.
- **The day's weather is not in the view.** `setWeather` is set by hand. The season code was being changed on another branch, so it was left alone.
- **The overview inset** for a phone held upright (PRD 6.1) is a game screen item.
- **Hover** was not tried: the browser pane has no mouse-over.
- **`realism-guardian` was not run.** It runs before the pull request.
- Lighthouse was not run. No website page changed.

Packages added: `pixi.js` 8.23 in `@gg/render` (the map, PRD 14.2). `pixi-viewport` was not added: the camera is 200 lines of tested arithmetic of our own. pnpm reported "agent skills awaiting approval: pixi.js". They were not approved or used.

Questions for Claudia:

- **Big mobs.** Is a sample right for a big mob in a big paddock (a marker with the true count, and up to three cattle a square on four squares in ten), or do you want every beast drawn and the paddock full of cattle?
- **Where a mob stands.** It gathers round the square it was put on, which is usually the trough. Should it follow where the model says they grazed lately?
- **Grass taller than cattle.** Rank grass at 90 cm is drawn about twice a cow's height, as the MVP and the mockups did, so height reads. Too much?
- **Cattle colours.** Black cows, dark brown heifers, red steers with white faces, grey bulls and brown calves in the south. Pale grey cows, cream heifers, red steers, dark grey bulls and fawn calves in Central Queensland. Right for each class?
- **The pale rim round cattle.** It is what keeps a black cow readable on dark ground. Does it look right to you, or too much like a sticker?
- **Labels.** They hang under the paddock's top fence. On a small paddock the label is the name in full and a coloured dot, and a paddock too narrow for that gets no label. (The first build cut the name to its number, which REQUIREMENTS rules out.)
- **Trees.** Do you want them back as decoration, or only once the model has shade?
- **A knocked-down fence** is a steady red line with a "!" marker, not flashing. Is steady enough to catch the eye?

After the realism check (same milestone, before the push):

- **Fixed: the side-view figures gave formulas away.** The paddock's side-view figures were sent to the kg and the tenth of a cm, with raw rankness and leaf age. The check worked the height and leaf-reach rules back out of one test farm exactly. They are now rounded to what a paddock sheet shows (kg to the nearest 10, whole cm, whole %), leaf age is in ten steps, and rankness is replaced by a seed-head share worked out on the server. The view's version is now 2.
- **Fixed: green at the base and seed heads were not drawn zoomed out.** The front of a raised square now shows a green band under a straw band, and a square with seed heads carries pale flecks. Tested.
- **Fixed: the short paddock label was a bare number.** It is now the name in full and a dot, or no label on a very narrow paddock.
- **Recorded in VISUALS.md:** the builder's decisions that were not marked as such, and a list of what the map does not do yet (the fence tool's map side, clicking a knocked-down fence, the farmer, the phone hint, night contrast, speed on a phone).
- **For Claudia:** the "Short" label is the same colour as danger.
- **Joined to the real-years line:** the view now reports the real date and the light for that date on a real-year farm.

## Ideas raised but not built yet

- An "overgrazed" judgement based on grazing pressure combined with rest periods (graze short is fine with a long rest).
- More stubble nuance (preference, nutritive value by crop).
- Touch / phone testing.
