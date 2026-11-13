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

## Ideas raised but not built yet

- An "overgrazed" judgement based on grazing pressure combined with rest periods (graze short is fine with a long rest).
- More stubble nuance (preference, nutritive value by crop).
- Touch / phone testing.
