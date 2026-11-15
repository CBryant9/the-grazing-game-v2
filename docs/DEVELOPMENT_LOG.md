# Development log

How The Grazing Game got to where it is, round by round: what Claudia asked for, what was built, and what was learned. Artifact version numbers refer to the published page at https://claude.ai/artifact/KpkSthPfYtYf7uPVpXVVva.

**Where to look first.** The stage reports are in `docs/STAGE_REPORTS.md`. The one list of every call made for Claudia is `docs/CALLS_FOR_CLAUDIA.md`. Running the live site is `docs/RUNBOOK.md`; the launch requirements and their proof are `docs/LAUNCH_CHECK.md`. The final branch is `m7-final`.

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

- Performance is not a steady 100 on the landing shell. First-load JavaScript is 141 KB compressed, over the PRD's 100 KB budget for website pages. Most of it is the framework's own runtime. Dealt with for the public pages in milestone 5.4: they send no script (LESSONS R1).
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

### 14 Nov 2026: milestone 1.5a, the clock

Engine 0.7.0, save format 4. Engine work only, no screens. Branch `m1.5a-the-clock`, on top of `m1.4c-real-years-wiring`. The first part of milestone 1.5 ("The working day").

This entry describes the milestone as it ended. It was built once with driving, a homestead, contractor bookings and jobs that carried over from day to day, reviewed, and then made much simpler on Claudia's decisions of 14 Nov 2026 (REQUIREMENTS.md, "14 Nov 2026: the working day made simpler"). What changed on the way is under "After the review" below.

Built, all in `packages/engine`:

- **The farm clock** (`sim/clock.ts`). Every day runs from first light to last light for the district town, on the date the game reports (the real date on a real-year farm). The farm keeps today's first and last light and the light used. Looking never moves it. With the light used up no job starts, and the refusal says so.
- **Job times** (`data/jobTimes.ts`): one table of the figures in PRD 5.4 that are still in the game, each marked Decided, Proposed or Builder in the code and in DATA.md. A job's time is its work only.
- **One path for the job card and the job** (`day/act.ts`, `day/spec.ts`). `previewAction` gives the card and `applyAction` does the job. Both run the same function, so they can't disagree.
- **What fits today.** A job done in one go is done if it fits in the light left and refused if it does not, with how long it takes. A line of fence, tape or pipe is built as far as its whole pieces fit, in the order drawn, and charged for that much. The card gives the pieces that fit and the pieces that do not, the reason "You don't have enough time to do this today", and a flag when the job uses up the rest of the day. Nothing carries over.
- **Buying, sowing and harvest** take none of the day and happen at once.
- **Next day and skips** (`day/days.ts`): `endDay`, and `skipDays` for a week, a month, a year or a number of days. A skip stops for everything the MVP stopped its clock for. Both return a summary of facts.
- **Things to do** (`day/look.ts`, `thingsToDo`): a read-only list for the banner and the mob card. A mob with no water, a portable trough low or empty, calves to mark, a crop ready, a fence down. Weaning is not listed: the model weans a drop by itself when it is due. Each is a fact with the mob or the place and a count, and names the action that deals with it.
- **Evening** (`clockView`): says when the light is used up, and when less is left than the shortest job needs, so a screen can dim the farm and light up Next day.
- **The time of day** is on every job in the action log, on a `job-worked` event, on a mob's arrival and on each inbox message from a job.
- **The instant path** for the calibration suites and the MVP comparisons: `applyInstant`, not exported, reached only by test support.
- **The homestead is gone. The stock yards stay**, where they were.
- **Saves:** format 4. Older saves load.

What was not changed: no grass, cattle, crop or price formula or figure. The daily tick has one new last step (the clock goes back to first light). How a mob grazes is untouched. The figure for the age at which the model notes calves for marking (60 days) was given a name so the things-to-do list reads the same figure. Its value is the same.

After the review (14 Nov 2026):

- The review of the first cut found four defects: a card that showed all of a job's work done on a job that had not taken effect; driving inside a line under-charged; a contractor booked inside the sowing window arriving outside it; and the instant path reachable through the public `applyAction`. Each was fixed with a test that failed first (LESSONS D7, D8, D10, D11).
- Claudia then took out driving and the drive home, the homestead, contractor bookings, routes through gates and jobs in progress. The first three defects went with them. The fourth fix stands.
- **Taking the homestead out moved nothing else.** The yards were placed two to five squares from the homestead, from their own random stream. The homestead's square is still drawn, and thrown away, so the yards of every farm stand where they did. Checked on 480 farms against the generator as it was (yards, fences, water, pasture and soil all equal), and three yards squares from before are pinned in a test.
- Marking's time counts every calf at foot (it counted bull calves only).
- "Looking is free" is tested against every function the index exports that takes a farm, not a list picked by hand.
- A real-year farm saved in format 2 loads, gets its real date's light, and carries on.

After the second review:

1. `startDay` is no longer exported from the engine index. It resets the day's used light, so a caller could have switched the daylight limit off. A test checks the index leaves out `startDay`, `applyInstant`, `tryAction` and `recordAction`, and the lint guard now names all three of the last. `day/act.ts`, which puts them behind the clock, has the one exception.
2. The `calves-to-wean` item is gone from things to do. It listed calves from 90 days, the youngest the model allows, so it showed for months. The model weans a drop by itself at about 280 days.
3. `calves-to-mark` shows only when there are bull calves of 60 days or more. Young bulls stay on the item as a number for information and no longer make it show.
4. Marking, weaning and selling have no muster. A 4,000 ha paddock made each of them take a whole day. Marking is 2 min per calf, weaning 30 min and 0.5 min a head, selling 60 min and 1 min per 10 head.
5. Switching a supplement on takes none of the day. The 30 minute figure is kept for Daily Farm feeders.

Questions for Claudia from the second review:

- (a) Husbandry now has no mustering time: right?
- (b) On a 12,000 ha farm one permanent fence segment is about 340 m and takes 68% of a day, so it is one a day, and none once a third of the day is used. On 6,000 ha a day builds 480 m and on 4,000 ha 392 m. Should permanent fence scale with the farm?
- (c) Things to do does not list a crop to lock up or grain shedding, though the model raises both. Add them?
- (d) Does a contractor's fence run carry on day after day (Stage 2)?

How it was tested:

- 1,546 tests pass in 70 files: the 1,424 from before the milestone, and 122 new ones in seven files under `packages/engine/src/day/` and in `farm/generate.test.ts`. Type check, lint, format check and the speed test pass (2.65 ms a day with 4,895 head, limit 5).
- **Calibration and the MVP comparisons are unchanged.** They act through the instant path. The edits to existing tests are: the name of the function they call; the homestead taken out of two generation tests and one rules test; and nothing else.
- **The clock:** a winter day in Western Victoria (10 h 42 m on 1 June) has less working light than a summer day in Central Queensland (14 h 18 m on 1 December), and the same pipe job gets 30 squares done on the first against 41 on the second. A real-year farm in order from 2025 takes its light from 1 January 1997 on day 365.
- **Job times:** every figure is written out in a test, and each action's time is checked against figures written in the test.
- **A long permanent fence:** 1,800 m drawn again each day takes four days at 500, 500, 500 and 300 m, and ends up the same fence, ledger and cost as one built at once. Tape and electric put the same line up in 36 minutes and 1 h 48 m.
- **A job done in one go:** a move with 21 minutes left fits and the mob moves. With less light than it needs it is refused and nothing changes. Across eight kinds of job and 57 amounts of light, every job that was done had all its work done and every one that was not was refused with the reason.
- **The card and the job agree** for all 29 kinds of action (34 cases).
- **Skips** stop for a mob with no water (before and during), a portable trough low (before) and dry (during), a crop ready, the year's end, and game over at the bank and from feed.
- **Saves:** save, load and carry on after every step of a 14-day run equals running straight through. Saves in format 2 and format 3 load, and a mob in the yards stays there.
- **Break-it checks:** 60 changes were tried on the final code (change a figure or a rule, run the working-day, save and generation tests, restore it). 59 failed a test at once: all 18 figures in the job times table that an action uses (each failed a test of what the job does, as well as the two tests of the table itself), and 41 rules, among them what fits today, the order a line is built, each thing that stops a skip, the real date, old saves, the yards moving, each item on the things-to-do list at its edge, and the instant switch put back on the public action (the review's fourth defect). One was missed: tape that is down was not on the things-to-do list, because only electric fence was tested. It now has a test and fails. For the review's first three defects the tests were written first and 11 of them failed before the fixes went in. Those defects then left with travel and bookings. The changes were chosen by the builder who wrote the tests, so this is weaker than it sounds: the review found four faults that 53 earlier break-it checks had not.

PRD defaults used (section 21): row 5 (job times in one data file and DATA.md), row 13 (first light to last light), row 14 (electric 1 km an hour, tape 3 km an hour), row 16 (the proper gate's hour). Row 4 (travel) and row 34 (fences longer than a day) are overtaken by Claudia's decisions.

Figures and rules the builder chose are in DATA.md, "Job times": one figure marked Builder (opening or shutting a gate takes none of the day) and 17 rules. The four that matter most are what "500 m a working day" means, whole segments only, a job longer than a day's light, and that the bank must cover the whole line.

Not done, or not verified:

- **No screens.** Nothing here was looked at on a phone.
- **The `realism-guardian` agent was not run** on this change, and there was no Lighthouse run (no page changed).
- **A mob's grazing is not split at the time of a move.** The times are recorded.
- **Buying is still straight into a paddock.** Sale days, and delivery into the yards for the player to move out, are the next part.
- **Daily Farm:** nothing specific was built.
- **Farm hands and contractor fencing** are Stage 2.
- The VISUALS and mockups docs still show a homestead and a "job in progress". They were not touched.
- First and last light as clock times lean on the machine's time zone database. The minutes of light in a day do not.
- CALIBRATION.md has no new run: no model formula or figure changed and the suites pass as they were.

Questions for Claudia:

1. **"500 m a working day."** Built: a working day is that day's light, so a whole day on the fence is 500 m in June and in December, and other jobs come off it. Or is it a pace by the hour?
2. **Whole segments only.** A line is built one map square's side at a time, so on a big farm a day of permanent fence can be one 340 m segment, with the rest of the day's light left for other jobs. Right, or should the last segment be built in part?
3. **A job longer than a day's light.** Built: a job longer than the day's light can be done at first light, before anything else that day, and takes the whole day. With the muster taken out this only affects a very big mob (weaning 2,000 head is 17 h 10 m). Right?
4. **The bank** must cover the whole line as drawn, though only today's part is built and paid for. Right?
5. **Electric fence pace.** PRD 5.4 has single-wire electric at about 1 km an hour (built). The mockup's job card shows 650 m in 4 h 20 m, which is 150 m an hour. Which?
6. **Taking things out.** The PRD has no times. Built: as long as putting in (a gate 1 h, a trough or hub 3 h, fence at its building pace). Moving a fixed trough: 3 h.
7. **Opening or shutting a gate** takes none of the day. Right?
8. **Weaning's "0.5 min per head":** every head in the mob (built), or each calf?
9. **Marking's "2 min per calf":** every calf at foot (built), or only the bull calves that are marked?
10. **Selling's "1 min per 10 head":** calves at foot counted (built)?
11. **Buying takes none of the day** now that there is no trip to the saleyard. Right, until sale days and delivery are built?
12. **"The line stops drawing when the day is used up" and "the part that fits is built, the rest shows red"** are built as one thing: the engine gives the split and a "uses the rest of the day" flag, and the screen draws the red and says the words. Is that how you meant them?
13. **A year's skip started part-way through a year stops at the year's end** (the MVP stopped its clock there). A month is 30 days and a year 365. Right?
14. **Evening** is called when less than 15 minutes of light is left (the shortest job, moving a mob). Right time to dim the farm?
15. **Things to do** lists five kinds of fact. Should anything else be on the banner (no bull with the cows, a sowing window open, low condition)? They were left off because they are closer to advice than to a job.
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
- Joined to the farm clock (1.5a): the homestead is gone from the view and the map, the yards stay, and the view's version is 3.

### 14 Nov 2026: milestone 1.5b, sale days and the yards

Engine 0.8.0, save format 5. Engine work only, no screens. Branch `m1.5b-sale-days`, on top of `m1.6b-map-on-clock`. The second part of milestone 1.5 ("The working day"). The rules as built are in docs/MODEL.md, section 9, "Buying and selling on sale days".

Built, all in `packages/engine`:

- **A sale calendar for every farm.** `saleDayOn` and `nextSaleDay` work for a farm with random seasons too: a weekly prime sale on a set weekday for its district, none from 16 December to 7 January. A real-year farm reads the yard's real days, as before. `marketView(farm, env)` is the read-only view for a screen.
- **Buying only on a sale day.** On any other day the buy is refused with the next sale named. On a sale day the money is spent at once and the cattle arrive in the stock yards at first light the next day, joining the mob already there if there is one. Until then they are on the books (`farm.arrivals`) at what was paid. `thingsToDo` lists `in-yards` for a mob there, with its head and days there. The player moves it out with `moveMob`.
- **Selling books onto the next sale** on a day with no sale. Nothing is paid and the stock stay and graze. At first light on the sale day the booked stock still on the farm sells at that day's price with the usual costs. `cancelSale` takes stock off. The selling time is spent on the day the player asks.
- **First light is one function** (`day/dawn.ts`), called by `endDay` and `skipDays` for each new day. The daily tick is untouched. A skip does not stop for a sale day. The period summary reports `arrived` and `bookedSold`.
- **Saves:** format 5. `farm.arrivals` and `farm.saleBookings` are saved and hashed. Older saves load with none.
- Net worth counts cattle on their way at what was paid.

How it was tested: `day/saleDays.test.ts` (23 tests) covers the calendar for both kinds of farm, the refusal and the card, the buy, the landing, the yards item and moving out, two buys in one mob, a sale day and a booked sale worked out with the engine's own valuing function, a booked animal that died, cancelling, skips against stepping, save and load at every step, the instant path, and looking being free. `marketView` is in the "looking is free" list in `day/clock.test.ts`. Existing tests that bought or sold on the clock on a day with no sale were changed to do it on a sale day, or to expect a booking (`day/jobs.test.ts`, `day/jobTimes.test.ts`, `day/clock.test.ts`, `day/saves.test.ts`, `sim/realYears.test.ts`). No expected figure in the calibration or comparison suites changed, and they pass untouched. Break-it: 18 changes to a rule or a figure were made one at a time (a sale weekday, the Christmas break, buying on any day, the arrival day, net worth, landing, joining the yards mob, selling the booking, booking on a sale day, double booking, selling time, skips and Next day leaving out first light, cancelling by tag, older saves, the days in the yards, the clock path, a lost animal). Each made a test fail. One did not at first (double booking by tag number), so a test was added. Each was put back.

Not done:

- Cattle left in the yards need nothing yet: no hay, and no rule that they go hungry (PRD 5.13 proposed "after one day").
- Store and prime sales are not told apart: any sale day takes any cattle, and a real-year farm's store-only days count as sale days.
- Nothing limits the head that can be booked, and no commission differs for a booked sale.
- No screens: the market, the yards item and the booking mark are for Stage 1's game screens.

Questions for Claudia:

1. **Buy only on a sale day, or any day?** Built: only on a sale day, with the next one named. Or any day, with the cattle arriving the next morning?
2. **Book a sale ahead, or sell only on the day?** Built: on a day with no sale the stock is booked onto the next one and sold at first light that day at that day's price, and can be cancelled. Or only sell on the sale day?
3. **Should cattle left in the yards need hay?** PRD 5.13 proposed "after one day". Built: they have water and graze the yards' own square, and nothing else.
4. **The weekdays for farms not playing real years.** Built: Central Queensland Wednesday, Northern Tablelands Thursday, Central West Thursday, Western Victoria Monday, each the day its yard sold on most recently. Right?

### 14 Nov 2026: milestone 1.5c, grazing plans and the play test

Engine 0.9.0, save format 6. Engine work only, no screens. Branch `m1.5c-plans`, on top of `m1.5b-sale-days`. The third part of milestone 1.5 ("The working day"). The rules as built are in docs/MODEL.md, section 10 (plans) and section 9 (the small fixes).

Built, all in `packages/engine`:

- **Part A, four small fixes.** `cancelSale` counts only animals still on the farm, as `marketView` does, and is refused with a reason when none of the named stock is still booked. The `in-yards` item in `thingsToDo` says the yards have water and almost no feed (`hasWater`, `feed: 'almost-none'`, `grazingHa`), with no change to the tick. The job card's `booking` part says nothing is paid now and the price is set on the sale day. MODEL.md section 9 notes that a skip does not stop for an arrival or a booked sale.
- **Part B, grazing plans, as in the old game.** A plan is a template: legs of paddocks in order, a rule (every N days, down to 4 moves a day, or grazed down to X kg DM/ha with an optional day limit), and rounds, then repeat or stay. A mob runs a template from a step. Actions `setPlan`, `pausePlan`, `resumePlan` and `clearPlan`, all free. The plan moves the mob in step 8 of the daily tick and during skips. A plan that moves several times a day gives the cattle step the day's stops (`stopsToday`). A move by hand pauses the plan. The one fault fixed (BUILD_PLAN 2.4): rounds count only when the mob moves, so a plan stuck at a stop with no water counts nothing. A plan that can not move (the next paddock has no water) says why (`plan-waiting`), is listed in `thingsToDo`, and stops a skip once for each stop, as the old game's clock did. A plan that moves into a paddock with another mob joins the two, as the old game did. `plansView(farm)` reads every plan for the screens. Plans are saved, hashed and upgraded from older saves.
- **Daylight.** The moves a plan makes by itself take none of the day, as in the old game. Putting a mob on a plan's stop (`setPlan`, `resumePlan`) is a move when the mob is not already there: it costs the ordinary move time (15 minutes and 1 minute for each 100 head) and needs the light.
- **Part C, the 180-day play test.** Three scripted players (absent, careless, ordinary) in `test-support/players.ts`, run on running medium farms in each district on two seeds. `day/players.test.ts` asserts only what must hold. The table is in docs/CALIBRATION.md, "14 Nov 2026, milestone 1.5c: 180 days with three kinds of player". No player ended the game early, and no mob went a day without water.

How it was tested: `sim/plans.test.ts` (26 tests: the actions and every refusal, a move by hand and a resume, moves on Next day and in a skip, several moves a day, the light a move takes, waiting for water and for another mob, finishing, `plansView`, saves part-way through a plan and from an older format, hashing, joining mobs) and `sim/plans.mvp.test.ts` (13 tests against the old game's own plan code run in memory: a rotation every 3 days for 120 days in Central Queensland and Western Victoria, the "grazed down to" rule in the Northern Tablelands and the Central West (the day limit, the weekly note, and moving each day), 4, 2 and 2-with-a-dry-stop moves a day, a plan that runs out of rounds (stay and repeat), a move by hand with a resume from a step and a clear, and the no-water case). Every pasture array, every animal, where each mob is, and the plan's stop, days on it, waiting, moves, rounds and feed eaten are equal with no tolerance every day. In the no-water case the engine differs only in the round count, which the test leaves out of the comparison and then asserts (the old game counted a round every day it was stuck, the engine none). What was added to the old game's in-memory hook: `normPlan`, `perDayOf` and `planStep` in the whole-farm hook (`test-support/mvpWhole.ts`), a plan comparison in `farmDifferences`, and `mvpSetPlan` and `planFarm` in `test-support/plans.ts`, which does what the old game's `commitPlan` does without its dialog code. Nothing under `reference/` was changed. `day/players.test.ts` (14 tests, about 11 seconds). Existing tests changed: the version and save-format asserts (`day/saves.test.ts`, `day/saleDays.test.ts`); the two exact-match asserts for the `in-yards` item and the booking card, which now have the new fields (`day/saleDays.test.ts`, plus one new test for `cancelSale`); the list of exported reads (`day/clock.test.ts`, which now has `plansView` and `stopsToday`); and four new action cases in the card-and-job test (`day/jobs.test.ts`, 30 kinds of action became 34). No expected figure in the calibration or comparison suites changed, and they pass untouched. All 1,886 tests pass (1,832 before), with `pnpm typecheck`, `pnpm lint`, `pnpm test:speed` and `pnpm format:check`. Break-it: 26 changes to a rule or a figure were made one at a time (the days rule a day late, the kg rule the wrong way, the day limit a day late, the days on a stop counted from today, rounds counted while a plan waits, another mob not stopping a move, no water not stopping a move, one move too many a day, the day's stops one stop on, the light going below zero, the move time 10 minutes, a plan that always repeats, a leg's rounds one late, a paused plan still moving, a move by hand not pausing, a resume not restarting the stay, a step ignored when setting a plan, a skip not stopping for no water, feed eaten in the report, an older save without plans, a joining mob losing its plan, the tick not running plans, a cancel counting animals that are gone, the yards item's feed, the booking card's price). Each was put back. 25 made a test fail. One did not: things to do listing a paused plan as waiting. That check can not be reached, because pausing a plan clears its wait, so no test can tell. It is left in as a guard.

Not done:

- A plan move says nothing about the crop in the area the mob moves onto (the old game asked first only when the player moved a mob by hand).
- No farm hand does plan moves (Stage 2), and no screen shows a plan, the plan card or "Run today's plan" (Stage 1's game screens).
- The old game's water check when a plan is saved is a dialog. The engine gives `dryAreas` on `plan-set` for a screen to ask.

After the review (a second pass on the same branch):

- **The "wait if another mob is there" rule is out.** It was a new rule added while porting, and it broke a plan that moved several times a day (it grazed paddocks it was then refused entry to) and made a second mob's plan impossible to set on a normal farm. A plan that moves into a paddock with another mob now joins the two, through the ordinary joining, as the old game did. The bigger mob keeps its name and its own plan, or takes the mover's if it has none. A plan set or resumed says up front which of its stops hold another mob now (the paddock, that mob's name and head, on the event and on the job card). LESSONS P4.
- **Setting or resuming a plan is a move** when the mob is not already on the stop: the ordinary move time, through the same clock path, refused with the plain reason if the light does not cover it. Free if the mob is already there.
- **A plan's own moves take none of the day.** The first build took the move time off the day's light, and it only lowered the reported light. LESSONS P5.
- **The plan report carries kg gained**, worked out from each animal's weight before and after the mob's day, since the cattle step is not changed. It agrees with the old game's figure to 1e-6 kg (not to the bit); every other plan figure agrees with no tolerance.
- **Comparisons with the old game added:** a plan that moves into the paddock of a smaller and of a bigger mob and they join, two mobs both on plans, and the "grazed down to" rule at 1,500 kg DM/ha where the paddock crosses the figure part-way through a stay (Western Victoria and Central West). The comparison of two runs of the same new code was removed.
- **The play test:** the ordinary player's plans now move (25 moves on the seed 1 farms, 50 on the seed 2 farms, none waiting at the end), the test holds a floor against a broken run, fails if a run is missing, and has the new columns. `GG_PLAYERS_RUN=1 pnpm exec vitest run packages/engine/src/day/players.test.ts` prints the table. The CALIBRATION.md entry has the table again, the ranges of the differences as the table has them, and "Why nobody went under in 180 days".
- Break-it for the review changes: 8 changes (a plan move not joining, setting a plan not joining, the old wait put back, setting a plan free, a join losing the mover's plan, kg gained left out, the card leaving out the joins, a plan move taking light again). Seven made a test fail. The last did not: the clock is reset when the day ends, so a deduction during the tick can not be seen afterwards. It is why the deduction was cosmetic.

Questions for Claudia:

1. **Join or keep apart.** When a plan reaches a paddock with another mob in it, built: the two mobs join, as the old game did (the bigger keeps its name and plan). The other way is to keep them apart, so a plan waits. A rotation needs a spare paddock then: on a running farm there are as many mobs as paddocks with water. Which?
2. **Plan moves and daylight.** Plan moves take none of the day's light, as in the old game. PRD 5.15 proposed they use the farmer's daylight. Which?
3. **Setting or resuming a plan** costs the ordinary move time if the mob has to be moved to the stop. Right?
4. **Editing a plan** resets the round and the waiting state of every other mob on it (a mob whose step is gone goes back to the start). Right?
5. **The feedlot.** A move to the feedlot ends the plan, where any other move by hand pauses it. The old game ended the plan on every move by hand. Should the feedlot pause it too?
6. **A move by hand pauses the plan** (the old game ended it). It is resumed from any step, or cleared. Right?
7. **The limits** in DATA.md (up to 8 legs, 30 stops in a leg, 20 plans, 0.25 to 60 days, 300 to 5,000 kg DM/ha). The old game had none, and clamped a low figure up to 300 where the engine refuses it with the reason. Is that right?

### 14 Nov 2026: milestone 1.7a, the play screen foundation

Branch `m1.7a-play-shell`, on top of `m1.5c-plans`. The engine and the map renderer are not changed. This connects them: a small game server inside the web app, the setup flow, and the first playable screen.

Built:

- **The game server** (`apps/web/server/game/`, every file starts with `import 'server-only'`). It owns farms: create from the setup choices, load, preview, apply, Next day, skip. Farms are kept as files of the engine's save format under `apps/web/.farms/` (git ignores it, or `GG_FARMS_DIR`), behind a three-call store interface (`get`, `put`, `delete`) so a database can replace it, with a small in-memory cache and one request at a time for each farm. One farm for each guest session: a random session id in an HTTP-only, same-site (Lax) cookie. The farm's file name is a one-way hash of the session id, so a session can only reach its own. The browser names a job only (a key from the things to do, or a short list of simple actions). The server finds the action, checks it with the engine, and saves. A request from another site is refused, bodies were limited to 4 KB (32 KB since milestone 1.7c, for long lines), and there is a light in-memory rate limit. Every response is `no-store`. A bad request is a 400 with one plain sentence.
- **The snapshot** is built by `snapshot.ts` from the engine's reads into hand-written wire types in `lib/game/types.ts` (browser-safe, no engine import). Top-level keys: `version`, `farm` (name, district, setup in words, no dollars), `day`, `date`, `season`, `totals`, `clock`, `view` (the `FarmView`), `todo`, `market`, `plans`, `mobs`, `paddocks`, `inbox`, `over`. It never holds the farm state, the seed, random streams, price series, data tables, the action log, or anything about days to come. A test walks every snapshot and fails on any key from a deny list. The one allowed use of the word `seed` is the map's placing number in `view.mobs[]`, which the shared type defines as coming from the mob's id alone. A farm with 4,143 head gives a snapshot of 45,606 bytes (the limit is 150 KB).
- **Routes** under `app/api/game/`: `setup` (GET, the choices and real hectares), `farm` (GET the snapshot, POST create, DELETE start over), `preview`, `act`, `day`, `skip`.
- **The setup flow** at `/play` for a visitor with no farm: district, size, enterprise (with the arable and cropped step for mixed), years, start, difficulty, name, then a summary. Cards are real radio buttons. Back works on every step. No dollar figures. Mode and stock are left out. Every option and figure comes from the server.
- **The play screen**, one set of components in three layouts (phone upright, phone on its side, PC), chosen by `useLayout`: the map (PixiJS loaded lazily, follows the theme and the time of day, tap opens a paddock), the top bar with the date, season, cash, a slim daylight bar with a short note and Next day, +1 week, +1 month, +1 year, the evening state (the map is lit for dusk and Next day is highlighted, with no words), things to do with the job card and the result on the same row, the day or skip summary card, the tabs (only Farm works, the rest say "Coming soon"), a sheet container (bottom sheet, full screen on a phone on its side, a side panel on a PC) with a simple paddock sheet in it, a quiet busy bar, and a plain message with a retry for a lost connection or a server error.
- **Zustand** holds the snapshot and the screen's state. Every action goes to the server and replaces the snapshot.
- **`pnpm check:browser-bundle`** searches `apps/web/.next/static` for nine engine-only terms (`dmdMax`, `frostSen`, `dmdDead`, `cpMax`, `predictGains`, `settleDeaths`, `lossDays`, `calvNote`, `gen:herd`). It also checks each term is still in the engine source, that the scan found a string the browser does hold, and that no source maps were published. It is in CI after the build.

Packages added to `@gg/web`: `zustand` (the screen's state) and `server-only` (so a server module can not be pulled into browser code by mistake). `@gg/engine` is now a dependency of the web app and is compiled with it. `next.config.ts` also traces the engine's data folder into the game routes for a hosted build.

How it was tested: `server/game/game.test.ts` (21 tests: the setup choices and their checks, create, one farm to a session, scratch and mixed farms, a real-years farm, preview then apply with the same card, a refusal that changes nothing, running out of light, Next day, skips, save and reload giving the same snapshot and the same next day, two sessions unable to reach each other's farm, quick taps run one at a time, the action checker, the deny list and that the walker catches a leak, plain JSON, and the 4,143-head size). `server/game/routes.test.ts` (11 tests: the routes themselves with a real file store: the cookie flags, bad bodies, no farm, another site refused, start over, the rate limit). `lib/game/store.test.ts` (9 tests: the job flow, a refusal on the row, errors with a retry, busy and a second tap ignored). `lib/game/format.test.ts` (6 tests). All 1,933 tests pass (1,886 before), with `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build` and `pnpm check:browser-bundle` (28 files, nine terms, none found; a planted file holding `dmdMax` made it fail). A production build was started and a real-years farm created and skipped through the real routes, to check the engine finds its data tables in a built server. The built `/play` and home page HTML were read: none of the eight chunks that hold PixiJS is in the scripts either page loads up front (`/play` loads about 605 KB of JavaScript before compression, the home page about 570 KB).

What was looked at in a real browser (the pane's browser, not a phone): phone upright 375 by 812 in the light theme (setup steps, the play screen, the paddock sheet, Next day and the summary card, a thing to do through card, working and result, the evening state with Next day highlighted), and in the dark theme (evening); 360 wide with the banner and the sheet open, no sideways scroll (measured by script); phone on its side 812 by 375 in the light theme in the evening, with the whole farm fitted; PC 1280 by 800 in the light theme, and in the dark theme with a paddock open in the side panel; a lost connection (fetch made to fail) giving the plain message, and Try again working; a year skip. A script checked the text contrast of everything visible outside the map in both themes with the banner and the sheet open: nothing under WCAG AA. Not looked at: phone on its side in the dark theme, the game over card, the mixed-farm setup step, a keyboard-only run, and pan and zoom by touch or pinch (only a mouse click on the map was tried). The map's own text was not part of the contrast check.

Not done:

- The other tabs (Market, Herd, Paddocks, Plans, More) say "Coming soon". The paddock sheet is simple: name, hectares, label, feed, green, height, water and the mobs. The full sheet is the next piece.
- Moving a mob, buying and selling, building, and the bell and inbox are not on screen. The snapshot carries the market, plans and inbox for those screens.
- Setup cards have words and no pictures yet.
- Starting a new farm is only offered on the game over card (the More tab is not built). The DELETE route is there for it.
- No accounts or database: a guest's farm lives in a file on the machine running the app, so a hosted deployment needs the database first.
- Lighthouse was not run.

Questions for Claudia:

1. **The start month.** Setup has no month step, so every farm starts on 1 September (random seasons start in 2026, real years start from 1997). Right, or should the player pick?
2. **Marking calves.** The Mark calves banner counts bull calves of 60 days or more, but the job marks every bull calf and young bull in the mob. The banner now says "old enough to mark" and the job card says it covers every bull calf not yet marked. Should the job mark only the old enough ones?
3. **When the farm goes dark.** The map is lit for dusk as soon as less light is left than the shortest job needs (15 minutes), even if last light has not quite come. Right, or only at last light?
4. **Phone panels.** On a phone held upright the paddock sheet covers the bottom 58% of the map. Is that the right size to start?

### 14 Nov 2026: milestone 1.7b, the paddock sheet and the mob card

Branch `m1.7b-paddock-and-mob`, on top of `m1.7a-play-shell`. Nothing under `packages/engine/src` or `packages/shared/src` is changed. One small addition to the map renderer (below).

Built:

- **The paddock sheet** (bottom sheet on a phone, side panel on a PC). Quick view: name, hectares, the neutral label, feed on offer in kg DM/ha, the side-view picture with its caption (`drawSward`, `swardCaption`, `swardParts` from `@gg/render/sward`, no PixiJS), water in words (with why it matters when there is none) and the mob in it with head. A paddock that is part crop and part pasture shows two pictures side by side with their areas. Details open with one tap: green share, height, green and dry feed, ME (MJ/kg), CP %, ground cover, growth on the last day, stocking now in AE and DSE and per hectare, days of feed, and what the soil carries over the long term in DSE/ha. The one action is "Move a mob here".
- **The mob card**, opened from the paddock sheet, the things-to-do banner or the Herd tab, never by tapping a cow. Quick view: where it is, head and calves, AE and DSE, average weight, CS and daily gain (before the mob's first day, weight and CS come from the animals). A plain "Why" note when the mob is losing weight, short of feed or without water, built on the server from the engine's own reasons (`predictGains`, which carries `gainWhy`'s reasons): not enough feed, low ME, CP under 7%, milking, late pregnancy, just short, no water. Details: head by class with weight and CS, intake in kg DM/head/day and as % of live weight, diet ME and CP, PTIC, a joining fact, stock booked for the next sale.
- **Husbandry, one button each, done where the mob is:** Mark calves, Wean, Sell (a group and a number, held to the head free to sell), Move, the supplement switch (None, Lick, Hay, Pellets, each with its daily price for this mob), and Cancel sale. Each button asks the server for the job card first and shows it right there: "takes about 40 min" (to the nearest five), cost or money in, light left, then Confirm or Cancel, then the result right there. A refusal shows its plain reason. A button for something that cannot be done is disabled with its reason beside it. Selling on a day with no sale says the stock go down for the next sale, with its date, nothing is paid now and the price is set on the day. A supplement shows "costs about $N a day while it is on" and takes none of the day.
- **Moving cattle, "pick the paddock, done".** From the mob card ("Move") or the paddock sheet ("Move a mob here"): pick the mob if it is not picked, then tap the paddock on the map or pick it from the list. The map tints and outlines the paddocks that can be picked, red where there is no water (`setPickable`, new, see below). The job card notes a paddock with no water and a mob already in it ("The two mobs will join"), before Confirm. Part of a mob is a class and number picker (`moveCattle`; calves go with their mothers). Then the tool ends and the result stays on the screen until dismissed. Cattle in the stock yards: the things-to-do item has a "Move out" button that opens the same flow, and an "Open mob" button.
- **Lists.** The Herd tab (name, where, head, CS, daily gain; sort by name, head, CS or gain) and the Paddocks tab (name, hectares, label, feed, mob; sort by name, hectares or feed). Rows are buttons, readable at 360 px. Market and Plans stay "Coming soon".
- **The snapshot** gains, for each mob: classes, intake, why, PTIC, joining fact, supplement and its options with daily prices, booked head and date, mark and wean counts with reasons, sell groups with head free to sell. For each paddock: DSE, AE/ha, growth, carrying capacity, and a square the move action names. Things to do carry the mob they are about. A 4,143-head farm gives a snapshot of 48,526 bytes (the limit is 150 KB). The deny list is longer (it now also rejects `threshold`, `weights`, `dmd`, `dist`, `rule`, `forecast` and others) and a new test checks that no string in the snapshot says "should", "overgrazed" or has a dash aside.
- **Server.** `parseAction` accepts `sellGroup`, `setSupplement`, `moveCattle` and, with the farm, `cancelSale` (the browser names only the mob; the server finds the booked animals). Job cards carry move notes (water, join) and, for a supplement, the daily price. `doneWord` has words for a move, a join, a supplement, a booking, a cancel and a sale. The engine's `landOf` is not exported, so `mobs.ts` builds the same land from `surveyOf`, `plantingsNow` and the farm (the engine's `dietOf`, `intakeOf` and `predictGains` do the work).
- **Renderer.** `FarmMap.setPickable(paddocks | null)` and `packages/render/src/pickable.ts` (a pure list of outlines, tested). `setHighlight` was not enough: it takes one paddock.

How it was tested: 1,987 tests pass (1,933 before). New: `mobwords.test.ts` (each reason sentence, the why, the joining fact, move notes, done words, no banned words), `mobcard.test.ts` (the mob and paddock wire, the supplement card, a move that joins two mobs, a part move, a refused move, booking onto the next sale and cancelling, a refused cancel, a refused mark, the new action checks, the strings check), `lib/game/lists.test.ts` (sorting, the sell picker's limits, the move picker), store tests for the mob card and the move flow, `pickable.test.ts`. `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build` and `pnpm check:browser-bundle` pass.

What was looked at in a real browser (the pane's browser, not a phone): the PC at 1280 by 800 in light and dark (paddock sheet with its details, mob card, wean, supplement switch, move from the mob card and from the paddock sheet with the join note, the result); phone upright at 375 wide (Herd list, mob card, a sell with its booking card, confirm and cancel, the supplement switch, a part move picked by tapping the map, light and dark); 360 wide in light and dark (no sideways scroll, measured by script, for the lists, the mob card, the paddock sheet and the move tool); phone on its side at 812 by 375 (the move tool beside the tabs). A script checked text contrast of everything outside the map in both themes at 360 and at 1280: one failure (the mob row on the paddock sheet in dark, 4.35 to 1) was fixed and re-checked. Not looked at: a keyboard-only run (every control is a real button, input or select with the page's focus ring, but nobody tabbed through it), the mixed-farm two-picture paddock sheet (it is drawn by the same `swardParts` call and was not on screen), a paddock with no water (none in the start farms; the words are tested), phone on its side in the dark theme, touch.

Not done:

- Buying and selling by class across the farm (`sellClass`, `sellAnimals`) is the Market tab's job, and Plans is still "Coming soon". Fencing and water tools are the next piece.
- The map outline for the selected paddock is faint on a farm of two paddocks (most edges are the farm fence). The move tool's tint is clear. Worth a look with real art.
- A mob that is split by a part move gets a new name ("Mob 4") from the engine, and the result says so.
- Lighthouse was not run.

Questions for Claudia:

1. **Why note when a mob is only not gaining.** It shows for any mob under +0.05 kg/head/day on pasture, not only a mob that is losing. Right?
2. **Sell groups.** The picker offers the engine's groups (Steers, Heifers (empty), Heifers (PTIC), Cows (PTIC), Cows (not in calf), Bulls). Calves are not offered because they go with their mothers. Right?
3. **Figures in the words.** The paddock sheet says cattle with no water die on the fourth day (the banner already did), the milking reason gives MJ a day, and the joining note says week N of 9. Are exact figures like these fine to show, or should they be vaguer (rule 14)?
4. **Mark calves.** Question 2 from 1.7a still stands: the card says "bull calves and young bulls to mark", and the job marks all of them, as the engine does.

### 14 Nov 2026: milestone 1.7c, the build tools

Branch `m1.7c-build-tools`, on top of `m1.7b-paddock-and-mob`. Nothing under `packages/engine/src` or `packages/shared/src` is changed. No new package or outside service.

Built:

- **The map learns about lines** (`packages/render`). `lines.ts` (pure, no PixiJS, also served as `@gg/render/lines`): the nearest fence segment and the nearest grid corner to a point at any zoom, the path a drag makes along the grid (the long way first, then the short way; dragging back undoes; a second drag from either end extends), the same for squares of pipe, the run of tape a segment rolls up with, and whether a corner joins a fence. `draft.ts` (also `@gg/render/draft`): the draft overlay as data, with the styles `ok`, `late` and `remove`, styled from the server's job card, and the snap dots. In `map.ts`: `setTool`, `setDraft`, `groundToScreen`, and the events `drag`, `toolTap` and `fenceTap`. The draft and the hover are two Graphics layers on top, redrawn on their own, so drawing never rebuilds the map. In a drawing tool one finger or the left button draws; two fingers, the space bar or the middle button pan. Look is as before.
- **The tool bar** (`BuildBar`): Look and Fence (permanent, electric or tape, each with its price a metre and what it does), Gate, Pipe, Trough, Portable trough, Water hub (on a corner or on a square) and Remove. A compact bar that opens on a phone; at the top of the side panel on a PC. One line of help for each tool. Prices and help lines come from the server's snapshot (`build`). Cancel, Look and Escape go back to Look, and so does every finished job.
- **Fence and tape.** Drag along the grid, extend by dragging again from an end. The page asks for the job card at most about three times a second, newest answer only (`lib/game/latest.ts`). The part that fits is the line's colour and the part that does not is red. The card beside the line (floating on a PC, above the tool bar on a phone) says the length, the cost, the time lightly, then "You don't have enough time to do this today." with the metres that fit and the metres that do not, and "This would use up your full day." Build puts up the part that fits (the engine builds it from the whole line; the red part is not remembered). If nothing fits, all of it is red and Build is off. A refusal shows the server's reason on the card.
- **The other tools,** each preview, card, confirm, result, back to Look: Gate (tap a fence for a gate; tap a gate to open or shut it, with the paddocks it joins and that the mobs join if both hold stock; also from a Gates list on the paddock sheet), Pipe (drag over squares), Trough (tap a square; a trough away from water gets the engine's reason; tap a trough to move or take it out), Portable trough (place, move, refill, sell back), Water hub, Remove (fence, tape rolled up, gate, trough, hub, portable trough). A knocked-down fence: tap it in Look, or use "Put it back up" in the things to do, which opens the same card and marks the fence.
- **Server.** `server/game/build.ts` checks every build action (whole numbers in range, lists of at most 400, known fence kinds). `buildwords.ts` writes the tool help, prices, the line sentences, the gate sentences and what a done job reports ("Built 482 m of permanent fence. It cost $3,377."). The job card carries the pieces that fit and do not fit, with metres, and the words. The request body limit went from 4 KB to 32 KB for long lines.

How it was tested: new tests in `packages/render` (`lines.test.ts`, `draft.test.ts`: segment and corner hit-testing at 12, 26, 60 and 96 px a square, the path a drag makes, tape runs, the overlay styles from a job card, snap dots), `lib/game` (`latest.test.ts`: the throttle and stale answers; `taps.test.ts`; `buildstore.test.ts`: drawing, the red part, a job that cannot start today, stale answers, confirm and refusal, snapping back to Look; `linecard.test.ts`) and the server (`build.test.ts`: the action checks, a short tape line, a permanent fence longer than the day with only the part that fits built, a refusal, a gate with its notes, pipe from the bore then a trough, a portable trough sold back, tape rolled up; `buildwords.test.ts`). `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build` and `pnpm check:browser-bundle` pass (see the final counts in the report).

What was looked at in a real browser (the pane's browser, not a phone, on a scratch farm, drawing with scripted pointer events because the screenshot tool crops the pane): the PC layout (1024 wide pane) in light: a tape line drawn and built, a permanent fence longer than the day (brown turning red, both messages, only the 482 m that fit built), a gate put in and the open card, pipe from the bore then a trough on it, a portable trough set down and sold back, a fence taken down. Phone upright at 375 and 360 wide: the bar, the card above it, no sideways scroll (measured), every bar button at least 44 px, a drawn electric line. A script checked text contrast in the bar and card in light and dark: nothing under 4.5 to 1 (it approximates the translucent bar over a plain background). Not looked at: phone on its side, the dark theme by eye, a real touch, a keyboard-only run, the pipe's red part, hub placement, and a knocked-down fence on screen (none occurs on a fresh farm).

Not done:

- Drawing a fence or pipe by keyboard. The tools and the card buttons are reachable and have focus rings, but the line is drawn with a finger or the mouse.
- Half-built lines and pegs on the map (still the working day's piece). (The farmer and the ute were listed here too. Driving was reversed on 14 Nov 2026, so they are not to be built.)
- Moving a square water hub, and taking out a square hub as one job (Remove takes out a trough or a corner hub).
- The card on a PC sits beside the end of the line and can cover part of it.
- Lighthouse was not run.

Questions for Claudia:

1. **Pipe on a phone.** Pipe squares are 15 to 40 px wide on a phone zoomed out. Should the tool zoom the map in for her, or is pinching first fine?
2. **The default fence.** The bar starts on electric. Right?
3. **Gate sentence.** Opening a gate says "The mobs in them will join if both hold stock." Is that the wording she wants, given joining is automatic?
4. **Remove.** Removing a fence gives nothing back and is free (the engine's rule). Is that intended, or should a permanent fence pay something back?

### 14 Nov 2026: milestone 1.7d, market, plans, crops and the inbox

Branch `m1.7d-market-and-plans`, on top of `m1.7c-build-tools`. Nothing under `packages/engine/src` or `packages/shared/src` is changed. No new package or outside service.

Built:

- **Market tab.** Prices, Buy and Sell. The top says whether there is a sale today or names the next one. Prices lists the eight classes the game sells in, with c/kg live weight, $ a head for a typical beast (the middle of the class's sale weight range, or the farm's own calves) and the change since the first day on the chart. A plain SVG chart shows the last month of prices the farm has lived (a class can be shown or hidden, each line has its own dash). Real-year farms show the MLA credit line under the prices. Buy: pick a class and a number, Check the buy, then a card with the total with freight, the head price, "They arrive tomorrow morning in the stock yards" and what is left in the bank, then Confirm. With no sale it is off with the engine's reason and the next sale named. Sell: by class across the farm or by mob and group. On a sale day the card gives the money after selling costs. On another day it says the stock go down for the next sale, with its date, that nothing is paid now and that the price is set on the day. Booked stock is listed by mob with a Cancel for each.
- **Plans tab.** Each plan with its paddocks in order, its rule in words, rounds, what follows, and each mob on it: step, round, running, paused or waiting with the reason, what it will do next, and its report. Make or change a plan on the farm tab: pick the mob, tap paddocks on the map in order (numbers sit over the map) or pick them from the list, pick the rule and figure, the rounds, and the step to start from. The card shows the move now, that it takes none of the day, any stop with no water and any stop that holds another mob. Pause, Resume from a step and Clear. A plan paused by a manual move says so. The day card now says when a plan moved a mob (one line for each mob, with a count over a skip).
- **Crops (mixed farms only).** The paddock sheet shows plantings with their stage in plain words and Harvest when ready, and Sow: the species the district grows with cost a hectare, window and a line on what each is for; outside the window the option is off with the reason. Squares are picked by dragging a box on the map (the squares tool the build tools use) or "all the arable land". The cards give hectares, cost, expected tonnes and money and what is left in the bank. The things-to-do item for a ready crop opens the same card.
- **More tab.** Inbox (newest first, 40 messages, built on the server from the engine's events, with the cause where there is one), a count on the tab for unread, the farm's name and setup, Start a new farm behind an in-page confirm, the theme switch and a link home.
- **Server.** New modules `market`, `marketwords`, `plans`, `planwords`, `crops`, `cropwords`, `inboxwords`. The job card carries ready-made `summary` lines for market, plan and crop jobs, so the browser works nothing out. `parseAction` takes `buyCattle`, `sellClass`, `setPlan`, `resumePlan` and `sow`, checking every number and list. A new route `/api/game/inbox` records how far the player has read (kept with the farm). The snapshot gains the market prices and chart, plans in words, the plan form's limits, `cropping`, arable hectares for each paddock and unread counts. The deny list gained price series, calendar, schedule and crop table names. A 4,143 head farm is 54,334 bytes. A mixed large farm with a plan and a full inbox is 61,325 bytes.

How it was tested: new unit tests for the server words (market, plans, crops, inbox), the request checks, the snapshot additions (including that the chart ends today and holds at most 31 days), buying through to the arrival and moving out, selling and booking and cancelling, a rotation that moves, pauses, resumes and clears, sowing, refusal out of the window, harvest from the paddock sheet and from the things to do (same card), the inbox read mark (also through the route), and the pure client parts (chart geometry, plan form, square picking, inbox helpers, card lines).

What was looked at in a real browser (the pane's browser, not a phone, on a real-year Central West NSW mixed farm starting Sep 1997): the PC at 1280 by 800 in light: the Market tab on a non-sale day with Buy off and the reason, Next day to the sale day, a buy of 12 weaner steers with the card and Confirm, their arrival and the things to do, moving them out, booking 3 head on a non-sale day and cancelling, a three-paddock plan made by tapping the map (numbers showed), the plan moving the mob by itself with the day card line, Pause, Resume from a step, Sow with a dragged box (refused where crops stand, with the reason) and with all arable land on a paddock with fallow, Harvest from the things to do, and the inbox. Phone at 375 wide: the Market prices and chart, the Plans tab (light) and the More tab (dark), and no sideways scroll on the pages looked at. The pane cropped some screenshots after a resize, so the phone plan form, the crop sheet and the 1280 dark theme were measured by script or not looked at (see Not done). The dev server was stopped after the run, and a few wording fixes made after it (see below) were covered by tests, not looked at again.

Changed after the browser run: the Cancel booking card now says "Take off the sale" and "Keep the booking"; a finished market, plan or crop job repeats only where the bank stands; cow and calf units are priced "a unit"; the sowing reason reads "The sowing window for wheat is Mar to May. It is September now."; join notes on a plan say "join now" for the first stop.

Departures from the spec: the price list is by market class (what prices are set in), the Buy list is by sale class (what the yard sells), so they are not the same eight; the chart toggles by market class. Plans made in the form have one leg (the engine allows more; a plan with more legs shows but its Change button is off). Crop squares are picked by dragging a box, not a path. The mob card's Sell now uses the new sale words too.

Not done:

- The phone plan form, the crop sheet on a phone and the dark theme at 1280 were not looked at in a screenshot. Keyboard use of the map taps and box drag is not possible (the paddock list and "all the arable land" are the keyboard routes).
- A forage or grain crop can only be picked on arable land. The pick also takes squares that already hold a crop; the card says how many can not take it.
- Lighthouse was not run.
- No "worker moved the mob" character, and nothing for Daily Farm.

Questions for Claudia:

1. **Typical beast.** $ a head uses the middle of each class's sale weight range. Heavy steers use the weight where the engine starts calling them heavy, and calves use the farm's own. Right?
2. **Inbox volume.** Births fill the inbox in calving season (one line a day). Should births be one line a week?
3. **Plan "next".** The plan card says "Moves into Paddock 2 after 2 more days here". That is the plan's own rule, not a forecast of the farm. Fine?
4. **Crop details.** The sow cards name how many squares can not take a crop. Should the map mark those squares red?

### 14 Nov 2026: engine rules after the screens review

Branch `m1.7x-engine-rules`, from `m1.7c-build-tools`. Engine and shared types only: nothing under `apps/` or `packages/render` changed. Engine 0.10.0, save format 7.

Built:

- **Fence materials are kept, and reused fence is half price** (Claudia: "half price is fine"). Taking down permanent or electric fence keeps its materials on hand, by the metre and by kind (`layout.fenceOnHand`; knocked-down electric counts as electric; gates are not kept; tape is unchanged). Building fence of a kind uses them first, along the line in the order drawn, at half the price of a new metre (`REUSED_FENCE_SHARE = 0.5`); the rest is full price. The ledger records each segment at what it cost. The build result and the job card say the metres from materials on hand and what that saves, for the whole line and for the part built today (`fenceMaterials`); the take-down result and card say what was kept and what is on hand (`materialsKept`). `materialsOnHand(farm)` gives the metres of each kind, tape on the roll included. Times are unchanged.
- **Water hubs can be removed and moved.** `moveHub` (a fence-line or corner hub to another corner), `removeSquareHub` (the trough comes out, the gates stay) and `moveSquareHub` (the trough moves, the new square gets its open gates, the old square keeps its gates). A hub on a square is read from the layout (`isSquareHub`: a fixed trough with a gate on every side that is not the boundary), so nothing new is kept. Moving costs what moving a trough costs ($300) plus any new gates; times follow the trough. The farm view carries `water.squareHubs` beside `water.hubs`.
- **The player is told only what a joining report or a preg test has told them.** `breedingReports(farm)`: each mob's latest joining report and preg test with their farm days, the head known in calf (bought PTIC, the running farm's starting PTIC cows included, or in calf at a preg test since, until they calve, slip, die or are sold), and the class table as the player knows it. The farm view's mob `classes` now count PTIC only when known. Kept as display state only (`farm.knownInCalf`, `mob.reports`). `JOINING_DAYS` (63) and `JOINING_REPORT_DAYS` (21) are exported for the screens. The live fields (`mobSummaries` classes and sale value, `classOf`, `label`, `groupKey`, `preg`) are marked "not for the player's screens".
- **Reads for the web server**: `supplementCosts` (each supplement's daily price for each mob as today's tick charges it, plans that move more than once a day included), `husbandryNow` (calves to mark and wean, and whether each job can be done now with its reason), `portableRefund`. `areaWatered` was already exported. To share code rather than copy it, `simMob`'s diet choice became `dayDiet` and the tick's first three steps became `startOfDay`, with the arithmetic unchanged.

How it was tested: `pnpm typecheck`, `pnpm lint`, `pnpm test` (2,142 tests, up from 2,089), `pnpm test:speed` (2.77 ms a day with 4,895 head, limit 5 ms) and `pnpm format:check` pass. New test files: `actions/fenceMaterials.test.ts`, `actions/hubs.test.ts`, `sim/told.test.ts`, `sim/reads.test.ts`, with additions to the job card test (every action, now 37), the farm view test, the saves tests and the "looking is free" test. The old game comparison has a new run that builds a fence, takes it down and builds again: it asserts the half price on the reused segments, then sets the old game's cash and year's infrastructure spending level, and every other figure stays equal day by day. No calibration or comparison figure was changed. A test runs a farm with what the player was told wiped every day and gets the same farm, so display state can't reach a formula. Break-it checks: 21 changes to the new rules and figures, one at a time (the half price, materials used and kept, the ledger, the card, the save upgrade, the hub checks and costs, the view, what a preg test tells, calving, the known classes, bought PTIC, the inbox read-back, the supplement price on the day's stops and after growth, the counts and the refund). Each made a test fail. The first run left one alive (pricing lick before the day's growth); a test over every day of a year now catches it.

Not done:

- **The farm view version is still 3.** `squareHubs` was added as an optional field and the meaning of a mob's `classes` changed, which calls for version 4. Bumping it fails the map fixture test in `apps/web/dev-fixtures` (the stored views are version 3), and this change was not to touch `apps/`. When the screens branch lands: bump `FARM_VIEW_VERSION` to 4, make `squareHubs` required if wanted, and run `pnpm dev:map-fixtures`.
- The screens: the fence tool starting on permanent fence, the pipe tool not zooming, the hub move and remove tools, showing materials on hand, and moving the web server onto the new reads.

Questions for Claudia:

1. **Fence materials in net worth.** Materials on hand count for nothing, and a segment rebuilt from them is on the books at the half that was paid. Right, or should materials on hand count for something?
2. **Fence built over.** Fence under a new run of another kind, or where a gate or a square hub goes, is gone, not kept. Should it be kept as materials too?
3. **Removing a hub on a square** takes the trough out and leaves the gates. Should the gates come out too, or be shut?
4. **Moving a hub** costs what moving a trough costs ($300). Right?
5. **The pregnancy premium.** A cow's sale value rises by $320 at 400c (about $304 after commission) on her 50th day in calf, tested or not. It doesn't move the day she conceives, but on day 50 it moves her mob's sale value and the farm's net worth, so a player watching those can count cows reaching 50 days: up to 13 days before the preg test. Leave it, or apply the premium only to cows known to be PTIC? (Late pregnancy shows the same way in AE at 190 days, well after the test. Selling the "PTIC cows" group also picks by live pregnancy.)
6. **A running farm's starting cows that come PTIC** are treated as known in calf, as if the previous owner's preg test came with them. Right?

### 14 Nov 2026: milestone 1.7f, fixes after the screens review

Branch `m1.7f-review-fixes`: `m1.7d-market-and-plans` with `m1.7x-engine-rules` merged in (conflicts in this log and LESSONS only, both kept). After the merge the farm view went to version 4 (`water.squareHubs` required), the map fixtures were made again (the fixture script now buys on a sale day and moves the stock out of the yards), and the map draws a hub on a square as a hub and reports a tap on one. Nothing else under `packages/engine/src` or `packages/shared/src` changed. No new package or outside service.

Each item from the review:

1. **Farm creation rate limit: done.** The limit's key is worked out before any session is made. Creation is keyed on the caller's address as the platform reports it: a header is trusted only when `GG_TRUSTED_IP_HEADER` names the one a trusted proxy sets (in `.env.example`); unset, every caller with no session shares one count. A forged cookie or `x-forwarded-for` gets no fresh count. Backstops: `CREATES_PER_ADDRESS` (5 in 10 minutes), `CREATES_PER_MINUTE` (30 for the whole server), `MAX_FARMS` (10,000 files) and `FARM_STALE_DAYS` (90: a farm not used for that long is removed, looked for every 6 hours and when full). Tests for each.
2. **Body size: done.** Refused on `content-length` before reading (413), and read with a hard cap so a body with no length or a false one is cut off. Tests with an oversized body, no length and a false length. The stale "4 KB" in this log now says 32 KB.
3. **Told only what was reported: done.** The mob card's breeding comes from `breedingReports`: the joining (its length from `JOINING_DAYS`), the latest joining report and preg test with their dates, and the head known in calf. Class rows and the sale groups count PTIC only when known (`knownClassOf`). The market's sell classes never read pregnancy. Net worth still carries the engine's pregnancy premium (a question already with Claudia, not changed); no new per-mob sale value was added. The deny list gained the live fields, and a test walks a joining day by day: on a day with no report the known figures never go up (it fails with the old live count).
4. **The card and the job agree: done.** The snapshot carries `farmVersion`, new at every change. `preview` returns the version it was made on. `act`, `day` and `skip` must send the version shown and are refused with "The farm has changed since this was shown. Here is the latest." and the fresh snapshot. Every act carries a one-use request id; the server keeps the last 12 for the farm with the farm and answers a repeat with the first answer. After a failed or refused act the browser takes the farm sent back, or fetches it again. The browser drops answers to older previews (each preview has a ticket), and Confirm sends exactly the request the visible card was made for (the mob card's Sell no longer reads the picker at Confirm). Tests: two tabs, a double confirm, a lost reply then a retry, a stale card, supplement A then B.
5. **A corrupt save: done.** The stored farm has `format` 2 with defaults for older ones. A farm that can not be read gives "Your farm could not be opened. Try again, or start a new farm. The old farm is kept aside." with Try again and Start a new farm (behind a confirm). The broken file is renamed `<id>.broken-<time>.json`, not deleted. Tests with a corrupt file through the routes and the store.
6. **Red means one thing: done.** Red (`notToday`) is drawn only for the part of a line that does not fit today. Knocked-down fence: amber, with an amber "!". Remove: lilac round white. Shut gate flag: slate. Low portable trough: orange. Water layer "no water" and the pickable no-water paddock: purple (and the move tool's key says so). Quality layer: purple to green. Grazed layer: orange. Tape stays white and dashed. Palette tests: nothing on a line or square but "not today" is red, amber is told apart from red and from the casing. REQUIREMENTS and VISUALS updated, marked "Claudia, 14 Nov 2026".
7. **None of a line fits: done.** "You don't have enough time to do this today. Draw it again another day." (from the server).
8. **Default fence: done.** Permanent.
9. **No tool zooms by itself: done.** Nothing in the play screen changes the zoom; tests show the wheel and a two-finger pinch zoom in both the pan and the drawing tools and that drawing leaves the zoom alone.
10. **Fence materials: done.** The fence card says how many metres come from materials on hand today and what that saves, the take-down card says "You keep the materials: 240 m of permanent fence. Fence built from them is half price.", and the fence tool shows what is on hand. Words on the server.
11. **Hubs removed and moved: done.** Both kinds, with `moveHub`, `removeSquareHub` and `moveSquareHub`: tap a hub with the hub tool (or a square hub with the trough tool) for Move or Take out; Remove takes out either kind.
12. **44 px touch targets: done.** On a touch screen (`pointer: coarse`) every button, select, summary, `.btn.sm`, `.padchip`, `.linkbtn` and `.sortbtn` is at least 44 px high. The PC layout is unchanged.
13. **Wording: done.** "Growth, last day: X kg DM/ha a day". Remove never offers the boundary.
14. **Stop copying the engine: done, with one exception.** Supplement prices (`supplementCosts`), marking and weaning with their reasons (`husbandryNow`), the portable refund (`portableRefund` on the card, the job's own figure in the result) and water on an area (`areaWatered`). `NO_WATER_WHY` is written once, in `words.ts`. Kept: a small `landOf` and `areaOf` in `mobs.ts`, because `predictGains` (the reasons a mob is not gaining) needs a land and an area and the engine does not export its own.
15. **Plans data: done.** Only what the Plans tab shows, typed; the rule's figures rounded.
16. **Bundle check: done.** Ten terms that survive minifying (district figure keys, random stream names, engine messages a player never sees), searched in `.next/static` and in the `/play` HTML and page data. A test plants a term in a pretend build in each place and sees it fail.
17. **Snapshot allow-list: done.** Every key at every depth is listed (`snapshotkeys.test.ts`); a test shows a planted field is caught.
18. **Docs: done.** The ute line, LESSONS S3, this entry, and LESSONS F1 and F2.

How it was tested: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` (2,267 tests in 117 files, up from 2,142 on the engine branch), `pnpm test:speed`, `pnpm build` and `pnpm check:browser-bundle` pass.

What was looked at in a real browser (the pane's browser on `next dev`, a running Central West farm): at 375 by 812 (touch emulated) the mob card during a joining shows "Joining: 1 Sep 2026 to 3 Nov 2026 (9 weeks). A report comes every 3 weeks." and the 31 cows known in calf, with no running count; every visible button measured 44 px or more by script and there is no sideways scroll. A double click on the supplement card's Confirm sent one act request and did the job once. At 1280 by 800 the fence tool starts on Permanent, shows "On hand: 277 m of permanent fence. Fence built from it is half price." after a fence was taken down, the take-down card said the materials are kept and the next fence card said 277 m came from them and saved $970 (half the $1,940); the PC buttons stay 36 px. A hub on a square was moved through the server (that showed the result line was missing; "Moved the water hub." was added and tested). Not looked at: a knocked-down fence on screen (none happened; the palette test covers its colour), tapping a hub on the map by hand, the broken-farm screen by eye, dark theme. The dev server was stopped.

Not done:

- Moving a mob or selling a group by the known classes could ask for more "not in calf" cows than the engine's live classes held. Settled in the second pass below (the herd record, engine 0.12.0).
- Lighthouse was not run.

Questions for Claudia:

(Questions 1 to 3 were settled in the second pass below.)
4. **Stale farms.** A farm not played for 90 days is removed (the session cookie lasts 90 days). Right?

### 14 Nov 2026: milestone 1.7f, second pass (review, and Claudia's change of direction)

Same branch. Engine 0.12.0, save format 8.

- **Pregnancy on the record, no preg test** (Claudia, 14 Nov 2026; REQUIREMENTS "pregnancy on the record"). Replaces the "told" design from earlier the same day (engine 0.10.0 and 0.11.0: `knownInCalf`, a mob's `reports`, joining reports and the preg test on the mob card), which is gone; save format 8 drops it from an older save. A cow or heifer is PTIC on the record by herself from `PTIC_DAYS` (50) in calf, the day the price pays the in-calf premium (`PREG_PREMIUM.fromDays`), so the record and the price agree and no money changes. One rule in `sim/told.ts` (`onRecordPtic`, `recordClassOf`, `recordGroupOf`) used by the mob card, the herd list ("31 PTIC, 2 to 4 months in calf."), the map's classes, `sellGroup` (sale and booking) and `moveCattle`. Groups renamed "Heifers" and "Cows" (no "empty", no "not in calf"). The inbox leaves out the joining progress and preg test notes; the cattle step still makes them, because the old game comparison checks them, so they stay in the engine unshown. Bought PTIC cattle come 100 to 210 days in calf, so they are PTIC from arrival (tested). Tests: a cow 10 days in calf shows exactly as an empty cow in every read and screen; selling "Cows" and moving a class by count take exactly the head asked for; the PTIC group and class with nothing on the record take none; PTIC price only from `PTIC_DAYS`; saves. Checked for selection by pregnancy: `sellGroup`, `moveCattle` (now the record); `sellClass` (market class), `sellAnimals`, booking by tag and `cancelSale` (tags), `markCalves`, `wean`, plan moves, `moveMob`, joins, the yards split and auto-weaning (no pregnancy). DATA "When a cow shows as PTIC": Agriculture Victoria gives reliable palpation from about 6 weeks of pregnancy (42 days); the engine keeps 50 (see the question below).
- **A water job that leaves stock dry says so.** Taking out or moving a hub of either kind, a trough or a portable trough: a trial run finds each mob that has water now and would have none, and the card says "After this, Mob 1 has no water in Paddock 2. Cattle die on the fourth day without water." The job is not blocked.
- **The key lists** cover the preview, act (stale, refused and repeated answers included), day and skip replies as well as the snapshot, and fail when a listed key is never sent. New fixtures: a booked sale, cattle on the way, a game over, a fence down to fix, a plan by days.
- **Start-up warning** in production when `GG_TRUSTED_IP_HEADER` is unset (`instrumentation.ts`, `.env.example`).
- **The session cookie is renewed** with a fresh Max-Age on every route that loads the farm. Tested.
- **The husbandry reasons** are asserted exactly against `husbandryNow`.
- **Colour, narrowed** (Claudia: red "is like an error, or a can't go any further, within the picture"). The rule is for the map picture only. The site's colours stay as designed, red included (the panels, the Short chip, the chart, the main button). On the map the no-water label text is now purple in both themes, like the pickable no-water outline. REQUIREMENTS and VISUALS updated.

How it was tested: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` (2,273 tests, calibration and every old game comparison unchanged), `pnpm test:speed`, `pnpm build`, `pnpm check:browser-bundle`; the map fixtures were made again (the mob classes follow the record).

Questions for Claudia:

1. **When a cow shows as PTIC.** The engine uses 50 days in calf, the day the price pays the in-calf premium. Agriculture Victoria says pregnancy can be reliably found by palpation from about 6 weeks (42 days). Keep 50, or move both the record and the price to 42 (that changes sale values against the old game)?
2. **Late pregnancy shows.** Cows more than 190 days in calf add 10% to AE and give a "late pregnancy" reason on the mob card. A grazier can usually see it by then. Leave it?
3. **Fence materials.** Fence built over by another kind is lost, and materials on hand count for nothing in net worth. Right?
4. **The main button is red.** Keep it?
5. **No water is purple on the map** (labels, markers, the pickable outline) but keeps the site colour in the panels. Right?
6. **Unused farms are removed after 90 days.** Right?

### 14 Nov 2026: milestone 1.7f, third pass (a review of the second)

Same branch. Engine 0.12.1 (notes carry more; no formula changed), save format 8.

- **The inbox no longer gives away early pregnancy.** The `slipped` note carries the days in calf; the inbox says "A PTIC cow in Mob 1 lost her pregnancy." only from `PTIC_DAYS`, and nothing before. Tested at 10, 49 and 50 days.
- **Ready-to-join counts follow the record.** The joining and no-bull notes carry `readyOnRecord` (joining-age females not PTIC on the record), which the inbox shows. The notes are still raised by the model's own count, so a note can stay silent when every female is in calf but under 50 days: a small give-away, accepted.
- **The mob card's "why" lines** group cattle by `recordClassOf` (`predictGains` takes a grouping; the old game comparison still uses the live class and passes unchanged).
- **No "empty" on screen:** the buy list, the buy card and the inbox say "Dry cows" from a server-side name list (the engine's label stays for its tables). The booking card adds "A cow that is PTIC on the record by then is paid as PTIC." (it shows no figure at booking; the price is set on the sale day).
- Stale comments and docs brought up to date (summary, animal, prices, worth, the farm view, MODEL, REQUIREMENTS), Claudia's quote word for word, LESSONS E1 rewritten and E2 added, the told test checks the bought cattle where they land.
- **The long layout comparison** ("40 farms vs MVP") ran past its 240 s limit when every test file ran beside it on a busy machine (about 70 s alone). Its own limit is now 10 minutes; it checks the same farms and jobs. No worker cap was added.
- The herd list line wraps inside its row on a narrow screen.

Calls made by the coordinator, for Claudia to confirm:

1. The move tool's map key describes the map, so its no-water line stays purple like the map. Everything else in the panels keeps the site colour.
2. The profit marker (not built) must not use red on the map when it is built (VISUALS).
3. A cow booked for sale in "Cows" who reaches 50 days in calf by sale day is paid the PTIC premium, more than a figure worked out at booking. The sale pays by the record on the day.

### 14 Nov 2026: m1.7g Scores and Diary

Second pass (an Opus review): weight lost is worded "Cattle lost 4,200 kg of live weight." when the year's gain is negative. The pasture facts give both totals in tonnes ("1,000 t DM of pasture grew. The cattle ate 1,300 t DM."), never a percentage, and say "They ate feed carried over from before the year as well." when more was eaten than grew (the score still uses its own uncapped figure). With no monthly readings, "Ground cover is X% today." The diary files a skip's lines from the run's own day by day events, so a year-long skip keeps every day (only first light events come from the inbox). The game over card labels the year under way as a part year with its days, and has "Look around" (a strip "The game is over on this farm." with Show the result and Start a new farm; Scores, Diary, the map and the lists stay readable). A refused day or skip (409) from an old tab loads the farm again instead of offering a retry. The year card's button says Close when the game ended in the same skip. The summary's feed figure is feed only; grain income is its own line ("Grain sold").

Branch `m1.7g-scores-diary`, from `m1.7f-review-fixes`. No engine rule or number changed.

What was built:

- **Year view** (`apps/web/server/game/years.ts`): a year as `{ n, title, total, parts, facts, money }`, worked out and rounded on the server. The five parts are Profit, Weight gain, Pasture use, Ground cover and Deaths, in whole points. The facts are plain sentences from the year's figures. The money rows are cattle sales, cattle bought, supplements, grain, crops, infrastructure, running costs and interest, with zero rows left out.
- **Wire:** snapshot version 1 to 2. The snapshot gains `score: { year, total }` (the year so far). Day and skip replies gain `yearEnd` (the last year that closed, or null) and `yearsClosed`. `over` is now `{ text, days, years, total, worth }`.
- **`GET /api/game/record`:** `{ soFar, years, diary, earlier }`, with `?before=<day>` for older diary days, 30 days a page. Same session, cookie renewal and limits as the farm route. A bad `before` is refused with a 400.
- **The diary** (`diary.ts`), kept in the farm file beside the engine save. Stored format 2 to 3. A format 2 file loads with an empty diary. The last 400 days are kept, 12 lines a day, then "and N more". Lines come from a job's result line, a day or skip's inbox messages (filed under the day each carries), and the money lines of the day or skip (filed under the last day that ran).
- **Screens:** the year end card ("Year 3 done", the Year score, a bar for each part, the facts, "Start year 4"), the Scores panel and the Diary panel (both from More), and the game over card. Next day and the skips are refused by the server once the game is over (409 with a plain message), as well as being switched off on screen. The old strip at the foot of the map is gone.
- The browser fetches the record only when Scores or Diary is opened, and again after a day or skip while one is open.

How it was tested: new tests for the diary lists (the 400 day cap, the 12 line limit, paging), a skip of 30 days filing under the right days, a format 2 farm loading with an empty diary, the year end for a year skip (random and real years), the game over refusals, the record route (paging, bad input, limits, cookie), the client store (year card beside the summary, fetching, paging, failure), and the key lists for every new field. Then `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm test:speed`, `pnpm build` and `pnpm check:browser-bundle`.

Calls for Claudia (what, why, how to change it):

1. **The headline is "Year score".** It is the engine's existing year score and its five parts. The PRD's "Grazier Score" (5.8) has no agreed weights, so it is not shown. It comes with the leaderboards in Stage 4. To change: rename the label in `YearScore` in `YearBlocks.tsx` and the line in `MorePanel.tsx`.
2. **No video or ad on the year end card.** Ads are Stage 5.
3. **The Diary is a list of days, newest first, with "Show earlier days".** The drag timeline and "view the farm on a past day" need a stored snapshot for every day, which waits for the database in Stage 3. **Closed in m3.2 (15 Nov 2026):** "View the farm on this day" is in the Diary, read only, from a picture of the farm kept for each day (see "m3.2 Accounts and saves"). The drag timeline is still not built.
4. **The Diary keeps the last 400 days for each farm.** To change: `DIARY_DAYS` in `diary.ts`.
5. **The snapshot version went from 1 to 2, not the map's farm view version (4).** The map's view did not change, only the snapshot and the day and skip replies. `FARM_VIEW_VERSION` is unchanged.
6. **The day number in the Diary counts from Day 1.** The farm's own day count starts at 0 on the first day, so the diary shows that day as Day 1. The paging value `before` is the farm's own day.
7. **A real-years farm titles a year "Year 3 · 1997".** The real year is the one the game year began in (September). A random-seasons farm says "Year 3".
8. **The diary leaves out births and deaths from the day's summary.** The inbox messages already say each one, by mob and cause, so saying them again would double the lines. The summary adds only the money lines. A long skip files each message under the day it happened. The inbox keeps 120 messages, so on a skip of a whole year only the last 120 are filed.
9. **A job's own inbox messages are not filed.** The job's result line is filed instead, once.
10. **The game over card counts the year under way** as a last year, so the total adds every score the farm earned. The part year's score is its score as if it closed that day.
11. **The part scores are rounded one by one,** so the five numbers can differ from the total by a point.
12. **The money rows on a year are signed:** money in is shown with a plus, money out with a minus. Interest keeps the engine's sign (paid is negative).
13. **Once the game is over the game over card covers the screen** with two ways on: look around the finished farm (a strip with Show the result and Start a new farm), or a new farm, behind the same "this farm will be gone" confirm as the More tab.
14. **The year score shows each part's points beside its facts, as the mockup does, so a player could work the weights back (for example dollars per profit point).** Kept for now. To be revisited when the Grazier Score and leaderboards are set in Stage 4.
### 14 Nov 2026: milestone 1.7e, help, the guided first day and empty states

What Claudia asked for (REQUIREMENTS, "Controls and screens" and "For the game screens milestone"; PRD 21a, "First-time experience"): help hidden behind a help button, in an info section that can be reopened, never covering the map on a small screen; an information panel that explains how the day works; onboarding and a tour with help available at any time; a short guided first day (open a paddock, move cattle, build a short fence and watch the daylight bar move, open the market, end the day) that can be skipped and replayed from More; empty states with one clear next step.

What was built:

1. **Help.** A Help button with its word in the top bar (on every layout) and a Help part in the More tab. It opens a help screen: a full-screen panel on a phone (like the other tabs, with its own Close help button and Escape), and the side panel on a PC. It is never a layer over the map: on a phone it takes the place of the map's panel the way Herd and Market do. Ten topics, each a heading that opens on a tap (How the day works is open first): the day, moving cattle, building (and what red means), water, buying and selling, husbandry (the banner and the one button, no preg testing, PTIC by itself), grazing plans, lick and feed, crops, reading a paddock; and What the terms mean (AE, DSE, CS, PTIC, ME, CP, kg DM/ha). The words are in `components/play/helptopics.ts`. Each line was checked against the game on this branch (the components, `words.ts`, `mobwords.ts`, `buildwords.ts`, `marketwords.ts`). It says what the player sees and can do, never how a number is worked out, and quotes no real-world figure. A test keeps the topic list, the terms and the plain writing (no em dashes, no judging words) from drifting.
2. **The guided first day.** A coach strip of two lines and two buttons (Skip this step, Skip the tour) sits in the page flow between the top bar and the map, so it never covers the map (it takes 49 px on a phone on its side and on a PC, 112 px on a phone held upright, where the map is still 60% of the screen). Each step finishes when the player does it, read from the game's state: a paddock opened, a move that is done, a fence built (the fence tool's job done), the Market tab opened, and the farm's day gone past the day the tour began (Next day or a skip). A step done early counts. A farm with no cattle has no move step ("Step 1 of 4"). When every step is done or skipped the strip says so with Close the tour. Where it is up to is kept in `localStorage` under `gg-tour` (in try/catch: the page works without it, and the tour then lasts for the visit). A new farm starts a new tour; throwing a farm away clears it; a farm with no saved tour that has not seen a day gets one; an older farm gets none. Show the tour again (in More and at the top of the help screen) begins it again from the day the farm is on. The step logic is pure (`lib/game/tour.ts`, 26 tests); `lib/game/helpstore.ts` is a small separate store that watches the game's store.
3. **Empty states.** `EmptyState` is one plain line and one button with a text label. Herd with no cattle gives when the next sale is and Go to the Market. Plans with no plan: with cattle, Make a plan; with none, the sale line and Go to the Market. Paddocks with none: Build a fence. The inbox with no messages: Back to the farm. The Market's Sell with nothing free to sell: See what is for sale (the Buy view).

Calls made where the spec was open (also in the stage report): the tour's strip sits above the map rather than over it; a step done early counts; the move step is dropped on a farm with no cattle right now (so cattle bought later bring it back); Help is a full-screen panel on a phone like the other tabs; the help topics are collapsed lists with the first open; the tour ends with a closing line the player dismisses; an existing farm with a day or more behind it gets no tour until replayed.

How it was tested: unit tests for the tour logic and the help words; `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build` and `pnpm check:browser-bundle`. In a real browser (the pane, `next dev`, a Central Queensland farm, then a farm from scratch): the whole tour played start to finish at 390 by 844, with the strip's step changing as each thing was done and the daylight bar moving after a fence was built; skip a step, skip the tour, replay from the help screen, and a reload with the tour kept off; Help and More at 390 by 844 in light and dark, at 844 by 390 and at 1280 by 800; no sideways scroll at any of them; the buttons measured 44 px or more on touch. On a scratch farm the tour had four steps and the empty Herd, Plans and Sell lists showed their line and button.

Not done or not looked at: the Paddocks and inbox empty states are in the code and the tests cannot reach them on screen (a farm always has a paddock and a first message); the help text says "A cow goes on the record as PTIC by herself", which is the newer ruling and needs the engine change from the other session to be true on screen; the mob card still has code for a preg test line that the engine no longer needs to send. In the landscape layout the closed Build button is drawn as a tall white bar in the middle of the map (not changed here and not looked into; a bug for whoever owns the build bar). Lighthouse was not run.

### 14 Nov 2026: milestone 1.8, Stage 1 wrap (install, offline, errors, speed budgets, cost)

Branch `claude/m1-8-stage1-wrap-eafda9`. Part of 1.8 only: the Stage 1 report and Claudia's real-phone play are not in this entry. New packages: `@serwist/turbopack`, `serwist` and `esbuild` (to build the service worker). No outside service, no art from outside the repo.

**Install to the home screen.**

- The manifest (`app/manifest.ts`) lists the SVG and three PNG icons. The icons are made by `scripts/make-icons.mjs` (`pnpm icons`): the pixel glyph already in `icon.svg`, lime on the frame colour from `globals.css`, with a small PNG writer in the script. `icon-maskable-512.png` keeps the glyph inside the safe circle that a launcher mask leaves. `apple-icon.png` is for iPhone.
- The service worker is `app/sw.ts`. Next.js 16 builds with Turbopack, which `@serwist/next` does not support, so `app/serwist/[path]/route.ts` (`@serwist/turbopack`) builds it when the site is built and serves it at `/serwist/sw.js`. It keeps the build's scripts, styles, fonts and the public files (58 files, 1.6 MB) and the pages `/` and `/play`. `/api` is never stored (a network-only rule). No source map is published for it.
- It is started from `/play` only, 8 seconds after the page has loaded, so the 1.6 MB it saves never competes with the farm's first load. It is not started on `next dev`.
- The More tab has an Install entry (`components/shell/InstallEntry.tsx`, one line in `MorePanel.tsx`). It shows only when the browser has offered install (an Install button) or on an iPhone or iPad in a browser (the two steps: tap Share, tap Add to Home Screen). Nothing shows once installed. No pop-up.

**Looking at the farm offline.**

- `lib/game/offline.ts` keeps the last snapshot in `localStorage` (about 50 KB for a 1,000 ha farm), checked for shape and format on the way back. Every storage call is wrapped. If the snapshot does not fit, the old copy is dropped so a stale farm is never shown.
- `lib/game/offlineWatch.ts` (started by `components/shell/PlayOffline.tsx`) keeps the copy fresh (after each snapshot, 0.4 s later, and when the page is hidden), shows it when `/play` can not reach the game, and holds every action off. The play components already switch Next day, skips and every job button off while the store's `busy` count is above zero, so being offline holds that count up by one. Looking (the map, paddocks, mobs, tabs) keeps working. One plain line shows above the play screen: "You are offline. This is the farm as you last saw it." A check every 15 seconds, and one when the browser says it is online, brings the live farm back and releases the buttons. If the farm was thrown away elsewhere, the normal screens take over.
- `lib/game/store.ts` was not changed. `lib/game/api.ts` exports the "could not be reached" message as `UNREACHABLE`, so the watch can tell it from a server error.
- Not available offline: setup, jobs, the market, the inbox being marked read. They need the connection.

**Error screens.** `app/error.tsx`, `app/global-error.tsx` (brings its own html and a plain link home), `app/not-found.tsx`, and `PlayBoundary` around the play screen (Try again clears what was open and starts from the farm tab; Home page). Plain words, no stack, no code; the error goes to the console until Sentry in Stage 3. `/dev/crash?where=page|client|play` shows them (404 on a live build, like the other `/dev` pages).

**Speed budgets in CI** (PRD 14.10). `pnpm test:speed` was already in CI (15 ms limit for the shared machine; 5 ms is held on the build PC). Added: `pnpm check:js-budget` (`scripts/check-js-budget.mjs`, with a test): the compressed size of the scripts each page asks for in its own HTML, `/` under 150 KB (the PRD target is 100 KB: React and the Next.js client are about 120 KB, so it is held at today's 141 KB and says so) and `/play` under 250 KB (184 KB). Lighthouse (`lighthouserc.json`, one set of assertions for each page): performance 0.95 median, Accessibility, Best Practices and SEO 1, LCP 2.0 s, CLS 0.05; TBT 200 ms as a warning (local runs swing between 60 and 630 ms with other work on the PC). On `/play` the LCP is a warning too (below). Nothing existing was loosened.

**Lighthouse, run here** (mobile, `next start`, three runs each, the PC was shared with other work):

| Page | Performance (median) | Accessibility | Best Practices | SEO | LCP | CLS |
|---|---|---|---|---|---|---|
| `/` | 0.95 (runs 0.84, 0.99, 0.95; an earlier set 0.98, 1.00, 0.99) | 1 | 1 | 1 | 0.9 s | 0 |
| `/play` | 0.89 (runs 0.89, 0.91, 0.88) | 1 | 1 | 1 | 3.3 s | 0 |

`/play` does not reach the 0.95 target, and did not before this change: the same build without it scored 0.87. The largest paint is the setup form's first heading ("Where is your farm?"), which waits for the page's scripts, then the farm request, then the setup request, one after the other. Fixing that means changing what the play page draws first (`PlayApp`, `SetupFlow`) and is not in this piece. The first paint is at 0.9 s.

**Cost measurement** (`pnpm build`, then `pnpm measure:cost`; the script starts the built server on its own port with its own empty farm folder). Farm of 3,000 ha (Northern Tablelands NSW, large), 959 head at the start, Windows laptop, Node 24, with other work running, round trip on this machine:

| What the player does | Runs | Median | Worst | Answer |
|---|---|---|---|---|
| Start the farm | 1 | 979 ms | | 52 KB |
| Open the farm | 5 | 29 ms | 38 ms | 52 KB |
| Next day | 10 | 86 ms | 182 ms | 53 KB |
| +1 week skip | 1 | 175 ms | | 54 KB |
| +1 year skip | 3 | 1,673 ms | 1,831 ms | 63 KB |

A year skip ran 359 days on average: 4.7 ms a simulated day, in line with the engine's own 2 to 3 ms a day. A Next day is 86 ms, so most of it is the request, the save and the snapshot, not the simulation.

The stored farm is one JSON file: 191 KB when started (67 KB compressed), 339 KB after about a year and a half of play (146 KB compressed). It grows as history is kept. BUILD_PLAN 5.2 says a farm at rest is "a few tens of KB": the stored file is several times that, and the snapshot sent to the browser is 52 KB. Worth looking at before Stage 3 sets storage limits.

**How it was tested.** `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` 2,283 tests in 120 files, 16 of them new; one earlier full run had two files fail while the PC was busy with other work and they passed on the next run, so those two were not looked into, `pnpm build` and `pnpm check:browser-bundle` pass. Tests: the offline storage (round trip, bad data, no storage, no room), iPhone detection, the JavaScript budget check (pass, over, polyfills, missing file). In the pane's browser on a production build: at 390 by 844 (light) and 844 by 390 (dark), with the server stopped and the page reloaded, the farm opened from the service worker's copy with the line above it, Next day and the three skips disabled, the map drawn, and no sideways scroll. Reconnecting (the page's game requests blocked, then let through) took the line away and enabled the buttons; the server itself was not restarted under an open page. The 404 and the page error (390 by 844, light), and the play screen's error (both sizes, both themes) showed two buttons with no sideways scroll; the last-resort error showed its words and buttons (its width was not measured). The Install entry was hidden, appeared when a `beforeinstallprompt` event was sent, and asked the browser to install when tapped. `/api` was not in any cache.

Not done or not checked: a real phone (install, the iPhone steps, offline in airplane mode, the Android install bar), the iPhone status bar in an installed app, and going offline while a request is in flight.

**Calls for Claudia** (from the review of this branch).

- The home page JavaScript is held at 142 KB (the check's limit is now 142 KB, so it can only go down) against the PRD 14.10 target of 100 KB. React and the Next.js client are about 120 KB (LESSONS, 1.8 W4 and R1). It reaches 100 KB when the website pages are built in Stage 5, or the target moves.
- `/play` Lighthouse performance was measured at 0.89 (runs 0.89, 0.91, 0.88) against the 0.95 the CI asks for. The CI rule is not loosened, so CI fails on this until the page is made lighter. The cause is the setup form heading waiting on the scripts, then two requests one after the other (LESSONS, 1.8 W5). The fix is in `PlayApp` and `SetupFlow`.
- The service worker starts 8 seconds after `/play` has loaded, so its 1.6 MB of saved files never competes with the farm's first load. Say if a player should get offline sooner.
- The stored farm file is 191 KB when started and 339 KB after about a year and a half of play. BUILD_PLAN 5.2 says "a few tens of KB". Worth a decision before Stage 3 sets storage limits.
- Help opens in the same bottom sheet as the paddock on a phone, so the map stays visible above it (REQUIREMENTS: help never covers the map on a small screen). On a phone on its side it is the whole-screen sheet, as the paddock is. This replaces the full-screen panel described in the 1.7e entry.
- The last-farm copy (offline viewing) and the tour progress are kept per browser, not per player, until accounts arrive in Stage 3. A second player on the same browser sees the first player's last farm copy and tour progress.
- The service worker now keeps only `/` and `/play`. Every other page (admin, sign-in callbacks, account pages) and everything under `/api` goes to the network and is never stored.

### 14 Nov 2026: m2.1 Farm hands and contractor fencing

Branch `m2.1-hands-and-contractors`, from `m1.7f-review-fixes` (34fecf2). Engine 0.13.0, save format 9. Engine and docs only: the screens are another agent's.

**Built (engine).** BUILD_PLAN 2.1 and 2.2, the simplest version that keeps the real numbers (MODEL section 11; figures and sources in DATA, "Farm hands and contractor fencing"):

- A labour pool worked out from the seed, week by week (`labourPool`); hiring and letting go (`hireHand`, `letHandGo`); casual, short contract and salaried hands at Pastoral Award rates (1 July 2026 pay guide) with 12% super.
- Pay day every 14 days: wages and super come out by themselves. A hand who can't be paid leaves and the standing falls 20; paying everyone brings it back 5. The standing changes the list (shorter, the most skilled gone first, dearer).
- A hand's share of any job the player does, from the hand's own day: an average hand adds 0.6 of the player's day, so a day of permanent fence is 800 m (REQUIREMENTS line 208). By the skill the job needs; dogs make stock work quicker.
- Standing duties at first light: low portable troughs filled, knocked-down fence put back up. Plan moves show in the worker report as the hand's on days a hand is on the books.
- Injuries at Safe Work Australia's rate for agriculture (9.6 serious claims per million hours), likelier on a fencing day, off 45 days (the median).
- Contract fencing, permanent fence only: a 1-man team 500 m a day or a 2-man team 1,000 m a day, Monday to Friday, none of the player's day, charged as built (materials plus $5 a metre labour, either team). It carries on by itself over days and skips, and stops only for no money or a changed line, with an event saying why. Hands can help. The contractor's segments are told apart from the player's fence in `contractView`, with "N m left, done on <day>".
- Reads for the screens: `labourPool`, `standingOf`, `workforceView`, `contractView`, `workerReport`, and on the job card `hands` and `contract`. Events: `hand-hired`, `hand-left`, `wages-paid`, `wages-missed`, `hand-injured`, `hand-back`, `hand-duty`, `contract-ordered`, `contract-built`, `contract-finished`, `contract-stopped`, `contract-cancelled`.

**Tested.** `labour/labour.test.ts` (both "done when" lines, pay day to the cent, missed wages, the pool's repeatability and standing, contracts across a skip, stops, cancelling, hands helping, duties, injury, old saves, wording) and `labour/noHands.test.ts`: a farm with no hands and no contractors matches a digest taken on engine 0.12.1 before any labour code existed (a year on random seasons, half a year on real years). No calibration band and no `*.mvp.test.ts` file changed.

**Calls for Claudia** (each is one constant in `packages/engine/src/data/labour.ts` unless it says otherwise):

1. **A real conflict in your own words: a hand's share of about 500 m, or 800 m a day with a hand on.** On 13 Nov you said both "With a farm hand on, one-man fencing assumes the farmer and the worker are both there, so about 800 m a day instead of 500 m" and "the first part of the line is the workers' share and uses none of the farmer's daylight (about 500 m for a worker, more or less by their skills)" (REQUIREMENTS lines 208 and 253). The PRD (5.11) carries both too: "about 500 m of permanent fence for an average hand" and "One hand takes a day's permanent fencing from 500 m to about 800 m". A 500 m share means player plus hand build 1,000 m a day; 800 m a day means the hand's share is about 300 m. **Built: 800 m a day (a share of about 300 m).** It is one constant, `handDayShare` in `packages/engine/src/data/labour.ts`: 0.6 now; set it to 1 for a 500 m share (1,000 m a day). Which do you want?
2. **Hands help on every kind of job,** by the skill it needs (fencing, water, stock), not only fence: "Farm hands can do all tasks". To limit it to fence, `skillFor` in `labour/help.ts` returns null for other jobs.
3. **No overwork limit.** With no roster the player can't work a hand past their hours, so "how hard you can work them before they quit" is not modelled. Hands leave only when let go, when a contract ends or when not paid.
4. **The contractor's labour charge is a stand-in of $5 a metre** (`labourPerMetre`). No published labour-only rate was found; price guides put installed rural fence at about $8 to $25 a metre, and the game's materials are $7. Please give a contractor's quote.
5. **Contractors start the next working day** after they are ordered (nothing is built on the day of the order) and **work Monday to Friday** (`contractorDays`). The PRD question at line 91 ("is a contractor's run the one kind of job that carries on from day to day?") is answered yes, as section 21 row 34 has it: contractors carry on, the player's own line does not.
6. **The bank must cover the whole run when it is ordered,** as for the player's line; then it is charged day by day as built, and stops if a day can't be paid.
7. **"Done on" is at the team's pace,** without hands helping (they may be off). Hands helping make it sooner.
8. **Pay is fortnightly** (`payCycleDays`); the award allows weekly or fortnightly. The first pay day is 14 days after the first hire.
9. **Casual hands are paid the casual day rate** (hourly × 1.25 × 7.6) for days worked; **contract hands the weekly rate over 5 days** for days worked (a fixed-term employee is not a casual under the award, so no 25% loading; second pass, `contractDayRate`); salaried hands the weekly rate. Weekend penalty rates, overtime, leave and allowances are not modelled. A salaried hand on a Wednesday-to-Sunday week is paid the weekly rate.
10. **Notice on letting go** is not modelled: the hand is paid what they are owed and leaves.
11. **Injury:** 1.5 times likelier on a fencing day (`fencingRisk`, a stand-in), and the farm pays one week of the hand's wages as its share of a claim (`injuryCostWeeks`, a stand-in; it differs by state). No workers compensation premium is charged.
12. **The standing figures** (80 to start; 20 off per missed wage; 5 back per pay day paid in full; at 0, 40% of the list and 20% dearer) and **the pool** (1 to 3 new people a week, listed 14 to 42 days, at most 6 hands) are stand-ins.
13. **A skip does not stop** for anything about the workforce (a missed pay day, a hand leaving or hurt, contract fencing stopped). The events are in the inbox and the worker report. To stop for them, add them to `stopsIn` in `day/days.ts` (they come from first light, so the skip loop would need to read `dawn`'s events).
14. **Hired today, starts tomorrow.** A hand does not help on the day they are hired.
15. **Wages the farm can't pay are kept as wages owed and never forgiven** (second pass). The hand still leaves and the standing still drops; the debt is paid in full by itself at the first first light the bank can cover all of it (not in part), and net worth carries it until then. An injury's cost goes the same way.
16. **Dogs** change one thing: a hand with dogs takes a 2.5 ÷ 1.5 bigger share of the player's stock jobs (moves, plan stops, weaning, marking, selling), which still take time in the working day. With walking and mustering cut on 14 Nov, they make nothing else quicker. Keep dogs as a stat, or drop them?
17. **Not built: the lick run duty and the "feeding and machinery" skill** (PRD 5.11). There is no lick run job for the player to hand over: in Fast Farm a supplement is switched on at a daily price, and Daily Farm feeders are not built yet. They can come with the feeders.
18. **Wages are 2026 rates on every farm.** They match the cattle prices only under the default `REAL_PRICE_DOLLARS = 'today'` (`market/realMarket.ts`); a farm run in the dollars of the day would pay 2026 wages against 1997 prices.
19. **Plan moves in the worker report** are credited at first light to the first hand (in hire order) who worked that day; a move on a day no hand worked is not in the report.

**For the screens milestone:** add the workforce's engine-only terms (for example `injuryPerHour`, `awardWeekly`, `labour:week:`, `dearerAtZero`) to `scripts/check-browser-bundle.mjs`, and use `jobSeekers` (not the engine's own `labourPool`) for the list of people looking for work. `LABOUR` is for the server and tests only.

**Second pass (a review, same branch, still engine 0.13.0 and format 9).** Letting a hand go pays today's wage too. Unpaid wages and unpaid claim costs are kept as wages owed and paid by themselves when the bank can cover them. Net worth takes off wages owed. Contract hands lose the casual loading. The hands' day is used on a contract run only when something is built. Plan moves are credited to the hand who worked that day, when it happens. The player's list is `jobSeekers` (no leave date, no award rate, no day argument). New tests for each, and for a contractor fence splitting a mob as the player's does. The calibration run is in CALIBRATION.md. New fields inside format 9 (`wagesOwed`, `planMoves`) load with defaults.

**Not done.** The screens (another agent). Sheep (2.3, 2.4). Real-year wages: every farm pays 2026 rates, as with its other costs.

### 15 Nov 2026: m2.2 Screens for hands and contractors

Branch `m2.2-hands-screens`, from `m1.7g-scores-diary` (fa07767) with `m2.1-hands-and-contractors` (b4e8b75, engine 0.13.0, save format 9) merged in. Screens and the web server only: no rule, number or engine file changed (the engine got no new export).

**After the merge, before building.** `pnpm typecheck` was clean and the 438 web tests passed with no change: the stored farm format (the web's own, still 3) holds the engine's save as a block, and an old save loads with no hands (format 9 default). Nothing in the web server broke.

**Built.**

- **Workforce panel** (More, "Workforce", and a to-do line when wages are owed). Standing in the district; your hands (facts, status today, what they did lately in their own words, owed since the last pay day and when it is paid, Let go); people looking for work (name, casual / short contract / salaried, rate, days they work, skills as plain numbers, dogs yes or no with one line on what dogs do, about what each pay day costs with super, Hire). Hire and Let go confirm in place: Hire says the cost per pay and that they start tomorrow, with the next pay day; Let go says what is paid out today and what that leaves in the bank. The result shows where the player pressed, and stays at the top of the panel when the person has left the list they were on.
- **Worker report.** After a day or skip with something to report, the summary opens with a worker and a speech bubble for each thing done while the player was away, in the worker's own plain words built from `workerReport` facts only. One tap for the next, or "Skip all". The same things are in the inbox.
- **Fencing tool.** A permanent line's card offers Yourself, a 1-man team and a 2-man team with the price and the done day on each, and says once that a team uses none of your day. Picking a team asks for that card: "materials plus labour", the start day, the done day, what it leaves in the bank. "Order the team" confirms; the line is drawn in the team's colour while the card is up. When a hand is on, the card says "[name]: the first 139 m is the hand's share, done from their own day. It uses none of your light." (any job, from `hands`; for a non-line job it says the minutes). The part that does not fit today is still red, for the player's own share only. A refused line (no light left, too dear) still offers the teams.
- **Under way.** A fact line on the Farm tab ("Contract fence: 1,179 m left, done on Monday 7 September", the team, what is built and charged so far) with Cancel, which confirms what is kept and what is owed. On a phone it shows in the things-to-do banner; on a PC in the side panel.
- **Map.** The contractor's segments from `contractView` in hot pink `#ff5cc8`: built is solid over the permanent fence, still to build is dashed. Only while the run is under way; then it is plain permanent fence. The player's own fence is as before. Palette, palette test (not red, not purple, not amber, 30 degrees of hue from every other line colour, 3 to 1 on the casing, readable on grass), VISUALS. The words carry the same colour as a swatch (a test holds the stylesheet's colour equal to the palette's).
- **Words.** Inbox, diary and a job's result for every workforce event: `hand-hired`, `hand-left` (let go, contract finished, not paid), `wages-paid`, `wages-owed-paid`, `wages-missed`, `hand-injured`, `hand-back`, `hand-duty`, `contract-ordered`, `contract-built`, `contract-finished`, `contract-stopped` (no money, line changed), `contract-cancelled`. The list of types is a `Record<LabourEvent['type'], true>` and `labourMessage` is an exhaustive `switch`, so a new engine event fails the type check until it has words. First-light events are filed in the diary from the inbox since the day began.
- **Skip summary.** "X t DM of pasture grew. The cattle ate Y t DM." on a skip (one decimal under 10 t, so a week does not read "0 t"), from the year view's own helper (`growthLine`, which the year facts now call too).
- **Browser bundle check.** The labour figure table's key names and the pool's stream name (`labour:week:`, `awardWeekly`, `injuryPerHour`, `dearerAtZero`, `listShareAtZero`, `standingMissedPay`, `skillFactor`, `dogsFactor`, `handDayShare`, `labourPerMetre` and others) are in `scripts/check-browser-bundle.mjs`.

**Rules kept.** The browser never imports the engine. Every new field is typed, rounded on the server and in the key allow-list test, and each listed key is seen in a fixture (a hand, a team under way part built, a refused line with the teams' refusals, wages owed). Nothing sent holds an award rate, an injury chance, a leave date, a draw or a skill factor. No word judges a person (a test checks every person and message against a list of judging words). Standing is a level and a fact, with no number.

**Tested.** `labourgame.test.ts`: every event has words and none judges; the days people work; the panel's facts, the standing and the fact behind it, wages owed and its to-do line; the whole flow on the game server (hire, the teams' prices on a permanent card and none on tape, order a team, a skip with its report and growth line, cancel, let go); the browser can not choose whether hands help or send a team that is not 1 or 2. `buildstore.test.ts`: the teams on the card, the team's colour on the line, confirm sends the order, back to Yourself, a new line drops the team, a refusal keeps the teams. `snapshotkeys.test.ts`, `palette.test.ts`, `contractcolour.test.ts`. In the browser (dev server, a temp farm folder): hired a hand, drew a permanent line and saw the hand's share and the teams, ordered a 1-man and a 2-man team, skipped a week and read the report and the pay, cancelled (the card), both themes; at 360 px nothing overflows and every button is 44 px or more (measured by script).

**Checks.** Typecheck, lint, format check and build are clean. The full test run was 2,430 tests in 130 files: 2,428 passed. One failure was real and is fixed (the card after a permanent fence lacked the teams its preview had: lesson S6), the other was the Central Qld "a day in under 5 ms" speed test at 5.97 ms under the machine's load, which passed when run alone. \`pnpm check:browser-bundle\` is clean (27 engine-only terms, 16 of them labour). JavaScript sizes: \`/\` 140.7 KB (limit 142), \`/play\` 193.8 KB (limit 250). New tests: 31 in \`labourgame.test.ts\`, 3 in \`buildstore.test.ts\`, 1 in \`palette.test.ts\`, 1 in \`contractcolour.test.ts\`.

**Second pass (a review, same branch).** The hand's share on a job card is said truthfully: the metres when it covers whole pieces, "builds all of this line" when the line is inside the share, and the time ("takes about 2 h 10 min off your day for this line") when it is under a piece, never "0 m" (tested on three farm sizes, skill 1, 3 and 5, one piece, and a hand who has used part of the day). The worker report sits inside the day summary as a section, and is stepped through only after a skip of days or when a hand is hurt or leaves, wages are missed or a run stops; the last button says "Show the summary" after a skip. Contract fencing and wages and super paid have rows in the summary's money list and the diary, and the bubble gives the cost (the year view carries both already, in Infrastructure and Running costs). A missed pay day counts once however many hands it left unpaid, and is dated from the run's first-light events by pay day, not from the inbox. The Top standing says only what is true from 90 to 100. A person's id goes to the browser as a keyed hash, never the engine's id (it says the week they joined the list); a stale id is refused in plain words. The growth line uses one rounding for both figures and kilograms under a tonne. \`teams\` is no longer on the job card: it is beside it in the preview reply, so the card after a job is the card before it (the earlier fix is replaced), and a fixture builds a permanent fence through the act route. The team's fence has a pattern as well as a colour: cross ticks, built solid and to build dashed, and a "Team fence" tag when zoomed in. VISUALS now says where the swatches are (the Farm tab line and the team buttons: there is no map key). REQUIREMENTS items that are still calls are unticked. Snapshot version is 4.

**Calls for Claudia** (where the spec was open; each is one place to change):

1. **The mockup has no workforce screens.** I built them in the existing style, with the worker report as a modal at the start of the day summary (there is no Daily Farm mode in the app yet, so the report comes after Next day and skips). The report opens on its own and can be skipped; it is capped at 24 bubbles and a repeat (a plan moving a mob, a trough filled, a day of fence) is one bubble with the total.
2. **Hands help a team whenever the farm has a hand.** PRD 5.11: "The player's hands can help them". The engine takes `handsHelp` as a choice; the screens do not ask, because a checkbox is one more thing to decide and Claudia cut those. The server sets it, the browser can not. The cost is that a hand's day goes to the team on days it builds, so the hand's share of the player's own jobs that day is less. Say if you want a switch.
3. **Both teams cost the same** (the engine charges $5 a metre labour either way); the card shows both so the difference is only the day it is done.
4. **Standing is shown as a level** (Top, High, Middling, Low, Very low, from 90, 70, 50, 25) with what it does to the list in words, and the fact behind it. The engine's number never goes to the browser. The "last year" fact needs a record the engine does not keep, so the web's stored farm now keeps the days a pay day was missed (`missedWages`, the last 365 days, no format change). A miss found inside a skip takes its day from the inbox if the message is still there, else the last day of the skip.
5. **"About $X each pay day, with super"** is the hand's full week cost over the 14-day cycle. For a casual or short-contract hand it is "if they work all their days", because what they are paid depends on the days worked.
6. **The wages-owed to-do line** only offers "See workforce". Nothing can be done about owed wages: they are paid by themselves when the bank can cover them.
7. **No "started" message.** The engine raises no event when a hand's first day comes; "hired" says the start date. "Run started" is "ordered" (it says the start day).
8. **Every working day of a run is an inbox line** (and a diary line), and so is every duty a hand does. The engine already puts them all in the inbox; the screens say them rather than hide them. With a long run that fills the inbox's 120 messages, which is the engine's cap.
9. **A skip does not stop for the workforce** (engine call 13): a missed pay day inside a skip shows in the report, the inbox and the diary.
10. **A team is offered on the fence tool only for permanent fence**, and the choice goes back to Yourself whenever the line or the kind of fence changes.
11. **Colour: hot pink `#ff5cc8`.** The nearest free hue that is not red, purple, amber, brown, yellow, white, green, slate or blue. The map has no key panel to put an entry in, so the key entry is the swatch beside the Farm tab line and on each team button, and the map's own colour in the draft while a team is chosen.
12. **Not shown:** the contract's spend is not a row in the day or skip summary's money list (it is "infrastructure", which that list leaves out), so it shows in the Cash change only. The player's own fence is not shown under way (it is built at once).
13. **Snapshot version 3.** The snapshot gained `workforce` and `contracts`, so `SNAPSHOT_VERSION` went from 2 to 3: a farm saved for offline viewing by an older build is not shown (it would lack them), and loads fresh when online.
14. **Pre-existing, left alone:** when part of a line does not fit, the card says "You don't have enough time to do this today." twice (the job's note and the line's own words).

**Not done.** Sheep (2.3, 2.4). A switch for hands helping a team (call 2). Daily Farm's own worker-report moment (call 1).

### 14 Nov 2026: milestone 5.4, the public website

Branch `claude/m5-4-website-363c83`, with `m1.7g-scores-diary` merged in (conflicts in `layout.tsx`, `lighthouserc.json` and this log, kept both sides). Touches the website only: `apps/web/pages` (the public pages), `apps/web/components/site`, `apps/web/components/SiteHeader.*`, `apps/web/lib` (new files, `fonts.ts` and `themeToggleScript.ts` among them), `apps/web/app` (`layout.tsx` uses the shared fonts, `robots.ts`, `sitemap.ts`, the share images), `.env.example`, `lighthouserc.json`, `vitest.config.ts` (JSX for the page tests), and the two build checks in `scripts/` (they now know the home page is built into `.next/server/pages`). Nothing under `app/play`, `app/api`, `components/play`, `server`, `lib/game` or `packages/`. No new package or outside service.

**Pages (static, no script):** `/` (landing and sales page), `/pricing`, `/advertise`, `/about`, `/privacy`, `/terms`, `/community-rules`. Each has a title, description, canonical address, Open Graph and Twitter text, a share image made in code (`app/**/opengraph-image.tsx` through `lib/shareImage.tsx`) and a breadcrumb. The landing page adds `WebSite`, `VideoGame` (free, browser, AUD 0) and `FAQPage` data. `sitemap.xml` and `robots.txt` read one page list (`lib/site.ts`). The landing picture is an inline SVG drawn in code. No ad slot and no activity ticker is rendered.

**No script on the public pages.** The App Router sends about 120 KB of script even when no component is a client component, which is why the first pass scored 82 to 100 and never held 100. The public pages are now pages-router pages (`apps/web/pages`) with `unstable_runtimeJS: false`. They send no script file. The light and dark button is plain HTML with a small inline script (`lib/themeToggleScript.ts`) that does what the game's React toggle does. The game stays in the App Router. `pnpm check:js-budget`: `/` 0 KB (limit lowered from 142 KB to 1 KB), `/play` 192 KB (limit 250 KB). `pnpm check:browser-bundle` passes. The service worker's page list still holds only `/` and `/play`, and the public pages register nothing (`PwaRegister` is only in `/play`).

**Only what is true.** The pages say what is live: Fast Farm, four districts, real or random years, paddocks, fences, water, plans, saleyard sale days, crops, no sign-up. Daily Farm, sheep, leaderboards, community, purchases, sign-ups and analytics sit inside sections read through `siteSwitchOn` (`lib/site.ts`), all off unless `SITE_SWITCHES_ON` names them. The shared defaults turn on Daily Farm, leaderboards and sign-ups, which are not built, so the site keeps its own off-by-default read. Pricing is linked from the header, footer and About page only while `purchases` is on; the page stays reachable. The prices come only from `lib/pricing.ts` (PRD 10.3, with "about" where the PRD has it, and "To be set" for the under-6-months Daily Farm price the PRD still marks Open). Contact address: `SITE_CONTACT_EMAIL`. Owner: `SITE_OWNER_NAME`. While either is unset, the draft pages show "Contact details will be added before launch."

**Tests:** `lib/pricing.test.ts` checks every price against PRD 10.3 (line numbers cited). `lib/sitePages.test.ts` renders each page with the switches off and on (quiet when off, shown when on, no contact link without an address, no Pricing link, no Open price), checks switch keys against `SHARED_SWITCH_KEYS` and checks the sitemap lists only public pages. `scripts/check-js-budget.test.ts` was updated.

**Lighthouse** (mobile, local production build, `lhci collect`, 3 runs per page): Accessibility, Best Practices and SEO were 100 on every run of every page. Performance medians: `/` 100 (8 runs, range 90 to 100), `/pricing` 99 (8 runs, 66 to 100), `/advertise` 100 (6 runs, 92 to 100), `/about` 100 (3), `/privacy` 100 (3), `/terms` 100 (8 runs, 97 to 100), `/community-rules` 100 (3). Largest Contentful Paint 0.7 to 1.2 s (one `/` run 1.9 s), Cumulative Layout Shift 0 on every run. Before the change (first pass, with the App Router) the medians were 93 to 99 and no page held 100. Runs below 100 now are this PC being shared (the worst, 3.6 s of blocking time on `/pricing`, happened on a page with no script to block), not the pages.

**Launch checklist (the "Draft. Not yet reviewed." line stays until every item is done):**

- [ ] `SITE_OWNER_NAME` set (and the owner and ABN decided, PRD 18).
- [ ] `SITE_CONTACT_EMAIL` set to an address Claudia chooses.
- [ ] A lawyer has read the privacy page, the terms and the community rules (PRD 18), including the under-16 wording and purchases by under 18s.
- [ ] `NEXT_PUBLIC_SITE_URL` set to the real domain.
- [ ] `SITE_SWITCHES_ON` set for what is live at launch, then the site rebuilt (the pages are static, so this is read when the site is built).
- [ ] The privacy page matches what the game really keeps (providers and where they keep data, how long, cookies, analytics).

**Calls for Claudia:**

1. **Domain.** Not chosen. `NEXT_PUBLIC_SITE_URL`. Canonical links, the sitemap and share images use it.
2. **Owner name and ABN** for the terms and the privacy page (PRD 18: her business or AgriProve). `SITE_OWNER_NAME`. Until set, the pages say "the owner of The Grazing Game".
3. **Contact address.** `SITE_CONTACT_EMAIL`. Until set, there is no contact link anywhere and no way to make a privacy request or an advertising enquiry.
4. **A lawyer's review** of the three legal pages. They are plain-English drafts built from the PRD, not legal advice.
5. **Providers named in the privacy page.** It says "hosting and database providers" and that data may be kept outside Australia. It names none. Vercel and Supabase (Sydney) are the plan (PRD 14, 19). Naming them, and where each keeps data, needs her yes once the accounts exist. Stripe is named only when `purchases` is on.
6. **How long data is kept.** Only the guest-farm rule is written ("removed if it goes unused for a long time", the server's 90 days). Account data retention is not decided.
7. **Which switches are on at launch** (`SITE_SWITCHES_ON`). Today none.
8. **Daily Farm keep-going price under 6 months.** PRD 10.3 marks it Open (A$15 until set). The page says "To be set".
9. **Audience totals and ad rates** for the Advertise page. The PRD has no rate card and there is no audience yet, so the page has none. It says no ads are running.
10. **Analytics only with consent.** The privacy page says analytics run only with the player's consent and that they can still play if they say no. That is stricter than PRD 12 ("where needed"), and it binds the PostHog work (milestone 5.3) to a consent gate.
11. **Wording that matters:** the SILO credit change notice ("soil water and pasture growth figures are worked out from it by The Grazing Game", DATA.md leaves it to her); "removed if it goes unused for a long time" for guest farms; "Looking is free and takes no time"; community rules shown with a note that the game has no community today.
12. **Privacy complaints.** The page points to the Office of the Australian Information Commissioner's "Privacy complaints" page (https://www.oaic.gov.au/privacy/privacy-complaints), looked up 14 Nov 2026. It says to tell us first. Check it before launch.
13. **Lighthouse.** `/pricing` has a median of 99 over 8 runs, not 100, and a few single runs on other pages fall below 100, all on a busy PC with no script to cause it. `lighthouserc.json` asserts performance 1.0 as an error on every public page (median of 3 runs), and `/play` keeps its own 0.95 rule. If CI fails on a busy runner, run it again before looking for a cause; if one page fails on a quiet runner, that page needs work.

**PRD defaults used:** PRD 10.3 prices and perks (21, rows 29 and 30) exactly as written, with the Open price left unset; PRD 6.3 page list and layout (big heading and a short line under it); PRD 10.1 slot places and formats for the Advertise page, listing only slots for places that exist; PRD 8.3 under-16 rules in the community rules; PRD 9.9 reporting and moderation actions in the community rules; PRD 14.10 targets (Lighthouse 100 on website pages, script under 100 KB).

Not done:

- Share images use the default font (the display font is not available to `ImageResponse` without bundling it).
- The legal pages are drafts, with no lawyer's review.
- No audience numbers or ad prices on Advertise.
- Cookie and consent banner (milestone 5.3, when analytics arrive).
### 15 Nov 2026: m3.1 Database

Branch `m3.1-database`, from `m1.7g-scores-diary` (the checked Stage 1 line, fa07767). The database half of milestone 3.1: the Supabase tables, access rules on every table, server functions, seed data and the tests that prove the rules. Sign-in screens are the other half and are not in this piece. Nothing in `apps/web`, `packages/engine` or `packages/render` changed. No account, project or key was made with any outside service.

What was built (details in [DATABASE.md](DATABASE.md)):

- **16 migrations** in `supabase/migrations` (after the second pass): 57 tables, three column-safe views, the access helpers, grants and policies, guards, server functions, five storage buckets with their rules, the reference rows (switches, ad slots, farm limits, products, rate limits, site settings) and two nightly pg_cron jobs.
- **Tables:** accounts (`profiles`, `account_private`, `account_status`, profile links, experience, education, showcase photos, `guest_sessions`, `farm_limits`); game (`farms`, `farm_saves`, `farm_days`, `farm_snapshots`, `farm_actions`, `farm_scores`, `challenges`, `challenge_entries`, `leaderboard_entries`); community (`follows`, `blocks`, `groups`, `group_members`, `posts`, `post_photos`, `comments`, `likes`, `activity_events`, `reports`, `moderation_actions`, `word_filter`); system (`feature_switches`, `site_settings`, `admin_audit_log`, `rate_limit_rules`, `rate_limit_hits`, `notifications`, `notification_settings`, `notification_prefs`, `push_subscriptions`, `weather_daily`, `price_daily`, `daily_counts`); money (`ad_slots`, `sponsors`, `campaigns`, `ad_creatives`, `campaign_slots`, `ad_events`, `ad_daily`, `products`, `purchases`, `account_entitlements`, `stripe_customers`, `stripe_events`).
- **`farm_saves` holds what `apps/web/server/game/store.ts` keeps in a file today** (stored format 3: the engine save, setup, farm version, recent act requests, inbox read mark), plus the save format, engine version and data version as columns. The diary moves to one `farm_days` row per day.
- **`packages/db`**: the test harness on PGlite 0.5.13 (a dev dependency of that package only), the stand-ins for what Supabase supplies (test folder only), and four test files.
- `.env.example`: the Supabase and Resend variables.

How it was tested: 391 database tests in 4 files, about 20 seconds: every table against a visitor, player A, player B, an under-16 player, an admin and the server for select, insert, update and delete (270 cells and impersonation checks), whole-database checks (row level security on everywhere, every table in the matrix, grants, callable functions, search paths, reference rows matching `packages/shared`), and the rules and functions one by one. Then `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` (2,748 tests in 130 files, all passing), `pnpm build`, `pnpm check:browser-bundle` (clean) and `pnpm check:js-budget` (`/` 140.7 KB, `/play` 191.5 KB, unchanged). No PGlite code is in the browser build: it is a dev dependency of `packages/db` only, which nothing in `apps/web` imports. `pnpm test:speed` was not run (asked to skip). The tests prove the rules on Postgres semantics; one run against a real Supabase project is still owed (DATABASE.md, "Still owed").

**Calls for Claudia** (what, why, how to change it):

1. **Feature switches start at the PRD 11.7 launch defaults** (replaced in the second pass; the first cut had them all off, which was wrong: with sign-ups off not even you could finish sign-up). Sign-ups, both modes, leaderboards and push are on; the community, ads, purchases and maintenance mode are off. A test checks the seed equals `FEATURE_SWITCHES` key for key. PRD 11.7 and `FEATURE_SWITCHES` agree on every key they share; `FEATURE_SWITCHES` also has `video_ads` and `banner_ads`, which the PRD table does not name (both off), and the PRD's "Each ad slot" switches are the `ad_slots` rows (all off).
2. **Guests are sessions the server makes** (a hashed cookie secret in `guest_sessions`), not Supabase anonymous sign-ins. No Auth user per visitor, no CAPTCHA, and it is how the game server already works. A guest's farm moves into the account on sign-up (`convert_guest`). To change: Supabase anonymous sign-ins could replace it later; `complete_sign_up` already refuses an anonymous session.
3. **A guest whose account has no room** (already 2 Fast Farms) is refused and nothing moves; the server is to offer the choice. To change: `convert_guest`.
4. **A guest not seen for 30 days is removed with their farm.** PRD 8.1 says the farm lives on the device only; 30 days is my number. To change: `prune_housekeeping`.
5. **The under-16 rule is worked out live from the date of birth on today's Sydney date**, not a flag stored daily (PRD 15). It is always right and opens on the 16th birthday. To change to the player's own time zone: `app.today_sydney`.
6. **Admins can use the community while its switches are off**, to check it before launch. An admin still has to be 16 or over. To change: `app.community_ok`.
7. **Admins can't read a date of birth.** Only the player can. Admin sees role and bans, farms, scores, reports and ads.
8. **Moderators** read reports, the moderation history, the word filter and every post (removed ones too). All moderation changes go through the server and the audit log.
9. **Privacy defaults:** profile Public, farm view Followers only, ticker activity off until the player turns it on. To change: column defaults on `profiles`.
10. **A followers-only or private profile still shows its card** (username, display name, checked photo, district) to other members, so a post's author can be named and a follow can be asked. The details stay hidden. A private profile can't be followed. If "private" should mean invisible, change `app.can_find_profile_for`.
11. **Blocks hide both ways everywhere**, including leaderboard rows: the blocked player's row is left out for the viewer. Ranks are not stored; 4.1 works them out.
12. **Under 16, or a private profile, on leaderboards: username and district only**, with no account id, photo or farm name. A deleted, banned or suspended account shows as "Former player".
13. **Rate limits** (per account): posts 20 an hour (5 for the first 7 days), comments 60 (15), likes 300 an hour, follows 100 a day (30), reports 20 a day (5), new groups 5 a day (1), sign-ups 3 an hour, jobs 1,200 an hour, farm starts 10 an hour, ticker lines 6 an hour. To change: `rate_limit_rules` rows.
14. **The word filter** matches whole words in text and letters in usernames. "Block" refuses; "flag" lets it through and puts it in the moderation queue. The seed has two placeholder words only; the real list is yours to supply.
15. **Download my data leaves out the engine save and the action log**, because they hold the hidden rules. It includes the farms' days, diary and scores. Worth a word with the lawyer about the Privacy Act.
16. **Deleting an account hands each group it owns to the longest-standing other member** (a community member first), and deletes a group only when the owner was its only member (second pass). To change: `app.before_account_delete`.
17. **Not made from PRD 15:** `farm_jobs` (jobs in progress were removed on 14 Nov), `farm_messages` (the farm inbox lives in the engine save; the account inbox is `notifications`), `subscriptions` and `plan_features` (v1.1 replaced the subscription with one-off purchases: `products`, `purchases`, `account_entitlements`, and farm limits in `farm_limits`).
18. **Products are seeded inactive at the PRD 10.3 prices**, with the proposed perks: the A$30 pack gives the farm pack, supporter badge and full diary; the A$50 pack adds no ads; the A$20 upgrade gives no ads. Keep going: Fast A$5, Daily A$15, A$25, A$50 and A$100 by age. No Stripe price ids until you make the products in Stripe.
19. **Farm ids are uuids.** The file store uses 32 hex characters; the server is to drop the dashes. 3.2 settles it when the store is swapped.
20. **The Daily Farm time zone change** is locked for 30 days, and moving to a zone already on a later date makes the farm wait a day rather than gain one.
21. **pg_cron runs only the database's own nightly jobs** (ad roll-up, housekeeping). The 15-minute rollover needs the engine, so it is a scheduled call to the web server, set up in 3.3.
22. **The seed accounts have no email addresses** (no contact details in the repo). To sign in as one locally, set its email in the local Studio.
23. **Avatars and group photos are in private buckets** and are checked like post photos: nothing shows until the image check passes on that exact file, so a new avatar shows initials (the screens' choice) until then. Ad media is a public bucket, with no SVG.
24. **Sign-up itself checks the sign-ups switch**, so it can be closed without a release.
25. **Three views run with their owner's rights** (`public_profiles`, `leaderboard_rows`, `public_farms`). The Supabase linter flags this (lint 0010); it is the column-safe view the brief asked for.
26. **PGlite is pinned to 0.5.13**, a release more than two weeks old, rather than the newest (0.5.16, 9 Nov).

**Second pass (an Opus security review, same day).** Each hole has a test in `packages/db/src/review.test.ts` that tries it as the attacking role. The tests were written alongside the fixes, not run against the unfixed rules first. Fixed: photos approved by their exact file (storage id and change time), with a Storage trigger that sends a row back to pending when its file changes and approval refusing a missing file; avatars and group photos owned by folder and checked; groups handed on when their owner is deleted; pending follows hidden from third parties; an under-14 refusal recorded against the sign-in; banned and suspended accounts gone from member lists and shown as "Former player" on boards; a removed post can't be deleted by its author; the data download now has ticker lines, board rows, challenge entries and ad events; no Stripe payload kept; no email in the audit log; reports cleared and every `<account id>/` file listed on deletion; a hashed ban record that outlives deletion; exact view columns, a moderator in the seed with tests, leap-day and Sydney-date tests; browser roles limited to the helpers the rules need; the guest conversion locks its row; the action log is append only; push hosts kept in one table; no SVG in ad media; notification links can't start with // or a slash and backslash; private profiles on boards show the username only; an anonymous sign-in counts as not signed in; bucket limits update on re-run; switches at the PRD defaults.

Checked after the second pass: 445 database tests in 5 files; `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` (2,802 tests in 131 files, all passing), `pnpm build` and `pnpm check:browser-bundle` (clean).

**Calls for Claudia, added in the second pass:**

27. **An under-14 refusal is kept against that sign-in only.** A different email address is a different sign-in and gets a fresh try; the database can't tell it is the same person. Date of birth alone may not be "reasonable steps" (PRD 18): a question for the lawyer.
28. **Privacy call for you and your lawyer: a ban outlives a deleted account.** When a banned or suspended player deletes their account, a row stays in `ban_records` with only a one-way hash of their sign-in email (a peppered HMAC since the third pass, call 33) and the ban's end date, used only to refuse a new sign-up with that email while the ban runs. The moderation history itself is deleted with the account. A different email gets past it.
29. **The push services allowed** are only those whose hosts I could read in the vendor's own documents: Apple (any host under push.apple.com, Apple's web push page) and Mozilla (updates.push.services.mozilla.com, Mozilla's autopush docs). Chrome and Edge could not be confirmed from a vendor page, so they are not listed yet, and Chrome and Edge subscriptions are refused until they are added (one row each in `push_service_hosts`, with the source). Needed before push goes live in 3.4.
30. **The audit log takes ids and action names only.** A trigger refuses anything that looks like an email address in its details. Admin pages must write ids, never names or free text about a person.
31. **A 29 February birthday counts from 1 March in other years** (14 and 16 are both reached on 1 March in a non-leap year). This is how Postgres counts ages.

**Third pass (a second Opus security review of feee0fc).** Each test in `packages/db/src/third.test.ts` was written first and seen to fail on the unfixed rules (21 of 25 failed; the other 4 guard behaviour that already held). Fixed: approval only through `approve_photo()`, with the id, change time and version of the file the check read (the read, swap, approve race is refused, and a bare status change is refused for every role); group handover only to a member 16 or over in good standing, otherwise the group stays ownerless and an admin assigns an owner; the ban hash is a peppered HMAC made on the server (the database computes no hash, takes the finished one, needs it before sign-up and before deleting a banned account); notification links refuse control and space characters; the audit log takes a fixed shape with no free text; an admin can clear a mistyped under-14 refusal (logged); the helpers the browser can run answer only what the caller may know; deletion clears the Stripe customer id from Stripe events and farm names from boards; avatars can't be changed in place; an unlisted push host is refused with `push_host_not_allowed`.

**Calls for Claudia, added in the third pass:**

32. **Ownerless groups.** When a deleted owner leaves no member 16 or over in good standing, the group stays with no owner rather than taking other members' posts with it. Members can read, post and leave; nobody can change it, invite or remove members until an admin gives it an owner (`assign_group_owner`, logged).
33. **The ban list needs `BAN_HASH_PEPPER`.** The server hashes each sign-in email with it (HMAC-SHA-256 of the normalised address) before sign-up and before deleting a banned account. Without the pepper the list is useless, which is the point: a database copy or backup can't be tested against known emails. Rotating it makes every ban on a deleted account stop matching. Normalising uses only rules read on the provider's own help page: Gmail dots and googlemail.com (Google), Fastmail `+tags` (Fastmail). Gmail `+tags` and Outlook, Apple and Yahoo aliases are not normalised yet, because no provider page stating them could be found: they get past the list until one is.
34. **The way back for a mistyped date of birth.** An admin clears that sign-in's under-14 refusal (`clear_signup_refusal`, logged). The admin page that calls it is for 3.5.
35. **Reports other people wrote about a deleted player stay** (the reporter's data and the moderation history). For the privacy notes and your lawyer.
36. **Sign-up now needs a server step first** (`record_signup_email`), so the sign-up screen in 3.1's other half calls the server before `complete_sign_up`.
37. **Chrome and Edge push** stay off the allowed list until 3.4; subscribing there is refused with `push_host_not_allowed`, for the screens to word plainly.

**Keys and accounts Claudia must set up** (BUILD_PLAN section 8, row 3.1). I made none of these and entered no keys.

| Account | What to copy | Where it goes |
|---|---|---|
| Supabase project, Free plan, Sydney region | Project URL | `NEXT_PUBLIC_SUPABASE_URL` in Vercel (all environments) and `.env.local` |
| | Publishable key (older projects: anon key) | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, same places |
| | Secret key (older projects: service role key) | `SUPABASE_SECRET_KEY`, Vercel only as a server variable, and `.env.local`. Never a `NEXT_PUBLIC_` name |
| | Database connection string (URI) | `SUPABASE_DB_URL`, only on the machine or CI that applies migrations |
| | Dashboard settings | Data API exposes `public` only (the exposed schemas setting must never include `app`); **anonymous sign-ins must stay off** (the rules treat an anonymous token as not signed in, but keep them off as well); two-step sign-in on your own Supabase login |
| Google sign-in | A Google OAuth client (client id and secret) | Pasted into the Supabase dashboard (Authentication, Providers, Google), not into an environment variable |
| Nothing new: a secret you make | A long random pepper for the ban list (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) | `BAN_HASH_PEPPER` in Vercel as a server variable and in `.env.local`. Never in the database or the repo. Keep a copy somewhere safe: losing it loses every ban on a deleted account |
| Resend (Free) and a domain with DNS access | API key | `RESEND_API_KEY` in Vercel and `.env.local`, and in Supabase Auth's SMTP settings for sign-in links |
| Vercel project (Hobby), linked to the repo, previews locked | | Paste the variables above |

Not done in this piece: the sign-in screens and Supabase client in `apps/web` (the other half of 3.1), swapping the file store for the database (3.2), the rollover route (3.3), and the run against a real Supabase project.

### 15 Nov 2026: m3.2 Accounts and saves

Branch `m3.2-accounts-and-saves`, from `m2.2-hands-screens` (7296efc) with `m3.1-database` (ce64b79) merged in (conflicts only in `.env.example` and this log, kept both sides). This is the web half of 3.1 (sign-in and accounts) and 3.2 (farm saves in the database). No engine file, no render file and no earlier migration changed. No account, project or key was made with any outside service, and nothing tried to reach a real Supabase project.

**What works with no keys set (the default, exactly as before):** guest play, farm files under `GG_FARMS_DIR`, the Diary, every game route. Sign-in is not offered: the sign-in, finish and account pages say in one plain line "Sign-in is not set up on this copy of the game yet" and offer guest play. More shows no account part. Nothing nags and nothing crashes. New in this mode: the Diary's "View the farm on this day" works from files (last 14 days), the saving state, and the shared CSRF rule.

**What needs keys:** accounts, sign-in, database saves, the farm picker, two farm slots, download and delete. They turn on only when all of `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_DB_POOLER_URL` and `BAN_HASH_PEPPER` (32 characters or more) are set.

**What was built**

1. **One farm store interface, two stores** (`server/game/store.ts`). The file store is today's behaviour, unchanged. `DbFarmStore` (`server/db/dbstore.ts`) keeps farms in `farms`, `farm_saves`, `farm_days` (the diary), `farm_snapshots` and `farm_snapshot_views` (the daily history), `farm_actions` (the log) and `guest_sessions`. It is written against a small SQL interface (`server/db/sql.ts`): the site runs it on a `pg` pool, the tests on PGlite as `service_role`. One id form at the edge (32 hex): the database converts it to a uuid. A new migration, `20261115000100_farm_store.sql`, adds `farm_saves.missed_wages`, the server-only tables `farm_snapshot_views` and `farm_saves_aside`, and makes `prune_housekeeping` also clear aside saves after 30 days. It is in the access matrix and the server-only list, so the matrix tests cover it.
2. **Saving that never loses a job silently.** The database write names the version it expects, so two tabs or two servers cannot both win (the loser is told the farm changed, with the latest farm). A failed write is tried again twice on the server (150 ms, 600 ms); if it still fails nothing is kept, the server drops its copy and answers 503 `save_failed` with plain words. The browser then asks again (1.5 s, 4 s, 9 s) with the same one-use id while the screen says "Saving again", and after the last try says what was not saved ("That job was not saved. Nothing on your farm has changed."). A retry after a lost reply is answered from what was stored. A job is only shown as done after the server has stored it.
3. **Daily history and "View the farm on this day"** (closes the call deferred in 1.7g). The database keeps a picture of the farm (map and paddock figures, no engine data) for every day for 14 days, then one a week back to 182 days (changed in the second pass, see below); the file store keeps the last 14 days. A skip stores its last day only. The Diary shows the button on each day that has a picture; the view is read only, with "You are looking at Day N" and "Back to today".
4. **Guests and farm slots.** Guest play as before; with the database the guest session is recorded as a hash and the cookie lasts 30 days (the database removes a guest not seen for 30 days; with files it stays 90). An account has two Fast Farm slots (the database enforces the limit; a third farm gets a plain "no room" message). A farm picker (name, district, day, last played; Open, Delete with a confirm that says it can not be undone, Start a new farm) shows at `/play` for an account with more than one farm, and from More, "Your farms". The Daily Farm is not started from anywhere in this milestone.
5. **Sign-up and sign-in** through Supabase Auth's server-side flow (`@supabase/ssr`; the docs were read on 15 Nov 2026 and are quoted in `server/auth/supabase.ts`): `/sign-in`, `/sign-in/check-email`, `/auth/callback`, `/sign-up/finish`, `/account`, sign out. The finish page has the username with a live check that only says free or not available, the date of birth with the 14 or older rule in plain words, and the refusal for under 14, which is final for that sign-in (no form, no hint). An account under 16 gets `community: false` and `interestAds: false` from the server. After sign-up the guest's farm moves in (`convert_guest`), or the page says there was no room. The account page: username, sign-in method, download my data, delete my account (type the username; says what goes and what stays), sign out, sign out everywhere.
6. **What the server does itself:** email normalising and the keyed ban hash (`server/auth/email.ts`, following DATABASE.md; provider rules only where a page is cited), a banned hash refused before sign-up, the date of birth sent to `complete_sign_up`, cookie settings (HttpOnly, SameSite=Lax, path /, Secure over https and in production on a real host), one CSRF rule for every state-changing route, rate limits on the auth routes, a redirect allow-list, and no user enumeration in the sign-in reply (same words and same work whether or not an account exists).
   - **CSRF, what the game routes used before and now.** Before: the game routes refused an `Origin` naming another host, and let a request with no `Origin` through. Now one function (`server/security.ts`) serves the game and account routes: the `Origin` must be this host; `Sec-Fetch-Site` must be `same-origin` or `none`; a body must say it is JSON (so a form or plain-text post can not get through with no `Origin`); and the session cookies are SameSite=Lax and HttpOnly. A request with neither `Origin` nor `Sec-Fetch-Site` is not a browser acting for a player and is let through.
7. **Service worker and offline.** The allow-list test now names every new page and API path; a test reads `sw.ts` to check that `/api` is network only and that the fallbacks are `/play` and `/` only. The offline last-farm copy is kept per player (`gg-last-farm` for a guest, `gg-last-farm:<account id>` for an account), waits until the server has said who the player is, and sign out and delete clear every copy.
8. **Feature switches** are read from `feature_switches` (30 second cache) when the database is on, from the shared defaults otherwise. Sign-up pages say "Sign-ups are not open yet." when `signups_open` is off.
9. **Checks.** The bundle check also looks for the names of the server secrets (`SUPABASE_SECRET_KEY`, `SUPABASE_DB_POOLER_URL`, `BAN_HASH_PEPPER`) and each term is looked for in `apps/web/server`, so the list can not go stale. The JavaScript budget has its own line for each sign-in and account page.

**How it was tested** (147 test files and 3,065 tests in the full run, up from 139 and 2,941 before this work; the one failure in that run, a missing `updated_at` on the new aside table caught by the table coverage test, was fixed and the database tests (515) run again and pass). Database store on PGlite (`server/db/dbstore.test.ts`): ids, guest and account farms, the guest limit and the two slots, ended farms freeing a slot, the diary cap, the 90-day and 30-day clean-ups, old and newer stored formats, the broken-save path (Try again, Start a new farm, the bad save kept aside), the stale version and the one-use request id, two servers and one version, injected connection failures with and without recovery, and proof that `anon` and `authenticated` (even the owner) can not read `farm_saves`, `farm_actions`, `farm_snapshot_views` or `farm_saves_aside`. File store path (`server/game/saves.test.ts`): retries with a growing wait, failure with nothing stored, double taps, two tabs. Sign-in flows against a fake provider (`server/auth/flows.test.ts`): emailed link, Google, replayed, expired and other-browser links, a provider that fails, under 14 and no retry, 14 and 15, a banned hash in a different spelling, sign-ups off, username check, guest conversion with and without room, the picker and other accounts' farms, past days, sign out, download, delete (including a failure part way and a running ban), CSRF on every route, no keys, and the keys each new reply holds. Plus the ban hash and normalising, redirect allow-list, cookie and CSRF unit tests, the browser's retry logic, the per-player offline copy, the service worker allow-list, the picker and the budget check. In a browser (production build, port 3291, a fresh farms folder, no keys): guest play end to end, Diary and "View the farm on this day" and the way back, the sign-in, finish and account pages in the "not set up" state and (with the answer faked in the page) with their forms, dark and light, and at 360 px by script: nothing wider than the screen and no target under 44 px.

**JavaScript sizes** (gzip, what the page's HTML asks for): `/` 0.0 KB (limit 1), `/play` 198.1 KB (limit 250), `/sign-in`, `/sign-in/check-email`, `/sign-up/finish`, `/account` about 143.5 to 144.0 KB each (limit 150). About 140 KB of that is React and the Next.js app runtime, the same as any app router page here; the PRD 14.10 target of 100 KB is not reachable for these without cutting the framework (see W4), so they are held at 150 KB and the check says they are over target.

**Proven only against the fake provider, still owed against a real Supabase project** (also in DATABASE.md, "Still owed"): the `pg` pooler connection and `set local role` inside its transactions; `@supabase/ssr` cookies and refresh; `getClaims()` on a real token; the emailed link end to end (including the email template below) and that a link opened in another browser fails; the Google round trip; `signOut` scopes; `auth.admin.deleteUser` through the `auth.users` trigger; Storage removal; two real connections racing on one save; the in-memory auth rate limits across several server instances (they are per instance; only `sign_up` has a database limit).

**Calls for Claudia** (I built the default and kept it easy to change):

1. **The database store runs on a `pg` pool, not the Supabase JS client.** The JS client can not run SQL, and the store needs transactions. The new variable is `SUPABASE_DB_POOLER_URL`, the pooled connection string. The secret key is used only for Auth's admin calls and Storage. Say if you would rather have the saves go through database functions instead.
2. **Guest cookie 30 days with the database.** It matches the database's 30 day guest clean-up. With files it is still 90.
3. **Picture of a day: every day for 14 days, then weekly to 182, gzipped.** Measured in the second pass: 45 to 48 KB as JSON, 3.5 to 4.7 KB gzipped, so at most about 180 KB a farm and about 180 MB for 1,000 farms. Files keep 14 days. A skip keeps its last day only; the day a farm is made has no picture until the first day ends.
4. **A farm that is refused a job keeps its version.** A refusal changes nothing the player is looking at.
5. **The picker shows at `/play` only for an account with more than one farm, and "which farm is open" lasts for the browser session** (a cookie with no expiry, checked against the account's own farms on every request). A signed-in account with exactly one farm opens it straight away.
6. **An account whose sign-up is not finished plays as a guest** (second pass: with a guest session made and renewed like anyone's) until it is finished. A guest farm moves in at finish, not at sign-in.
7. **Under 14: the refusal is final for that sign-in** and the finish page shows only the message and "Play as a guest". Nothing is said about other dates or addresses. Under 14 can still play as a guest (PRD 8.1).
8. **The username check says only free or not available**, for a taken name, a name the word filter refuses and a wrong form alike. It needs a signed-in session and is limited to 30 a minute.
9. **Redirect after sign-in:** only `/`, `/play`, `/account`, `/about`, `/pricing`, nothing after the path. Anything else goes to `/play`.
10. **Sign-in link limits:** 3 links an hour for one address (a hash is kept in memory, the reply is the same), 10 tries a minute from one address, and the same for the others. They are in memory per server instance. Set `GG_TRUSTED_IP_HEADER` on Vercel or every caller shares one count.
11. **Daily Farm cannot be started** from the game in this milestone, whatever the switch says. The shared default for `daily_farm` is on, the seed follows it; the setup flow only makes Fast Farms.
12. **`GG_SITE_URL` is required for accounts in production** (second pass). Without it accounts stay off.
13. **The sign-in pages are about 144 KB**, over the 100 KB target and under a 150 KB limit that I set (see above). They are not on the home page or the other public pages, which still send no script.
14. **Provider rules for the ban hash stay as DATABASE.md has them.** A Gmail `+tag` or an Outlook alias still gets past the ban list until a provider page is found. Unchanged by 3.2.
15. **Apple sign-in (PRD 8.2) is not built.** The PRD lists Apple; the milestone asked for emailed link and Google.

**Keys and accounts Claudia must set up** (nothing was made or entered by me). Each goes in Vercel as a server variable (Production, Preview) and in `.env.local` for a local run.

| Variable | Where to find it | Safe in the browser? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard, Project Settings, API, Project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project Settings, API Keys, the publishable key (older projects: anon key) | Yes (rules guard every table) |
| `SUPABASE_SECRET_KEY` | Project Settings, API Keys, the secret key (older projects: service role key) | **No.** Server only. Used for deleting a user and removing files |
| `SUPABASE_DB_POOLER_URL` | Project Settings, Database, Connection string, tab "Transaction pooler" (or "Session pooler"), URI, with your database password filled in | **No.** Server only. Farm saves go through this |
| `BAN_HASH_PEPPER` | A secret you make: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | **No.** Server only. Never rotate it casually (DATABASE.md) |
| `GG_TRUSTED_IP_HEADER` | `x-real-ip` on Vercel | Server only. **Required for accounts in production**: without it accounts stay off (the limits would be one count for everyone) |
| `GG_SITE_URL` | Your public address, for example `https://yourdomain` with no path | Server only. **Required for accounts in production**: every sign-in link is built from it |
| Google sign-in | Google Cloud Console, APIs and Services, Credentials, an OAuth client (web). The authorised redirect URI is the one Supabase shows under Authentication, Providers, Google (`https://<project>.supabase.co/auth/v1/callback`). Paste the client id and secret into that Supabase page | Not an environment variable |

**Supabase project settings that must be set by hand** (Authentication and Settings in the dashboard):

- **Data API, exposed schemas:** `public` only. Never `app`.
- **Anonymous sign-ins: off** (Authentication, Sign In / Providers). The rules treat an anonymous token as not signed in, and the server refuses it.
- **Email provider on, Google provider on.** "Confirm email" can stay on: the link is the sign-in.
- **URL Configuration:** Site URL is your public address. Redirect URLs include `https://<your address>/auth/callback` and, for local work, `http://localhost:3000/auth/callback`. A redirect URL not on this list is refused by Supabase, which is the second guard behind the server's own allow-list.
- **Email template, "Magic Link":** keep `{{ .ConfirmationURL }}` as the link (the default). The server uses PKCE: the link only works in the browser that asked for it, and the sign-in page says so. Set the sender and SMTP to the Resend settings from the 3.1 list.
- **JWT signing keys:** use the default asymmetric keys, so `getClaims()` checks a token's signature without a round trip. With a symmetric secret it still works, one request slower.
- **Rate limits (Authentication, Rate Limits):** leave Supabase's email limits on; they are the real limit for sent mail.

**Not done:** Apple sign-in; the Daily Farm (3.3); the drag timeline in the Diary; the admin page that clears a mistyped under-14 refusal (3.5); Supabase-wide rate limits that survive across server instances; any run against a real Supabase project; the full Lighthouse run on the pages (the budget and the browser checks above were done).

**Second pass (the Opus security review of m3.2), 15 Nov 2026.** Each fix was written test first and seen to fail, except where noted.

| # | Fix | Test (seen to fail first?) |
|---|---|---|
| 1 | An old guest cookie can no longer reach a farm that moved into an account. `guestAccess` in the store matches a guest key only to a farm still owned by that session, and a converted session is refused; the routes treat such a cookie as no session, so it can start a fresh guest farm | `flows.test.ts` "1. an old guest cookie..." (three tests), `dbstore.test.ts` "1. a guest cookie only reaches..." Failed first |
| 2 | Accounts are off in production unless `GG_TRUSTED_IP_HEADER` is set (start-up warning says why). `/api/auth/me`, username, finish, sign out, download and delete are limited per session; sign-in per address; a request with no address is limited by its browser headers, never one shared bucket | "2. rate limits..." (four tests). The production-off, `/me` and no-address tests failed first; the email-flood test already passed because the header was set in the tests |
| 3 | Every auth URL is built from `GG_SITE_URL`; in production accounts are off without it; the comment on `siteOrigin` is now true | "3. every auth link..." The `accountsBlockers` test failed first; "uses GG_SITE_URL even when the request names another host" already passed |
| 4 | A signed-in account with no finished profile (abandoned, or refused as under 14) falls through to the guest path, with the session minted and renewed | "4. an account with no finished profile..." Failed first |
| 5 | Every statement runs inside a transaction that begins `set local role service_role` (`clientOnPool`) | "5. the store runs as service_role": the wrapper test failed first; the harness test (`current_user`, `create table` refused) passed already, as the harness always forced the role |
| 6 | Sign out, sign out everywhere and delete clear `gg_session`, and the browser clears every offline copy | "6. sign out and delete clear..." Failed first |
| 7 | Account routes already asked the server (`getUser()`); the fake now keeps accepting a token after a global sign out on the claims check, so the gap shows | "7. the token check lets a signed-out-everywhere token pass..." Passed once the fake was changed (that was the point). Documented in DATABASE.md |
| 8 | An account with no profile can delete its sign-in by typing the word `delete`; the refusal record goes with it (DATABASE.md). The account page offers it | "8. an account with no profile can delete its sign-in" (two tests). Failed first |
| 9 | Nothing logs an address, token, link or provider message; every log line is a fixed reason code | "9. no email address, token or link is ever logged". Failed first |
| 10 | `put` requires the version it expects, in the interface and at run time | `dbstore.test.ts` "10. ..." Failed first (the type check and the run) |
| 11 | A converted guest session is removed 30 days after it moved, by `prune_housekeeping` (new migration `20261115000200_prune_converted_guests.sql`) | `dbstore.test.ts` "11. ..." Failed first |
| 12 | Past-day pictures measured and cut, see below | `dbstore.test.ts` "12. ...", `pastKept` tests. Failed first |

**Past-day storage, measured.** One daily picture (map plus paddock figures) on all 24 combinations of district, size and enterprise: 44.4 to 47.7 KB as JSON (the map is about 95% of it), 3.5 to 4.7 KB gzipped. Original rule (every day for 90 days, then weekly to 400 days): 134 pictures a farm, up to 6.4 MB raw or 0.63 MB gzipped, so 1,000 farms would be 6 GB raw or 630 MB gzipped, more than a small database. Cut to: gzipped (`view_gz`), every day for 14 days, then weekly to 182 days: at most 38 pictures, about 180 KB a farm, about 180 MB for 1,000 farms, and about 3.6 MB for 20 farms. A farm with a large herd stores more mobs in the map, so allow a quarter more. The window is `PAST_DAILY_DAYS` and `PAST_MAX_DAYS` in `server/game/store.ts`, easy to change.

**Second-pass additions to the Calls list:** 16. Past-day pictures are now 14 days daily, then weekly to 182 days, gzipped (above). 17. Accounts need `GG_TRUSTED_IP_HEADER` and `GG_SITE_URL` in production, or they stay off with a start-up warning. 18. A refused under-14 can delete their sign-in; signing up again with the same address is a fresh sign-in with a fresh try (as DATABASE.md says the database can not tell apart). 19. Game routes accept an access token for up to its lifetime after "sign out everywhere"; account routes do not.

**Second-pass hand-set Supabase setting:** the access token lifetime ("JWT expiry limit" in the project's JWT or Auth settings; I could not confirm which dashboard page holds it in the current layout). Default is 3,600 seconds; set it to **900 seconds** so a token signed out everywhere stops working on the game routes within 15 minutes. The keys table above now marks `GG_TRUSTED_IP_HEADER` and `GG_SITE_URL` as required for accounts in production.

**Third pass (15 Nov 2026): accounts off in production.** The production build with no keys answered `GET /api/auth/me` with 500 on every page load. Cause: `authRoute` worked out `siteOrigin(req)` for every request, and in production that throws without `GG_SITE_URL` (a second-pass check), before the handler could say "not set up". Fix: the address is only worked out when accounts are on. New test `accountsoff.test.ts`: every auth and account route under `NODE_ENV=production` with no keys, some keys, and all keys without the header or address answers a 200 `/me` with `accounts: false` and a 503 "not set up" for the rest, with the game still playing as a guest (failed first, 3 of 3). Failure logs are now `failed route=<route> reason=<code> error=<class> code=<plain code>` (`server/logging.ts`, tested to carry no message, address, token or link). The email-spelling tests use plainly fake local parts. The "unknown error fetching the script" in the browser pane is the pane, not the site: it registers no service worker at all (same error for `/robots.txt` and a missing file), while `/serwist/sw.js` answers 200.

### 15 Nov 2026: m3.5 Admin shell

Branch `m3.5-admin-shell`, from `m3.2-accounts-and-saves` (d2c9d61). Built in a separate worktree beside the Daily Farm and notifications work, so the changes are in new files (`apps/web/app/admin`, `apps/web/app/api/admin`, `apps/web/server/admin`, `apps/web/components/admin`, migration `20261115000300_admin_tools.sql`) and a few small edits to shared files (listed below). No outside accounts, keys or connections were used.

**What works with no keys (the default):** `/admin` shows "Admin needs accounts to be set up" and nothing else; every `/api/admin` route answers a plain 404 `{"error":"Not found."}`; the game, `/play` and every other route are untouched. Checked on the production build (see "Production check").

**What needs keys:** all of admin. It needs the same keys as accounts (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_DB_POOLER_URL`, `BAN_HASH_PEPPER`, and in production `GG_TRUSTED_IP_HEADER` and `GG_SITE_URL`) and one admin account. No new variable.

**How the first admin is made.** Sign up in the game first (that makes the profile). Then, in the Supabase dashboard, open the SQL editor and run, with your own username:

```sql
update public.account_status
   set role = 'admin'
 where user_id = (select user_id from public.profiles where username = 'YOUR_USERNAME');
```

It should say `UPDATE 1`. A test runs this exact statement. There is no public route and no environment variable that makes an admin. If the sign-in has gone stale, open `/play` once (it refreshes the sign-in), then `/admin`. Later admins are made from the Users page by an admin.

**What was built**

1. **The shell** (`/admin`): its own menu (Dashboard, Users, Feature switches, Site settings, Audit log, then Moderation, Ads and sponsors, Purchases, Challenges, each saying "Built in a later milestone"), down the side on a PC and along the top on a phone, 44 px targets, both themes, keyboard reachable with visible focus.
2. **The role gate** (`server/admin/gate.ts`, `page.ts`, `route.ts`). The sign-in provider's `user()` (asks the auth server) and one query on `account_status` (role `admin`, not banned, not suspended) with a finished profile. Nothing the browser sends is read. Signed out, player, under-16 player, moderator, suspended or banned admin, an admin whose role was just taken away, and a session signed out everywhere all get the same plain "not found" (the site's own 404 page, status 404; the routes answer the same JSON). A database that can not be read means "not an admin". Every page and the layout call `requireAdmin()` themselves (a layout does not run again between pages), and every route goes through `adminRoute`. The order in a route is: a light limit by address or session, the gate, the shared CSRF rule (`csrfRefusal`), a limit per admin (30 changes a minute on each route), then the handler. The CSRF rule comes after the gate so a visitor who is not an admin can not tell the route exists from what it says.
3. **`/admin` is never cached, and is indexed by no one.** (Corrected in the second pass.) The sitemap has no admin address and `robots.txt` does not name `/admin` (naming it would say it exists; `/api` stays disallowed as a whole). The admin layout sends `noindex`, so an admin page is `noindex` once the role check passes; a visitor who is not an admin gets exactly the not found any unknown address gets, with no admin-only header. An admin route's answer carries `X-Robots-Tag: noindex` only after the gate passed. The service worker's allow-list keeps only `/` and `/play`, and `/api` is network only (a test reads `sw.ts`).
4. **Feature switches.** The screen lists exactly the keys in `FEATURE_SWITCHES` (a test, and a type that fails the build if a key has no words), each with what it does, On or Off, who changed it last and when (`feature_switches.updated_by`), and a button that asks first with "what it does to players". The change and its audit row are one transaction. **How switches are read and cached:** `featureSwitches` reads `feature_switches` and keeps the answer for 30 seconds on each server. A change clears the cache on the server that made it, so it shows at once there and within 30 seconds on the others, with no redeploy, for the game and account routes. A database that can not be read falls back to the shared defaults (never down because of it). **The website's static pages read switches at build time** (`SITE_SWITCHES_ON` in `lib/site.ts`), so the screen marks "Website needs a rebuild" on the switches those pages read (sign-ups, Daily Farm, community, leaderboards, ads, purchases) and the page's top line says so.
5. **Maintenance mode.** (Corrected in the second pass: it is read only, as PRD 11.7 says.) The `maintenance_mode` switch. While on, a game route that changes the farm (`write` in `route()` in `server/game/http.ts`, except `preview` and choosing which farm is open, marked `readOnlyOk`) is refused for everyone but an admin in good standing, with a 503, the code `maintenance` and the wording. Routes that only read (the farm, the farm list, past days, the record, setup) answer as usual, and every answer carries `x-game-maintenance: <wording id>`. The play screen reads that marker (`lib/game/api.ts`), shows the fixed wording above the farm, holds the buttons off the way it does offline, and reads again every 15 seconds until the marker stops. **No free text reaches a player:** the admin chooses one of three fixed wordings by id (in `@gg/shared`), and a row holding anything else gives the first wording. A request already past the check finishes (a save is one transaction with a version check); a request after is refused before it touches the farm. A suspended admin is a player. If the database can not be read the game stays open.
6. **Users.** Search by id (exact) or username (exact or prefix, 2 characters or more, any case, wildcards escaped, at most 25), never by email. The user page shows id, status, role, joined, farms (Daily and Fast), last seen (latest `farms.last_opened_at`), **under 16 as Yes or No** (worked out inside the query; the date of birth is never returned) and the moderation history. Actions, each with a confirm and an audit row: suspend (1, 3, 7, 14 or 30 days), ban (with the hashed ban record: the same peppered hash `prepare_account_deletion` writes, made when the provider can give the email; the ban applies either way), lift, change role, clear a mistyped under-14 refusal (the existing server-only `clear_signup_refusal`, which writes its own row), sign out everywhere (new `admin_sign_out_everywhere`, which writes its row and ends the sessions in one step). An admin can not suspend, ban or change the role of their own account. The last admin in good standing can not lose the role, be suspended or be banned: the server refuses with the admin rows locked, and the trigger `account_status_keep_one_admin` refuses any role update that would leave none, whoever writes.
7. **Site settings.** `announcement` (up to 140 characters, one line, optional link to a page on this site or an https address), `districts_available` (the four launch districts, at least one), `community_rules` text (up to 10,000 characters). Each is parsed on the server again, saved with `is_public` set as the database's seed has it, and audited with only a number (the length, or the count), never the words. The pages do not read these yet, and each setting says so on the screen.
8. **Audit log.** Newest first, 25 a page, filter by action and by admin (username or id), read only, with the fixed-shape details in plain words (for example "feature switch groups: switch groups, turned on").
9. **Dashboard.** Accounts, guests (not yet moved into an account), Daily and Fast Farms (going and ended), farms played today (saved since midnight Sydney time), farms played this week (last 7 days), saves failing (rows in `farm_saves_aside`: saves that could not be opened and were kept aside), each read from the database with "As at" its clock time. Active users, audience, income, ads, game-over causes and the rollover job say "Built in a later milestone" and why. A test seeds rows with known dates and checks every number.

**Audit rows** (all in the log's fixed shape, no free text): `switch_set`, `setting_set`, `user_suspend`, `user_ban`, `user_lift`, `user_set_role`, `user_sign_out_all`, `clear_signup_refusal`. Each change and its row are one transaction; a test makes the audit insert fail for every kind of change and checks nothing changed, and an HTTP test checks the admin gets a plain 500 with no detail.

**How it was tested.** 152 test files and 3,156 tests in the full run on the code at commit time (m3.2's log gave 147 files and 3,065 tests before its later passes; this milestone adds 3 files and 64 tests: 51 in `server/admin/admin.test.ts`, 6 in `pages.test.ts`, 6 in `static.test.ts` and 1 in the budget test), all passing; the first-admin statement test was added after that run and passes alone (`admin.test.ts`, 51 tests). On PGlite with the fake sign-in provider: the gate for every route as signed out, player, under-16 player, suspended admin, banned admin, moderator, an admin with no profile, an admin demoted in the database, a session signed out everywhere, and no accounts; the gate on every page and the layout (`pages.test.ts` runs each page module as each kind of visitor with the sign-in cookie given through a mock of `next/headers`); CSRF (cross-origin, same-site, cross-site, wrong content type) and both limits; every action's effect and audit row; rollback when the audit write fails; the own-role and last-admin rules (including a race made to happen inside the transaction); a body too big or not an object; the dashboard counts; maintenance mode through the real game route as a guest, a player, an admin and a suspended admin; settings that must be refused; the service worker, robots, sitemap and header checks; and a check that no admin file imports the engine or (in the browser components) the server code, and that none contains an em dash. The new JS-budget line is itself tested.

**Production check** (`next start -p 3295`, no keys, fresh `GG_FARMS_DIR`, probed by fetch): every `/admin` page answers 200 with "Admin needs accounts to be set up" (or the plain 404 for an unknown admin address), with `no-store` (and, in the second pass, with no admin-only `noindex` header: see the second pass); every `/api/admin` route answers 404 to a POST (with and without a cross-site `Origin`) and 405 to a GET; no 5xx anywhere; `/robots.txt` disallows `/api` and, since the second pass, does not name `/admin`; the sitemap has no admin address; `/play`, `/api/auth/me`, `/api/game/farm` and `/api/game/setup` answer 200 as before. The server was stopped afterwards. **Not checked in a browser:** the admin screens themselves, because with no keys no one can sign in to see them. They are checked as server output (page modules rendered as an admin in `pages.test.ts`) and by the type check and build, not by eye on a phone or a PC. That is owed with a real project.

**JavaScript sizes** (gzip): `/` 0.0 KB (limit 1), `/play` 198.2 KB (limit 250), `/sign-in` 143.5 KB, `/account` 144.2 KB (limit 150 each), and the new line **`/admin` 147.4 KB (limit 150)**, measured from the heaviest admin page's two build manifests (the shared files every app page starts with, about 140 KB of React and Next, plus the files of its client components; `/admin/switches` is heaviest). Admin pages are rendered on demand and have no built HTML, so `scripts/check-js-budget.mjs` reads the manifests. No limit was raised. The browser bundle check is clean.

**Small edits to shared files:** `server/game/http.ts` (the maintenance check, three lines), `server/auth/provider.ts`, `supabase.ts` and `test-support/fakeAuth.ts` (a new `emailOf(userId)` for the ban hash only), `next.config.ts` (the noindex headers), `packages/db/src/stand-ins/supabase.sql` (a stand-in `auth.sessions` table), `scripts/check-js-budget.mjs` and its test (the `/admin` line).

**Calls for Claudia** (I built the default and kept it easy to change):

1. **Maintenance wording is one of three fixed texts, chosen by id.** No free text goes to a player's browser, so there is nothing to escape or length-limit. Add a wording by adding a line to `MAINTENANCE_WORDINGS` in `server/admin/info.ts`.
2. **`/play` stays a static page, and the game is read only while maintenance is on.** A page that checked maintenance on the server would stop being static (slower, and the service worker keeps `/play`). The game routes carry the marker instead (above). A player with the farm open sees the message and sees the farm, and can not do anything until it ends.
3. **A suspended or banned account can still play its own farm.** The game routes do not check suspension or bans (they only affect the community and sign-up today, as the database rules were written in 3.1). Admin does check them. Enforcing a ban in the game is a decision for you (it changes what a banned player can do); it is one check in `route()`.
4. **The first admin is made by a statement you run in the SQL editor** (above), not by a route or a variable.
5. **Ban and the hashed record (second pass).** Banning writes the hash at ban time when the provider can give the sign-in email. When it can not, the ban still applies, the answer and the confirm say plainly that it will not survive the player deleting their account and signing up again, and the audit row says so (`value` false). **Lifting a ban is refused with a plain 409 when the hash can not be made**, so a permanent record is never left behind; lifting a suspension never needs it.
6. **"Sign out everywhere" for another user deletes their rows in `auth.sessions`** through a security definer function (the owner role is expected to be allowed on Supabase; to confirm). A device stays signed in on the game routes until its access token runs out (the 900 second setting from m3.2).
7. **Sign-in on admin pages (second pass: the first answer was wrong).** The first pass said a page could not refresh a stale sign-in and that opening `/play` fixed it. In fact the admin pages called the refreshing check on a jar that discarded the new tokens, which spends the refresh token for nothing and, on Supabase, can sign the admin out. Now: an admin **route** writes every cookie the provider set back on its answer, whatever the answer; an admin **page** never refreshes (`provider.verify`: it reads the access token from the cookie, checks it has not run out, and asks the auth server about that token alone, so no refresh token is spent) and gives the plain not found when the access token has run out; and the admin shell calls `/api/auth/me` (a route, which can write cookies) when it opens and every 5 minutes while visible, so an open admin screen stays signed in. An admin who comes back after the access token ran out (15 minutes with the m3.2 setting, if no admin screen was open) gets the plain not found on the first `/admin` load, and no amount of reloading helps until something refreshes it: they open `/play` (its calls refresh the sign-in), then `/admin`. A redirect through a route that writes cookies would fix that, but would show a signed-in player with a stale token that `/admin` exists. The same mistake was looked for on the account and game paths: they already wrote the jar on a good answer, but the game's refusals (a thrown error, such as maintenance) did not, and now do. Supabase's own guidance (supabase.com/docs/guides/auth/server-side/nextjs, read 15 Nov 2026) is to refresh in a proxy because Server Components can not write cookies; a `proxy.ts` for `/admin` would be the other fix, and is not built.
8. **A suspended admin is treated as no admin**, and a moderator can not open admin. Moderator screens come with moderation.
9. **Ad slot switches are not in the switches list.** The list is exactly the shared keys, as asked; each ad slot's own on and off belongs to the Ads milestone (the `ad_slots` table).
10. **Site settings are saved but not read yet.** Nothing on the site reads the announcement, districts or rules text, and each says so on its screen. The districts list is not yet used by the setup screen.
11. **"Saves failing" is the count of saves kept aside because they could not be opened.** There is no record of a save that was refused and retried, so that is the closest true number.
12. **"Farms played" means farms with a save**, today (since midnight Sydney time) and in the last 7 days. A farm that was only opened is not counted.
13. **The `/admin` JS line is 150 KB, the same as the account pages,** measured at 147.4 KB, so it is held at its limit and a new client component will fail it. The weight is the shared React and Next code, not admin's own.
14. **Suspension lengths are a fixed list** (1, 3, 7, 14, 30 days) and a ban has no end date; both are one line each in `UserControls.tsx` and `store.ts`.

**Still owed against a real project** (also in DATABASE.md): the admin screens by eye on a phone and a PC in both themes; `delete from auth.sessions` by the function; `getUserById`; a stale token on an admin page; the first-admin statement in the dashboard's SQL editor.

**Second pass (an Opus security review), 15 Nov 2026.** Commit ids are in the report. Each test was written first and seen to fail on the first-pass code (the new tests were run against the old source, restored from a copy; the database test with the new migration moved aside).

| # | Fix | Test (seen to fail first) |
|---|---|---|
| 1 | A refreshed sign-in is no longer thrown away (see call 7, corrected above). Routes write every provider cookie on every answer; pages use `verify` and never refresh; the game's refusals now write them too; the admin shell keeps the sign-in fresh | `second.test.ts` "1." (a FakeAuth that rotates refresh tokens and ends the session when a spent one is reused; failed: no cookies sent, a page refreshed), `pages.test.ts` expired token |
| 2 | `is_admin_user` and `is_staff` mean "in good standing" (migration `20261115000500_admin_fixes.sql`); ban and suspend end the target's sessions in the same transaction (`app.end_sessions`, in a savepoint, count in the audit row) | `packages/db/src/adminfixes.test.ts`, as the banned or suspended admin's own token (`set role authenticated`): `[6, 2, 1, 2]` rows before, `[1, 0, 0, 0]` after. `second.test.ts` "2." (failed first) |
| 3 | Maintenance is read only: routes that change the farm refuse, reads answer with `x-game-maintenance`, the play screen shows the wording and holds its buttons off like offline | `second.test.ts` "3." walks every game route file and needs a line for a new one; `lib/game/maintenance.test.ts` for the screen |
| 4 | Lifting a ban is refused (409) when the hash can not be made; a ban with no hash says so on the confirm, in the answer and in the audit row (`value` false) | `second.test.ts` "4." |
| 5 | The visitor limit before the gate is by address; the admin limit is by account id | `second.test.ts` "5." (125 made-up cookies from one address reach 429) |
| 6 | The acting admin's row is read `for share` | `second.test.ts` "6." (the query is seen to carry the lock) |
| 7 | The last-admin trigger counts only admins in good standing and fires on bans and suspensions | `second.test.ts` "7." |
| 8 | Every route file under `app/api/admin` gets the gate (signed out, player, under-16, suspended, banned, no keys), CSRF, a failed audit write (a digest of every table it can change must not move) and a pass test; a new route fails the suite until it has a body in `BODIES` | `second.test.ts` "8." |
| 9 | A refusal ending sessions is a plain 503: "Could not end their sessions here. Do it in the Supabase dashboard." Listed as owed against a real project | `second.test.ts` "9." |
| 10 | `profiles_username_prefix`, a `text_pattern_ops` index on `lower(username)` (the 25 row cap stays) | `second.test.ts` "10." (the plan uses the index) |
| 11 | `/admin` is not named in `robots.txt`, `next.config.ts` sends nothing for it, a non-admin's answer carries no admin-only header, and `noindex` comes only once the role check passes | `static.test.ts`, every route's gate test (`x-robots-tag` null for non-admins, set for admins) |
| 12 | See below | |

**What a banned or suspended account can and can not do today (call 3, still a call for Claudia).** It can not use the community, sign up again after a ban (by hash, when the hash was written), or open admin, and its sessions end when it is banned or suspended. An access token already issued still works on the game routes until it runs out. It **can** sign in again and play its own farm, because the game routes do not check status. Enforcing it is one check in `route()`.

**Not done:** the redirect route (or `proxy.ts`) that would refresh an admin's sign-in on a page load; the unknown `/api/...` path answers differently from an admin route's JSON 404 (an admin route's answer is the same for everyone who is not an admin, which is what was asked); the access matrix has no new table to add (the new test file covers the new rules); nothing was checked in a real browser or a real Supabase project.
### 15 Nov 2026: m2.3 Sheep model

Branch `m2.3-sheep-model`, from `m2.1-hands-and-contractors` (fd01165), with `docs/SHEEP_BENCHMARKS.md` brought in from the benchmark branch. Engine 0.14.0, save format 10. Engine and docs only.

**Built (engine).** BUILD_PLAN 2.3, the animal model (MODEL section 12; figures in DATA, "Sheep"):

- Sheep mobs beside the cattle mobs (`farm.sheep`, left off a farm with no sheep), each with `species: 'sheep'`, grazing the same pasture arrays with the cattle's rules and sheep figures: a greener pick, fuller intake from shorter feed, a lower residual.
- Classes (lamb, weaner, hogget, ewe, wether, ram), Merino (medium and large) and crossbred, SRW, DSE worked out from energy, AE at 8.4 DSE.
- Energy for maintenance, walking, pregnancy (singles, twins, triplets), milk and growth; appetite as a share of live weight; lamb and weaner growth; CS and weight moving together (0.19 × SRW a CS).
- Joining on the district's date for 5 weeks on a 17-day cycle, conception and litter by CS and breed, ram cover at 1% + 1, scanning count, lambing at 147 days, birth weight, lamb survival by litter, breed and CS, marking and weaning counts, orphans.
- Wool: clean fleece with feed and gain, slower in late pregnancy, micron with growth rate, coarser males; `shearMob` and `crutchMob` (fleece weight, micron, months of wool; 6 weeks of fly cover).
- Deaths: adult, lambing (by litter, breed, CS, toxaemia), lambs (early and late), weaners (by growth and weaning weight), thin sheep, no water, flystrike.
- Water by class and season. One mob to an area holds across species: cattle are refused into a sheep paddock (`sheep-there`), plans wait, weaner calves never go in with sheep.
- Helpers and reads for milestone 2.4: `addSheepMob`, `ensureSheepState`, `sheepMobsOf`, `occupiedAreas`, `sheepAreas`, `sheepWaterLitres`, `shearMob`, `crutchMob`, `fleeceMicron`, `greasyKg`, `sheepMobsRead`, `sheepJoiningRecord`, `stockingRead`, `fleeceOf`, `dressingShare`, `carcaseKg`, `dseOf`, `aeFromDse`, `sheepClassOf`, `SHEEP_DISTRICTS`, `sheepDistrict`, `WATER_WELFARE_HOURS`. Events: `sheep` (notes), `lambs-born`, `sheep-deaths`, `sheep-weaned`, `mobs-joined`.

**Tested.** Every row of SHEEP_BENCHMARKS.md is a test named by its SB number (`calibration/sheep.units`, `.paddock`, `.mob`, `.year`); the model's figure for each is in CALIBRATION (15 Nov 2026). 61 rows pass in full, 4 pass in Western Victoria (or the Central West) with their Tablelands and Central West parts skipped, 5 are skipped (list below). Rule tests (`sheep/rules.test.ts`) and farm tests (`sheep/farm.test.ts`: refused in Central Queensland and on an occupied paddock, seeded repeatability, save and load mid-run, an older save loads with no sheep, a farm with no sheep saves no sheep, the whole life cycle on a farm, cattle refused into a sheep paddock, and cattle in their own paddock playing the same figures with sheep next door). No calibration band and no `*.mvp.test.ts` file changed; the no-hands digest (engine 0.12.1) still passes.

**Skipped benchmarks, with the reason** (each a `test.skip` named with it):

- SB-40, SB-41, SB-43 (Tablelands and Central West parts) and SB-47 (Tablelands): C18. On native pasture alone with no sheep supplement, the grass model's winter takes ewes from CS 3 to 1.4 (Tablelands) and 2.2 (Central West) at lambing. Western Victoria passes.
- SB-59, SB-60, SB-61, SB-62: C18. The carrying capacity rule (the grass model's) gives 3.55 DSE/ha on Tablelands native pasture and 5.5 to 7.7 on sown pasture, against 5 and 12 to 23 sourced.
- SB-65: C26, the sheep-proof fence price is Claudia's, and the netting fence is milestone 2.4.

**Calls for Claudia** (each is one constant in `packages/engine/src/data/sheep.ts` unless it says otherwise):

1. **C18, sheep through a Tablelands or Central West winter.** Unsupplemented ewes on native pasture lamb at CS 1.4 (Tablelands) and 2.2 (Central West), so marking is 53% and 67% and the Tablelands loses 19% of its ewes (first-pass figures; the third pass re-measured 48.8% and 71.1% marking and 31.7% of Tablelands ewes lost, eight seeds). Three ways to fix it, all yours: the grass model's winter green on native pasture, a sheep supplement (hay or grain, milestone 2.4), or running the benchmark on sown pasture and crops. Nothing was changed.
2. **C18, carrying capacity.** The rule's 26% of growth eaten is far under what 13 to 23 DSE/ha eats on improved pasture (45 to 80%). The growth itself matches EverGraze. To change: the district or planting safe use in the grass model.
3. **C3, DSE per AE.** Sheep use 8.4 (`DSE_PER_AE`); the cattle screens still say AE × 8 (`DSE_PER_AE` in `cattle/animal.ts`). `stockingRead` adds them at 8.4. Pick one figure and change the other constant.
4. **C21, Merinos unmulesed.** 17% of Merino ewes struck a year with one shearing and one crutch (`FLYSTRIKE.daily`). For mulesed Merinos, lower `FLYSTRIKE.daily.merino`. Strikes apply to every weaned sheep, though only ewes were measured.
5. **C26, the sheep-proof fence price.** Not built; SB-65 waits for your figure.
6. **C27, joining dates.** 1 April (Western Victoria, Central West), 15 May (Tablelands) (`JOIN_START`). Each mob keeps its own date (`joinOn`) so the player can change it later.
7. **C30, no water.** No source gives the days a sheep lives without water, so the cattle rule stays (dead on day 4). The transport standard's 48 hours off water is kept as `WATER_WELFARE_HOURS` for the screens.
8. **C31, dressing percentage.** Now sourced (MMFS 3.2, lambs 45 to 50%; MLA 2001, mutton by fat score). The fat score is taken as CS rounded (stand-in). The mutton table is dated 2001.
9. **C22, worms left out.** Western Victoria's weaners grown to target lose 1.6% a year, under SB-47's 2 to 6% (the national average takes in worm deaths). Held as a known gap of 0.4 points (`SB47_WV_UNDER`), as the cattle tests hold theirs.
10. **C32, two tables to check.** SB-03 (Agriculture Victoria table 3.1) passes. For lamb survival by CS, S19's table (C32) and its text disagree (the table gives 48% more lambs at CS 3.0 to 3.5 than 2.0 to 2.5, the text 15 to 20%); the slopes sit between them so SB-37 holds (`SURVIVAL_PER_CS`). Please check the printed page.
11. **Dead feed in the sheep's reach counts in full** (`DEAD_IN_REACH` 1), as for cattle. A quarter (the first build) starved sheep on dry winter feed (LESSONS SH1).
12. **No chores for the life cycle.** Rams work only in the 5 joining weeks; scanning is counted on day 80 of the joining; ram lambs become wethers at the marking count; lambs are weaned at 14 weeks into an empty watered paddock (or stay). All automatic until milestone 2.4 adds the jobs (marking, shearing, crutching).
13. **Sheep in the score and the books.** Sheep deaths stay out of the year's death score; sheep have no running or health cost yet. Milestone 2.4 should decide both.
14. **Crossbred ewe deaths.** First-cross ewes die 3.5% at lambing (S67) and 4.8% a year in Western Victoria, over SB-43's 2 to 4%; SB-43 is tested on Merino ewes (Lifetime Wool's baseline).
15. **Sheep and cattle in one area after a fence change** both graze it, unjoined, until one is moved. Sheep get through cattle fences in milestone 2.4.
16. **Stand-ins** (no source; each listed in `data/sheep.ts`): crossbred SRW 60 kg; ram weight 1.8 × SRW and maintenance × 1.25; triplet pregnancy × 2.4, third lamb's milk 2 MJ, triplet birth weight 3.0 kg; triplets 10% of litter above 1.25; the lactation curve; in lamb 5 points a CS; birth weight in proportion to SRW; the sheep's green pick (0.1), short green (100 kg) and bare ground (200 kg); residual 150 kg; a ceiling of 0.4 kg a day gained or lost; orphans weaned from 56 days; milk counted as wool feed at 1/11 kg a MJ; crossbred micron 28; CS to fat score.
17. **Fitted figures**, each set to a sourced benchmark and named in `data/sheep.ts`: maintenance, young sheep's maintenance, pregnancy, milk, large Merino SRW, gain energy, appetite and short feed, the lamb's milk share and grazing, milk on short feed, lamb survival by CS, crossbred lambing risk, adult and weaner deaths, flystrike rates, wool per kg, crossbred wool, wool and gain, wool by age, micron and growth.

**Not done.** Everything in MODEL section 12, "Not built yet": the market, setup choice, netting fence, shearing and crutching jobs and wool income, sheep supplements, sheep on the map (milestone 2.4). Speed is checked for cattle only (`pnpm test:speed`); a large sheep flock was not timed.

### 15 Nov 2026: m2.3 Sheep model, second pass, and the engine half of m2.4

Same branch. The hands review fixes (b4e8b75) merged in first. Engine 0.15.0, save format 11. Engine and docs only. Claudia was away: every open call below was made, built and is listed here for her.

**Review fixes.** SB-53 back to the document's band (1.8 to 2.2%), measured on 100,000 ewes; every other band checked against the document. SB-43 tested on both breeds (first-cross a known open gap). One mob to a paddock holds by itself across species (breakouts both ways). Weaner deaths carry the cause `weaner`. The losing-weight note gives its reasons. One DSE figure (8.4). The unmarked figures named and listed in DATA. CALIBRATION says which rows pass by construction. Speed: sheep are records with head counts; the largest flock runs at 2.65 ms a day (before: about a second a day).

**Built (engine half of 2.4).** Sheep feeding (lick, grain, hay); contractor shearing and crutching on dates with wool sold at shearing; sheep health costs and deaths in the year score; rams in and out with the joining; the sheep market (buy and sell at MLA indicators, sale days, freight); netting fence and sheep that get through cattle fences; the cattle, sheep or mix choice at setup with start flocks; reads for the screens (`sheepMarketRead`, `fenceKindsRead`, `nettingEdges`, `sheepYearRead`, and on `sheepMobsRead` the feed and the contractors' days).

**Tested.** Every benchmark row as before, the Tablelands and Central West year rows un-skipped (with winter feeding); known open gaps as expected failures; rule tests for counts, feeding, contractors, the market, netting, breakouts, setup, the score and old saves; the sheep speed test.

**Calls for Claudia (second pass), added to the list above:**

18. **The Tablelands winter (the top grass question, C18).** Unfed ewes there lamb at CS 1.4 and 32% die (31.7% over eight seeds, re-measured in the third pass; the 19% first written here was three seeds on the 0.4% adult rate), whatever the stocking. The grass model's native July and August give sheep 24 to 44 kg/ha green, about 1,000 kg/ha dead at 50% digestibility, ME 7.0, CP 5.5%. S57 says unimproved native pasture there carries 5 DSE/ha. The grass model was not changed; the year rows run with winter feeding. Evidence in CALIBRATION (15 Nov 2026, second pass).
19. **One DSE figure, 8.4, for every display (C3).** `data/stocking.ts`. The cattle screens' DSE figures move by 5% (AE × 8.4, not × 8): `mobSummaries`, `farmTotals` and the paddock summary's DSE per ha. No cattle benchmark moved. To go back: set `DSE_PER_AE` to 8.
20. **Breakouts across species.** Cattle never push into a paddock with sheep, sheep never into one with cattle; they take another fence or stay put. The other option was letting them box up together.
21. **Sheep get through every cattle fence** (permanent, electric, tape) when hungry or thirsty, by the cattle rule and chance; only netting, gates and the boundary hold them. Gates holding sheep is a builder's call.
22. **Joining dates sourced (C27 replaced):** Central West 5 January (June lambing), Tablelands 7 April (September lambing), Western Victoria 1 April. The NSW calendar's generic March joining was not used.
23. **Shearing and crutching days** follow the joining: crutch 60 days before lambing, shear 80 days after (NSW calendar). The shed hands, classer and presser are not charged (only the 2024 award shearing and crutching rates).
24. **Wool income** is its own line (`year.wool`); shearing, crutching and animal health go in running costs; sheep sales and purchases go in the cattle `sales` and `buys` lines.
25. **Sheep deaths in the score** count as one DSE's share of a beast each (÷ 8.4), so a sheep farm's score is not swamped by lamb deaths.
26. **Feeding** fills the energy gap up to Agriculture Victoria's full ration; the year benchmarks feed when CS falls under 2.7 (weaners under 50 g a day). Grain is charged at the game's pellet price and hay at its hay price (no dated feed prices were read).
27. **Stand-ins:** netting $10 a metre (C26), rams $1,200, Merino breeding sheep at 1.5 times mutton value, sheep freight $3 a head, health $3.57 a head a year, grain protein 11%, a sheep lick at the cattle rule and cost ÷ 8.4, start flock 1.5 DSE a ewe, young sheep frame under 540 days, the bought-sheep defaults.
28. **Refit:** adult deaths outside lambing 0.4% a year (was 0.8%), refitted to SB-43 when sheep became records.
29. **Known open gaps** (expected failures, figures in their names): first-cross ewe deaths (SB-43) 4.2 to 4.7% against 2 to 4% (S67's 3.25% at lambing alone leaves no room); Western Victoria weaner deaths (SB-47) 1.65% against 2 to 6% (worms left out, C22).
30. **SB-43's "never over 4.5%"** is held on the mean over the blocks, as every year band is; one 675-ewe block in eight went over.
31. **Flystrike counts strikes**, so a ewe struck twice in a year counts twice (records do not keep which ewe).

**Not done.** Real-year sheep prices (the indicators are pulled; the loader is not wired); booking sheep onto a later sale; Dubbo and Hamilton sheep sale days (the cattle calendar stands in); the marking job and its cost; the map and screens (another milestone). Timings were taken on a busy machine.

### 15 Nov 2026: m2.3 Sheep model, third pass

Same branch, engine and docs only, save format 11. After a second review.

**Built.** Start flocks as they stand on the start date (age classes, pregnant or with lambs at foot by the district's joining day, replacements, wool since shearing); sheep in the year totals (eaten, gain, deaths by size); moving sheep (whole mob, part, plans) with the species and fence rules; adult deaths back to the derived 0.8% and a wether rate; SB-43 per block; the year harness feeds through the player's action; grain at a sourced price; CS floor facts for the to-do list; feed cost a day per mob; the flystrike note at most weekly; shed staff, selling costs and oddments on the clip; the dated EMI; ewe micron 17.8; saves read by format number with real format 9 and 10 fixtures; sheep sales and wool on their own money lines; bought sheep land in the yards next morning; wool on backs in net worth; netting tellable beside the map view.

**Tested.** A test for each item (start flock per district, score, moves and each refusal, feeding, facts, costs, fly note, clip, market, arrivals, money lines, old saves, netting); every year row before and after in CALIBRATION.

**Calls for Claudia (third pass), added to the list above:**

32. **Sheep deaths score by size, sheep only.** (live weight ÷ 450)^0.75 AE a death, so a lamb is about 0.03 of a beast and a ewe 0.2 (replaces call 25's ÷ 8.4). Cattle still count one each: weighing cattle deaths by size too would change every cattle score.
33. **Adult and wether deaths 0.8% a year, derived** (call 28's 0.4% refit undone). SB-43 Merino then misses: Western Victoria 4.63% mean, and single blocks over 4.5% in the Tablelands (4.67) and Central West (5.00 to 5.53). Known gaps.
34. **Tablelands winter feeding costs about $19.76 a ewe a year** at feed barley's $330 a tonne (re-measured; it rides on the grass question, call 18).
35. **Ewe micron 17.8** (males 19.0): the coarsest that keeps SB-51's 1-micron gap, since the districts grow medium wool.
36. **Wool on backs counts in net worth**, net of the levy and the cost to shear, so a first year does not count wool grown before it.
37. **Lambs at foot are priced on their own** (MLA's lamb indicators by weight), not with the ewe: MLA has no ewe-and-lamb unit indicator. At the start they cost nothing on the books.
38. **Past the overdraft** a day's sheep costs come off cash as cattle supplements do, and the bank's limit ends the game; buying sheep is refused.
39. **The start flock**: ewes 1.5 to 5.5 years, cast for age at 6 (stand-in); this year's wether lambs counted as sold before the start.
40. **Wool selling costs are stand-ins** (shed staff $1.50 a head, levy 1.5%, $40 a bale selling, $16 cartage, $14 pack, 180 kg bales, oddments 22% of the clip): the pages refused automatic reading. The oddments price (0.9 of fleece) is from Mecardo.
41. **Several plan moves a day move sheep once a day.**
42. **The fly season is the same in every district** (known simplification: no district fly season page was read).
43. **Start-flock first-year profit is a known gap** against DPIRD's $50.46/DSE gross margin: Tablelands $11.6 (unfed winter), Central West $124.7 and Western Victoria $149.9/DSE (no sales, so the lamb crop is valued at 2026 prices; running costs are shearing, feed and health only).
44. **Netting on the map** waits for a `netting` code in `packages/shared` (outside this milestone's scope); `nettingEdges` tells it until then.

**Not done.** The netting look on the map (VISUALS proposal only). Re-reading the Central West June-lambing page by hand. Overhead costs a year for sheep. The web test `mobcard.test.ts` (DSE × 8) still fails, as agreed.

### 15 Nov 2026: m2.5 Calf growth

Home-bred calves weighed about 80 kg at weaning (9 months) and 82 to 117 kg at 200 days in every district. The sources say about 160 to 175 kg at 180 to 200 days. Two MVP formulas were wrong for calves and are fixed (engine 0.14.0). Figures before and after are in CALIBRATION.md (the m2.5 entry), the sources in DATA.md ("Calf growth to weaning"), the rules in MODEL.md section 3.

- **Calf cost of gain** (`YOUNG_GAIN_COST`, `mjPerKgGain`). Stock up to 100 kg pay 0.52 MJ of ME per kg LW^0.75 for each kg gained (Sekine and Asahida 1990 measured 510 to 520 kJ for calves under 100 kg), moving in a straight line to the MVP's grown figure (20 + 0.045 × LW) by 200 kg, where the paper's data stop. No step at weaning. Before, a 60 kg calf paid twice the measured cost.
- **Milk falls with the cow's condition** (`milkMJ`, `MILK`). The MVP cut milk to 45% on any feed of ME 7.35 or less. Now the cow keeps milking on poor feed, pays for it in condition, and her milk falls from full at CS 2.25 to nothing at CS 1.5, above the CS 1.4 where deaths begin.
- **No milk from nothing.** When a cow's loss for the day would pass the 1.5 kg floor, the milk she cannot pay for is not made (`unpaidMilk`), so all her milk is paid for. It moved almost nothing (Tablelands September-start herd gain 101.3 to 100.9 kg).
- **New benchmarks** in `calibration/herds.test.ts`, by district, from the nearest sourced figures: gain from birth to 200 days, weight at 100 and at 200 days, gain from 100 to 200 days. Every district passes at 100 days; every district is open on daily gain, and the three southern districts on weight at 200 days too (`it.fails`, named with their figures). A plain regression floor beside each district holds today's figures. A plain test holds the found case (`calibration/calvesFoundCase.cq.test.ts`), and `calibration/herdYears.test.ts` pins three years of calving and cow condition.
- The MVP comparisons load the MVP with these rules put in place (`REBUILD_RULES` in `test-support/mvp.ts`), which keeps the MVP's own lines as the record of what it did.

| District, average year | Birth to 200 days, kg a day | 100 days, kg | 200 days, kg | 100 to 200 days, kg a day |
|---|---|---|---|---|
| Central Qld (band 0.6–0.95; 100–146; 140–225; 0.6–0.95) | 0.28 → 0.53 | 73 → 111 | 93 → 142 | 0.20 → 0.33 |
| Tablelands (band 0.7–1.1; 101–146; 171–256; 0.7–1.1) | 0.34 → 0.54 | 84 → 107 | 103 → 143 | 0.20 → 0.39 |
| Central West (same band) | 0.32 → 0.57 | 84 → 120 | 101 → 149 | 0.16 → 0.29 |
| Western Victoria (same band) | 0.41 → 0.63 | 91 → 127 | 117 → 163 | 0.26 → 0.36 |

**Calls for Claudia**

1. **Cows now milk off their backs.** On poor feed a cow keeps milking, gets thin late in the dry season or the winter, and fewer get back in calf. Over three years with no player action, calves born per 100 cows and heifers fall to about 55 by year 3 in Central Qld and on the Tablelands (were about 58 to 61), and on the Tablelands about 17% of cows sit under CS 2.25 from August to October in years 2 and 3 (was none). Deaths did not rise. That is about what a grazier would expect of a herd left alone with no lick and no early weaning. Northern breeder herds wean 72 to 77 calves per 100 cows on average (CashCow), so year 1 sits above that and years 2 and 3 sit at or below the bottom of it. **What a player can do:** put the herd on lick or hay through the dry or the winter, wean earlier (the mob card offers it), or sell cows. **Whether the screens tell them why:** the mob card's reasons already say "milking" with the MJ she puts into milk, and "low ME" and "low protein" on poor feed, but nothing says her condition is falling *because* she is milking, or suggests weaning. A line for that, and a "cows getting thin" item in Things to do, would be screen work for a later milestone.
2. **The milk condition figures are stand-ins** (`MILK` in `packages/engine/src/data/cattle.ts`: full milk at CS 2.25, none at CS 1.5). No published figure was found. 2.5 and 1.6, 3.0 and 1.8, and 2.25 and 1.5 all keep every herd benchmark in its band; with no fall at all, Tablelands herd deaths are 4.4% (band 1.5 to 3.6%). To change it, change the two numbers.
3. **The calf cost of gain** (`YOUNG_GAIN_COST`, same file: 0.52, 100 kg, 200 kg) comes from Holstein calves in Japan on milk and concentrate, and here it also prices pasture gain for weaned stock up to 200 kg, whatever the diet's ME. The Australian feeding standards make the cost depend on weight against mature weight, rate of gain and diet quality, but could not be read online. FutureBeef's table gives 13 MJ a kg of gain at 100 kg (close to the game's 16.4) and 37 MJ at 200 kg (above the game's 29), so nothing read supports a cheaper rule for weaners between 100 and 200 kg. Not changed. If you can get the CSIRO 2007 book (Nutrient Requirements of Domesticated Ruminants), its energy value of gain would settle it.
4. **Every calf row is open except weight at 100 days, and Central Qld weight at 200 days.** The southern floors are now MLA's own (0.7 kg a day, 171 kg); with them Western Victoria (0.63, 163) is open too. The calves grow well to 100 days and slowly after (0.29 to 0.39 kg a day from 100 to 200 days, against 0.6 to 1.1). The grass looks like the binding limit: diet ME 6.9 to 9.5 on the Tablelands and 6.8 to 8.8 in Central Qld, protein under 7% for 5 to 6 months, feed never short in amount. Calving time alone will not close the Tablelands gap (next item).
5. **When the herds calve (not changed, for you to rule on).** Usual calving: Central Qld calves in the wet season (Brahman-cross herds in the dry tropics from late October, Fordyce et al. 1993); Western Victoria herds calve in autumn, spring or both (the Western District and Limestone Coast businesses in MLA report L.PDS.1908); no source was read for the Northern Tablelands or Central West, where spring calving is the usual reading but needs a source. The game's start herd has its PTIC cows 100 to 210 days in calf on whatever day the farm starts, so on a 1 September start every district calves from late November to early March (a May start calves August to November). The review found that with a May start (spring calving) 79 to 82% of Tablelands cows sit under CS 2.25 in September and October, the herd averages CS 1.99 at its lowest, and those calves do worse (0.51 against 0.56 kg a day). Changing calving time means a calving window per district in the start herd (`startHerd` and the `ptic` and `cowCalf` sale classes, or a district setting beside them), the herds benchmark runs, the map fixtures and web tests that count head and calves, and what a new player sees on 1 September.
6. **Herd figures that moved** (all still in band, CALIBRATION.md m2.5): herd gain a head rose 5 to 15 kg in every district; Central West's highest single herd lost 3.85% (was 3.37). Tablelands preg tests now run 7.17 points over the expected rate (was 5.54, band up to 9): the yardstick moved, not the cows. Thinner cows make the expected rate fall (83.6% to 81.4%) while the share in calf barely moves (89.1% to 88.5%).
7. **Why the MVP once recorded 148 to 249 kg at weaning:** most likely bought calves at foot, set at 36 kg + 0.8 kg a day of age, not calves the model grew. No script for that check survives.
8. Map fixtures were made again (`pnpm dev:map-fixtures`) after each model change; only the cattle figures moved.

### 15 Nov 2026: m2.7 Engine join

Branch `m2.7-engine-joined`: `m2.3-sheep-model` (eff980d) with `m2.5-calf-growth` (2bd90de) merged in. Engine 0.16.0 (one bump for both: the calf change was numbered 0.14.0 on its own branch, which the sheep line had already used), save format 11 (no stored field changed; formats 9, 10 and 11 load, fixtures kept). Engine, docs and map fixtures only.

**The join.** Only `version.ts` and its test clashed in code; both sides' docs were kept in full (CALIBRATION, DATA, DEVELOPMENT_LOG, LESSONS; MODEL merged by itself). No lesson or call number clashed: the sheep lessons are SH1 to SH11, the calf lesson is C7, and calls are numbered within each entry. MODEL's "DSE = AE × 8" in the cattle section was brought up to the sheep branch's 8.4, and the calf rules there are marked as shipped in 0.16.0. The Benchmarks table in CALIBRATION now has a State column for every cattle, calf and sheep row.

**Proved.** Every cattle figure equals the calf branch's and every sheep figure the sheep branch's, to the last digit (CALIBRATION, the m2.7 entry). The no-hands digests the calf branch took pass unchanged, so nothing was regenerated. The map fixtures were made again and none changed. A mixed farm runs two years with no player action with nothing eaten twice, year lines that add up to the cash, both species breeding and weaning, and the same result on the same seed (new test, `sim/mixedFarm.test.ts`).

**For Claudia.**

1. **Sheep and cattle rules stay apart.** No sheep code calls a cattle rule the calf change moved. Sheep have their own cost of gain and milk (fitted to the sheep benchmarks), so lambs do not get the calf fix. That is right while the sheep rows pass on their own figures; if a lamb growth row ever opens, look at the sheep rules, not the cattle ones.
2. **Sheep profit a DSE is still a known gap** against NSW DPIRD's $50.46/DSE gross margin (start flock, first year, no hands): Tablelands $11.6 (unfed winter), Central West $124.7 and Western Victoria $149.9 (no sales, so the lamb crop is valued at 2026 prices; running costs are shearing, feed and health only). Unchanged by the join (sheep branch call 43).
3. **On the mixed probe farm** (Western Victoria, 86 cattle and 659 sheep, left alone) 579 sheep died in two years, most of them lambs (1,185 born), and profit fell from $192,435 in year 1 to $25,757 in year 2 (not looked into further: year 1 counts its lamb crop as new worth, as the start-flock gap above does). Nothing was done to the farm, so this is what neglect looks like; it is not a benchmark.
4. **Weaners go where the other species is not.** On a mixed farm the first lambs went to Paddock 1 because Paddock 6 held cattle. That follows the one-mob-a-paddock rule; it does mean a mixed farm's weaning destinations depend on where the cattle are.
5. **SB-65's skip reason is stale.** It still says the netting fence is milestone 2.4; netting is built (at the $10 a metre stand-in). The row waits only on your fence price (C26). Not changed here.
6. The web test `apps/web/server/game/mobcard.test.ts:111` (DSE as AE × 8) still fails, as agreed, until the sheep screens.

**Checks.** Type check, lint, format, every test (one agreed web failure), both speed tests alone (cattle 4.49 ms a day, sheep 1.99 ms), build and the browser-bundle check.

### 15 Nov 2026: m2.7 Review of the sheep third pass

Same branch (`m2.7-engine-joined`). Engine 0.17.0, save format 12 (a joining's `lambingStart` is null before lambing; real-year farms keep `sheep.prices`; formats 9, 10 and 11 load, with a new format 11 fixture pair made by the join commit's own code). Engine, docs only. Figures before and after in CALIBRATION (the m2.7 review entry); sources in DATA ("Review of the third pass"). Every cattle figure is still byte for byte the calf branch's; the no-hands digests pass untouched.

**Done, each with a test written first and seen to fail** (except the real-year sheep prices, item 10, whose tests were written with it):

1. **Start lambs weaned.** A lambing that began before the farm's first day is a negative day, so marking and weaning count from it; no lamb stays at foot past 150 days; a sheep under half the weight it is measured against dies, cause `starved` (a lamb at foot against its age's normal weight, a weaned sheep against the normal weight at weaning, so SB-46's slow weaners live). Central West from 1 September now weans on day 6 at about 22 kg, joins dry, lambs 2,070 (was 628) and shears its start lambs.
2. **Sheep plans** take a move's daylight when they move the mob, warn of dry stops (`dryAreas`) and give the no-water warning.
3. **Sheep on their way** count in net worth at what was paid.
4. **Regression limits** beside every open sheep row (SB-43, SB-47, the start-flock profit, SB-GM); the SB-43 comment fixed (4.5% is per block).
5. **Adult and wether deaths 0.91%** (3.2 − 1.95 − 0.34; flystrike from S37).
6. **Start flock shape**: one age class of ewe weaners kept, the oldest class cast at weaning, lambs at foot at the CS the model lambs at (Central West 90.9 a 100 ewes joined, against the model's own 87.4; was 101), mid-joining ewes already in lamb.
7. **Pause and resume** for sheep plans (`pausePlan`, `resumePlan` work on a sheep mob).
8. **Nothing eaten twice**, square by square: green and dead feed on every square match the cattle-only or sheep-only farm until day 276, and the feed lost on a day is what was eaten plus trampling.
9. **SB-65** tested: netting $10 a metre against permanent $7.
10. **Real-year sheep prices**: the six MLA national indicators for the real date in today's dollars, with their own data version (cattle data versions unchanged). Two long breaks (heavy lamb 37 days, Merino lamb 23 days, both over the 1996 Christmas) are covered by a 45-day hold; wool stays at the dated stand-in.
11. **Lambs count in the year's births.**
12. Smaller: the netting comment; dry ewes out of season are "other" (CS floor 2), at the joining stage only from 42 days before joining; format 10 lambs doomed after day 2 still die; the losing-weight note from day 10 then weekly, low condition weekly; **the sheep breakout stream restarted from the seed every day** (the sheep step replaced its stream record), so most thirsty mobs never broke out: fixed. Sheep get through permanent, electric and tape fences, standing or knocked down; netting, gates and the boundary hold them.
13. **The budget**: the DPIRD pages refuse automatic reading (HTTP 403). The $50.46 was read (Sheep Central, 5 Aug 2026); the October 2024 20-micron budget's figures were seen in search summaries only (DATA).
14. **Costs from the budget**: shearing $9.81 a head all in, crutching $1.92, ram replacement. Ewe micron and cut not changed (below, call 4).
15. **SB-GM** a managed flock: Central West $38.69 a budget DSE (passes $37.85 to $63.08); Tablelands $71.88 and Western Victoria $90.33 open, mostly wool. Cattle against sheep on one farm recorded in CALIBRATION.

**Calls for Claudia (review of the third pass), not changed** (1 to 3 are the review's figures):

1. **Death points in the year score mix two rules**: a dead newborn calf costs 60 points, a ewe about 11.6, a newborn lamb 1.9 (sheep by size, cattle one each).
2. **Old ewes** die at the same rate as young ones, and nothing casts them for age unless the player sells them.
3. **With no sales** a Western Victoria flock reaches 121% of carrying capacity by year 3.
4. **Ewe micron 17.8 stays.** C15 says the districts grow 19 to 21 micron, but SB-52 holds wethers at 18 to 20 (S64, 19.0) and SB-51 holds males 1 to 3 micron coarser than ewes (S46). Ewes at 19 would need one of those rows to move. Your call which.
5. **DSE a ewe.** The model's DSE from energy is 1.6 to 2.0 a ewe joined; the DPIRD budget rates 2.32. The margin row divides by the budget's rating; a screen that shows "per DSE" on the model's own figure reads 20 to 45% higher.
6. **Wool prices** are the dated September 2026 stand-in on every farm (no real-year wool series). They are why Tablelands and Western Victoria sit over the margin band.
7. **Stand-ins added**: starved at half the reference weight; no lamb at foot past 150 days; ram working life 4 years; joining stage from 42 days before joining. Costs not charged for want of a figure: marking, freight beyond the $3 head fee, pasture. Animal health stays $3.57 a head.
8. **Thirsty sheep** get out by the cattle rule (the cattle odds, then a 21-day wait). One that breaks into another dry paddock can still die before its next try, as cattle can.
9. **Cattle against sheep on one farm** (unmanaged, average year, overheads on each): Western Victoria year 2 cattle −$96 and sheep +$101 a DSE; Central West −$97 and +$59. Not margins; for you to judge whether a managed comparison should be a benchmark.
10. **SB-GM's band**, ±25% of $50.46, is the builder's: tighter would test the price date.

**Checks.** Type check, lint, format, build, browser bundle: clean. Every test passes but the agreed web test (`mobcard.test.ts:111`); one cattle test that timed out under load passed when run alone. Map fixtures made again: none changed. Speed, each alone: sheep 1.66 ms a day (6,865 sheep). Cattle read 5.4 to 9.1 ms against the 5 ms limit while about 30 other node processes ran; the join commit's own code (44f0583) read 4.36 and then 6.07 in the same minutes, so the miss is the machine, not this change (no cattle code path changed). Run it again on a quiet machine.

**Not done.** Reading the DPIRD budget itself (refused). A managed cattle margin to set beside SB-GM. The web screens for the new sheep plan events and `sheep.prices` (outside this scope).

### 15 Nov 2026: m2.8 Sheep screens

Branch `m2.8-sheep-screens`: `m3.5-admin-shell` (78930e7) with `m2.7-engine-joined` (5337928) merged in (engine 0.17.0, save format 12). Stage 2.4, the screens half.

**The join.** Only DEVELOPMENT_LOG and LESSONS clashed; both sides kept in full. What the engine change broke in the web app: one test, `mobcard.test.ts` (DSE as AE × 8). It now reads the engine's `DSE_PER_AE`, so every DSE shown is AE × 8.4 with no figure written in the web app. Nothing else broke: stored farm format 3 is unchanged, and a farm stored by the web line on engine 0.13 (save format 9, the engine's own old-code fixture wrapped in the web's stored format) opens, shows no sheep, plays a day and saves on 0.17 (`sheep.test.ts`, "old farms").

**Built, all behind the `sheep` feature switch, off by default** (`FEATURE_SWITCHES.sheep`, a seed migration, an admin switch entry). Sheep show on a farm in a sheep district when the switch is on, or when the farm already has sheep. Never in Central Queensland.

- Setup: a "Cattle, sheep or both?" step on a running farm in a sheep district, with the start flock in plain facts read from a probe farm the engine sets up once per district.
- Mob card and herd list for sheep mobs (`SheepCard.tsx`): head by class, lambs at foot, DSE and AE, weight, CS, daily gain in g, where the flock is up to, wool (months, clean kg a head, micron), "Shearing on 14 November. About $9.81 a head.", crutching, the joining record (joined, scanned, born, marked, weaned), reasons when losing weight (the engine's own losing-weight reasons from its last note), and the fence fact. Paddock sheet and stocking count sheep DSE and AE at the one figure.
- To-do lines: sheep in the yards (opens the move), no water, under the CS floor for the stage (with reasons), behind a fence that does not hold sheep.
- Moves and plans through the existing flows. The server turns a move named by a sheep mob into the sheep move. Refusals read "Paddock 4 holds cattle. Cattle and sheep run in separate paddocks." The move card says when the paddock has cattle fence ("A cattle fence does not hold sheep."), no water, or sheep to join.
- Feeding (none, lick, grain, hay) with the cost a day from `sheepFeedCosts`, confirm first.
- Sheep market (Market tab, Cattle or Sheep): MLA indicators and wool prices, buy a class (arrives next morning in the yards), sell from a mob, each with the money lines on the card before anything is spent. Wool sells by itself at shearing: its own line in the summary, the diary and the year (Wool, Sheep sales, Sheep bought).
- Shearing and crutching: dated facts on the card and herd list, "Move shearing" (month and day), the result in the summary and the diary (clip per head, micron, income, cost).
- Netting in the build tool, at the engine's price, and each cattle fence says "A cattle fence does not hold sheep." on a farm that shows sheep; a cattle fence drawn on a farm with sheep carries the same note.
- Words for every sheep event (`sheepwords.ts`, `SheepEvent` is every engine event named `sheep*` or `lambs-born`; a new one fails the type check until it has words). Lambs and sheep deaths with their causes in the summary.
- The map: flocks and netting drawn (render, in code: there is no sheep art in `art/`; VISUALS "Sheep" and "Netting fence"). The server adds `flocks` to the view and sets netting segments to `VIEW_FENCE.netting`.
- Help: three sheep topics and four terms, shown only on a farm that shows sheep. The tour is untouched.

**Engine changes (said so):** `setPlan` and `clearPlan` take a sheep mob (pausePlan and resumePlan already did): without this a farm with no cattle could not make a plan. A test in `sheep/moves.test.ts`. Two exports: `SHEEP_BUDGET_COSTS` and `MAX_SHEEP_BUY`. No rule or number changed.

**Tested.** `sheep.test.ts` (switch off: cattle only, no sheep word in anything sent, sheep jobs refused; switch on: never in Central Queensland, a sheep farm's card, feeding, a move, moving the shearing day, a shearing in the summary, the inbox and the year's money, buying and selling with the money first, the yards to-do, the plain species refusals both ways, the old save). The key list test has a mixed sheep farm fixture and every new key. Help topics test. Render tests (subagent). In the browser: see the report and below.

**How the switch is turned on with no database:** `GG_SWITCHES_ON=sheep` (read only when no database is set; `.env.example`).

**Calls for Claudia**

1. **A farm that already has sheep keeps showing them if the switch goes off.** New sheep farms and the sheep market for cattle farms go with the switch. Hiding live animals that still eat and die seemed wrong.
2. **The farm view version stays 4.** `flocks` is optional and netting is a new code, so past days' pictures still draw (the map refuses another version). A map given an engine view alone draws netting as permanent fence.
3. **Sheep part moves are one class at a time** (the engine's `moveSheepPart`). The picker says so.
4. **Sheep are sold on a sale day only** (the engine does not book sheep onto a later sale). The card says when the next one is.
5. **Only the shearing day can be moved on screen.** Crutching and joining keep their dates (the engine can move them; a screen for them is easy to add).
6. **The summary's Head, Calves and Live weight rows stay the cattle's** (the engine's period figures); sheep come as their own lines. Top bar head counts both.
7. **Paddock "days of feed" counts the cattle only** (the engine's paddock read); on a sheep paddock it can say no stock on it.
8. **The start flock text is general** (read from a small probe farm on 1 September), not the player's own head count, which is shown once the farm is taken.
9. **Gain is shown in g a head a day for sheep**, kg for cattle.

**The sheep model's open gaps that keep the switch off** (from the engine entries above, for Claudia to rule on):

- The Tablelands winter: unfed ewes lamb at CS 1.4 and about 32% die (call 18).
- Carrying capacity under sourced figures on Tablelands and sown pasture (C18).
- Ewe deaths: first-cross ewes 4.2 to 4.7% against 2 to 4%; Merino adult deaths over 4.5% in single blocks (SB-43).
- Western Victoria weaner deaths under the band (worms left out, SB-47).
- Sheep money: start-flock first-year profit per DSE far over DPIRD's $50.46 (Central West $124.7, Western Victoria $149.9; Tablelands $11.6), SB-GM open for Tablelands and Western Victoria; wool at a dated stand-in price on every farm.
- DSE a ewe: the model's energy DSE (1.6 to 2.0) against the budget's 2.32, so "per DSE" on screen reads higher than budgets.
- Unmulesed flystrike rates, the fence price for netting ($10 a metre stand-in), wool selling costs (stand-ins).

**Checks.** Type check, lint, format, build, browser bundle (36 engine-only terms, 9 of them sheep), JS budget: `/play` 201.7 KB of 250 (sheep add about 3 KB; no limit raised; public pages still 0 KB). Map fixtures made again: none changed. Every test passes.

**In the browser** (port 3305, a fresh `GG_FARMS_DIR`, `GG_SWITCHES_ON=sheep`): a Western Victoria sheep farm through the setup flow (the stock step and the start flock text), the mob card, lick fed with its card, the flock moved (the card said the paddock has cattle fence), Merino ewes bought and a ewe sold on the 7 September sale with the money on the card first, skipped to shearing (the summary: 417 shorn, 3.6 kg clean a head at 17.9 micron, wool $38,142, shearing $4,140), sheep on the map close up (woolly, outlined, not cattle-like) and a netting line in light and dark. At 360 px nothing overflowed on the farm, the sheep card or the sheep market (measured by script). Then with the switch off and another fresh folder: no stock step, nothing about sheep in the page or the snapshot, and a Western Victoria cattle farm skipped a week as before. Not looked at by eye: phone landscape, and the sheep sprites at the far zoom.

**Not done.** Moving the crutching and joining days on screen. Booking sheep onto a later sale (engine). A sheep figure for paddock days of feed. The sale line still says "cattle sale" on a day sheep are traded too.

### 15 Nov 2026: m3.3 Daily Farm

Branch `m3.3-daily-farm`, from `m3.2-accounts-and-saves` (d2c9d61). Daily Farm is the real-time mode: one game day for each real day, in the farm's own time zone. It is built behind the `daily_farm` switch, which is **off** until Claudia turns it on. With the switch off, or with no database keys, nothing about it shows except the plain "coming" card in setup; Fast Farm and guest play are untouched. No account, key or connection was made, and nothing was fetched from SILO or MLA: the live feed is written and tested on recorded answers only.

**Engine.** No rule, number or calibration test changed. One line was added to `packages/engine/src/index.ts`: `worksOn` (the engine's own "does this hand work on this day" check, already used by the worker report) is now exported, so the server can ask the same question. No engine function was added, so `docs/MODEL.md` is unchanged. Every `*.mvp.test.ts` and the calibration tests are untouched.

**What was built**

| Piece | Where |
|---|---|
| Migration | `supabase/migrations/20261115000400_daily_farm.sql`: `farm_saves.daily`, `weather_daily.et0_mm` and `rad_mj`, and the switch set off. No new table (a new table needs a row in the access matrix, and the admin work is changing the same file) |
| Time | `server/daily/clock.ts`: local date, next local midnight (a 23 or 25 hour day at a daylight saving change handled by the zone's own rules), zone check |
| The real data | `server/daily/data.ts`: the baked tables with the days kept since on the end, as one bundle built as it stood at the end of the day being run. Sale days carry on by the district's usual weekly sale |
| Where days come from | `server/daily/feed.ts`: a recorded-fixture feed for tests, and `liveFeed` for SILO and MLA (one day at a time, the requests the data scripts make). The contact address is read from `SILO_CONTACT_EMAIL` and is nowhere in the repo |
| The night and the plan rule | `server/daily/advance.ts`: the engine's `endDay`; with no hand working that day the plans are held for the night and the move is offered on the plan card |
| The game server | `server/game/game.ts`: Daily Farm creation (accounts only, behind the switch, from real data), `bringUp` (the same catch-up for the cron job and for "also on open"), the refusal of a job on a farm that is waiting, the midnight message, `dailyDone`, `dailyAck`, `catchUpFarm` |
| The rollover | `server/daily/rollover.ts`, `server/daily/cronroute.ts`, `app/api/daily/rollover/route.ts`, `apps/web/vercel.json`: fetch what is missing, claim 25 farms at a time, a 45 second budget, counted in `daily_counts` |
| Farm facts | `server/db/dbstore.ts`: a Daily Farm's mode, time zone and clock are written when it is made, and `daily_finish` runs inside the save's own transaction, so the saved night and the clock move together |
| Routes | `/api/daily/done`, `/api/daily/ack`, `/api/daily/rollover`; the setup route also says whether Daily Farm is open for this player; the farms routes carry the Daily limit |
| Screens | Setup asks the mode first. The top bar says Daily Farm or Fast Farm and, in the place of Next day and the skips, "Today ends at midnight, in 5 h 20 min" (counted from the server's clock) and Done for today. The catch-up sheet, the plan card and the plan strip are in `components/play/DailyBits.tsx`. The farm picker shows the mode, district, the farm's date and "Today's work not started / started / done" |
| Words | Help has one new line and the guided first day's last step is reworded for a Daily Farm |

**How it works, in the order a player meets it**

1. **Starting.** Setup, step 1, is the mode. Daily Farm is a card with the plain reason when it can not be chosen: switched off or no database ("Daily Farm is coming. Fast Farm is ready to play now."), a guest ("needs an account, so the farm is kept for you from day to day", with a Sign in link), or both slots used. The browser names its time zone once, at the start. The server checks it, the farm records it, and nothing after that can change it. The farm starts on the 1st of the month yesterday was in and runs, night by night on the real weather and prices, up to today, so the player's first day is today's real date and its season is today's.
2. **The day.** One day's light for the date in the farm's zone. Jobs, moves, buying and selling are Fast Farm's. There is no Next day and no skip (a request for one is refused in plain words). The clock on the top bar is from the server's time.
3. **Midnight.** The cron route runs every 15 minutes. It fetches the days of weather and prices that are missing, then brings each farm with a night owed up to today, one saved night at a time. Run twice, it does nothing extra. Run late by three days, it brings the farm up night by night, in order, to the same farm as running each night. Interrupted halfway, the nights saved stay and the next run does the rest.
4. **Also on open.** Opening the farm, or a job, brings the farm up first with the same code. The tests run the same seven days both ways and the two saves are identical.
5. **Missed days.** A night after a date the player never opened the farm on is a missed day. The farm runs it with no player jobs: the hands' standing duties (the engine's dawn) and the plan moves a working hand makes still happen. On the next open, one sheet shows each missed day as the diary has it (facts only) and what the hands did, then "Start today".
6. **Plans.** With a hand working that day the engine moves the plan in the night, as in Fast Farm, and the worker report says so. With no hand, nothing moves in the night. On opening, the plan card says "Your grazing plan said today you would move X to Y." with **Yes** (or "Yes, run today's plan" for several) and **Not yet**. Not yet leaves a strip along the bottom with a **Move** button for each. A move is the engine's own `resumePlan` at the next step.
7. **Fairness.** The action log records each job and each night with the server's time (`at`) and the local date (`on`). A card shown before midnight, sent after it, is refused with "The day ended at midnight, so that job was not done. Here is your farm for today." and the fresh farm. A job on a farm that is waiting for data is refused with the reason. Nothing replays or takes back a day. The only things a request can carry are the job, the farm version and the one-use id.

**How it was tested** (all on PGlite with a fake clock, no network)

| Test file | Proves |
|---|---|
| `server/daily/week.test.ts` | A Daily Farm through 7 real days (13 to 19 Nov 2026) with 2 missed: each night run, the catch-up shows the 2 days once and clears, and the farm run by cron every night and the farm run only when opened have the **same engine save**, diary, totals and day |
| `server/daily/nights.test.ts` | The plan rule on the engine alone, with and without a hand and a plan: a plan moves on the nights a hand works and is held on the nights none does, the card is offered only on the held days, the plan is as it was afterwards |
| `server/daily/rollover.test.ts` | Run twice; run three days late equals running every night; failed halfway then finished equals uninterrupted; stops on its budget and the next run finishes; late weather (waits, says so, refuses jobs, carries on); late prices (the day is all in or not in); a day already kept is never changed; a job at 23:59:59 and at 00:00:01; 25 and 22.5 hour days; one night for each local midnight hour by hour across the April daylight saving change in Brisbane, Sydney and Melbourne, and the sim across it; the request carries no date, clock or zone; the database refuses a day not over and going back; two tabs doing a job and two tabs opening after midnight; switch off; no keys |
| `server/daily/start.test.ts` | Starts on today in its own zone, zone locked, clock one night behind; guest, switch off and made-up zone refused; waits for yesterday's data and starts once it is in |
| `server/daily/cronroute.test.ts` | The secret: 404 when not set, 401 with no detail for a missing, wrong or badly made one, one run for the right one, a throwing run is a plain 500 with no stack and no secret |
| `server/daily/data.test.ts`, `feed.test.ts` | The bundle is as it stood at the end of a day; a gap stops "complete"; sale days carry on; SILO and MLA answers parse; the live feed uses the address from the environment and asks nothing without it |
| `server/game/snapshotkeys.test.ts` | The new reply keys are on the allow-list and seen by fixtures (a plan card and a worker report) |

**Test counts:** the whole run is 156 test files and 3,130 tests, all passing (the full run before the last three fixes had 3 failures that were all the new fields and the one new engine export, listed in the keys tests and the engine's read list). 37 of them are new (`server/daily/*.test.ts`), and `snapshotkeys.test.ts` now sees the Daily keys. `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm check:browser-bundle` and `pnpm check:js-budget` pass. JS: /play 200.3 KB compressed in 11 scripts (limit 250 KB, was within it before and no limit was raised), sign-in pages unchanged at 143.5 to 144.2 KB (limit 150). The production build with no keys (fresh `GG_FARMS_DIR`, port 3296) answered every new route with no 5xx: the rollover route 404 "not set up" (no secret), done and ack 404 "no farm yet", setup's Daily card "coming", a guest asking for a Daily Farm 403 with the reason, and a guest's Fast Farm and Next day working as before. Setup's first step was looked at in the browser pane on a 375 px phone: the Daily Farm card shows the plain coming state, 44 px targets, and nothing wider than the screen. Not checked in a browser: landscape, the light theme, the catch-up sheet, the plan card and the time on the top bar (they need a database and an account, which this machine has no keys for).

**Calls for Claudia** (nothing stopped on a question; each is a default that is easy to change)

1. **Daily Farm is off.** The brief says off by default, the PRD table (11.7) says on. It is built off: `FEATURE_SWITCHES.daily_farm` is `false` and the migration sets the row off. Flip it in admin or with `update public.feature_switches set enabled = true where key = 'daily_farm'` when ready.
2. **Late data waits.** If a day's weather and prices are not in when the day ends, the farm stays on yesterday, says so, and refuses jobs until they arrive (looking is allowed). The other option, running the day on the day before's weather and correcting later, can not be corrected without replaying the farm. SILO publishes a day some hours after it ends, so expect a gap in the morning unless the feed runs early. The rollover tries every 15 minutes.
3. **Start date.** A new farm starts on the 1st of the month yesterday was in and is run to today on that month's real weather, so its first day is today but its day count is not 1 and its cash has had those days' running costs. The farm picker and top bar show the date, not "Day N". The alternative (start on the 1st with no run-up) did not start "on today's real date".
4. **Today's weather is a placeholder.** Today's rain is not known until tomorrow, so the screens' growth figures for today use no rain and the last evapotranspiration. The night that closes the day uses the real row.
5. **Plan moves with no hand.** Held for the night, offered on the plan card. "Yes" is `resumePlan` at the next step: it costs no daylight (as plan moves never did) and restarts the round count. A plan that moves several times a day is moved one step at a time from the card.
6. **A missed day** is a night after a date the player did not open the farm on. Opening and doing nothing counts as playing that day.
7. **Done for today** is a fact on the farm card and in the picker. It does not skip, end or lock anything, and a later job clears it.
8. **Real sale days past the tables** carry on by the district's usual weekly sale until real yardings are fetched. Real yardings are not fetched yet.
9. **SILO's provisional days** (source code 75 for the last few days) are used as served and never revised once a farm has run on them.
10. **Time zone.** Taken from the device once, locked. The database function that changes it (once every 30 days) exists but no screen or route offers it.
11. **Slots.** 2 Daily Farms for each account, enforced by the database, counted apart from the 2 Fast Farms. The picker adds the two limits.
12. **No notifications** (the evening warning, "Time to move your stock"): milestone 3.4.
13. **The plan setup screen** does not yet say "you have no staff, so you will need to remember to move them".
14. **The live feed has never been run against SILO or MLA.** It is built from the requests the data scripts make. Run it on a preview first, with `GG_DAILY_FEED=live`.
15. **Daily Farm data version is the label `daily-1`.** The tables grow by a day each day, so a fingerprint would change daily. A re-pull of the baked tables does not stop a running farm.
16. **Leaderboards, day cards and the read-only view of a Daily Farm** are not touched (3.5 and the community milestones).

**Keys and settings Claudia must set** (nothing was made or entered by me)

| Setting | What |
|---|---|
| Apply `20261115000400_daily_farm.sql` | With the rest (`supabase db push`) |
| `CRON_SECRET` | A long random secret, **server only**, in Vercel (Production, Preview) and `.env.local`. Without it `/api/daily/rollover` answers 404 and runs nothing |
| The schedule | Vercel cron from `apps/web/vercel.json` (every 15 minutes; Vercel sends `CRON_SECRET` itself, and a per-15-minute cron needs a plan that allows it, the free plan runs a cron once a day), **or** pg_cron with pg_net and the snippet in `docs/DATABASE.md` |
| `GG_DAILY_FEED=live` | To fetch each new day from SILO and MLA. Empty: nothing is fetched and Daily Farm runs only as far as the days already kept (the baked tables end 12 Nov 2026) |
| `SILO_CONTACT_EMAIL` | Already in `.env.example`: the address SILO asks for. Only with the live feed |
| The `daily_farm` switch | On, in admin, when you are ready |
| The database keys of 3.2 | Daily Farm needs them: `SUPABASE_DB_POOLER_URL` and the rest |

**Not done:** the evening and morning notifications; a way to change a farm's time zone; real yardings for sale days; a read-only view of someone else's Daily Farm and day cards; an end-to-end check in a browser on a phone in both orientations and both themes (the production build was checked by fetch; see below); a run against a real Supabase project or the live SILO and MLA services; the leaderboards by days survived.

**Second pass (an Opus review of f3de5d6), 15 Nov 2026.** It supersedes the first pass where they differ. In particular, **Calls 2, 3, 4 and 5 above are replaced by the list below, and the migration comment about a day's weather row being written with its price rows is out of date** (an existing migration is not edited; `docs/DATABASE.md` is right). Each fix was written test first. "Seen to fail" says whether I saw the test fail before the fix.

| # | What | Test | Seen to fail first? |
|---|---|---|---|
| 1 | Every write to a stored farm moves a revision (`farm_saves.rev`, migration `20261115000500`), a cached copy is trusted only if the database's `version:rev` is its own, and a write names the rev it was made from. Before, a second server holding last night's copy ran the next night on an old `daily` and an old inbox mark and wrote them back | `twoservers.test.ts`: Daily (cron server holds the farm; the player opens, acknowledges and reads on the other; the next night runs; `openedOn`, `away`, `seenSeq`, `inbox_read` survive) and Fast Farm (inbox read survives a day run on the other server) | Yes, both, with the revision check taken out |
| 2 | `resumePlan` starts the round again **by design** (MODEL.md section 10, and `plans.mvp.test.ts` compares it with the old game), so it is right for pause and resume and was left alone. A new engine action `planMove` makes the plan's next move by hand with the tick's own `planStep`, so rounds, legs and the end of a plan count as the tick counts them. The plan card uses it | `planMove.test.ts` (rounds 2 on 2 stops ends after 2 rounds with `after: 'stay'`; two legs reach the second leg; `resumePlan` never ends it; refusals), and `nights.test.ts` (the card over several days, with and without `stay`, and with a second leg; not offered twice a day; the night does not move it as well) | The contrast test shows the old card path never ends a plan. The new action's tests passed first time |
| 3 | A night never waits. **Call:** a game day runs on the real weather and prices of the day `DAILY_DATA_LAG_DAYS` before it, **5** (see DATA.md for why, and that SILO's own pages give no delay figure). Missing rows: long-term average rain and evapotranspiration for the day of the year, the last price carried forward, a diary line stating it, `daily_counts` (`night_weather_fallback`, `night_price_fallback`), never rewritten. No job is refused for late data. The Help page has a Daily Farm topic that says the data runs 5 days behind the real date | `rollover.test.ts` "late data never stops a farm", "a month with no prices and no weather", `data.test.ts` (lag, fallbacks, as-it-stood), the Help sentence is checked against the constant | No (the old waiting tests were replaced) |
| 4 | Weather, each price series and each yard's sale days are asked for apart, a range at a time, and asked for again at every run until they arrive; a missing price never stops a farm loading (carried forward at the data layer) | `rollover.test.ts` "MLA answers nothing and then a value, and the weather is not asked for again", `data.test.ts` (40 days with no price rows builds and prices) | No |
| 5 | Time zones are checked against one fixed list (the launch districts' Brisbane, Sydney and Melbourne, the other Australian zones, Auckland) and the farm limit is checked, both before anything is run | `clock.test.ts`, `start.test.ts` (`+10:00`, `australia/sydney`, a made-up name, `UTC` and none refused with 400 and nothing built; the third Daily Farm refused with nothing run) | Yes (the functions did not exist) |
| 6 | A new Daily Farm starts on today's date as day 0: no run-up with stock. The one engine option added is a start day, `start.date` (calendar, real-year plan, create, save), with no rule or number changed. The pasture is run up to today as a Fast Farm's start does it, and the herd is placed today | `startDate.test.ts` (engine) and `start.test.ts` ("arrives on Day 1 with nothing spent": cash equals the engine's for the same start, no diary, no days away) | Yes (the engine test, before the option) |
| 7 | The top bar says its true reason: the server's own words for paused and unavailable. There is no data waiting state any more | `wire.test.ts`, `rollover.test.ts` (switch off) | No |
| 8 | Each request has an 8 second timeout; up to 4 at once; no request is started after the budget; a farm with nothing to run is never loaded (a farm in the failed list is left alone without being loaded) | `rollover.test.ts` "side by side with a cap", `feed.test.ts` (timeout signal) | No |
| 9 | A failed farm is logged by id, counted by id in `daily_counts` (`rollover_farm_failed`, `dims = farm=<id>`) and tried again, up to 6 times a day, then left alone until tomorrow | `rollover.test.ts` "a farm that fails is found by its id", `logging.test.ts` | Yes (logging) |
| 10 | Sale days use the real yard's rows where they exist (the baked yardings and the kept ones) and the weekly stand-in only after them. Real rows exist for the four district yards (CQLX Gracemere, Armidale, Dubbo, Mortlake) | `data.test.ts` ("uses the real yard sale days kept after the baked tables") | No |
| 11 | The catch-up says the true number of days away and that it shows the last 60 | `wire.test.ts`, `week.test.ts` | No |
| 12 | One answer for the Daily Farm switch in the seed (migration 000400 sets it off), `packages/shared` (comment says so) and the coverage test (asserts it). The reference-data migration still says true in a comment: it is an existing file. **PRD 11.7's table says On** | `coverage.test.ts` | No |
| 13 | Two real ways to run the rollover: `vercel.json` (a Vercel plan that allows a 15 minute cron) and a pg_cron job, `gg-daily-rollover`, that calls the route through `pg_net`, with the address and secret read from Supabase Vault (migration `20261115000600`; the SQL to store them is in the migration and in DATABASE.md; Supabase's pg_net page and Vault page were read on 15 Nov 2026). The job does nothing until the two secrets are stored | `coverage.test.ts` (the job is scheduled, the function is server only, and it does nothing where pg_net or Vault is absent) | No |
| 14 | `seriesFor` fetches cattle only. A TODO in `data.ts` says to add the sheep indicators and yards when the sheep line is joined to the engine. **For the engine join: add sheep prices to `seriesFor`, `fetchMissing` and the feeds** | none (a note) | n/a |

**Calls for Claudia added or changed in the second pass**

- **The lag is 5 days.** Game day D runs on the real weather and prices of D minus 5. It is one constant, `DAILY_DATA_LAG_DAYS`, and the data version a farm records names it (`daily-lag5`), so changing it is not done to a running farm unasked. The PRD has no such line: it is a call, made so the night can run at midnight (PRD 14.3) with settled data and so a late feed never holds a farm. Weather and prices on the screen are 5 days behind the real date, and the Help page says so.
- **Today's weather is no longer a placeholder.** With the lag today's data is already in.
- **A new farm starts on today as Day 1** (replaces call 3). Sale days are real dates, not lagged.
- **The plan card's Yes uses the new `planMove`**, which takes the ordinary move time (so a move uses daylight, as moving the mob by hand does; the earlier note that it cost none was wrong), and keeps the plan's rounds.
- **Daily Farm stays off by default**, as the project rule says. PRD 11.7's table says On.
- **Time zones** are the eight in `SUPPORTED_ZONES`. A device in another zone is told so and can not start a Daily Farm until the zone is added.
- **A farm that fails 6 times in a day is left alone until the next day.**

**Keys and settings** (changes): `CRON_SECRET` is needed for either schedule. For the **Vercel cron** nothing more, and a plan that allows a 15 minute cron. For **pg_cron** instead: turn on `pg_net` and Vault in Supabase, then store `gg_site_url` and `gg_cron_secret` once in Vault (the two `vault.create_secret` lines in `docs/DATABASE.md`). `GG_DAILY_FEED=live` and `SILO_CONTACT_EMAIL` still turn the live feed on, and migrations `20261115000500` and `20261115000600` are to be applied after `000400`.

**Not done in the second pass:** the live feed has still not been run; the lag of 5 rests on the repo's own pull, not a figure from SILO, and should be looked at after a few weeks of real running; sheep prices (item 14).

**Second pass results.** The whole run is 161 test files and 3,162 tests. In the one full run after the last code change, 157 files passed; the failures were two `dbstore.test.ts` checks that expected `store.version()` to be the bare version (it is now `version:rev`; fixed in the tests) and three timing checks that fail only under load (`herds.test.ts` "under 5 ms", `gains.test.ts` and `farmData.test.ts` timeouts). The two database and the three timing files were re-run alone and pass. The count in `jobs.test.ts` went from 41 to 42 kinds of action (`planMove`). `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm check:browser-bundle` and `pnpm check:js-budget` pass (/play 200.4 KB of 250, sign-in 143.5 of 150). The production build with no keys (port 3296, fresh `GG_FARMS_DIR`): no 5xx on any route, `/play` and a guest's Fast Farm and Next day work, a guest asking for a Daily Farm gets 403 with the reason, the rollover answers 404 "not set up". The server was stopped. **Engine changes in this pass:** the `planMove` action (item 2) and the optional `start.date` (item 6); no rule or number changed; `MODEL.md` has both.

### 15 Nov 2026: m3.4 Notifications

Branch `m3.4-notifications`, from `m3.5-admin-shell` (78930e7). No engine file and no earlier migration changed. One new migration, `20261115000800_notify_queue.sql`. No account, key or project was made with any outside service, and nothing in the build or the tests reached the network (the push service and Resend are fakes in the tests).

**What works with no keys set (the default):** the game, sign-in and the inbox page. `/account/notifications` opens, shows the inbox, and says in plain lines what is not set up ("Notifications to phones and computers are not set up on this copy of the game yet."). Nothing asks the browser for permission, nothing is sent, no send rows pile up, and the sender route answers 404 to everyone while `CRON_SECRET` is unset. With the Push notifications switch off the page says "Notifications are switched off for now", the subscribe route refuses, the sender does nothing and the reminders are not made. The inbox works in every case.

**What needs keys:** web push (the two VAPID keys), email (the Resend key, a sender address on a verified domain, the site address and the token secret), and the scheduler (the cron secret and a 5 minute schedule). The list is at the end of this entry.

**What was built**

- **Types (A).** `apps/web/lib/notify/kinds.ts` holds the seven types and their defaults, shared with the page: morning reminder, one later reminder, farm alerts, evening warning, community, challenges and leagues, account and purchase notices. `apps/web/server/notify/wording.ts` writes every line (the PRD morning line "First light at Kooringa. 3 things to check." and "Rain overnight at Wattle Flat: 12 mm." are the tests' fixtures), and holds the net that keeps nagging out: no exclamation marks, guilt, pressure, streaks, countdowns, praise, instructions or money.
- **Queue (D).** `queueNotification` in `server/notify/queue.ts` is the entry point the Daily Farm, community and purchase work will call. The contract is in the file's comment and in `docs/DATABASE.md`. `queueEvent` writes the words for the events in wording.ts. It never throws for an expected case.
- **Sender (D).** `server/notify/sender.ts`, run by `/api/notify/send`. Claims rows with `for update skip locked`, a time budget, a batch, retries with backoff, a daily cap, idempotent sends, a gone device removed, the allow-list checked again, one failing row never blocking the rest. Details in `docs/DATABASE.md`.
- **Web push (D).** `server/notify/webpush.ts`: RFC 8291 encryption and VAPID (RFC 8292) with Node's own crypto, no new package. The encryption is checked byte for byte against the example in RFC 8291.
- **Email (D).** `server/notify/mail.ts`: a small interface, the Resend implementation (endpoint, bearer key, headers and Idempotency-Key read from Resend's own page on 15 Nov 2026), and a fake for tests. Every email has `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058).
- **Unsubscribe link (D).** `/api/notify/u`: an encrypted, expiring token that reveals nothing and turns off one type's email for one account. GET shows a button and changes nothing (mail scanners open links), POST does it.
- **Reminders (E).** `server/notify/reminders.ts`, run by the same cron call. Reads Daily Farm state through `DailyFarmReader` (a fake in the tests; `sqlDailyFarmReader` reads the `farms` table and knows no "things to check" count, so by default the line has no count; the Daily Farm work can call `setDailyFarmReader` with one that does). Rules are in the file's comment.
- **Inbox and settings (B, C).** `/account/notifications` (one page, one JS budget line): the inbox with unread count, mark read, mark all read and paging; a plain button "Turn on notifications on this device"; per-type switches for push and (when email is set up) email; the reminder time; quiet hours; the device list with "Remove this device"; "Turn everything off" (one tap). On an iPhone or iPad that has not had the game added to the Home Screen, a card shows the three steps (never a pop-up). Links: More, then Notifications, and Your account, then Notifications.
- **Service worker (D).** `lib/pwa/push.ts` (push and notification-click handlers), added to `sw.ts` in two lines. A tap focuses an open page of this site and moves it to the link, or opens it. The pages kept are still `/` and `/play` only, and nothing from a push or the API is stored.
- **Admin (F).** `/admin/notifications`: counts sent, failed, held and dropped by type for 7 days with the reasons as fixed codes, and "Pause all sending", confirmed and audited (`notify_pause_set`).
- **Clean-up.** Signing out everywhere removes every device of the account (server). Signing out here and deleting the account first remove this browser's device (the page does it before the call). Deleting the account cascades the rest.

**Which inbox is which.** The account inbox (this milestone) is for account-level notifications and is separate from the farm's own inbox of game messages (the bell in the game, `inboxwords.ts`), which stays in the farm save. The PRD does not join them, and the page says where the other one is.

**Push hosts.** Added Chrome (`fcm.googleapis.com`, from Chrome's own developer blog) and Edge (`notify.windows.com` and subdomains, from Microsoft's WNS overview), each with its source in the migration and in `docs/DATA.md`. Read what the Microsoft page says carefully: it states the WNS domain, not the exact addresses Edge gives a website. See Calls.

**How it was tested.** `apps/web/server/notify/notify.test.ts` (queue, sender, reminders, devices, on PGlite with a fake push, a fake mail and a fake clock), `routes.test.ts` (every route, the walked-route pattern, the sender route's secret, the unsubscribe link, admin), `clock.test.ts` (quiet hours across midnight and across both daylight saving changes), `webpush.test.ts` (the RFC example, VAPID, the key command), `wording.test.ts`, `token.test.ts`, `lib/pwa/push.test.ts`, and `packages/db/src/notify.test.ts` (hosts, columns, the queue table). The named tests are "Each type can be turned off" and "Wording never nags". Full suite: 163 files, 3319 tests, all passing. JS sent, gzip: `/account/notifications` 146.8 KB (limit 150), `/admin` heaviest page 147.8 KB (limit 150, `/admin/switches`, unchanged), `/play` 198.8 KB (limit 250), `/account` 144.4 KB, public pages 0 KB. No existing limit was raised. Production build with no keys: every new page and route answers with no 5xx (the signed-in notification routes answer a plain 404 when accounts are off, the sender and unsubscribe routes 404, the admin route 404), `/play` plays as a guest, and the service worker has the push handlers and asks for nothing.

**Current requirements checked.** Wording describes, never nags (PRD 13, BUILD_PLAN 3.4): the net and the named test. Each type can be turned off: the named test. Quiet hours: dropped for reminders and the evening warning, held for the rest (Calls). Under 16: no community notifications (the queue refuses them, tested with a 15 year old; the community switch off refuses them too). Never ask for push permission on load: a test reads the code (the browser call is in one function, called only from the button's click handler).

**Calls for Claudia** (each is easy to change; none stopped the work)

1. **Quiet hours: drop or hold.** The PRD does not say. A morning reminder, the later reminder and the evening warning are **dropped** inside quiet hours (they are only true at their moment). Everything else (farm alerts, community, challenges, notices) is **held** until quiet hours end, and dropped if still unsent after 12 hours. One flag, `expires` in `lib/notify/kinds.ts`.
2. **Defaults.** Nothing is sent until a device is added or email is turned on. The morning reminder is off until the player turns it on (the PRD shows the iPhone guide "when someone turns on Daily Farm reminders", so reminders are opt-in). Farm alerts, the evening warning, community and challenges default to push on once a device exists. Email is off for every type. Account and purchase notices are push off, inbox always.
3. **Email is only a fallback.** It goes when the player has no working device, or when push failed for good (a gone device, a refusal, the retries used up). A player who turned push off for a type and email on gets the email directly.
4. **The later reminder** goes 6 hours after the morning time, within a 3 hour window, and not at all when the morning time is after 5 pm. The morning reminder is only made within 3 hours after its time, so a scheduler that was down never sends a stale one. Both read "the farm's time zone".
5. **Under 16.** Community notifications (follower, comment, like, group invite) are never made. Challenge and league notices are still made, because under 16s have leaderboards (PRD 8.3). Say if challenges should also be hidden.
6. **Daily cap** of 6 notifications to phones or email for an account in 24 hours (`DAILY_CAP` in `sender.ts`). The inbox always has everything.
7. **Notification wording** for the later reminder: "Kooringa: 3 things to check." (or "A reminder for Kooringa." when no count is known). The PRD gives no exact words for it.
8. **Evening warning:** at most one a day for each farm, never if the farm was opened that day. What counts as urgent is for the Daily Farm work to decide; this milestone gives it `evening_no_water` and `evening_feed_low` lines and the queue rule.
9. **Edge's push host** (see above): the domain is allowed, the exact address pattern is not documented. Chrome's host is documented only as "the origin you see when VAPID works". Both need one test with a real browser.
10. **One-click unsubscribe is sent on every notification email**, though Google's rule only requires it for bulk marketing and subscribed mail. Cheap and kind.
11. **A device is per browser, and moves** to the account that signs in on that browser (the old account stops getting it). Up to 10 devices per account.
12. **The sender is one route** (`/api/notify/send`) that also makes the reminders. One cron call every 5 minutes does both.
13. **A message deleted by the player** before it is sent is never sent (the send row goes with it).
14. **No `web-push` package.** The encryption and VAPID are about 150 lines of Node crypto, checked against the RFC. Say if you would rather use the package.

**Keys and setup for Claudia (nothing was made for you)**

1. **VAPID keys (web push).** Run this once on your PC and paste the two lines into the host's environment variables (Vercel: Settings, Environment Variables), never into the repo:
   `node -e "const c=require('crypto');const k=c.generateKeyPairSync('ec',{namedCurve:'prime256v1'});const j=k.privateKey.export({format:'jwk'});const pub=Buffer.concat([Buffer.from([4]),Buffer.from(j.x,'base64url'),Buffer.from(j.y,'base64url')]).toString('base64url');console.log('VAPID_PUBLIC_KEY='+pub);console.log('VAPID_PRIVATE_KEY='+j.d)"`
   Also set `VAPID_SUBJECT` to `mailto:` an address you read (or leave it empty to use the site address).
2. **Resend (email).** Make a Resend account, add your sending domain (a sub-domain such as `mail.yourdomain` is best), and add the DNS records Resend lists for it at your domain host. Resend shows them on the domain's page: normally an SPF record (a TXT record, and an MX record on the `send` sub-domain), a DKIM record (a TXT record named like `resend._domainkey`) and, if you want it, a DMARC TXT record. Wait until Resend says "Verified". Then set `RESEND_API_KEY` (an API key with "sending access" for that domain) and `NOTIFY_FROM_ADDRESS` (the form `The Grazing Game <an address on that domain>`). Check the exact records on Resend's page: they are theirs to say, and this entry does not guess them.
3. **`NOTIFY_TOKEN_SECRET`:** 32 or more random characters: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
4. **`CRON_SECRET`:** the same command. On Vercel a variable with exactly this name is sent by Vercel Cron as `Authorization: Bearer <value>`.
5. **The schedule.** Add `vercel.json` at the root of `apps/web` (or the project root, as your Vercel project is set up) with `{"crons":[{"path":"/api/notify/send","schedule":"*/5 * * * *"}]}`. Every 5 minutes needs a Vercel plan that allows it (the free plan allows once a day only, which is not enough for reminders). Another scheduler works too: call the address with the bearer header every 5 minutes. This milestone did not add `vercel.json` because other work shares that file.
6. `GG_SITE_URL` must already be set (accounts need it). Email links use it.
7. Turn the **Push notifications** feature switch on or off from `/admin/switches`, and pause everything from `/admin/notifications`.

**Not done, and owed**

- Nothing was sent through a real push service or through Resend. One run of each with real keys is owed, with a real iPhone (installed), an Android Chrome, a desktop Edge and a Firefox.
- The Daily Farm rollover has to call `queueEvent` for farm alerts, the evening warning and day-card events, and community and purchase code for theirs. The contract and every wording line are ready. `setDailyFarmReader` takes the "things to check" count.
- A bell with an unread count in the game's top bar was not added (the top bar is a shared file); the count is on the notifications page and the page is linked from More.

### 15 Nov 2026: m5.1 Ad slots

Branch `m5.1-ad-slots`, from `m3.5-admin-shell` (78930e7). Built in its own worktree beside the community, purchases, notifications and Daily Farm work, so nearly everything is in new files: `apps/web/server/ads`, `apps/web/app/api/ads`, `apps/web/components/ads`, `apps/web/lib/ads`, `apps/web/app/admin/ads`, and one new migration, `20261115000900_ads_events.sql`. No outside account, key, script or connection was made or used. The AdSense switch does nothing (see below).

**What works with no keys (the default):** everything as before. With every ad switch off, with no keys, or for an account that owns no-ads, the server lists no slots in `/api/auth/me`, so the play screen draws no ad markup and no empty box, sends no ad request and does not even download the ad code (it is a separate chunk, loaded only when a slot is listed). The public pages are untouched and still send no script.

**What needs keys:** all of it, because an ad is chosen from the database. The same keys as accounts (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_DB_POOLER_URL`, `BAN_HASH_PEPPER`, and in production `GG_TRUSTED_IP_HEADER` and `GG_SITE_URL`). No new variable. The secret key is also what writes and serves the pictures and videos in the `ad-media` bucket. To see an ad: run the new migration, make an admin (m3.5), turn on the master Ads switch (Feature switches), turn on a slot (Ads and sponsors), make a house campaign for it, add a picture, tick "Running".

**What was built**

1. **The slot registry** (`lib/ads/registry.ts`). Every slot id from `@gg/shared`, with its screen, shape, size per layout (phone, landscape, PC), what it may show, the extra switch it needs (`banner_ads`, `video_ads`), whether it is timed, and whether a place for it exists in this build. `visibleSlots` is the one place that says what may be on screen: a slot with no size in the layout is out; a summary or the year end card covers the farm, so farm ads under it are out; on a phone (upright or on its side) only one slot is left, the one with the lowest priority number. A test tries every set of mounted slots (every subset of all 14 places a slot can be mounted) on both phone layouts and checks at most one draws.
2. **`<AdSlot id=... />`** (`components/ads`). Outside, a few lines that read the slot list from the server; inside (loaded on demand) the choosing, the reserved size, the card, the label (`Ad` for a house ad, `Sponsored` for a sponsor's), the close button on the timed banners, the view beacon (an IntersectionObserver in `useSeen.ts`: half of the ad on screen for a second with the tab showing, then one `sendBeacon`), and the lease that applies the one-per-phone rule. Targets are 44 px, both themes (a cream card with dark text, as the mockups draw it).
3. **Where the slots sit** (one `<AdSlot>` each): `pc_farm_rail` left of the map on screens 1280 px and wider; `pc_banner` as a strip under the map on a PC; `phone_banner` inside the bottom stack above the tool bar on an upright phone, hidden while a tool, plan, move, card or sheet is open (`hold`); `summary_sponsor_card` on the day summary and the year end card; `video_between_years` on the year end card. The play screen got one wrapper (`stagecol`, no box on a phone, a column on a PC) so the strip can sit under the map without moving the map's own element.
4. **The server** (`server/ads`): `slots.ts` (slot rows and the live check, 30 second cache like the feature switches), `serve.ts` (the viewer, the no-ads function, `chooseAds`), `events.ts` (views and clicks), `token.ts` (the signed impression token), `media.ts` (looking at bytes, the storage interface and its Supabase and in-memory versions), `routes.ts` (handlers), `adminStore.ts` and `adminActions.ts` (every admin change and read), `adminRead.ts` (the gated read route for the CSV), `adsense.ts` (the empty adapter).
5. **Routes** (`app/api/ads`): `pick` (GET), `event` (POST), `click/[id]` (GET, the redirect), `media/[id]` (GET), `admin` (POST, every admin change, through `adminRoute`), `admin/report` (GET, the CSV, gated the same way).
6. **Choosing** reads the slot, its campaigns (on, inside their dates, under their view budget), the creatives that are on and fit the slot, the viewer's own last views (for the caps) and nothing else. A sponsor's campaign comes before a house ad; house ads fill only what is left, and a rail with fewer sponsors than cards is topped up with house ads. Weights decide between campaigns. Caps: the slot's gap between showings (`min_seconds_between`, banners) and `max_per_day`, the campaign's views a day for one player, and its budget. A capped slot is not given to a viewer the server cannot tell apart. It reads nothing about a farm (a test records every statement it runs and checks no farm table or word appears).
7. **Who is shown what.** No-ads owners: nothing, anywhere (the function `ownsNoAds`; a test uses a fake reader and the real `account_entitlements` table). Under 16, guests and accounts with no profile: only campaigns for everyone, never one aimed at farmers or a state (PRD 8.3 has no rule that bans ads for under 16, only the server's `interestAds: false`; nothing here is aimed by interest, and the aimed ones are held back as the safe reading). A guest is shown ads like a free player (PRD 8.1).
8. **Views and clicks, honestly.** A view needs the token the server signed when it chose the ad, so a view can only be reported for an ad that was shown, in that slot; it must come at least 0.9 seconds after (the page drew it and a second passed), within 30 minutes, for a slot still on; the database holds one row per impression and kind, so a replayed beacon counts once; a video end or skip needs its view first and a video slot. Each viewer is limited by the database's own rules (`ad_view` 300 an hour, `ad_click` 60 an hour, new rows in `rate_limit_rules`), by account, guest session or a hash of the address. A click goes `/api/ads/click/<creative id>?s=<slot>`: the link is read from the database by creative id and never from the request, it must be plain https with no login in it, the creative, campaign and slot must be on and linked, and the answer is a 302 with no referrer; an unknown, off or bad one is a plain 404. Over the click limit the person still goes where they clicked; the click is not counted. Nothing is recorded but slot, campaign, creative, kind, time and the account or guest session for the caps.
9. **Uploads** (`media.ts`). The bytes decide what a file is: JPEG, PNG, WebP (up to 1 MB, 16 to 4,096 pixels a side) and MP4 (up to 3 MB and 30 seconds, read from the movie box). SVG, HTML, script, text and anything else are refused whatever the file is called, and the stored name is random with the extension found in the bytes. A new file is stored first and removed again if the database change fails; a replaced or deleted file is removed. Served from our own `/api/ads/media/<creative id>` with the type found at upload, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Cross-Origin-Resource-Policy: same-origin` and range support (Safari needs it for video).
10. **The video break between years** (`VideoBreak.tsx`, no third-party player and no outside script). It starts muted (never autoplays with sound) with a "Sound on" button; "Skip in 5" counts down by the video's own time, then "Skip" works (the PRD's 5 seconds, exactly); real buttons with 44 px targets and a visible focus ring, a labelled region and a polite note when skipping becomes possible; labelled `Ad` or `Sponsored` with the time left; reports a view when it is playing and on screen, and its end or skip. It is the only ad on the year end card: the video beats the sponsor card, and the farm ads under the card are out. The "Start year" button waits for it, and Escape does nothing until it ends or is skipped. It can never trap anyone: a video that errors or has not started in 6 seconds is dropped, and the whole break ends after 40 seconds whatever the video does. No-ads owners never see it, because the slot is not listed for them.
11. **Admin** (`/admin/ads`, PRD 11.4). Slot table with each slot's switch (audited, with a confirm), caps and times, campaigns running now and 30-day views, clicks and click rate; sponsors; campaigns with dates (Sydney days), who sees it (everyone or players who say they farm, by state), weight, views a day for one player, a view budget, the slots it runs in and Running; house ads (a campaign with no sponsor); creatives with upload and a preview at the size of each slot on a phone and a PC, drawn by the same card the game uses; views and clicks by day and slot; a sponsor report per campaign as a page and a CSV (counts only). A campaign with views or clicks can not be deleted, and a sponsor with campaigns can not be deleted. The menu entry is no longer "later".
12. **AdSense (off).** The `adsense` switch exists and the data has `provider` and `adsense_unit_id` columns, as before. `adsense.ts` is an interface with nothing behind it: no script address, no script tag, no publisher or unit id anywhere in the repo, no field in admin for them, and a consent gate (`adsenseMayLoad`) that says no whatever is passed. **It does nothing until Claudia decides, and it needs a consent banner and her own AdSense account.** A test reads the ad code for any script, Google or game-ad name and fails if one appears.

**How it was tested** (PGlite with every migration, the fake sign-in provider; see the counts in the report). `server/ads/ads.test.ts` (35): everything off (nothing told to the screen, picked, counted or followed, for every slot, as a visitor, a player and a guest; the master, the extra switch and the slot's own switch each hide a slot; a slot with no place or no live campaign shows nothing), one slot on (a house ad with its label, one view counted once, a replay refused, sponsor before house, a rail of three, weights, no farm read), no-ads (fake and real), under 16 and targeting, dates, budgets and caps, the click redirect (unknown, made-up, injection-shaped, disabled, off, wrong slot, a url in the query, a bad stored link, the limit), view abuse (replay, forged, tampered, expired, too soon, kinds, video order, slot off, creative deleted, the database limit, the event route's CSRF and size), and the daily counts matching the database before and after the nightly roll-up. `server/ads/adminads.test.ts` (34): the registry (sizes, switches, one place for each placed slot found by reading the code, no third-party script), never two ad units on a phone screen, nothing drawn with the switches off (`<AdSlot>` rendered for every slot), the AdSense adapter, what the bytes say (all four types, SVG, HTML, script named `.png`, too big, too small, too long, unreadable), uploads through the admin route (random name, rollback and file removal, no storage), media headers and ranges, slots and campaigns in admin (audit rows, bounds, no free text in the log, delete rules), **"Claudia can switch on a slot, upload a house ad and see views"** end to end (switch, slot, campaign, picture, a player sees it and the picture loads, a view and a click, then the admin slot table, daily counts and CSV all match the database), the ad pages rendered for an admin, and the walked-route pattern: every file under `app/api/ads` must be listed and classified, exports only its method, the admin routes are a plain 404 for signed out, player, under-16, suspended, banned and no keys, CSRF, a failed audit write for every action, no keys for every public route, and the limits on pick, event, click and the report.

**Small edits to shared files** (each listed so the merge is easy): `lib/auth/types.ts` and `app/api/auth/me/route.ts` (the `ads` list), `server/auth/flows.test.ts` (the key list), `components/play/PlayScreen.tsx` (five `<AdSlot>` lines, `adHold`, the `stagecol` wrapper), `play.module.css` (`stagecol`), `SummaryCard.tsx` and `YearEndCard.tsx` (one slot each, and the year end button waits for the video), `components/admin/AdminNav.tsx` (the Ads entry is no longer "later"), `components/admin/ConfirmAction.tsx` (one more endpoint in its type), `server/admin/pages.test.ts` (the new pages), `scripts/check-js-budget.mjs` and its test (a new `/admin/ads` line).

**Calls for Claudia** (I built the default and kept it easy to change):

1. **No-ads owners see no sponsor cards either.** PRD 10.1 proposes that subscribers still see sponsor cards; PRD 10.3 and the mockups say no ads. Built as no ads at all. To change it, `adSlotsFor` and `viewerFor` in `server/ads/serve.ts`.
2. **Ads for under 16.** The PRD has no rule that bans ads for an under-16 account. Built as: allowed, but only campaigns for everyone; never aimed. AdSense, when it exists, must never be personalised for them (the gate says so).
3. **The home page logo strip (`landing_sponsors`) is not on the home page.** Public pages are built ahead with no script and no database read. A strip there would have to be server markup with no script, which makes the page rebuild on a timer, and views could not be counted (no script), only clicks. The slot is built and switchable; the registry says why it is not placed. Say if you want the home page to rebuild every few minutes.
4. **Slots for pages that are not built are ready and not placed:** `pc_community_side`, `pc_profile_side`, `pc_leaderboard_banner`, `feed_sponsored`, `challenge_sponsor`. Each page, when built, adds one `<AdSlot id=... />` (server markup can not be used there either: they are game-style pages). They are not listed to the screen until a place exists.
5. **`video_between_days` and `video_daily_summary` are not placed.** The first caps by game days ("once every 10 game days"), which means reading the farm; choosing an ad must never read the farm. The cap by real minutes works. The Daily Farm cannot be started yet. Say how you want the game-day cap counted (the browser could count its own days and the server never read them, which a player could change).
6. **The phone banner is upright only, over the bottom stack above the tool bar.** No ad over the map on a phone on its side (PRD 10.1, 6.2). It floats above the tool bar inside the stack (mockup 4), so it never covers a button. It stays 30 to 60 seconds (a setting), has a 44 px close button, and comes back after the gap (300 seconds, a setting). The gap is real time, not "minutes of play".
7. **The PC banner is a strip under the map that appears and goes, so the map changes height a little each time.** An alternative is a strip that always keeps its room (an empty bar between showings). Say which.
8. **The farm rail shows from 1280 px wide.** PRD says "wide screens" and gives no number. Below that it is not drawn and counts nothing. One line of CSS (`ads.module.css`, `.rail`).
9. **Videos go through the page as one request, so 3 MB and MP4 only.** Vercel limits a request to 4.5 MB, and the page sends the file as base64. Longer videos need a direct upload to storage, which needs a signed upload from Supabase (not built). MP4 only because a WebM's length is not read as simply. Pictures up to 1 MB.
10. **Dates are Sydney days.** "First day" is the start of that day in Sydney; "Last day" is included.
11. **The sponsor report shows counts and nothing else.** No names of players, nor any private note. The sponsor's name is on the page, not in the CSV.
12. **A video's break holds the "Start year" button until it ends or is skipped.** It never holds for more than 40 seconds.
13. **A view counts after 1 second with half of the ad on screen**, the usual rule for display ads. It is one constant in `useSeen.ts` and `events.ts`.
14. **"Spots left" for the Advertise here card** is a setting (`advertise_spots`, 20) and is not counted yet: there is no community page to show the card on.
15. **No AdSense publisher or unit id fields in admin.** PRD 11.4 lists them; the brief says no account id and an empty adapter. Add the fields when you decide.
16. **Rate limits for ad events are rows you can change** (`ad_view` 300 an hour, `ad_click` 60 an hour). The in-memory limits in front (60 picks, 120 events, 30 clicks a minute) are per server instance, as for sign-in.
17. **Ads live only when accounts are on** (they need the database and the secret key). A copy with the database but accounts off shows none.

**What Claudia must set up:** nothing new for this milestone. To use it: apply the migration, set the existing keys, make an admin, then follow the steps under "What needs keys". An AdSense account and a consent banner only when you decide to use AdSense.

**Still owed:** the storage side against a real Supabase project (the REST calls with the secret key, range reads, the bucket's own type list); the ad screens by eye on a phone and a PC in both themes (the admin pages are checked as server output and by typecheck and build only); the video break watched in a real browser with a real MP4 (the player is checked by its logic and the registry, not by playing a file); the Lighthouse run on the play page with a slot on.

**Counts and sizes.** The full run is 157 test files and 3,269 tests, all passing. This milestone adds two test files (69 tests: 35 and 34) and one case in the budget test. Type check, lint, format check, `pnpm build`, the browser bundle check (68 script files, 12 `/play` page files and the service worker, no engine term or server secret name) and the JavaScript budget all pass. **JavaScript sizes** (gzip, what each page HTML asks for): `/` 0.0 KB (limit 1), `/play` 201.7 KB (limit 250; it was 198.1, the 3.6 KB is the registry, the lease and the lazy loader; the code that draws ads is a separate chunk, loaded only when a slot is listed, and is not counted), `/sign-in` and the other sign-in and account pages 143.8 to 144.4 KB (limit 150, unchanged), `/admin` 148.0 KB (limit 150; it was 147.4, heaviest page `/admin/switches`), and the new line `/admin/ads` 147.4 KB (limit 150, heaviest page `/admin/ads`). No limit was raised. **Production check** (`next start -p 3304`, no keys, a fresh `GG_FARMS_DIR`, probed by fetch and, for `/play`, in the browser pane): 22 pages and addresses answer with no 5xx and no ad markup (the admin ad pages say "Admin needs accounts to be set up" as every admin page does); `/` sends no script; `/api/auth/me` says `ads: []`; `pick` answers `{"items":[]}`; `event` answers `{"counted":false}`; `click` and `media` are 404; the admin ad routes are 404 to a POST (also with a cross-site Origin) and to the report GET, and 405 to a GET of the write route; `/play` opens as a guest on the first setup step, makes no ad request, and logs no console error. The server was stopped afterwards (no listener on 3304). Not checked in a browser: any ad on screen (nothing could be switched on without keys), so the cards, banners, rail and video break are checked as logic, markup and the registry, not by eye on a phone or a PC.

### 15 Nov 2026: m5.2 Purchases

Branch `m5.2-purchases`, from `m3.5-admin-shell` (78930e7). One-off purchases through Stripe Checkout, built and tested with no Stripe account. No engine file and no earlier migration changed. Nothing was sent to Stripe, and no account, key or terms were touched. Everything sits behind the `purchases` feature switch (off) and a product switch (off).

**What works with no keys (the default):** everything as before. The store page and `/purchase/*` pages answer, the store says "Nothing is for sale today", the pricing page still says nothing is for sale, there is no buy button anywhere (`StoreLink` shows nothing unless the server says the store is open), `/play` works as a guest, and every billing route answers a plain 404 or an empty list with no 5xx (tested with no keys, no accounts, and the switch off). **What needs keys:** `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, plus accounts on, the switch on and a product on. Nothing else.

**What was built** (`apps/web/server/billing/`, routes in `app/api/billing/**`, pages `/store`, `/purchase/success`, `/purchase/cancelled`, admin `/admin/purchases`)

- **A. Products and entitlements.** The `products` table is the one source of prices. `accountOwns()` is the one answer to "what does this account own": the farm limit (the database's own `farm_limit`, which already read `farm_pack`), `hasNoAds()` for the ad slots, and the store and account screens all use it. Farm pack: 5 of each farm, full diary, supporter badge. Pack with no ads: those plus no ads. Upgrade: no ads, only for an account with the pack. A second pack is refused. The packs' contents are exactly PRD 10.3's.
- **B. Buying.** Store page, reached from More (the Account part) and from the farm picker when the limit is reached; a confirm that states what is bought and the price (GST included, one-off, not a subscription) before leaving for Stripe; the Checkout Session made on the server with inline price data from the product table (no price ids needed in Stripe); success page ("Thanks. Your purchase is being confirmed.", reads the server) and cancelled page; "Your purchases" on the account page with a receipt button (the address is fetched from Stripe only when pressed). A double click makes one purchase (a partial unique index plus Stripe's idempotency key set to the purchase id).
- **C. Webhook** (`/api/billing/webhook`). Signature on the raw body, t and v1 only, timestamp tolerance 5 minutes, constant time compare; every event id recorded once (a replay does nothing); one transaction for record, act and mark; any order (a refund or dispute that comes first waits and is settled when the payment arrives); unknown types acknowledged and ignored; amount, currency, product and purchase id checked against OUR row, never the metadata alone; ids only stored, never an email, name or card detail. A failed write answers 500 so Stripe sends it again. The admin "Check with Stripe" button asks the payments interface for the session's true state and settles the same way.
- **D. Paying to keep going.** Built up to the engine call (see "Engine function needed"). The offer comes from the server (tier chosen from the farm's days, never from the browser), the card lists the amount and every change, the purchase is bound to that farm, and `applyRescue` applies a paid rescue once (purchase row locked, `applied_at` set in the same transaction as the engine call, which is keyed on the purchase id). Tested with a fake engine. With no engine function registered there is no offer and the products cannot be switched on.
- **E. Admin purchases page.** Whether Stripe is connected (test or live, never the key), the webhook address to give Stripe, the purchases switch, event counts, counts by state that read the database, products with on/off, recent purchases (ids, product, amount, state, time), Check with Stripe, and Refund (confirm, then the payments interface, then the local change and the audit row in one transaction). Audit actions: `product_set`, `purchase_refund`, `purchase_reconcile`.
- **F. Data rights.** Download my data already carried purchases (without Stripe ids) and entitlements; a test now holds that. Delete my account leaves the purchase record with no account, clears entitlements and the Stripe customer, and a test holds that too.

**Engine function needed (not built, product left off).** Name it `rescueFarm(state, { purchaseId })` in `packages/engine`, wrapped by the game server as a `RescueEngine` (`apps/web/server/billing/rescue.ts`) with two parts: `preview(farm)` returns `{ cashAfter }` (the hard-difficulty starting cash for that farm, in dollars), and `apply({ purchaseId, farm })`, which must be idempotent on `purchaseId`. Apply must: sell the stock to clear the debt, set cash to the hard-difficulty starting cash, reopen the farm on the day it ended, set `farms.status = 'active'`, `continued = true` and `rescue_count + 1`, keep the leaderboard row as it stopped, and add one diary line stating the fact. Then call `setRescueEngine(...)` from the game server's start-up. After that the keep-going products can be switched on in admin.

**Calls for Claudia** (each is easy to change)
1. **Buying age is 18 and over until a lawyer advises.** (The first pass said 16; the review changed it.) PRD 10.3 does not say 18 or parental consent; it only says to check "purchases by under 18s" with a lawyer, so the safe default is 18. Every message that names the age is built from `MIN_PURCHASE_AGE` in `products.ts`.
2. **No Stripe library.** The real provider calls Stripe's REST API with `fetch` and checks signatures by hand, to Stripe's docs read today. The fake uses the same signing code. Swapping to the library later changes one file (`stripe.ts`).
3. **Hosted Checkout takes card only** (`payment_method_types: card`), so a payment is not "pending" for days. Delayed-payment events are still handled.
4. **Refunds and disputes.** A full refund takes the entitlement away. A dispute raised takes it away until it is won. A lost dispute keeps it away. A part refund changes nothing. PRD 10.3 is silent on all of these.
5. **A rescue is not undone by a refund.** Refunding a paid rescue after it was applied does not reverse the farm. It stays applied.
6. **Daily Farm rescue tiers by days run:** under 183 days (price Open, never shown, can not be switched on), 183 to 364, 365 to 729, 730 and over. PRD gives three points; these are the nearest.
7. **A second pack is refused**, and the pack with no ads is refused to an account with the pack (the upgrade is the one to buy).
8. **A won dispute that arrives before the dispute is raised** is remembered on its event, and the raised event then changes nothing. An inquiry closed without a dispute (`warning_closed`) never takes anything away, and restores what its opening took.
9. **Stripe customer:** Checkout creates a Stripe customer for each buyer so a second purchase reuses it. Only the `cus_` id is kept here. Stripe holds the email and name, and sends its own receipt if the dashboard setting for receipts is on.
10. **The sign-in "next" list** now includes `/store`.

**Keys list for Claudia** (both server only, in Vercel's environment variables, and in `.env.example` with comments). Start in **test mode** (the Test mode switch at the top right of the Stripe dashboard).
- `STRIPE_SECRET_KEY`: Developers, API keys, "Secret key" (`sk_test_...`). A restricted key (`rk_test_...`) also works if it can write Checkout Sessions and Refunds and read PaymentIntents and Charges.
- `STRIPE_WEBHOOK_SECRET`: Developers, Webhooks, add the endpoint below, open it, "Signing secret" (`whsec_...`).
- No publishable key and no price id are needed (hosted Checkout, inline prices). BUILD_PLAN's list names a publishable key and products and prices: not needed for this design.
- `GG_SITE_URL` must already be set (the return pages and the webhook address use it).

**Stripe dashboard steps Claudia does herself, in test mode**
1. Create the Stripe account and stay in test mode. Under Settings, Public details, set the business name. Under Settings, Customer emails, switch on "Successful payments" if Stripe should email receipts. Leave the Customer Portal off (not used).
2. Developers, Webhooks, Add endpoint. URL: `https://<GG_SITE_URL>/api/billing/webhook`. Send exactly these events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`. Copy the signing secret.
3. Put both values in Vercel, redeploy.
4. In `/admin/switches` turn on **Purchases**. In `/admin/purchases` switch on the products to sell (leave the keep-going ones: they stay off until the engine function exists). The page should say "Stripe is connected (test mode)".
5. **The BUILD_PLAN test purchase:** sign in with an account 18 or over, open More, Store (or `/store`), press Buy on the Farm pack with no ads, confirm. On Stripe's page use Stripe's published test card 4242 4242 4242 4242, any future expiry, any 3 digit CVC and any postcode. You land on "Thanks. Your purchase is being confirmed." and a few seconds later "Your purchase is confirmed". Check: the farm picker now allows 5 farms; `/admin/purchases` shows the purchase Paid; the account page lists it with a Receipt button. Then press Refund in admin, confirm, and check the farm limit goes back to 2. For a card that is declined use 4000 0000 0000 0002. If a purchase sits at "Waiting for payment" after paying, press Check with Stripe.
6. Not yet proven: the real Stripe calls (`stripe.ts`) and the real event shapes. **Owed against real Stripe, to check against the live docs on the first test-mode purchase:** (a) the `v1` signature scheme and the 5 minute tolerance in `verify.ts` (the header's `t` and `v1` entries, HMAC-SHA256 of `t.body`); (b) that the `payment_intent` field is present on `charge.dispute.created` and `charge.dispute.closed` events (dispute matching depends on it); (c) that Stripe accepts `customer_creation` being left out when `customer` is set (the code drops it in that case); and (d) that a Checkout Session with `expires_at` 60 minutes from the purchase row and the repeat of the same idempotency key is accepted. The test purchase above is the proof. If Stripe answers with an error, the server log line carries only the route, a reason and Stripe's error code.

**Checks.** `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm check:browser-bundle` (now also searches for the Stripe secret names) and `pnpm check:js-budget` pass. Full `pnpm test`: 3,270 tests, 67 of them new in `billing.test.ts`; the first full run had 7 failures, none in billing: 4 in the JS budget test and 1 in the admin pages test (both knew nothing of the new pages, fixed), and 2 engine timing tests that only failed under load and pass alone. JS sizes (gzip): `/store` 142.7 KB, `/purchase/success` 142.6 KB, `/purchase/cancelled` 141.3 KB, each with its own 150 KB line; `/play` 199.7 KB (limit 250), `/account` 145.1 KB (limit 150, unchanged), `/admin` 147.8 KB (limit 150, unchanged). Production build with no keys on port 3302: every new page and route answered with no 5xx, the store route said `selling: false`, the webhook, checkout and admin routes answered a plain 404, the pricing page still says "Nothing in the game is for sale today", and `/play` loaded as a guest.

**Second pass (an Opus security review of the first pass).** Each test was written first and seen to fail. Fixed: (1) two pack checkouts: starting one finishes the account's other open pack checkouts, an entitlement stays while another paid purchase of the account also gives it (`revoke` re-points it), and a pack paid for that the account already had is marked `needs_refund` (migration `20261115000701_billing_refund_flag.sql`) and listed on the admin page; (2) a payment that failed the amount check can be refunded from admin; (3) buying age 18, words built from `MIN_PURCHASE_AGE`; (4) the Checkout Session end is worked out from the purchase row (60 minutes after it was made), so a repeat with the same idempotency key is identical, and a purchase with no session saved is dropped after 25 minutes; (5) a paid session the server never saved is found by the purchase id in its metadata, taken only when the row has no session and the account in the metadata is the row's, then checked for amount, currency and product like any other; (6) refund and dispute events waiting for their purchase are settled again after the paid write commits, and by reconcile; (7) a won dispute before its raised event, and `warning_closed`, as in call 8.

**How it was tested.** `apps/web/server/billing/billing.test.ts` on the PGlite harness with the fake auth provider and a fake Stripe that signs events the way Stripe does: the whole flow (named test "A test purchase lifts the farm limit and removes ads": buy, webhook, entitlement, farm limit lifted from 2 to 5 by the database, no-ads flag set, no personal detail stored); a bad, missing, wrong-secret and altered-body signature, an old and a future timestamp, a replay, out-of-order events, a wrong amount, a wrong currency, a wrong or forged product, an unknown event type, a database failure rolling back; double click and retried request; refund, part refund, dispute raised, won and lost; buying signed out, under 18 (17 refused, 18 allowed), banned, suspended, unfinished sign-up, with the switch off, with no keys and with no accounts; a walk over every file under `app/api/billing` (each uses the wrappers, exports only GET, POST and dynamic, a POST says `write: true`), with CSRF and rate limit tests for each route; the rescue ("A rescue does exactly what the card said": the card's amount and lines, the right farm only, once only across a replay, a second event and a reconcile, a failing engine retried by reconcile, a refunded rescue not applied); admin product, refund and reconcile with audit rows and rollback.

### 15 Nov 2026: m4.2 Community

Milestones 4.2 (profiles and following) and 4.3 (posts and the feed), built together on branch `m4.2-community` from `m3.5-admin-shell`. All of it sits behind the Community switch (and `feed_posts` for the post routes), off by default. With the switch off, or with no database keys, no community page, link or route answers: every one is the same plain 404, and the game and website are untouched. No migration was needed: the rules were already in the database (docs/DATABASE.md, "What the server does for the community").

**What was built**

- Profiles (`/community/me` to edit, `/community/u/<name>` to view): display name, photo, bio, town, district, farming answers, links, experience, courses, privacy (profile, farm view, ticker). A private profile shows its card only. "See it as others see it" shows a stranger's view.
- Following: follow, unfollow, requests for followers-only profiles (accept, decline, cancel), followers and following lists, block and unblock with a plain Yes or No confirm, search by the start of a username.
- Posts, comments (one level of replies), likes, reports (post, comment, profile, the PRD's reasons), edit and delete your own. A removed post shows as removed to its author and can not be deleted by them.
- Feed (`/community`): Friends' days, Everyone, Groups, paged by a keyset cursor, with empty states.
- Share my farm and day cards: plain facts stored at posting time. A share image (`/api/community/share-image?post=`) for public posts.
- Photos: upload to the server, cleaned (metadata removed), stored in the player's own folder, pending, an image-check interface with a "held for review" default, and the admin queue (`/admin/photos`).
- Navigation: a Community button in the More tab's account section, only when the server says the switch is on and the player is 16 or over.

**How it was tested** (`apps/web/server/community/*.test.ts`, on PGlite with the fake sign-in provider and a fake storage and image check)

- `community.test.ts`: the walked routes (a route file must use `communityRoute`, export only GET or POST, and be in the test table, so a new route can not skip the gate, CSRF and limits); visitor, under 16, banned, suspended, no profile, switch off (admin too) and no keys all get the same 404 on every route; cross-site and non-JSON writes get 403; limits; profiles and privacy; follows, requests, blocks both ways; posts, comments, likes, reports; the word filter (including a zero-width trick), rate limits, script tags, `javascript:` links, bidi and zero-width characters; cursor paging over 45 posts; day cards; Share my farm; the whole photo path.
- Named tests: "An under-16 test account sees no community anywhere" (routes in `community.test.ts`, pages in `pages.test.ts`) and "A photo never shows before it has been checked" (pending to nobody, the author's note only, swapped file, approval by exact file, queue, check pass and fail).
- `pages.test.ts`: every page and the layout as each caller; every page calls `requireMember()` itself.
- `image.test` cases inside `community.test.ts`: JPEG, PNG and WebP metadata removal, bombs, oversize, renamed files.
- `scripts/check-js-budget.test.ts` has a community case; `admin/pages.test.ts` lists the new `/photos` page.

**Results.** Full `pnpm test`: 157 files, 3,252 tests (the one run with a failure was the generic admin route walk, which could not give the photo queue a real photo; it now skips `photos`, whose own gate, CSRF, no-keys and rollback tests are in `community.test.ts`). `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build` and `pnpm check:browser-bundle` pass. JS (gzip): `/` 0.0 KB (limit 1), `/play` 198.7 KB, `/community` 145.4, `/community/me` 147.1, the other community pages 144.3 (new line, limit 150 each, never raised), `/admin` 147.8 (unchanged limit). Production build with no keys on port 3301: every community page and route answers 404 (`/admin/photos` shows the "needs accounts" notice like the other admin pages), no 5xx, `/` and `/play` 200, and the farm API answers as a guest.

**How photos are cleaned.** No image library is installed, so the server rebuilds each file keeping only the picture's own parts (image.ts): JPEG without EXIF, XMP, IPTC and comments; PNG without text, `eXIf` and time chunks; WebP without `EXIF`, `XMP ` and the colour profile (header flags rewritten); animated WebP refused. It reads the real type from the bytes and the size from the header (over 12,000 a side or 36 million pixels is refused). It does not re-compress. The page shrinks and re-encodes in the browser first, which also applies the camera's rotation.

**Calls for Claudia**

1. **An admin does not see the community with the switch off** on this site, although the database would let them. This keeps "switch off means nothing is reachable" true. To check it before launch, turn the switch on in a preview copy. One line in `server/community/gate.ts` would let admins through.
2. **Photos are stripped, not re-compressed.** Adding `sharp` (already in the build for Next) as a dependency would re-encode them on the server. It needs your say-so because it changes the lock file.
3. **Photos upload through the server**, not straight from the browser to Storage: 6 MB for a post photo, 2 MB for a profile photo.
4. **The image check is an interface with no service behind it.** Until you choose one, every photo waits in `/admin/photos`. `IMAGE_CHECK_API_KEY` is listed in `.env.example` and does nothing yet.
5. **A post needs some words.** A photo-only post is not allowed (the database wants a body for a plain post).
6. **Everyone is newest first.** The PRD says "newest and popular"; popular ordering is not built.
7. **Day cards are built and tested (`makeDayCard`) but nothing calls it.** The Daily Farm rollover belongs to the Daily Farm work and is to call it after each day.
8. **A private profile's page lists no posts**, but its public posts still appear in the Everyone feed, because that is how the database rule for posts works. If a private profile should post only to followers, that is a change to the post rule.
9. **Share my farm shows**: farm and district, date, season, head, average pasture, ground cover, net worth: all on the farm screen already.
10. **The Groups tab reads group posts, but there is no group screen yet** (the groups milestone). Reports of groups are left for it.
11. **Search is by the start of a username only**, not display name.
12. **Real farm photos (showcase photos), the ticker, the leaderboard tabs, pull to refresh (the mockup does not show it) and looking at someone's farm (4.5) are not built.**
13. **The Community link is in the More tab**, not the bottom bar, and not on the public site header (public pages send no script).
14. **Photo queue decisions are audited** as `photo_approve` and `photo_reject`.

**Keys Claudia must set up:** none for 4.2 and 4.3 beyond those already listed (Supabase URL, publishable key, secret key, pooler URL, ban pepper, site address). Photos use Storage through the secret key. For the image check: an image-check service (BUILD_PLAN section 8), then its key as `IMAGE_CHECK_API_KEY`, and an adapter written for it.

**Still owed against a real project:** Storage uploads with the secret key, `storage.objects` rows matching what `approve_photo` reads, and the photo route's download; the pages by eye on a phone and a PC in both themes.

**Fixes after the security review (Stage 4, Phase 1).** Migration `20261115001000_stage4_review.sql`, tests in `server/community/review.test.ts` and `packages/db/src/stage4.test.ts`, each written first and seen to fail.

1. Staff see the community as any member does. The helpers the community's rules use (`can_find_profile_for`, `can_find_profile`, `can_see_profile`, `can_see_group`, `post_row_visible`, `comment_visible`, and the read rules on comments, post photos and showcase photos) no longer let a moderator or admin through. A moderator or admin gets the plain not found for an under-16 profile, its posts and its follower list, sees a private profile's card only, and no followers-only post they do not follow. Staff powers are in `/admin`, which uses the server's own connection. Tests that expected the old staff view now expect the member's view.
2. A private profile's posts are its author's alone (PRD 9.1), whatever the post's own setting: not in Everyone, not on the post page, not in the share image. Share my farm from a private profile is refused with a plain reason.
3. Images: a JPEG with a second frame header is refused; the JFIF header is rebuilt without its thumbnail; players can no longer write to Storage with their own token (the three insert rules are gone: only the server stores a photo); `servePhoto`, the image check and the new admin preview read the real type from the bytes, require the file name's extension to match and the file to parse, and refuse anything else.
4. A database limit on photos: `photo` (24 an hour, 8 for a new account) and `photo_day` (80 a day, 20 for a new account), counted by a trigger on each new post or showcase photo row and each avatar change made with a player's token. Stand-in figures.
5. The word filter now reads the farm name on Share my farm (it goes on the card) and the words of profile links.
6. Hidden characters: the Hangul fillers (U+3164, U+115F, U+1160, U+FFA0), the braille blank (U+2800), the invisible maths signs (U+2061 to U+2064), the grapheme joiner (U+034F) and the tag characters (U+E0000 to U+E007F) are removed. A display name that would show as blank is refused.
7. Slow queries: username search keeps its prefix index (a test checks the plan); the Friends tab reads each followed author's newest posts through a new index (`posts_author_feed`) and a lateral join; like counts come from one safe count each (`app.like_count_post`, `app.like_count_comment`: the count, told only to someone who may see the post or comment).
8. A banned or suspended player is not shown the Community link (`/api/auth/me` asks `member_raw`); a comment shows its first 5 replies and then "Show more replies" (the thread shows up to 200); the admin photo queue loads each preview from `/api/admin/photo-preview` (admins only, only a photo still waiting) instead of a data address of up to 6 MB.

Calls: a like count counts every like, including one from someone the viewer has blocked (a count is not an identity). Tag characters are removed, so an emoji flag that uses them (Scotland, Wales) shows as a plain black flag. Comments a private-profile player writes on other people's posts still show (only their own posts are hidden).

### 15 Nov 2026: m4 Stage 4 report

Stage 4 (competition and community), milestones 4.1 to 4.5, finished on branch `m4.2-community` on top of the m4.2 work. Phase 1 fixed the security review of what m4.2 built (see "Fixes after the security review" in the m4.2 entry). Phase 2 built the rest. Every part sits behind its own switch (`leaderboards`, `community`, `groups`, `activity_ticker`, `farm_viewing`, `feed_posts`); with a switch off, or with no database keys, nothing of that part answers and the game is untouched. No community anywhere for an account under 16, both ways, from the database's own test (`app.member_raw`).

**What was built**

- **4.1 Scores and leaderboards.** A score provider (`server/boards/score.ts`) and a board writer (`server/boards/write.ts`) called by the game server after a year closes (`server/stage4/hooks.ts`: the end day and skip paths in `server/game/game.ts`). Boards: Score (the headline, a marked stand-in), profit per ha, weight gain per ha, ground cover, days survived, and a board for each real year that ranks on the change over that year. Filters: mode, district, farm size, start, enterprise, period (this week, month, season, all time), people I follow, a group, a challenge. The public page `/leaderboards` is drawn on the server for each request and sends no script (the filters are a plain form); your own row is pinned at the bottom. A pages-router page can not load the server's own modules, so its server side reads the board from `/api/leaderboards` at the site's configured address (`NEXT_PUBLIC_SITE_URL`, never the request's Host header), passing on the caller's cookie. Rows are written only by the server, after the action log check (PRD 14.5); read through `leaderboard_rows` as the viewer, so under-16 and private rows show the username and district only, banned or deleted accounts show as "Former player", and a block hides both ways.
- **4.4 Groups and challenges.** `/community/groups` (your groups, public groups, join by code, start a group, the public challenges) and `/community/groups/<id>` (members, the group board, the group's challenges and their boards, the group feed with a composer, and for the owner the invite code, remove a member, hand over, change, delete, set a challenge). An ownerless group says so; its members still read and post; an admin gives it an owner on `/admin/challenges`. Challenges: a Fast Farm challenge (same farm and seed for everyone) or a Daily league, set by a group's owner or an admin; entering starts a farm on the challenge's settings and seed (the seed never leaves the server) and makes it the current farm. `/admin/challenges`: make, end, see entries and results, groups with no owner. All audited.
- **4.5 The ticker.** Live activity lines on website pages only: the landing page (when the switch is on at build), `/leaderboards` and the community pages (from the live switches). Never on the farm screen. Facts only, written for players who switched ticker activity on (off by default), 16 or over, not private, not banned, at most 6 an hour each: "started a Fast Farm in Western Victoria", "reached Day 100 on their farm", "finished year 3 on their farm". With the switch off the public pages still send no script. With it on they send `/ticker.js` (1,345 bytes gzip, its own budget line, limit 2 KB) and it reads `/api/ticker` (at most 10 lines from the last 3 days).
- **4.5 Look at someone's farm.** `/community/farm/<id>`: a read-only view built on the server from the owner's own farm snapshot, keeping only what PRD 9.5 lists (farm, district, day, date, season, head, average kg DM/ha, net worth, ground cover, each paddock with its label, area, pasture and mob, and the stand-in score). No buttons. Linked from profiles ("Their farm today") and day cards. Follows the farm-view setting (followers only by default), blocks and the under-16 rule.
- **4.5 Moderation.** `/admin/moderation`: the open reports with the content, its context, how many reports the target has and the author's history; remove, keep, warn, suspend for N days, ban, each resolving every open report on that target, recorded in the moderation history, audited, and told to the author in plain words through their notifications. `/admin/words`: the word filter editor. Removed content shows as removed to its author and to nobody else. Reporting has its rate limit (5 a day for a new account, 20 for others, and the route's own per-minute limit).

**How it was tested** (PGlite with the fake sign-in provider, fake Storage and image check)

- `server/boards/boards.test.ts`: the score provider, period keys, the writer and its refusals (log gap, a step after the farm's day, rescued, unranked), players can not write rows or scores, a real skip writes the rows through the hook, filters, privacy and blocks, the friends filter (members only), the public page (no script, not found with the switch off or no keys). Named tests: "Your row pins at the bottom", "A real-year board ranks on the change over that year".
- `server/community/groups.test.ts`: create, join by code, leave, owner tools, the ownerless group and the admin fix, challenges (owner only, entering on the fixed seed, one entry each, no seed in any answer, outsiders refused, its board), a Daily league refused, admin challenges audited, under 16, banned, signed out, switch off and no keys. Named test: "Two accounts in one group see the same board".
- `server/community/farmview.test.ts` and `ticker.test.ts`: every viewer case (owner, follower, stranger with each setting, blocked both ways, under 16 both ways, banned, signed out, switch off, no keys), no engine words, form or button on the farm page, the ticker's opt-in, privacy, blocks, hide, the landing page with the switch off and on, no ticker in the game. Named test: "Two test accounts follow each other and see each other's day cards and farms".
- `server/admin/moderation.test.ts`: every action, audit rollback, notifications, the gate for every kind of caller, CSRF, the word filter editor, the report rate limit.
- The walked-route tests now include `group` and `challenge` (community) and `words` and `challenges` (admin: gate, CSRF, rollback on a failed audit write, noindex); the read-only preview and the moderation route have their own. Page lists in `pages.test.ts` (community and admin) and the JS budget lines include every new page.
- `packages/db/src/stage4.test.ts`: the review migration and the word filter change at the database.

**Results.** Full `pnpm test`: 164 files, 3,368 tests, all passing. `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm check:browser-bundle` and `pnpm check:js-budget` pass. JS (gzip): `/` 0.0 KB (limit 1), `/leaderboards` 0 scripts (runtime off), `/ticker.js` 1,345 bytes when the ticker is on (limit 2 KB), `/play` 198.7 KB, `/admin` 149.0 KB (heaviest `/admin/challenges`, limit 150 unchanged), community pages 144.3 to 147.1 KB (`/community/groups` 145.8, `/community/groups/[id]` 146.8, `/community/farm/[id]` 144.3; limit 150 each, never raised). Production build with no keys on port 3301: every new page and route answers 404 (the admin pages show the "needs accounts" notice), `/api/ticker` answers an empty list, no 5xx, `/` and `/play` 200, and a guest can start a farm and end a day.

**Calls for Claudia**

1. **The headline Score is a stand-in.** PRD 5.8's Grazier Score has no agreed weights. The headline board ranks on the game's own year score averaged over a farm's finished years, and the page says so. Swapping it is one function (`headline` in `server/boards/score.ts`) once calibration farms are run and you rule on the weights.
2. **The other boards** use what the year view already holds: profit per ha is the average yearly change in net worth per ha; "beef per ha" is the average yearly live-weight gain per ha (kg/ha); ground cover is the average of the yearly averages; days survived is the farm's day.
3. **A real-year board ranks on the change in net worth over that game year, per ha**, so a farm that started small and grew a lot beats one that started big and grew a little (your words in REQUIREMENTS).
4. **A period board** (week, month, season) lists the farms that closed a year in that period, each with its figure over all its finished years. Periods are by Sydney time.
5. **The action log check** is what the tables allow: at least one day or skip run by the server, no step after the farm's day, no gap in the numbering. No replay (PRD v1.1: every farm runs on the server).
6. **Private profiles and under-16s on group boards:** their rows show on the main boards (username and district) but not on a group or friends board, because those filters match by account and the board does not show those accounts.
7. **Moderators can not open `/admin`** (it is admins only). The moderator role still reads reports and the history through the database.
8. **A like count counts every like**, including one from someone the viewer blocked.
9. **Daily leagues can be set but not entered** until Daily Farms exist.
10. **Visitors see the ticker on the landing page** (PRD 9.4 says Landing). Signed-in under-16s, banned players and anyone who hid the ticker see nothing.
11. **The ticker lines** are: started a farm, reached Day 100, 365, 500, 1,000 or 2,000, finished a year. No farm names (free text). Rate 6 an hour each.
12. **Stand-in limits:** photos 24 an hour and 80 a day (8 and 20 for a new account); `/api/ticker` 30 calls a minute per address; group and challenge routes 30 and 6 a minute per member.
13. **Group challenges** start when set and end on the date given (or never).
14. **The farm view** shows a farm as a list of paddocks (no map drawing), and a farm name the word filter refuses shows as "A farm".
15. **Leaderboards are not in the header or sitemap** yet (the community pages link to it). Add when you switch it on.
16. **Moderation "remove" on a profile** clears its bio and display name; a group can not be removed, only kept or warned.
17. **Tag characters are stripped** from text, so flag emoji that use them (Scotland, Wales) show as a black flag.

**Keys Claudia must set up:** none new. `NEXT_PUBLIC_SITE_URL` (already listed) must be the live address, because the leaderboard page reads its board from the site's own `/api/leaderboards`. The Supabase keys, pooler URL, ban pepper and site address from earlier stages are all that Stage 4 needs. The image-check service is still to be chosen (`IMAGE_CHECK_API_KEY`). To show the ticker on the landing page, add `activity_ticker` to `SITE_SWITCHES_ON` at build.

**Not done**

- The Grazier Score formula (needs calibration farms in the engine and your ruling). Weaning %, condition and the "above 1,500 kg DM/ha" share are not in any board.
- Daily leagues can not be entered, and day cards are not made automatically (both wait for the Daily Farm rollover). The farm view works for Daily Farms only, so today it is reachable only for a farm marked daily.
- A leaderboard tab inside the game, a farm's summary from a board row, badges and best ranks on profiles.
- The Groups tab in the leaderboard page shows your groups as a filter, not as a list of every group's board.
- Popular ordering in Everyone; reports of groups from a group page.
- Checks against a real Supabase project, and the pages by eye on a phone and a PC in both themes.

### 15 Nov 2026: m6 Join

Branch `m6-joined`, cut from `m2.8-sheep-screens` (8d594fa: Stage 1, the website, farm hands, accounts and saves, the admin shell, engine 0.17 with calf growth and sheep, the sheep screens). Merged in order, each with `--no-ff`, checked (install, type check, the affected tests) and fixed before the next: `m3.3-daily-farm` (cd47b2a), `m3.4-notifications` (2d7e9c6), `m5.1-ad-slots` (81eb6bf), `m5.2-purchases` (a7060be), then `m4.2-community` (7c951b3). Every branch's own entry above is kept in full. Engine 0.18.0, save format 13, stored format 3, snapshot version 6.

**What clashed and how it was settled**

- **m3.3 Daily Farm** was built on the 0.13 engine. Its two engine pieces were carried onto 0.17 by hand: the `planMove` action (the jobs list is now 50 kinds of action) and the optional `start.date` (calendar, creation, real-year plan). The engine version went up once, to 0.18.0. The setup offers both the Daily mode and the sheep stock step; the game server keeps both the sheep switch and the Daily runtime; the snapshot version is 6 (both branches had numbered their change 5, so an offline copy from either is not shown). `farm_saves.rev` is used by every store write (the sheep and admin work added none of their own).
- **m3.4, m5.1, m5.2** clashed only in shared lists: the admin navigation, the admin confirm's endpoints, the walked admin tests, the JS budget lines (the ad screens keep their own `/admin/ads` line; notifications and the community admin pages are on the `/admin` line), the play screen (the ad slots and the Daily overlay), the account section (Community, Leaderboards, Notifications, Store), and the docs.
- **m4.2 Community** clashed in the same lists and in the game server (the Stage 4 hooks beside the sheep switch and the Daily runtime). No admin page is a placeholder any more.
- **Lessons.** Every section from m3.5 on had numbered its lessons from 1 with letters already used (M, D, N, C, S, P). They are now prefixed by milestone: AS (m3.5), DF (m3.3), NT (m3.4), AD (m5.1), PU (m5.2), CM (m4.2), ST (Stage 4). The older "rebuild" sections are unchanged.

**Migrations renamed** (none had been applied to a real project, so renaming is safe): `20261115000500_farm_rev.sql` to `20261115000510_farm_rev.sql`; `20261115000600_sheep_switch.sql` to `20261115000610_sheep_switch.sql`. New: `20261115003000_notify_cron.sql` (the sender on the database scheduler). The whole set applies from empty in name order on PGlite in every database test; a new test checks each stamp is unique and a real date and time, and that each migration comes after the ones it builds on.

**What was wired**

1. Daily Farm and notifications (`server/daily/notices.ts`): after a night is saved, the night that brings a farm to today queues its facts through `queueEvent` (trough low or empty, no water, through the tape, calving started, deaths), each with a key for the farm, night and fact. Daily Farm's own reminder reader is installed with `setDailyFarmReader`: "opened today" is the farm's own `openedOn`, not `farms.last_opened_at` (which the rollover moves when it loads a farm at midnight, so the default reader would never send a morning reminder), and the count is the farm's things to do plus plan moves due. The evening warning is not wired (no evening job exists yet).
2. Ads ask the purchases' `hasNoAds`. Placed: the Daily Farm catch-up video (`video_daily_summary`, holding the Start today button like the year end), the feed's sponsored post, the community and profile side cards (PC only), the challenge sponsor. Not placed: `pc_leaderboard_banner` (the leaderboard page is a public page that sends no script), `video_between_days` and `landing_sponsors` (as before). The registry's one-per-phone rule covers the new places.
3. `seriesFor` and the live feed keep the six national sheep and lamb indicators and a sheep yard's six (MLA ids 6 to 11). The Daily bundle labels the sheep prices with the Daily data version, so a farm's kept sheep prices are not refused night to night.
4. The rescue: `rescueFarm` in the engine (MODEL section 13): every head sold to pay the debt, cash set to the hard-difficulty starting cash for the farm, or what the sale left if more (a stand-in, below), the farm open again, recorded on the farm and idempotent on the purchase id. The game server saves it with one diary line and the farm row is marked `continued`. Registered through `setRescueEngine` (a factory the game server sets). `applyRescue` no longer holds a transaction across the farm's save. An offer needs a free slot. The Open-priced tier stays unsellable. New end-to-end test "A rescue does exactly what the card said (the engine itself, end to end)".
5. One `apps/web/vercel.json` with both crons; the matching pg_cron job for each (DATABASE.md, "The m6 join").
6. Feature switches: shared defaults, the seed and the admin switches screen hold the same keys (the seed-equals-shared test passes). Off: Daily Farm, sheep, community and its parts, ads and every slot, purchases, maintenance. On: sign-ups, Fast Farm, and, as PRD 11.7 has them, leaderboards and push notifications (push sends nothing with no keys).
7. Community: day cards are made at the rollover (the night calls the Stage 4 hooks, which call `makeDayCard`); follows, comments and likes notify through `queueEvent`; `/api/auth/me` says whether the boards are open and the More tab links them (PRD 6.4: the app shell's Farm, Community, Leaderboard, Profile tabs are not built as a shell yet, so the link sits beside Community). The read-only farm view stays **Daily Farm only**: PRD 9.5 says "their Daily Farm", so the builder's rule was kept; it now reads without marking the owner's farm opened.
8. Every API route file is walked with no keys (`server/routes.walked.test.ts`). The sign-in and account routes answered 503 "not set up" with no keys; they now answer 404 with the same words (as notifications and Daily Farm do), so nothing returns a 5xx.
9. `.env.example` is one file, each variable once, grouped by service.

**Old data.** Real saves made by the old code (engine 0.13 format 9, 0.14 format 10, 0.16 format 11 twice) and a format 12 save, wrapped as stored format 3 (and one as stored format 2), load and play a day through the file store and the database store (`server/game/oldsaves.test.ts`). It found one fault, fixed: a format 10 sheep "losing weight" note has no reasons and broke the inbox words.

**Proof**

- **The engine against `m2.7-engine-joined` (5337928).** The whole engine suite was run on both (the joined engine, then 5337928's engine and shared package checked out in place and put back). Same result for every test the two share: 1,980 tests on 5337928, 1,997 here, 0 failed on either, the same 4 skipped, the same expected failures (each open calibration row is an `it.fails` whose name carries its figure). The only differences are the 17 new tests (`planMove`, `start.date`, the rescue, one m2.8 sheep plan test) and the version test renamed for 0.18.0 and format 13. Cattle calibration, the calf rows, the sheep rows, every `*.mvp.test.ts` and the no-hands digests are identical. No band or test was loosened.
- **The full checks.** `pnpm typecheck`, `pnpm lint`, `pnpm format:check` clean. `pnpm test`: 212 files, 4,100 tests: 4,074 passed, 22 expected failures (the open calibration rows), 4 skipped, 0 failed. Both speed tests run alone pass (cattle 3.41 ms a day with 4,890 head, sheep 1.42 ms a day with 6,865 sheep; limit 5). `pnpm build`, `pnpm check:browser-bundle` (clean), `pnpm dev:map-fixtures` (13 fixtures, unchanged) pass. `pnpm check:js-budget`: one line a page, no limit raised: `/` 0 KB, `/play` 207.2 of 250, sign-in and account pages 141.4 to 146.9 of 150, `/admin` 149.1 and `/admin/ads` 147.4 of 150, the community pages 145.3 to 149.4 of 150, `/leaderboards` 0 (runtime off), `/ticker.js` 1,345 bytes. The community group page first came out at 151.1 KB once its ad slot was placed; the ad slot's registry now loads with its live half, which brought every page that has a slot down (no limit was touched). Several pages sit within 1 KB of their limit.
- **The production build with no keys** (`next start -p 3310`, a fresh `GG_FARMS_DIR`): every page (48) and every route file (79, GET and POST, plus robots, sitemap, manifest, the service worker and the ticker) walked from a list built from the app directory: no 5xx anywhere. The home page sends no script file (its two small inline theme lines are as before). `/api/billing/store` says nothing is for sale; `/api/auth/me` lists no ads and no community; no page has ad markup or asks for notification permission. Guest play end to end: a Central Queensland farm, a job (a mob moved), Next day, +1 year (the year ended), Scores and the Diary. With `GG_SWITCHES_ON=sheep`: the stock step offers cattle, sheep and a mix, a sheep farm starts in Western Victoria (one sheep mob, 333 head in all) and a year passes. The server was stopped.
- **Not done:** the browser pane walk on a phone in both orientations and themes (no screen changed shape apart from the More tab's Leaderboards button and the catch-up video slot, which draws nothing while ads are off); the `realism-guardian` agent was not run.

**For Claudia**

- **The rescue's cash** (PRD 10.3 is silent): all stock is sold; cash is the hard-difficulty starting cash for that farm with no herd, or what the sale leaves after the debt if that is more, so a rescue never takes away money its own sale raised. Stock already bought and on the way still arrives.
- **Farm view stays Daily Farm only** (PRD 9.5). Every farm in a database today is a Fast Farm, so nobody can be looked at until Daily Farm is on. Say if Fast Farms should be viewable too: one line in `app.can_view_farm_for` and a migration.
- **The leaderboard banner** can not go on a page that sends no script. Say if the boards page should send a little script for it.
- **A rescue needs a free farm slot**; with none, no offer is shown.
- **Accounts-off answers are 404s now**, not 503s.
- The evening warning has its words and queue rule but no job that sends it.

### m5.3 Dashboard and analytics

Branch `m5.3-dashboard`, from `m6-joined` (32ca9cf). Migration `20261117000100_analytics.sql` (this branch uses the `20261117` range; the launch-check branch uses `20261116`).

**What was built**

1. **The dashboard at `/admin`** (`server/admin/dashboard.ts`, one module for every figure). A date range of Sydney days (default the last 7, at most a year, never past today), set with a plain form, so the page sends no new script. Tables: summary, by day, farms by mode, audience mix, the audience snapshot for advertisers (shares only, groups under 5 left out), analytics events, Web Vitals, server timings by route, failures and save conflicts, rollover runs, queues now. Figures: players, new sign-ups, guests, players active today, in 7 days and in 30 days (from `farms.last_opened_at`), Daily and Fast Farms going, started and ended, days played, purchases, income (refunds taken out) and refunds, push and email sends and failures, ad views, clicks and click rate, website page views, the moderation queue, broken saves. A read failure says so on the page; with no keys the admin layout says accounts are not set up (unchanged) and the page shows nothing.
2. **Days played** is a new count: the farm store adds to `daily_counts` (`days_played`, by mode) in the same transaction as a day's diary row, the first time that row is kept. Before this nothing counted days played (the diary keeps only the newest 400 days, so it could not be counted from there).
3. **CSV export** of every table: `GET /api/admin/dashboard?table=...&from=...&to=...`, through `adminRoute` (gate, limit, noindex). Each download writes `dashboard_export` to `admin_audit_log` (the table's id and its number of rows) before the file is sent. Text that starts with `=`, `+`, `-`, `@`, a tab or a carriage return gets a `'` in front. No table holds an email, a date of birth (age bands only, worked out in SQL), a username or an id.
4. **Game health** (`server/analytics/health.ts`): every game route and every sign-in and account route is timed; every `logFailure` is counted by route and reason code; a 5xx answer is counted as `status_5xx`; a save conflict in the farm store is counted; each rollover run is written with how long it took. Kept as sums in `health_daily`; each server writes at most every 30 seconds in one statement. Queue depth (notifications waiting and sending, Daily Farms owed a day, reports and photos waiting) is read live.
5. **Analytics with consent.** No analytics library in the browser. `lib/analytics/beacon.ts` sends a few events to our own `POST /api/collect` with `navigator.sendBeacon`, only when the consent cookie says yes. The route: the shared CSRF rule, 60 a minute per player, a 2 KB body, at most 10 events, every event on the fixed list in `@gg/shared/analytics` (an unknown name, a server-only name, an extra key or a value off the list refuses the whole beacon with 400). Then nothing is kept unless the database is set, the `analytics` switch is on and the person said yes. It answers 204 either way. Events are counted in `analytics_daily` (no id) and sent to PostHog's batch API only when `POSTHOG_KEY` and `POSTHOG_HOST` are set, with `$process_person_profile: false` and `$geoip_disable: true`, from the server. The id is a random per-browser id (guests) or the account id hashed with the pepper under the label `analytics:` (signed in).
6. **Consent** (`server/analytics/consent.ts`, `GET` and `POST /api/consent`, the control in `components/analytics/Consent.tsx` on the account page). Default no. An account's choice is in `analytics_consent`; the cookie follows it on that device. A guest's choice is the `gg_analytics` cookie (`y` or `n`, a year, readable by the page so the beacon can stay silent). A signed-in player is never counted by the cookie, only by the database. Under 16: off, the box can not be ticked, the route answers 403, and a trigger in the database refuses a yes too.
7. **Server-side events**: `trackServer` with the same rules. Wired: `farm_started` (create), `day_completed` (a Fast Farm day), `skip_used` (the length asked for). A guest's server-side events are counted but not sent on, as the server has no install id for them.
8. **Website page views**: `apps/web/proxy.ts` (the Next 16 name for middleware), matched to the eight public pages exactly, counts one `website_view` by page and day after the page is answered (`waitUntil`). No cookie read or set, no id; bots, prefetches and anything not asking for HTML are left out. The public pages still send no script.
9. **Web Vitals**: `components/analytics/Vitals.tsx`, a hand-written `PerformanceObserver` collector (LCP, CLS in bursts, INP as the longest interaction), on `/play`, `/account`, `/account/notifications`, `/store` and both purchase pages. It also sends a page view. Kept as a histogram (`web_vitals_daily`); the dashboard shows the 75th percentile by page against PRD 14.10.
10. **The `analytics` switch**, off, in the shared list, the migration and the admin switches screen (marked as read when the site is built, because the privacy page reads it). The privacy page's analytics section now says it is off until you say yes, never under 16, names PostHog, and says website views are counted with no cookie.

**How it was tested**

- `server/admin/dashboard.test.ts`: rows seeded in PGlite inside the range and 40 days before it; every summary figure, the by-day rows, farms by mode, audience bands and the snapshot's small-group rule, events, Web Vitals p75, routes, failures, rollover runs and queues are checked against them, then a range 40 days back finds only the older rows. The CSV rules, the range rules, and the export: 404 for signed out, under 16, a suspended admin, a banned admin and no keys; 400 for an unknown table; every table downloaded with no email, username, id or date of birth in it; one audit row a download.
- `server/analytics/analytics.test.ts`: the fixed list (no free-text property anywhere), `/api/collect` refusals (another site, a form body, over 2 KB, unknown and server-only events, too many), the rate limit, nothing kept without consent or with the switch off, a guest counted with a yes, PostHog mocked (called only with a key, with the random or hashed id and nothing personal), a signed-in player counted only by the database, under 16 refused by the route and by the database, the guest cookie, the vitals histogram, `trackServer`, website views (bots, prefetches, other pages, switch off), a PostHog failure logged without its message, buckets and p75, and the health sums and their write.
- `server/db/dbstore.test.ts`: days played counted once per diary row by mode; a save conflict counted.
- `packages/db`: the four new tables are server only in the access matrix and the coverage list; the new migration comes after the ones it builds on.
- The walked-route test now names `collect`, `consent` and `admin/dashboard`; `second.test.ts` leaves the export to its own test (it is a read).
- Full checks: `pnpm typecheck`, `pnpm lint`, `pnpm format:check` clean. `pnpm test`: 214 files, 4,153 tests: 4,127 passed, 22 expected failures (the open calibration rows), 4 skipped, 0 failed. `pnpm build` passes (the proxy is listed). `pnpm check:browser-bundle` clean. `pnpm check:js-budget`: every page under its limit, none raised. Before and after: `/play` 207.2 to 208.3 KB (limit 250), `/account` 145.4 to 147.6 (150), `/account/notifications` 146.9 to 148.6, `/store` 142.8 to 144.6, `/purchase/success` 142.7 to 144.4, `/purchase/cancelled` 141.4 to 143.2, `/admin` 149.1 to 149.5, `/community/groups/[id]` 149.4 to 149.8, `/` and `/leaderboards` still 0. Pages not touched grew by 0.3 to 0.4 KB as well, cause not found (LESSONS DA1). Several pages are now within 0.5 KB of 150 KB.

**Calls made for Claudia** (each easy to change)

- **Players active** today, in 7 and in 30 days come from each farm's last opened time, so they are "as of now", not a history. Average minutes a day, return rates and streaks need a record of each visit, which is not kept; they are listed on the dashboard under "Built in a later milestone", as are game overs by cause and replay failures.
- **Income** counts paid purchases by the day they were paid; a refunded purchase is left out of income and counted under refunds.
- **The advertiser snapshot** shows shares only and leaves out any group under 5 players and "Not said". Enterprise is left out of the audience mix because it is free text on the profile.
- **Game health is always on** (it holds no person's data). The `analytics` switch covers events, Web Vitals and website views.
- **Website views are counted without consent**: no cookie, no id, by page and day only, so nothing about a person is stored. The privacy page says so.
- **The hashed id** for PostHog uses `BAN_HASH_PEPPER` under its own label, so no new secret is needed. Changing the pepper starts new ids in PostHog.
- **Health timings** are written every 30 seconds per server; a server that stops loses up to that much. Fine for spotting trouble, not exact counts.
- **INP** is the longest interaction, not the full measure's one-in-fifty drop, so it reads a little high on long sessions. The p75 shown is the top of its bucket.
- **The consent control** is on the account page for everyone, guests included (a guest who opens `/account` sees it). The game page has no control of its own yet, to keep its script small.

**Not done or not checked**

- Not checked in a browser: the dashboard, the consent control and the beacon were not opened on a phone or PC, in either orientation or theme. No real PostHog call was made (mocked only). The proxy was built (`ƒ Proxy (Middleware)` in the build) but no page was requested through `next start` to see a view counted.
- Not wired: `signup`, `login`, `profile_completed`, `farm_ended`, `checkout_started`, `pwa_installed` and `notification_opened` are on the list but nothing sends them yet. Admin, community, billing and notify routes are not timed (game and sign-in routes are).
- `/api/account/data` (download my data) does not include the consent choice yet.
- The `realism-guardian` agent and Lighthouse CI were not run.

### 15 Nov 2026: m5.5 Launch check

Branch `m5.5-launch-check`, cut from `m6-joined` (32ca9cf). Built beside the 5.3 builder (dashboard and analytics), so nothing here touches analytics, the dashboard or `/api/collect`. The launch checklist is `docs/LAUNCH_CHECK.md`; the runbook, backups and restore drill are `docs/RUNBOOK.md`.

**What was built**

1. **Error reporting to Sentry, from the server only** (`server/errors/sentry.ts`). No Sentry package: a small sender posts one event to the DSN's envelope endpoint, with a 2 second timeout, at most 30 events a minute per server, and never throws. With no `SENTRY_DSN` nothing is sent. An event carries the source (server or browser), the route name, a fixed reason code, the error's class, the release, the environment and a trimmed stack (function names and paths inside the app, no hosts, queries or home folders). Never cookies, tokens, emails, usernames, bodies, query strings, the request or who asked; a server error's message is never sent. Every `logFailure` line also goes to Sentry, and `instrumentation.ts` sends errors nothing caught (`onRequestError`, with the route's template only).
2. **Browser errors** go through `/api/client-error` (`server/errors/clientError.ts`). The app layout writes about 600 bytes of inline script (`lib/clientErrorScript.ts`) on `/play` and every signed-in page: an uncaught error or rejected promise is sent with `sendBeacon`, five a page at most. No script file, so no page's budget moved for it. The public website pages never carry it. The route takes the CSRF rule, 10 a minute per caller and 120 for the whole server, a 4 KB body and a fixed shape (`kind`, `name`, `message`, `stack`, `route`, each short). The page path becomes a template with no ids (`/community/u/:id`). The message is scrubbed (emails, addresses, `name=value` pairs, ids, tokens, long numbers) and cut to 120 characters, and only reaches Sentry; the server log gets the page, the reason and the class.
3. **Load test** (`pnpm test:load`, not part of `pnpm test`; `scripts/load-test.mjs` and `scripts/load/server.mjs`). Results below.
4. **End-to-end flows** at the HTTP level through the real route handlers (`apps/web/server/e2e/`, 7 tests in 5 files): a guest plays a year; a guest becomes an account and the old cookie no longer reaches the farm; Daily Farm start, rollover and next morning; a purchase through the fake Stripe and a refund; a rescue; a post, a report and its removal by an admin; download my data then delete the account. Playwright is not a dependency, so none of these drive a browser.
5. **Backups and restore.** `pnpm test:restore` (`packages/db/src/restore.ts`, also tested in `restore.test.ts`): builds the database from every migration and the seed, copies it two ways (a table-by-table data dump into a fresh database built from the migrations with triggers held off, and the whole data folder), and compares the row count and an md5 checksum of every table. Run on 15 Nov 2026: 67 tables, 192 rows, every one the same both ways. `pg_dump` is not on this PC and PGlite has no server for it. File-store farms: `pnpm farms:export` and `pnpm farms:import` (`server/game/farmexport.ts`), one JSON with a format number and a sha256, refusing a changed file, a newer format, a bad id or an existing farm unless `--overwrite`.
6. **Runbook** (`docs/RUNBOOK.md`): deploying, every environment variable and what breaks without it, backups and the restore drill as exact steps, the first admin, each switch and what to check, the scheduled jobs and how to tell they ran, and what to do for a bad deploy, a failed migration, Stripe webhooks, push or email, a stale feed, a leaked secret, a moderation emergency, maintenance mode and privacy requests. Plan facts are marked "check in the dashboard".
7. **Launch checklist** (`docs/LAUNCH_CHECK.md`): 42 rows, each passes (with the test), needs keys or a device (with what Claudia does), or not done.

**Security review fixes (all 14).** Each has a test that was seen to fail without the fix (item 9 needed no fix; its tests pin the behaviour).

1. Day cards follow the farm view setting: none with it off; public only when the profile and the farm view are both public (`server/community/share.ts`; `community.test.ts`).
2. Content-Security-Policy on every page (`proxy.ts`, `lib/csp.ts`; `lib/csp.test.ts`). `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` (no form posts to Stripe: checkout is a navigation), `frame-ancestors 'none'`, `img-src 'self' data: blob:` plus the Supabase origin from `NEXT_PUBLIC_SUPABASE_URL`, `connect-src 'self'` (the browser calls no outside service). Scripts never get `'unsafe-inline'` or `'unsafe-eval'`. The static website pages get a fixed hash policy for their two inline theme lines and stay static. The app pages get a fresh nonce per request (the Next 16 proxy, as `node_modules/next/dist/docs` describes) with `'strict-dynamic'`; the fixed inline lines are allowed by hash. Styles have `'unsafe-inline'` (React writes `style` attributes, which a nonce can not cover). The map imports `pixi.js/unsafe-eval`, PixiJS's build that never calls `new Function`. Consequences: `/play`, `/account`, `/store`, sign-in and the purchase return pages were built ahead and are now made for each request (the root layout awaits `connection()`), because a nonce needs a request. So `check:js-budget` measures those pages from their build manifests, the way `/admin` and `/community` were already measured (on the last static build the two ways gave the same figure for every one of them; same limits; tested), and `check:browser-bundle` starts the built site and searches the `/play` page and page data it really sends. Checked in a production build with no keys (`next start`): `/` (the theme button works), `/play` (a farm started, a supplement job, Next day, the map zoomed in to the cattle), `/account`, `/admin` and `/community` (their no-keys answers): no CSP violation reported. A real signed-in community or admin page was not loaded in a browser (no database here).
3. Sign-in rate limits key on the verified account id, else the address; a made-up `sb-*` cookie is ignored (`server/auth/route.ts`, `supabase.ts`; `auth/ratekey.test.ts`).
4. An ad click counts only with a valid, unexpired impression token for that creative, campaign and slot, once per impression; it always goes to the stored link (`server/ads/events.ts`, `serve.ts`, `routes.ts`; `ads.test.ts`).
5. Push endpoints are parsed with WHATWG URL and the sender's host list before the insert; migration `20261116000200_push_host_strict.sql` lets the database guard's host part hold only hostname characters (`server/notify/store.ts`; `notify.test.ts`).
6. No-ads fails closed: any error shows no ads (`server/ads/serve.ts`; `ads.test.ts`).
7. A keep-going checkout asks `roomFor` before any purchase row or Stripe session (`server/billing/checkout.ts`; `billing.test.ts`).
8. The read-only farm view never runs the owner's missed nights, never saves, never moves `last_opened_at` (`server/game/game.ts`; `daily/viewonly.test.ts`).
9. Players can not rename paddocks or mobs: every name comes from fixed patterns ("Paddock 3", "Mob 2", "Weaners 1"). The only typed name is a plan's, and plans are not on the farm view. A comment and `community/farmviewnames.test.ts` pin this (it fails if a rename action is ever added).
10. Ad media only while the creative and its campaign are on (an admin still sees it for the preview), `Cache-Control: private, max-age=300`; migration `20261116000100_ad_media_private.sql` makes the `ad-media` bucket private (`server/ads/routes.ts`; `adminads.test.ts`).
11. `safeDecode` (`server/decode.ts`): a broken escape no longer throws. Fixed in `/api/leaderboards` and in the ad click and media routes; nothing else in the app decodes request data bare (`decode.test.ts`).
12. JSON-LD writes the six characters `\u003c` for every `<` (`components/site/PageHead.tsx`; `PageHead.test.ts`).
13. A push endpoint saved by another account is refused with `push_endpoint_taken`; the same account still refreshes its device (`server/notify/store.ts`; `notify.test.ts`). docs/DATABASE.md is updated to say so.
14. The daily notification cap is counted and claimed in one transaction under a per-account advisory lock, and the claim is visible to the next count; a place is given back when a send does not go. Two senders at once never pass the cap (`server/notify/sender.ts`; `notify.test.ts`).

**Load test results** (`pnpm test:load --players 60 --rounds 2`, this PC, Windows 11, one production server process, file store, no keys). 60 guest farms a round, started 30 at a time a minute (the server's own cap), two rounds, 196 s. Each player: create, open, preview, act, Next day, +1 year until a year closed.

| Route | Requests | Errors | p50 ms | p95 ms | p99 ms | Max ms |
|---|---|---|---|---|---|---|
| create | 120 | 0 | 1,077 | 1,629 | 1,653 | 1,667 |
| open | 120 | 0 | 125 | 157 | 166 | 166 |
| preview | 120 | 0 | 164 | 219 | 267 | 328 |
| act | 120 | 0 | 444 | 586 | 601 | 657 |
| Next day | 120 | 0 | 1,384 | 3,821 | 4,296 | 4,491 |
| +1 year | 120 | 0 | 3,030 | 4,750 | 4,755 | 4,760 |

Memory after a full collection (heap / RSS): 76.8 / 181 MB before, 119.4 / 459 after round 1, 117.1 / 485 after round 2, 116.6 / 485 after 5 s idle. The heap stops growing after the first round: the farm cache (64 farms) and the real-year tables fill once and stay. No server failure line was logged.

The first full run of the same test, while another builder's work was running on this PC, had 8 of 120 year skips with no answer at all (the client saw the connection close with no reason it could read) and times up to 16 s. A 60-farm one-round rerun and the two-round run above had none. The cause is not known. It is not tuned away and is listed (LESSONS LC15).

What it found and fixed: one entry stayed in memory for every farm a server had ever opened (the "last marked opened" list beside the capped cache). It is now capped with the cache (`server/game/game.ts`, `server/game/held.test.ts`, which fails without the fix). No unbounded cache otherwise, no lock held across farms (each farm has its own queue, which empties), and the game routes make no outside call that could hang (Sentry's send has a 2 s timeout).

What it does not prove: a real database (no Postgres, no pooler, no network between servers), more than one server process, a real network or real phones. Every request runs on one Node process, so the times are the engine's work queued on one core; the load generator shares the same processor. Times grow with how many farms run a long skip at the same moment, which is what one process does; on Vercel each request can get its own function.

**How it was tested.** `pnpm typecheck`, `pnpm lint`, `pnpm format:check` clean. `pnpm test`: 228 files, 4,164 tests: 4,138 passed, 22 expected failures (the open calibration rows), 4 skipped, 0 failed (564 s). `pnpm build` passes. `pnpm check:browser-bundle` clean (89 script files, the rendered `/play` page and page data, 116 service worker files). `pnpm check:js-budget`, no limit raised: `/` 0 KB, `/play` 207.6 of 250, sign-in, account, store and purchase pages 141.7 to 147.3 of 150, `/admin` 149.5 and `/admin/ads` 147.7 of 150, community pages 145.6 to 149.8 of 150, `/leaderboards` 0, `/ticker.js` 1,345 bytes. Every page grew 0.3 to 0.4 KB with the nonce work (the inline error hook is not a script file and is not counted). `/community/groups/[id]` sits 0.2 KB under its limit.

**Calls made for Claudia**

- Day cards follow the farm view as well as the profile: none with the farm view off, public only when both are public. The default farm view is "followers", so a public profile on default settings now posts day cards to followers only. (Decided in the security review; listed for you.)
- No Sentry package anywhere. Browser errors come through the site's own `/api/client-error`; Sentry sees only the server sending.
- The app pages are now made for each request so each gets its own nonce. `/play`'s Lighthouse Performance may move; it was not measured on this branch.
- Styles are allowed inline (`'unsafe-inline'` for styles only). Scripts are not.
- The map uses PixiJS's no-eval build. Its uniform code is a little slower than the generated kind; the 60 fps check on a phone is still owed.
- The load test keeps to the 30-farms-a-minute creation cap rather than lifting it for the test.
- The restore drill is on PGlite; the real drill on Supabase is a written procedure for you to run once.

**Environment variables added:** `SENTRY_DSN` (server only; unset, nothing is sent), `GG_RELEASE` (optional release name; Vercel's commit is used without it). Both in `.env.example`.

**Not done or not verified**

- Events reaching a real Sentry project (needs `SENTRY_DSN`).
- Lighthouse on this branch (the app pages are now dynamic).
- A browser walk on a phone in both orientations and both themes, and real phones.
- A signed-in community or admin page loaded in a browser under the new policy (no database on this PC).
- Supabase's own backups and restore; Storage files are not in the drill.
- The 8 unanswered year skips in the first load run.
- The `realism-guardian` agent was not run (no change to the model, data or pictures).

### 15 Nov 2026: m7 Final join

Branch `m7-final`, cut from `m5.5-launch-check` (f50c821). Merged with `--no-ff`, type-checked after each: `m5.3-dashboard` (7b9e03f), then `m6-final-report` (056bb4a, only `docs/CALLS_FOR_CLAUDIA.md` and `docs/STAGE_REPORTS.md`). `docs/GRASS_QUALITY_REVIEW.md` was brought in from `m2.6-grass-quality-review` without merging that branch. Commit trailers were left as they were.

**What clashed and how it was settled**

- **`apps/web/proxy.ts`** (both added one). One file now: a public website page gets the fixed hash policy, stays static, and hands its page-view count to `waitUntil` (`countWebsiteView` still checks the page is public, skips bots and prefetches, and reads or sets no cookie). Every other page gets a fresh nonce. One matcher set: everything but `/api/`, `/_next/`, `/serwist/`, files with an extension and prefetches. Tested in `lib/csp.test.ts` (a public page hands on its count; an app page does not).
- **`apps/web/server/logging.ts`** (both hooked `logFailure`). Both run: the health listener (5.3) and the Sentry report (5.5), each in its own `try`, so neither can throw into the caller. Tested in `server/errors/sentry.test.ts` (a listener that throws stops neither; a transport that throws stops nothing).
- **`.env.example`**, the walked-route list, `docs/DEVELOPMENT_LOG.md` and `docs/LESSONS.md`: both sides kept.
- **An escape lost in three places.** The JSON-LD lesson, its log line and the comment in `PageHead.tsx` said "the six characters <": the editing tool had unescaped what was written. Fixed with a script (LESSONS LC17). The code itself was right.

**What was wired**

1. Download my data includes the analytics consent choice: migration `20261118000100_export_consent.sql` (the function as before with one key, `analytics_consent`, the yes or no and when, or null). Test: `packages/db/src/rules.test.ts` ("download my data holds the analytics consent choice").
2. Server-side events, each one line through `trackServer` (consent and the `analytics` switch still decide): `login` (the callback, a returning player, with the method), `signup` (finish; a new account has made no account choice, so the guest's consent cookie decides, and it is counted here only, never sent on), `checkout_started` (the billing checkout), `farm_ended` (Next day or a skip that ends a Fast Farm, `endedDays`). Tests: `server/analytics/serverevents.test.ts`, through the real routes.
3. `/api/client-error` and `/api/collect` are in the walked-route list and in the no-keys test (`server/auth/accountsoff.test.ts`).

**The page growth (LESSONS DA1, LC16).** Both branches saw 0.3 to 0.4 KB added to pages they did not touch. Both added a proxy. Built the same tree with `proxy.ts` moved aside: the shared chunks every app page loads were 131,335 bytes gzipped against 131,600 with it, and the page chunks about 70 bytes smaller. A token diff of the two builds found nothing but module ids one digit longer with the proxy (`836437` against `36437`): with the proxy's module graph in the build the bundler numbers from a larger range, and every reference pays a byte. Not something to trim. Final sizes are below; every page is under its limit and none was raised.

**Offline and install, now that app pages are made per request.** The service worker precaches `/play` at install (the `additionalPrecacheEntries` in `app/serwist/[path]/route.ts`), and the Cache API keeps the response with its headers, so the cached copy carries the policy whose nonce matches its own scripts. Checked in headless Chrome (puppeteer-core from the Lighthouse tools, a fresh profile) against the production build: the worker registered and activated, the `/play` shell is in `serwist-precache-v2`, its header nonce and the nonce on all 16 of its scripts are the same, and with the network off a reload of `/play` drew the guest farm (name, date, head, buttons) with no policy violation. The existing offline tests pass. Nothing needed fixing. The one cached copy reuses its nonce until the next install (Part B, B136). Not checked: a real phone, airplane mode, the install prompt (V1).

**Proof**

- `pnpm typecheck`, `pnpm lint`, `pnpm format:check` clean. `pnpm test`: 231 files, 4,225 tests: 4,199 passed, 22 expected failures (the open calibration rows), 4 skipped, 0 failed (629 s). `pnpm test:speed` alone: cattle 4.07 ms a day with 4,890 head, sheep 1.62 ms a day with 6,865 sheep (limit 5).
- `pnpm build` passes. `pnpm check:browser-bundle` clean (91 script files, the rendered `/play` page and page data, 118 service worker files). `pnpm check:js-budget`, no limit raised: `/` 0 KB, `/play` 208.3 of 250, `/sign-in` 144.1, `/sign-in/check-email` 144.1, `/sign-up/finish` 144.5, `/account` 147.6, `/account/notifications` 148.6, `/store` 144.6, `/purchase/success` 144.4, `/purchase/cancelled` 143.2, `/admin` 149.5, `/admin/ads` 147.8, community pages 145.6 to 149.8 (`/community/groups/[id]` 149.8) of 150, `/leaderboards` 0, `/ticker.js` 1,345 bytes.
- Lighthouse (the repo's `lighthouserc.json` settings, mobile, three runs each, against the production build on this PC, no rule changed): `/` Performance 100, 100, 100, Accessibility, Best Practices and SEO 100, largest paint 0.67 to 0.71 s. `/play` Performance 89, 90, 90 (target 95: A25), Accessibility, Best Practices and SEO 100, largest paint about 3.45 s, layout shift 0. No console errors on either.
- Production build with no keys, in the browser pane: `/` (no script file, theme button works), `/play` (a guest farm, a supplement job, Next day, +1 year to the year card, Scores, Diary), `/account` (the consent box ticks and unticks, `/api/consent` 200), `/admin` and `/community/people` (their no-keys answers). With the consent cookie set, the Web Vitals collector's beacon reached `/api/collect` (204). No policy violation, no 5xx, no failure line in the server log. Every server started was stopped.

**Not done or not checked**

- The dashboard and its date form, and signed-in community and admin pages, under the policy (no database here; V13).
- Real Sentry and PostHog events (V16). Lighthouse on CI (V14). The 8 unanswered year skips (V15).
- `farm_ended` for a Daily Farm that ends at the midnight run, and `profile_completed`, `pwa_installed`, `notification_opened`.
- The `realism-guardian` agent was not run (no model, data or drawing change in this join).

### 15 Nov 2026: m7.1 Realism fixes

Branch `m7.1-realism-fixes`, cut from `m7-final` (ca7ff39). Engine 0.19.0, save format 14. A read-only review of the final branch found realism faults in three places; each is fixed with a test that fails without it. Lessons RF1 to RF11. Calls B137 to B140, A20 and V10 updated.

**Daily Farm plans with no hand.** The night is the engine's own (`TickEnv.plansByHand`), not the player's "paused" state: plans stay live, no mob moves, and the plan's report counts the night. The review's case (Central West, one mob, a daily plan, 6 nights moved from the card): before, 6 moves, 0 kg DM, 0 head-days, 0 kg; now 6 moves, 5,523 kg DM, 924 head-days, -457 kg (the engine's own tick on the same farm: 6 moves, 5,528 kg DM, 924 head-days, -454 kg; the difference is that a hand-moved mob grazes its new paddock that day). A part-time hand's nights and the held nights both count. Plans of several moves a day graze across the paddocks the mob was moved through (`handStops`) and the card offers at most the plan's own moves a day. Sheep plans are held, offered and moved by `planMove`. "Grazed down to" plans wait a day after a hand move and can end on the card. A waiting plan gives its real reason everywhere. `createFarm` refuses a bad start date. Tests: `packages/engine/src/sim/heldNight.test.ts`, `apps/web/server/daily/nights.test.ts`, `apps/web/server/game/realism.test.ts`.

**The rescue.** Sheep valued as a normal sale pays (no wool on the back). The sale goes in the year's sales; the cash added on top is its own money line, "Paid to keep going", left out of the year's profit and score. A Central West farm (medium, seed 3, taken by the bank): net worth $42,360 to $140,000, $97,640 paid in; the year's profit stays at -$328,322 (before the fix it rose by the $97,640, with no money line). Words by case on the diary line and the offer card. Tests: `money/rescue.test.ts`, `realism.test.ts`, the billing and purchase flow tests.

**Day cards.** "Day N" is the diary's day on the day card, the Share my farm card and its farm picker. A day card carries job and farm facts only, picked by the kind of line when the day is filed (`farm_days.card_lines`, migration `20261119000100_day_card_lines.sql`), and `rain_mm` is written when the day is kept. Tests: `community.test.ts`, `farmview.test.ts`, `dbstore.test.ts`, `realism.test.ts`.

**Proof**

- `pnpm typecheck`, `pnpm lint`, `pnpm format:check` clean. `pnpm test`: 233 files, 4,253 tests: 4,227 passed, 22 expected failures, 4 skipped, 0 failed. Engine tests against `m7-final` by name: 2,000 the same result, 1 renamed (the version test), 13 new; the same 22 expected failures and 4 skips. No benchmark moved (CALIBRATION, the m7.1 entry).
- `pnpm test:speed` alone: cattle 3.56 ms a day (4,890 head, 407 calves), sheep 2.59 ms a day (6,865 sheep).
- `pnpm build` passes. `pnpm check:browser-bundle` clean. `pnpm check:js-budget` passes with no limit raised and no page larger than at m7 (`/play` 208.3 KB, `/sign-in` 144.1 KB, `/community/groups/[id]` 149.8 KB): every change is on the server.

**Not done or not checked**

- The supplement price read (`supplementCosts`) prices a plan of several moves a day on the plan's own stops, not on the paddocks the player moved the mob through on a night with no hand. A small difference in a price shown, on Daily Farm only.
- The sheep tick still counts a round when a plan wraps to a stop it then can not enter (kept so no sheep figure moves).
- The review's exact Central West rescue farm (-$73,277) was not rebuilt; a farm of the same kind was used.
- No browser check of the plan card wording; the `realism-guardian` agent was not run on this pass.

### 15 Nov 2026: m8 Site look

Branch `m8-look-site`, cut from `m7-final` (6a27291). The website, admin, community pages and the map's surround brought into line with `docs/mockups/index.html`. No game rule, figure or engine code changed. Lesson LS1.

- **Landing page:** the title sits over the dusk farm with the mockup's fade (`--hero-fade`, both themes, in `globals.css`): from the left on PC, from the top on a phone, where the farm shows under the buttons. Hero buttons: Play free, then Leaderboard while `leaderboards` is in the site's switch list, otherwise How a day works. The three cards under the hero (Daily Farm, Fast Farm, Community) follow the switch list. **Daily Farm is on by default** in the site's list (`SITE_SWITCHES_DEFAULT_ON`; `SITE_SWITCHES_OFF=daily_farm` turns it off). The other sections stay lower down. The admin's announcement shows as a bar at the top when there is one and a database is set: the page is built with `getStaticProps` and rebuilt every 5 minutes only when `SUPABASE_DB_POOLER_URL` is set, otherwise fully static. It still sends no script file. The announcement rules moved to `lib/announcement.ts` so the page and the admin form share them (a pages-router page can not load a `server-only` module). Sections below the first screen use `content-visibility: auto`.
- **Public header:** links are the mockup's small ghost buttons.
- **Map surround:** bush country in both themes (VISUALS, "The surround"), in `packages/render/src/surround.ts`, drawn as a screen tile under the farm. No farm view changed, so the map fixtures did not need making again.
- **Admin:** headings in Silkscreen 20 px, chunky buttons in every button row (coral for the main one), the switch look on the switches screen with its confirm step kept, the mockup's menu (logo and ADMIN, active item, a coral count of open reports on Moderation), KPI tiles four to a row from 900 px. The logo and the count are drawn by the server layout and handed to the menu, so no script was added.
- **Community:** headings in Anton (40 to 64 px). The feed page has the mockup's 340 px right column on PC, holding the side ad slot, while ads are on (no new data, no new script). A sponsored post after every 8 posts (the mockup and the slot's stored default; the feed does not read the stored `every_n_posts` yet).
- **Tokens:** `.badge.coral`, the `.btn.lime` bevel, `.pagehead h1` letter spacing.
- **Ticker:** the mockup's green border and glow, 340 px wide, 20 px in from the corner. 1,437 bytes compressed (limit 2 KB).

**Proof:** see the m8 report for the test counts, the JS sizes and Lighthouse on `/` before and after.

**Not done or not checked**

- Signed-in admin and community pages (no database here): only their not-set-up answers were seen.
- The announcement bar with a real database.
- Lighthouse on this PC was noisy while another build ran beside it; the quiet runs matched the m7 figures.

**Merged with `m7-final` (53da309).** Both branches had made the site show Daily Farm by default. One mechanism is kept: the default-on list `SITE_SWITCHES_DEFAULT_ON` in `lib/site.ts`, turned off by name with `SITE_SWITCHES_OFF=daily_farm`. The minus form in `SITE_SWITCHES_ON` (`-daily_farm`, in the m8 Daily Farm entry below) is removed and now does nothing; `.env.example`, SETUP, RUNBOOK, CALLS_FOR_CLAUDIA and the tests say the same.

### 15 Nov 2026: m8 Daily Farm on by default

Branch `m8-daily-on-and-speed`, cut from `m7-final` (6a27291). Claudia asked: "I would also like you to turn on the daily farm ... I want to be able to get on and try both rounds of gameplay." (REQUIREMENTS, 15 Nov 2026.)

- **The default.** `daily_farm: true` in `FEATURE_SWITCHES`; new migration `20261120000100_daily_farm_on.sql` sets it on where no admin has set it by hand; the seed test checks the two agree (on). The admin switches screen reads its default from the shared list, so it follows. The website's own default now shows Daily Farm (`SITE_SWITCHES_DEFAULT_ON` in `lib/site.ts`); `-daily_farm` in `SITE_SWITCHES_ON` takes it off.
- **No database.** Setup no longer says "Daily Farm is coming". With no database it says: "Daily Farm needs the game database, which keeps each farm from day to day and runs its nights. This copy of the game has no database set up yet. Fast Farm is ready to play now." With a database but no sign-in: Daily Farm needs an account and sign-in is not set up. Switched off by the admin: "Daily Farm is switched off at the moment." The setup state `coming` is renamed `off`.
- **Trying it before the database.** `GG_DEV_LOCAL_DAILY=1`, honoured only in `pnpm dev` with no database: a guest can start a Daily Farm on farm files (`DailyData(null)`, so the baked tables then the averages and last prices). No rollover job: the nights owed run when the farm is opened, by the same `bringUp` code. A small change: a `local` flag on the Daily runtime and two guards in `createDaily`.
- **What Daily Farm needs to run** is written down in `docs/RUNBOOK.md` section 5.1. `.env.example` said a farm with no feed runs "only as far as the days already kept"; it runs on, on averages and last prices, with a diary line. Fixed there and in the RUNBOOK.
- **Proof.** `daily.e2e.test.ts` no longer forces the switch: it reads the migrations' default from the database (on), checks setup offers Daily Farm to the new account, starts a farm, runs the rollover route after midnight and opens the farm next morning on the next day (passes). New `server/daily/offer.test.ts` (7 tests): the no-database line, the sign-in line, the development setting ignored in production and with a database, and a guest's local farm moving on overnight. `start.test.ts`, `rollover.test.ts`, `coverage.test.ts`, `sitePages.test.ts` pass.

### 15 Nov 2026: m8 /play speed

Same branch. Lighthouse Performance on `/play` against the 0.95 target in `lighthouserc.json` (no rule, threshold or config changed). Lessons SP1 and SP2.

**Measured first** (5 mobile runs back to back with the repo settings, `lhci collect --url=http://localhost:3000/play --numberOfRuns=5`, local production build; the PC was busy with other work, so the scores are noisy):

- Before: 0.86, 0.86, 0.82, 0.86, 0.85 (median 0.86). Largest paint 3.49 s (median), first paint 0.93 s, total blocking time 249 ms, layout shift 0.
- The largest paint was a setup card's text (since this branch, the Daily Farm card's longer line). It was not in the server's HTML, which held "Loading your farm". Before it could draw: 14 script files (about 217 KB over the wire), then `/api/game/farm` and `/api/auth/me` side by side, then `/api/game/setup` (mounted only after the farm answer), then React's render. Lighthouse's breakdown: 0.6 to 0.9 s of "element render delay" after the HTML. Fonts (4 files, preloaded) and the 2 style sheets come with the HTML and were not the cause. The PixiJS map already loads only when a farm is drawn. The main thread: script evaluation about 0.7 s, mostly React (one long hydration task of 250 to 400 ms).

**Fixed**

1. `server/game/firstScreen.ts`: a request with none of the game's cookies (`gg_session`, `gg_farm`, or a `sb-*` sign-in cookie) can have no farm, so `/play` gets the setup choices on the server (the same `setupOptions` and `dailyOffer` the setup route sends) and draws the first setup step in its HTML. `PlayApp` shows setup in place of "Loading your farm" until the farm request answers, then follows the answer as before. `SetupFlow` uses the choices it was given and skips the setup request. With any cookie, or if the server read fails, the page is exactly as before.
2. The site header and the setup flow each sit in their own `<Suspense>`, so React hydrates them as separate pieces of work. Within the noise; kept because it changes nothing on screen.

- After: 0.96, 0.94, 0.98, 0.87, 0.95 (median 0.95). Largest paint 0.92 s, the same as the first paint, and the element is in the server's HTML (the document grew from 7.4 KB to 9.0 KB over the wire). Total blocking time 250 ms (median). Layout shift 0. Accessibility, best practices and SEO 100 every run.
- What is left: total blocking time, mostly React's own first hydration (one task of about 260 to 350 ms on this PC). A busy machine can still read under 0.95. Taking it lower needs less to hydrate on the first screen (for example a setup step that is plain HTML until it is used), which is a redesign of how the page starts, not done.

**Rules kept.** No Lighthouse rule or JS budget changed: `/play` is 208.4 KB (208.3 KB before). `pnpm check:browser-bundle` clean (no engine code in the browser). The CSP is unchanged; the page's nonce and hashes still match (no policy errors in any run, best practices 100). The service worker still precaches `/play`: a headless Chrome check (puppeteer-core) opened `/play` as a new visitor (setup in the HTML), let the worker install, made a farm through the setup screen, opened `/play` again, then stopped the server. Offline, the worker served its install copy, which holds the setup HTML, and the page still showed the kept farm with "You are offline. This is the farm as you last saw it." and Next day switched off. The browser pane in the app can not register a service worker at all ("An unknown error occurred when fetching the script"), so that check was done in headless Chrome. Tests: `apps/web/server/game/firstScreen.test.ts`, `apps/web/components/play/playfirst.test.ts`, and the offline, maintenance and CSP tests rerun.

**Proof (both m8 parts).** `pnpm typecheck`, `pnpm lint`, `pnpm format:check` clean. `pnpm test`: 236 files, 4,267 tests: 4,240 passed, 22 expected failures, 4 skipped, 1 failed on time only (`boards.test.ts` "Your row pins at the bottom", 30 s timeout while Lighthouse and a server ran on the same PC); rerun alone, 13 of 13 passed. `pnpm build` passes. `pnpm check:browser-bundle` clean. `pnpm check:js-budget` passes with no limit raised (`/play` 208.4 KB). Production build with no keys: `/` (no script file, the Daily Farm card shows), `/play` as a new visitor (setup in the HTML, Daily Farm says it needs the game database), a Fast Farm taken through setup, Lick switched on, Next day and the overnight card. No policy error in the console. Every server started was stopped.

### 15 Nov 2026: m8 the game screens match the mockups

Branch `m8-look-game` (from `m8-daily-on-and-speed`). Claudia asked that the built game match `docs/mockups/index.html` and its feel (REQUIREMENTS "15 Nov 2026: the game screens match the mockups"). Colours, fonts, buttons and radius already matched; this pass is layout and parts. Recorded requirements that differ from the mock were kept (Plans tab, Help in the top bar, Workforce in More, the extra setup steps, four labels, time shown lightly and the rest listed there).

**Built**

- Pixel icons: the mock's 8 by 8 grids in `Icon.tsx`, crisp and filled, plus drop, help, close, back and chevron in the same style. Every old line icon is replaced.
- Phone upright: the top bar floats over the full-height map (farm button, name, day, date and mode, cash with "Bank limit $X" under it when cash is below zero, the bell with the unread count, Help, the 12 px daylight bar with first light, a light note and last light, a facts line, the time chips). The theme switch moved to More, Settings. "N things to check" under it, open with three square-bullet lines, collapsible, "See all" for the full list with its buttons, contract fencing and the paddock buttons. Each thing to do has "Put away" (the playability branch's `dismissTodo`).
- Tabs: Build, Herd, Paddocks, Market, Plans, More, 10 px labels. Build opens the tray docked on the tabs (grab handle, tools, then the job card). The job card is key and value rows and Cancel | Build it at 1fr / 1.4fr; the daylight bar shows the open job as a striped slice.
- Paddock sheet as the mock: title, chip, "ha · Water ✓/✗"; six tiles; "Mob: …, about N days of feed at this rate" (or the server's `feedText`); the picture; a slot for the comment line; Move cattle in here | Details.
- Day summary: full screen on a phone, "Day N done" or "N days done", every figure kept, full-width Back to the farm.
- More: a sheet of icon rows (Plans, Scores, Diary, Inbox with its coral count, Workforce, Help, Farm, Account when sign-in is set up, Settings). Inbox, Help, Farm, Account and Settings each open their own page; inbox messages carry kind icons. The bell opens the inbox; the farm button opens the farm list (signed in) or the Farm page.
- Segmented controls, sort chips and tool buttons at the mock's sizes. Market buy rows with c/kg that open the stepper and the confirm card under the row; the chart uses one series token per class (`--s0` to `--s6`, both themes, added to `globals.css`). Herd rows "180 steers · avg 342 kg · CS 3.5" with the gain in ok or bad colour and the reason. Paddocks: one line each on a phone, a table on a PC with the open paddock marked, a Water sort (and Rest days once the server sends them). Score bars in their own colours, 12 px, radius 2, no track.
- Setup: the row of step badges, "Next: choose district" and so on, and a recommended start picked on every step (Fast Farm, first district, small, grazing, random seasons, running, medium). It is in the server's first HTML because `SetupFlow` starts its draft from the choices sent with the page, so no change to `server/game/firstScreen.ts` was needed (test in `playfirst.test.ts`). Difficulty cards show starting cash and the bank limit when the server sends `sizes[].money`.
- Phone on its side: a slim bar (date on one line, short skip chips, cash at the far right); the paddock sheet and lists in two columns with ✕; build tools bottom left and the card top right.
- PC: the website header on /play with Farm (and Community, Leaderboard, Groups when switched on), the bell and the avatar when signed in, no "Play free"; the game header in the mock's order with cash over net worth; side tabs Build, Herd, Plans, Paddocks, Market, Scores · Diary, More (Scores and the Diary together); panel width by tab; the sponsor rail at the far left at 180 px.

**Calls made**

- Build and More stay as PC tabs (the mock has neither): the tools, things to do and the inbox, workforce, help and settings must be reachable.
- The market's buy row does not multiply price by head: the server's card gives the total, so the browser never shows a sum that could differ from it.
- Panels on a phone on its side keep the slim bar above them (the mock covers it).

**Proof.** `pnpm typecheck`, `pnpm lint`, `pnpm format:check` clean. `pnpm test`: 236 files, 4,268 tests: 4,242 passed, 22 expected failures, 4 skipped (plus a new case in `playfirst.test.ts`: Fast Farm checked and "Next: choose district" in the first HTML). `pnpm build` passes. `pnpm check:browser-bundle` clean. `pnpm check:js-budget` passes with no limit moved: `/play` 214.1 KB of 250 KB (208.4 KB before). Lighthouse on `/play` (repo settings, mobile, 5 runs, local production build, a PC busy with other builders): after 0.91, 0.96, 0.89, 0.94, 0.95 (median 0.94), largest paint about 0.93 s, layout shift 0, accessibility, best practices and SEO 100. Before (336c9ce, two tries, each with runs that failed on the busy PC): 0.81, 0.82, 0.83 (3 of 5 runs, largest paint 3.6 s), then 0.93 (1 of 5). The two are not a clean pair; the median is within the noise of the 0.95 measured when the speed fix landed, and total blocking time (React's first hydration) is still what holds it under 0.95. Screens checked with headless Chrome against the production build with no keys, a guest farm taken through setup on the recommended start: phone 390 x 844 and on its side 844 x 390 in both themes, PC 1440 x 900 dark (PC light was refused a new farm by the guest farm limit, 5 in 10 minutes), beside screenshots of the mockups.

**Waiting on server fields** (drawn when present, read through `components/play/ui.ts`): `totals.rainMm`, `market.buy.classes[].weekChangeCKg` (and a week and year change on the price table), `paddocks[].restDays`, `paddocks[].comment`, the Feed panel and the Stock book components (slots left in More, the PC tabs and Herd).

### 15 Nov 2026: m8 Playability fixes

Branch `m8-playability`, cut from `m7-final` (6a27291). Engine 0.20.0, save format 15, snapshot version 7. From a playtest of 144 three-year games. Calls B141 to B150, A10 (doing nothing out-scores sensible play, for Claudia, nothing changed), stand-ins and G10. Lessons PF1 to PF8. Only the engine, `apps/web/server`, `lib/game/tour.ts`, `lib/game/types.ts` (new fields only), `components/play/helptopics.ts` and docs were touched: the screens are other builders'.

**What was built**

1. The bank: two facts before it takes the farm (cash below zero, three quarters of the way to the limit), in the inbox, Things to do and as skip stops; `totals.bankLimit` and `totals.lendLimit` as display numbers. Nothing came off the browser deny list. Tests: `day/playability.test.ts`, `server/game/playability.test.ts`.
2. Skip stops for the first eaten-out day, the bank facts, deaths other than natural, and calving starting, each with its words. Tests: `day/playability.test.ts`, `day/days.test.ts`.
3. A year skip runs to the farm's year end: 366 days across 29 February (a Central West farm from September 2007). Test: `day/playability.test.ts`.
4. Things to do facts: a sale within 7 days with the head at sale weight by class, a mob under CS 2.5, calving started, feed under the floor; each once while true; `dismissTodo` puts one away. Tests: both playability files, `day/todo.test.ts`.
5. Marking once per drop, when most calves are old enough or 30 days after calving started. Test: `day/playability.test.ts`.
6. Mob card warnings only when losing worse than 0.05 kg a head a day, CS under 2.5 or no water; otherwise `details`. Tests: `mobwords.test.ts`, `server/game/playability.test.ts`.
7. "Under 800 kg DM/ha" in place of "0 days" (`feedText`); "Feed is about 760 kg DM/ha. Under about 900 they eat less." Tests: same.
8. The tour: open a mob, look at the fence card; never join mobs or spend money. Test: `lib/game/tour.test.ts`.
9. The year card's change lines. Test: `server/game/playability.test.ts`.
10. Setup money per difficulty for each district and size (`sizes[].money`). Test: `server/game/playability.test.ts`.

**A small playtest through the real `GameServer`** (real years, small farms, three years; sensible player on week skips doing every job with a button, selling steers and heifers at sale weight when a sale is near, moving mobs out of the yards; do-nothing player on month skips):

| District | Player | New to-do items a week | Items shown | Warning lines at each look | Skips | Stopped early | Missed stops |
|---|---|---|---|---|---|---|---|
| Central Queensland | sensible | 0.40 | 0.87 | 2.7 | 161 | 10 | 0 |
| Central Queensland | nothing | 0.33 | 2.87 | 3.6 | 44 | 15 | 0 |
| Central West | sensible | 0.37 | 0.61 | 3.1 | 160 | 8 | 0 |
| Central West | nothing | 0.35 | 2.68 | 2.9 | 43 | 13 | 0 |

The first item came on day 74 in Central Queensland and day 0 in Central West (before: day 133 to 160). On hard difficulty the Central Queensland do-nothing farm was taken by the bank in year 3; its skips stopped first at -$44 (below zero) and again at -$45,095 (three quarters of the way), then at the end. A buyer spending to the overdraft on hard was warned the night each buy took cash below zero. "Missed stops" counts inbox facts that should stop a skip on a day that was not the last of its skip: none.

**Proof**

- `pnpm typecheck`, `pnpm lint`, `pnpm format:check` clean. `pnpm test`: 235 files, 4,278 tests: 22 expected failures and 4 skips (as on `m7-final`); after the fixes to the tests listed in CALIBRATION (the m8 entry), the two tests that failed only on time under load (`cattle/gains.test.ts`, `server/boards/boards.test.ts`) pass alone.
- `pnpm build` passes. `pnpm check:browser-bundle` clean. `pnpm check:js-budget` passes with no limit raised (`/play` 208.6 KB).
- `pnpm test:speed` alone: sheep 2.27 ms a day (passes). The cattle case failed on time on every run (45, 20, 6.7 and 7.7 ms a day) while other builders were running on the same PC; `m7-final`'s own engine, run the same way in the same hour, gave 17 ms. No change here touches the cattle tick's work (the bank check is two comparisons a day). Not yet seen under 5 ms on this tip.

**Not done or not checked**

- The screens do not yet draw the new fields: `totals.bankLimit` and `totals.lendLimit` beside Cash, `paddocks[].feedText` in place of the days, `mobs[].details` in the mob card's details, `setup` `sizes[].money` on the difficulty step, and a "put away" button on each Things to do item that sends `{ action: { type: 'dismissTodo', key } }`. Until then the paddock sheet still shows "About 0 days", and Help does not mention putting an item away.
- The inbox's own out-of-feed line still says "The farm has about N days of feed left"; the skip stop words are the new ones.
- The marking note in the inbox (`toMark`, every 45 days) is unchanged.
- Engine tests were compared with `m7-final` by count (22 expected failures, 4 skips), not file by file by name. The `realism-guardian` agent was not run. No browser check.

## m8 second pass: the stock book, the Feed panel and the paddock comment line (engine 0.21.0, save format 16)

Three things in the mockups and REQUIREMENTS that milestone 1.7 never built (LESSONS SB1), built on the engine and server side with self-contained components. Branch `m8-stockbook-feed` from `m8-playability` (0d14d26).

**Built**

- **Stock book and profit per animal.** The engine already kept each animal's purchase price (`paid`) and running cost (`cost`: purchase, feed, health, marking). New: `stockBook` (engine) and `RecordResponse.stockBook` on the record route (every head; it is not in the snapshot, which a herd of 4,000 would take past its 150 KB limit: class, age, kg, CS, PTIC, where it came from, bought, spent, value now after selling costs, profit), and `money` on every Sell row (`mobs[].sellGroups[]`, `market.sell.classes[]`). `createFarm` records `startTags`, so the start herd reads "Taken over" (save format 16; an older save reads "Bought or taken over"). Components `StockBook` and `SellProfitLine`.
- **Feed panel.** `feedForecast` runs the tick's own start of the day on a copy for 365 days in an average season, with the stock on hand eating what they ate today. `snapshot.feed` sends 12 points of tonnes, the floor, what the stock eat a month, the facts, the average-season note, and each cattle mob's supplement with its cost a day and what each one adds. Component `FeedPanel` (SVG chart, no library).
- **Paddock comment line.** `paddocks[].comment`: seven lines, each tied to one condition (MODEL section 14).
- **Display fields.** `paddocks[].restDays` (from a new `stockedOn` record), `totals.rainMm`, `market.prices[].lastWeekCKg`, `mobs[].gainWhy`. Already sent: `mobs[].weightKg`, `farm.setup.districtName`, `totals.head`, `totals.netWorth`.
- **Leftovers.** The inbox's eaten-out line no longer says days of feed left; the engine's 45-day marking note shows once a drop in the inbox.
- **Plans with legs.** The engine took up to 8 legs already; the server now takes `moreLegs` on `setPlan`.

**Proof**

- `pnpm typecheck`, `pnpm lint`, `pnpm format:check` clean. `pnpm test`: 238 files, 4,331 tests: 4,305 passed, 22 expected failures and 4 skips (as on `m8-playability`). 53 new tests (engine 13, server 30, components 10).
- `pnpm build` passes. `pnpm check:browser-bundle` clean. `pnpm check:js-budget` passes with no limit raised (`/play` 208.6 KB, unchanged: the new components are not mounted yet).
- The snapshot for a 4,000-head farm stays under its 150 KB limit: the stock book went to the record route after the first try put it in the snapshot (782 KB).
- The feed forecast takes about a tenth of a second a farm (a year of the grass model); the server reuses it while the pasture, crops and stock are unchanged.

**Not done or not checked**

- Nothing is mounted: the restyle builder mounts `StockBook`, `SellProfitLine` and `FeedPanel` and draws `comment`, `restDays`, `rainMm`, `gainWhy` and `lastWeekCKg`. No browser check, so no phone or PC screenshot.
- Grazing evenly or patchily is not in the comment line. The plan form has no Leg 2.
- The diary still lists the engine's marking note every 45 days.
- The `realism-guardian` agent was not run.

### 15 Nov 2026: m8 the mockups' screens with the real fields, the stock book, the Feed panel and plan legs

Branch `m8-look-game`, after merging `m7-final` (the playability fixes, engine 0.20.0) and `m8-stockbook-feed` (engine 0.21.0, save format 16, snapshot version 8). Calls B169 to B172.

**Built**

- The new fields are read from the game's own types, no casts left: the bank limit beside Cash when cash is below zero, `feedText` in place of the days on the paddock sheet, `details` in the mob card's details (plain text), the setup money on each difficulty card (starting cash by the chosen start, and the bank limit), Put away (`dismissTodo`) on each thing to do, `gainWhy` as the reason on the Herd rows, `restDays` (a Rest days sort and a column on the PC table), `rainMm` in the phone bar's facts line, `comment` in italics on the paddock sheet, and `lastWeekCKg` as a Week column with ▲ or ▼ on the price table.
- Mounted: the stock book behind "Mobs | Stock book" on Herd (phone and PC), fetched with the record the first time it opens, with a loading line; the Sell money line under the Market's Sell pickers (by class and by mob) and the mob card's; the Feed panel as a row in More on a phone and a tab between Paddocks and Market on a PC, its supplement buttons asking for the mob card's own job card, which draws under that mob's row. The stock book and the Feed panel load only when opened (`next/dynamic`).
- The plan form as mockup F: Leg 1, "Add a leg" up to eight, each leg a card with its paddocks as chips joined by arrows, "+ add" to tap paddocks into that leg, its own rule and rounds; Repeat | Stay; the water line; Start from across every leg; Save plan and New plan. The form sends the extra legs as `moreLegs` with `step` counted across them (`lib/game/plans.ts`, a new test in `plans.test.ts`). Change shows on every plan, so a plan of several legs opens in the form.
- Tour and Help words name the Build tab, the things-to-check banner and Put away. The tour's steps are the server branch's (paddock, mob, fence, market, day); none of them depends on where a control sits, and each was walked on a phone.

**Calls made:** B169 to B172 (Build as the first tab, water under the paddock's name on a phone, Build and More kept as PC tabs, the slim bar staying on a phone on its side).

**Still hidden for want of a field:** the weekly arrow on the Buy rows (a buy class has no last-week price; its price is worked out from the market classes on the server, so the screen does not guess it), Fast Farm "2 of 3" in the PC farm box, a Groups switch, an unread count on the site bell, a year's price change on the price table.

### 15 Nov 2026: m8 the PC header at mid widths

At about 1024 px the PC game header squeezed the date block into a few characters and wrapped it one word a line (about 200 px tall), and the panel tabs wrapped to two rows. Fixed in `play.module.css` (rules in VISUALS "The PC header at every PC width"): a 150 px minimum and an ellipsis for the date block, parts dropped in a set order at 1365, 1279 and 1180 px, a second row only below 1024 px, tabs on one row, the panel capped at 42% of the window. Also fixed: "PTIC" in the Herd rows (a word-boundary character had gone in as a backspace). New `components/play/pcheader.test.ts` guards the rules. Checked on the production build with a guest farm at 768 x 1024 (phone layout), 1024 x 768, 1180 x 820, 1280 x 720, 1366 x 768, 1440 x 900 and 1920 x 1080: the header is one row of 63 px at every PC size, no sideways scroll, the map at least 594 px wide.

## Ideas raised but not built yet

- An "overgrazed" judgement based on grazing pressure combined with rest periods (graze short is fine with a long rest).
- More stubble nuance (preference, nutritive value by crop).
- Touch / phone testing.
