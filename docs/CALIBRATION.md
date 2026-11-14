# Calibration: the numbers that must stay true

The game is only worth playing if a grazier would believe it. These benchmarks are the definition of "believable". **Any change to growth, quality, intake, energy, breeding, deaths, water or stocking must be re-run against them before it is published.** A rebuild is not done until every line here passes again.

## Benchmarks

| What | Target | Why this figure |
|---|---|---|
| Steer gain, Central Qld, set-stocked, no lick | 20–60 kg/head/yr | Spear grass country without supplement: weight lost through the dry wipes out most of the wet-season gain |
| Steer gain, Central Qld, with lick | 75–130 kg/head/yr | Urea/protein lick lifts dry-season intake (CP < 7%) |
| Steer gain, Northern Tablelands | 90–105 kg/head/yr | Frosty winters, a good summer |
| Steer gain, Central West NSW | 115–130 kg/head/yr | Spring flush, rain through the year |
| Steer gain, Western Victoria | 155–185 kg/head/yr | Higher-quality temperate native pasture |
| Steer gain, Top End | 30–55 kg/head/yr | Long dry, low CP, big paddocks |
| Annual deaths, lick and normal stocking | 1.5–3.6% (Top End 2–5%) | Industry ranges. Droughts with no destocking can be far worse, and that is intended |
| Intake on green leafy feed | 2.5–3% of live weight | |
| Intake on dry stemmy feed | 1.5–2% of live weight | Lactating cows eat more |
| Conception per 3-week cycle | ~50–65% in good condition, ~25% at CS 2 | |
| 9-week joining at CS 3–4 | 85–95% in calf | About 4% of cows never get in calf |
| Post-calving anoestrus | 45 days (good condition) to 85+ (CS 2) | |
| Carrying capacity | annual growth × 0.65 × district safe utilisation ÷ 3,285 kg | About 0.3 AE/ha in Central Qld, much lower in the Top End |
| Barley yield, Central West | ~2.5 t/ha | |
| Wheat yield, Central West | ~2.4–3 t/ha | |
| Steers on oats | ME ~10.7, CP ~18%, ~1.4 kg/day | |
| Speed | under ~5 ms per simulated day with 4,000+ head | Fast-forward must stay smooth |

Seasons are random. Judge a run against its season: a drought year below target is expected, but an average year outside target is a bug.

## How to run the checks (the rebuild)

The benchmarks are automated tests in `packages/engine/src/calibration`. The runs they use are in `packages/engine/test-support/calibration.ts`.

```bash
pnpm test
```

```bash
pnpm test:speed
```

- `pnpm test` runs every benchmark with the rest of the tests: steer gains, established herds, grain yields, steers on oats, and 500 head on 4 ha moved daily. The cattle benchmarks that need no farm (intake, conception, joining, anoestrus, no water) are in `packages/engine/src/cattle`. Carrying capacity is in `packages/engine/src/money/costs.test.ts`.
- `pnpm test:speed` runs the speed benchmark on its own, because a timing taken beside the other tests reads several times slower. The limit is 5 ms. CI runs it with a looser limit (15 ms) for its slower shared machines.
- After any change to the model or its data: bump `ENGINE_VERSION`, run both, and add the before and after figures to the results log below.

### How a benchmark is judged (proposed, waiting on Claudia)

**This is not the rule in the build plan.** BUILD_PLAN section 3 and the MVP's own script judge every run: an average or better year outside the target fails. The model cannot pass that as written, before or after the rebuild, because blocks differ by more than some bands are wide. What follows is how the tests hold the bands until Claudia decides. The figures behind the question are in the 1.3 entry of the results log.

- Every run is on a fixed seed, so the same run always gives the same figures.
- **The average year** is the measure for a band. Every day grows at the district curve, with no good or poor months. The seed still changes the block (its land, its soil and the pasture it starts with).
- **A band is held on the average over the blocks, not on each block.** In the very same season one block differs from the next by 20 to 30 kg a head. That is wider than the Tablelands and Central West bands, which are 15 kg wide.
- **Random seasons** are run on the same seeds. A run is judged against its season: a year with a poor season may fall under the band, and that is recorded, not failed. The long run of seasons must not be over the band.

## How to run the checks (the MVP, kept for reference)

1. Make a scratch copy with the debug hook. The `tests/tmp/` folder is git-ignored:

   ```bash
   python -I -c "s=open('grazing-game.html',encoding='utf-8').read();i=s.rindex('setupDialog();')+14;open('tests/tmp/calib-copy.html','w',encoding='utf-8').write(s[:i]+'window.__gg={get S(){return S},get REGS(){return REGS},get ROF(){return ROF},stepDay,newGame,diffMoney,buyCattle,ccAEfor,FARMS,REGIONS};'+s[i:])"
   ```

2. Start the local server (the `game` entry in `.claude/launch.json`, port 8765) and open `http://localhost:8765/tests/tmp/calib-copy.html` in the in-app browser.
3. In `javascript_tool` run:

   ```js
   const src=await fetch('/tests/calibrate.js?'+Date.now()).then(r=>r.text());(0,eval)(src);await calibrate()
   ```

   Pass `['steers']`, `['herds']` or `['speed']` to run one suite.
4. Paste the output into the results log below with the date and the version, and explain anything marked CHECK.
5. Never publish a file that contains `window.__gg`.

When the rebuild changes function names, update the hook line and `tests/calibrate.js` together. The suites only need: start a game (region, farm size, month, money, herd or scratch), buy weaner steers into the paddock with the bore, set the supplement, step one day, and read mobs, the year totals and the log.

## What each suite does

- **steers:** a 260 ha block with one water and weaner steers at about 60% of carrying capacity. It runs a year, three runs per case, and reports gain per head, deaths and the seasons.
- **herds:** an established medium farm on medium difficulty, starting in September and in May. It runs a year and reports deaths, gain per head, preg-test results against the expected rate, and ms per day.
- **speed:** a large Top End farm (about 11,000 head) for 60 days, reported as ms per 1,000 head.

## Results log

### 13 Nov 2026, v15 (first run of `tests/calibrate.js`)

Steers (kg/head/yr; seasons are the start season, then the one drawn in July):

- cq no lick: 32 (above avg → avg), 16 (well below × 2), 30 (below avg × 2). In range except the dry year.
- cq lick: 123, 128, 127. In range.
- nsw: 105, 99 in average or better years; 61 in a well below → drought year.
- cw: 130, 140, 154 in average years. **A little high, up to 24 kg over the top of the range.** Worth a look in the rebuild: possibly spring quality or growth in Central West is a touch generous.
- wv: 179 (wet). 151 and 142 had a drought in the run. In range in normal years.
- nt lick: 45 (wet), 26 and 28 (average, or below in the second half). Around the low edge.

Established herds (deaths, gain/head, preg test vs expected):

- cq: 1.5–1.7% deaths, 136–156 kg; preg 92–94% vs 86–91% expected.
- nt: 2.5% in a below-average year. **7.3% when the season went from below to well below average** (drought-type year, no destocking). 20–36 kg gain.
- nsw: 1.6–3.2%, 96–101 kg; preg 70–94%.
- cw: 1.0–3.4%, 146–153 kg.
- wv: 1.8–2.0%, 178–182 kg.
- Preg tests run about 5 points above the expected rate in good years. That is fine, because the expected rate is a 3-cycle estimate and some cows get 4 cycles.

Speed: 1.2–3.1 ms/day on medium farms (250–2,900 head). A large Top End farm with 11,362 head ran at 6.7 ms/day, about 0.6 ms per 1,000 head, so it scales linearly and is within target.

### 13 Nov 2026, rebuild milestone 1.2a (cattle): the benchmarks that need no farm

The cattle formulas were matched to the MVP number for number, so these are the MVP's figures, now held by automated tests in `packages/engine/src/cattle`. The whole-farm benchmarks (steer gains, deaths, speed) wait for milestone 1.3.

Intake as % of live weight, dry stock, no supplement, on a paddock painted all one kind of feed:

| District | Green leafy: 250 / 350 / 500 kg | Dry stemmy: 250 / 350 / 500 kg |
|---|---|---|
| Central Qld (ME 9.1 green, 6.8 dry) | 2.58 / 2.32 / 2.06 | 1.59 / 1.43 / 1.27 |
| Northern Tablelands (9.8, 6.9) | 2.80 / 2.52 / 2.24 | 1.65 / 1.48 / 1.32 |
| Central West NSW (9.8, 6.9). From milestone 1.3: (9.4, 6.8) | 2.80 / 2.52 / 2.24. From 1.3: 2.69 / 2.42 / 2.15 | 1.65 / 1.48 / 1.32. From 1.3: 1.63 / 1.47 / 1.30 |
| Western Victoria (10.1, 7.1) | 2.92 / 2.63 / 2.34 | 1.74 / 1.57 / 1.39 |

- **Passes for cattle under 300 kg in every district:** 2.5 to 3% on green leafy feed and 1.5 to 2% on dry stemmy feed. A 450 kg cow with a calf on her is in the green range too (2.58 to 2.92%).
- **CHECK: heavier dry stock sit under both ranges.** The MVP's appetite steps down at 300 kg and again at 450 kg. A 500 kg bullock eats 2.1 to 2.3% on green feed and 1.3 to 1.4% on dry feed. Nothing was changed. For Claudia: is the benchmark meant for young cattle, or for all classes?
- With a lick, a 250 kg steer on the dry feed eats 2.2 to 2.4% (the × 1.25 lift).

Breeding:

- Conception per 3-week cycle: 50% at CS 3, 60% at CS 3.5, 65% at CS 4, 25% at CS 2. Passes.
- Expected in calf after 9 weeks: 84.0% at CS 3, 89.9% at CS 3.5, 91.9% at CS 4, 55.5% at CS 2. **CHECK:** at CS 3 exactly it is one point under the 85 to 95% range. It is inside from about CS 3.1.
- Anoestrus after calving: 45 days at CS 3 and above, 85 days at CS 2. Passes.
- No water: every animal that has a day on the fourth day dies. Passes in all four districts.

The MVP faults fixed in this milestone (the feedlot has water, a cow whose calf dies is dried off, weaning dries off a dam in another mob) change results a little from the MVP in those cases only. They have not been through the whole-farm suites yet. Re-run them in 1.3.

### 13 Nov 2026, rebuild milestone 1.2c (the whole farm): engine 0.4.0

No grass or cattle formula changed. The whole farm (the daily tick, costs, the market stand-in and the starting herd) was matched to the MVP's own `stepDay` day by day: breeding herds for 380 days in each of the four districts, steers for 150 days in each, a mixed farm for 300 days. Every animal, every pasture square, cash and the year's totals are equal exactly, so the MVP's whole-farm figures above still stand for the rebuild. The whole-farm benchmark suites (steer gains, deaths, the Central West tune) are milestone 1.3 and were not run here.

- **Speed: 2.1 to 3.0 ms a simulated day with 4,300 to 4,900 head** (plus 400 to 900 calves) in three mobs on a large Central Queensland farm, on its own on the build PC. Target under 5 ms. Passes. With the whole test suite running beside it the same test reads about 15 ms, so run it on its own (`pnpm exec vitest run packages/engine/src/sim/speed.test.ts`).
- **No water:** every animal in a mob with no water dies on the fourth day, in all four districts, as a whole-farm test (cows, calves, steers and bulls). Passes.
- **Rule checks that sit beside the benchmarks:** breakouts only through tape and only when hungry or thirsty; one mob to a grazing area after any fence or gate change; a year in each district ends with every figure a finite number.
- The rebuild's differences from the MVP in this part (tape and energiser costs, net worth, a fence through a mob) change money and mob membership, not growth, intake, gain, breeding or deaths.

### 14 Nov 2026, rebuild milestone 1.3 (calibration): engine 0.5.0

**Milestone 1.3's done condition, "every benchmark passes in average or better seasons", is not met as the build plan words it.** Every benchmark is now a test, and the Central West tune is in. But four of them pass only on a reading that is Claudia's to decide (the CHECK list at the end of this entry): steer bands held on the average of twelve blocks, Central Qld with lick 1 kg over, the oats figures held to one fortnight, and herd deaths counted over all herds together.

The MVP's three suites now run as automated tests on fixed seeds, with the other benchmarks beside them. **One figure changed: Central West peak green digestibility (`dmdMax`), 0.70 to 0.68.** No formula changed. The copy of the MVP that the comparison tests load is given the same figure in memory, so those tests still prove the formulas are the same (`REBUILD_TUNES` in `packages/engine/test-support/mvp.ts`).

**Steers.** Weaner steers at about 60% of carrying capacity on a 260 ha block with one water, a year from a scratch start, on seeds 1 to 12. Kg a head a year. Only Central West changed, so its "before" is shown. The other four rows are the same before and after.

| Case | Target | Average year: mean (lowest to highest block) | Random seasons, all 12 | The 4 years with no poor season | The 4 years with a poor season | Deaths, average year |
|---|---|---|---|---|---|---|
| Central Qld, no lick | 20 to 60 | 41 (31 to 57) | 35 | 44 | 26 | 1.6% |
| Central Qld, lick | 75 to 130 | 131 (127 to 136) | 126 | 135 | 118 | 1.6% |
| Northern Tablelands | 90 to 105 | 103 (91 to 118) | 93 | 104 | 80 | 1.7% |
| Central West NSW, before | 115 to 130 | **154** | 135 | | | |
| Central West NSW, after | 115 to 130 | **128** (119 to 139) | 109 | 129 | 75 | 1.6% |
| Western Victoria | 155 to 185 | 182 (171 to 195) | 162 | 179 | 133 | 1.7% |

"No poor season" means both seasons in the run were average or better. "A poor season" means one of them was well below average or a drought.

Every run, after the tune (seasons are the start season's factor, then the factor from 1 July):

| Seed | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Seasons | 1, 1 | 0.85, 1.15 | 0.85, 1.15 | 0.85, 0.5 | 1, 1 | 0.85, 0.5 | 0.85, 1 | 1.35, 1 | 1.15, 1.35 | 0.5, 1.15 | 1, 0.5 | 0.85, 1 |
| Central Qld, no lick, average year | 57 | 38 | 39 | 42 | 31 | 54 | 46 | 34 | 35 | 50 | 37 | 32 |
| Central Qld, no lick, random seasons | 60 | 37 | 35 | 31 | 36 | 42 | 42 | 42 | 37 | 0 | 33 | 21 |
| Central Qld, lick, average year | 135 | 129 | 129 | 133 | 128 | 136 | 127 | 134 | 131 | 134 | 129 | 128 |
| Central Qld, lick, random seasons | 137 | 128 | 128 | 125 | 130 | 126 | 124 | 139 | 133 | 93 | 128 | 121 |
| Northern Tablelands, average year | 118 | 97 | 97 | 105 | 91 | 115 | 108 | 100 | 98 | 111 | 98 | 92 |
| Northern Tablelands, random seasons | 121 | 96 | 100 | 83 | 89 | 90 | 99 | 97 | 109 | 48 | 98 | 81 |
| Central West NSW, average year | 139 | 125 | 127 | 126 | 122 | 139 | 127 | 123 | 124 | 135 | 124 | 119 |
| Central West NSW, random seasons | 136 | 126 | 128 | 51 | 120 | 48 | 124 | 129 | 133 | 121 | 81 | 112 |
| Western Victoria, average year | 195 | 176 | 179 | 185 | 172 | 195 | 188 | 176 | 176 | 194 | 176 | 171 |
| Western Victoria, random seasons | 192 | 175 | 176 | 125 | 171 | 89 | 186 | 174 | 177 | 173 | 147 | 163 |

**Why Central West ran high, and why digestibility was the tune.** In the average year Central West steers gained in every month: 0.23 kg a day in July and August and 0.25 to 0.35 from January to March, where Tablelands steers lose 0.15 to 0.33 kg a day through winter. There is green feed all year, so they never go backwards. Each lever was tried on its own in the average year (8 seeds):

| Lever (Central West only) | Gain, kg a head | What else it did |
|---|---|---|
| As the MVP | 155 | |
| Frost loss a day 0.006 to 0.010, 0.014, 0.020 | 155, 155, 153 | Winter gain fell, spring gain rose to match |
| Frost months and loss as the Tablelands | 153 | |
| Winter growth (June to August) at 60%, 40% | 151, 150 | Carrying capacity 0.33 to 0.31, 0.30 AE/ha |
| Summer growth (December to March) at 70%, 50% | 144, 134 | Carrying capacity 0.33 to 0.30, 0.28 AE/ha |
| Growth scale 0.8 to 0.7, 0.6 | 147, 136 | Carrying capacity 0.33 to 0.29, 0.25 AE/ha |
| Peak protein 14% to 13, 12, 11 | 155, 154, 150 | |
| Lowest green digestibility 0.51 to 0.50, 0.49, 0.48 | 155, 155, 155 | |
| **Peak green digestibility 0.70 to 0.69, 0.68, 0.67, 0.66** | **142, 129, 115, 102** | Intake falls a little with it (below). Carrying capacity does not change |

Less winter or frosted feed did not move the year, because the steers made it up in spring. Less growth lowered carrying capacity before it lowered the gain enough. Only peak digestibility moved the year without moving growth or carrying capacity. 0.68 is the smallest step that puts the average year inside the band.

**What else the tune moved.** Central West feed is a little less digestible, so cattle eat a little less of it. On the intake benchmark (1.2a entry above) Central West now reads ME 9.4 on green feed and 6.8 on dry (was 9.8 and 6.9). Intake on green feed is 2.69 / 2.42 / 2.15% of live weight at 250 / 350 / 500 kg (was 2.80 / 2.52 / 2.24), and on dry feed 1.63 / 1.47 / 1.30% (was 1.65 / 1.48 / 1.32). Both still pass under 300 kg.

**The tune lowered the level, not the pattern.** Central West steers still gain in every month of the average year. Kg a day after the tune (8 seeds): Jan 0.30, Feb 0.22, Mar 0.21, Apr 0.28, May 0.34, Jun 0.27, Jul 0.16, Aug 0.17, Sep 0.41, Oct 0.70, Nov 0.69, Dec 0.47. Whether steers on native pasture at Dubbo should hold or lose weight in July and August is a question for Claudia.

**Established herds.** A running medium farm on medium difficulty, left alone for a year, seeds 1 to 8, September and May starts. Deaths are over all the herds together, with the lowest and highest single herd in brackets.

| District | Head at the start | Deaths, average year | Deaths, random seasons, September start | Gain a head, September start | Gain a head, May start | In calf at preg tests | Preg tests against the expected rate |
|---|---|---|---|---|---|---|---|
| Central Qld (on lick) | 629 to 938 | 2.4% (1.5 to 3.0) | 2.4% (1.5 to 3.0) | 130 kg | 150 kg | 91% | 4.1 points over |
| Northern Tablelands | 216 to 323 | 2.6% (0.9 to 4.1) | 2.6% (0.9 to 4.1) | 97 kg | 135 kg | 89% | 5.5 points over |
| Central West NSW | 333 to 496 | 2.4% (1.2 to 3.4) | 2.4% (1.2 to 3.1) | 123 kg | 135 kg | 91% | 3.4 points over |
| Western Victoria | 178 to 265 | 2.6% (1.1 to 3.6) | 2.6% (1.1 to 3.6) | 177 kg | 171 kg | 92% | 2.7 points over |

- Deaths pass in every district (1.5 to 3.6%). A single small herd can sit outside the range on a handful of deaths.
- Central West herd gain before the tune was 144 kg (September start) and 161 kg (May start). Deaths before were 2.3 to 2.4%.
- **Recorded, not failed:** with random seasons and a May start, Northern Tablelands herds that drew a drought from 1 July lost 13.4 and 14.6% with no destocking (seeds 6 and 4; 19.9% on one of seeds 9 to 12). That is the intended result of doing nothing in a drought. On the same two seeds Central West herds lost 1.2 and 2.8%, Western Victoria 1.1 and 2.6% and Central Qld (on lick) 2.7 and 2.7%, so the drought only bites on the Tablelands in this set-up.
- **Not tested:** May starts with random seasons. Single herds, May start, random seasons, seeds 1 to 8: Tablelands 4.8, 3.3, 2.2, 14.6, 3.0, 13.4, 3.9, 2.0%. The 4.8% is seed 1, where both seasons were Average.
- **Steer deaths do not follow the season.** In the steer runs the deaths are the same in the average year and in a year the steers gained nothing (Central Qld, no lick, seed 10: 0 kg, 2.3% deaths). Deaths only rise once condition falls far enough.

**Grain, Central West, average year, not grazed** (three farms, each sowing month): barley 2.88 t/ha (target about 2.5), wheat 2.70 t/ha (target 2.4 to 3), oats 2.25 t/ha.

**Steers on oats, Central West, average year.** 36 ha of oats sown in March, 30 weaner steers put on at day 50 and left on:

| Days after sowing | Diet ME | Diet CP % | Gain, kg a day |
|---|---|---|---|
| 50 to 64 (settling in) | 11.4 | 21.0 | 0.78 |
| 64 to 106 | 11.4 to 11.5 | 21.1 | 1.2 to 1.6 |
| 106 to 120 | 11.3 | 20.2 | 1.57 |
| **120 to 134 (straight after lock-up)** | **10.7** | **17.4** | **1.43** |
| 134 to 148 | 10.1 | 14.4 | 1.13 |
| 148 to 162 | 9.5 | 11.8 | 0.83 |

The benchmark (ME about 10.7, CP about 18%, about 1.4 kg a day) is met in the fortnight straight after lock-up and nowhere else. The benchmark does not say which stage it is for. The only clue is the v13 note below, which has the oats check beside "oats grazed after lock-up". The test holds that fortnight. Before lock-up, when the game says to graze oats, the model gives ME 11.4 and CP 21%, which is outside "about 10.7" and "about 18%". On the CHECK list.

**500 head on 4 ha, moved to a fresh 4 ha every day for 20 days, average year.** 1,040 ha farm, 1 ha squares, tape cells with a trough each.

| District and month | Intake, % of live weight | Feed on the cell before | Left behind | Gain, kg a day |
|---|---|---|---|---|
| Central Qld, February | 2.2 to 2.3 | 1,840 to 2,530 kg DM/ha | 1,130 to 1,810 | 0.43 to 0.57 |
| Northern Tablelands, December | 2.4 to 2.5 | 1,490 to 2,060 | 720 to 1,250 | 0.69 to 0.80 |
| Central West NSW, October | 2.1 to 2.3 | 1,170 to 1,670 | 520 to 940 | 0.45 to 0.59 |
| Western Victoria, October | 2.5 to 2.6 | 1,720 to 2,370 | 910 to 1,530 | 0.74 to 0.90 |

- The mob got all the feed it wanted every day, stayed one mob, and never pushed through the tape.
- What came off a cell was what the mob ate plus 13 to 15% trampled or lost.
- Left on the same 4 ha instead, the mob has its fill on day 1, is short by day 3 and is losing weight by day 5.
- The figures in the table are from sampled days in the run. The tests hold every day to wider limits: intake 2 to 3%, at least a third of the feed and 400 kg DM/ha left, gain 0.3 to 1.1 kg a day.

**Speed:** 1.96 ms a simulated day with 4,895 head and 411 calves in three mobs, on its own on the build PC (`pnpm test:speed`). Target under 5 ms. Passes. The figure is the best of twelve 30-day runs after a 30-day warm-up, on a large Central Qld farm. The MVP's script took the average of 60 days on a large Top End farm. With other work running on the PC the same test has read 4.0 ms. The 5 ms limit is held by `pnpm test:speed` on the build PC. CI runs it with a 15 ms limit, so CI alone does not hold the benchmark.

**CHECK, for Claudia** (the first four decide whether milestone 1.3 passes):

1. **What a steer band is held on.** The build plan says an average or better year outside the target fails. In the average year these single blocks are over their band: Central Qld with lick 6 of 12 (up to 136 against 130), Northern Tablelands 4 of 12 (up to 118 against 105), Central West 3 of 12 (up to 139 against 130), Western Victoria 4 of 12 (up to 195 against 185). None is under. The tests hold the average of the twelve blocks instead. Is that how the bands are meant, or should the model be tuned until every block in an average year is inside? The second would mean lower figures everywhere and less difference between blocks.
2. **Central Qld with lick fails its band in the average year:** 131 against 75 to 130. The four random years with no poor season average 135 (137, 130, 139, 133). It is inside only over all twelve random years (126). Nothing was tuned. The test records the gap and fails if it passes 2 kg or goes away.
3. **Steers on oats** meet the benchmark only in the fortnight after lock-up. Young oats, which is when the game says to graze it, is ME 11.4 and CP 21% with 1.2 to 1.6 kg a day. Is the benchmark meant for young oats? If so the oats figures in `data/species.ts` are too high and want tuning.
4. **Herd deaths are counted over all herds together** (2.4 to 2.6%). Single herds run 0.9 to 4.1% in the average year, against 1.5 to 3.6%. A medium farm outside Central Qld has 200 to 500 head, so one herd moves a point on three or four deaths. Any single herd under 6% passes the test.
5. **Central West peak green digestibility of 0.68** is a tuning value with no outside source. To confirm. If the bands are meant for the long run of seasons and not the average year, Central West wants about 0.69 instead.
6. **Central West steers still gain in July and August** (0.16 to 0.17 kg a day) after the tune.
7. **Three districts sit at the top of their bands in the average year** (Tablelands 103, Central West 128, Western Victoria 182) and in the middle or below with random seasons (93, 109, 162).
8. **The twelve seeds are a sample, not a long run.** Their 24 season draws hold 4 droughts (17%, where the chance is 10%) and no "well below average" season. Every case uses the same twelve pairs of seasons. More seeds would steady the random-season figures and slow the tests.
9. **Barley is 2.88 t/ha in the average year** against "about 2.5". Nothing was changed. The test allows 2.0 to 3.0.
10. **The limits in the 500 head on 4 ha tests are mine**, set round what the model gives, because the PRD gives no figures. Central West in October: intake 2.1 to 2.3% of live weight and 0.45 to 0.59 kg a day. To look over.
11. Still open from 1.2a: heavier dry stock eat under the intake ranges, and a 9-week joining at CS 3 exactly gives 84.0%.

**Not in this milestone:** several moves a day at whole-farm level and a mob walked a long way (both need grazing plans and walking times, milestone 1.5; several moves a day is tested against the MVP at mob level in `cattle/simMob.test.ts`). Real dry and wet years (1.4). The 180-day run from BUILD_PLAN section 3.
### 13 Nov 2026, rebuild milestone 1.4b (growth from real weather)

Engine 0.3.0 (not bumped on this branch, see DEVELOPMENT_LOG). The grass formulas are unchanged. This run checks the new source of the season factor and the month factor (MODEL.md 1A) against the average year, against SILO's own rain, and against AussieGRASS.

**What was run.** The real `growGrass`, for each whole real year from 1997 to 2025 in each district, starting every time from the same pasture: 700 kg DM/ha green and 1,400 dead, grown for 540 days of the average year with no stock, to 1 January. Soil fertility 1 on every square, no sown country. Then the same pasture for 365 days of the average year (`averageYear`: both factors 1). Two versions of each:

- **No stock.** Nothing eats the pasture. It shades itself, so growth is well under the curve's total, and the gap between dry and wet years is partly hidden.
- **Steady take.** A fixed amount comes off the green feed every day: the district's safe share of a year's growth, spread evenly (safe use × yearly curve ÷ 365). It is a stand-in for stock, not the cattle model. It shows how pasture that is being used answers the weather.

The season look back before 1 January uses the real weather of the year before, as it was (run-up floor off).

**How to run it again.** `GG_WEATHER_RUN=1 pnpm exec vitest run packages/engine/src/season/weatherRun.test.ts --disable-console-intercept` prints the tables below. Without the setting it runs as a test and holds these lines: the 29-year average within 4% of the average year with no stock and 6% with the steady take; growth rising with rain (rank correlation over 0.6); the five driest years under the five wettest; the driest year under 75% of the average year.

**Settings.** Soil 100 mm, easy share 0.6, ceiling 1.9, scaling years 1997 to 2025, season look back 365 days (DATA.md, "Growth from real weather").

#### Summary

Feed grown, kg DM/ha a year.

| District | Curve total | Average year, no stock | 29-year average, no stock | Against the average year | Average year, steady take | 29-year average, steady take | Against the average year | Average year factor | Year factor range | Rain against growth, rank correlation (no stock / steady take) | Days with season factor under 0.8 | Days at the 1.9 ceiling |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Central Queensland (Emerald) | 6,232 | 2,567 | 2,588 | +0.8% | 2,693 | 2,795 | +3.8% | 0.999 | 0.46 to 1.62 | 0.74 / 0.80 | 19.6% | 31.7% |
| Northern Tablelands (Armidale) | 6,101 | 2,579 | 2,552 | -1.0% | 2,813 | 2,874 | +2.2% | 1.001 | 0.37 to 1.46 | 0.81 / 0.76 | 14.6% | 0.4% |
| Central West NSW (Dubbo) | 5,496 | 2,867 | 2,803 | -2.2% | 3,127 | 3,013 | -3.6% | 1.000 | 0.36 to 1.58 | 0.92 / 0.89 | 24.0% | 19.8% |
| Western Victoria (Hamilton) | 7,326 | 2,719 | 2,776 | +2.1% | 3,385 | 3,339 | -1.4% | 1.000 | 0.71 to 1.25 | 0.64 / 0.75 | 9.2% | 9.2% |

- **The factor does its job.** In every district the month factor averages 1 for each calendar month over 1997 to 2025, to better than one part in a billion (a test holds this). Weighted by the curve, the 29 years give back the curve's yearly total to within 0.1%.
- **The feed grown is close to the average year but not equal to it:** within 2.2% with no stock and within 3.8% with the steady take. The grass does not answer the factor in a straight line. A full pasture shades itself, short pasture has little leaf, and a season factor under 0.8 hays green feed off faster. So 29 uneven years do not grow exactly what 29 average years do. Nothing was tuned to close the gap.
- **For comparison,** the MVP's random seasons have a season factor under 0.8 in 24% of years.
- **CHECK: days at the ceiling.** Central Queensland sits at 1.9 on about a third of days and Central West on a fifth. Rain there comes in bursts onto soil that is usually dry, so for a month to average 1 under a 1.9 ceiling a good share of its days must be at the ceiling. A higher ceiling would cut this, but sown pastures and crops share the factor and were tuned with it no higher than 1.9. For Claudia.

#### Each year

"Year factor" is the year's month factors averaged with the curve as the weight: the feed the weather allowed as a share of the curve. The label is the season label on 31 December.

#### Central Queensland (Emerald)

Steady take: 4.3 kg DM/ha a day.

| Year | Rain mm | Year factor | Grown, no stock | Grown, steady take | Season label on 31 Dec |
|---|---|---|---|---|---|
| 1997 | 448 | 1.00 | 2614 | 2844 | Average |
| 1998 | 956 | 0.92 | 2593 | 3153 | Below average |
| 1999 | 367 | 0.97 | 2423 | 2529 | Average |
| 2000 | 689 | 1.15 | 2804 | 3088 | Above average |
| 2001 | 293 | 0.76 | 2029 | 2178 | Well below average |
| 2002 | 298 | 0.48 | 1375 | 1459 | Drought |
| 2003 | 374 | 0.81 | 2224 | 2507 | Below average |
| 2004 | 470 | 0.92 | 2600 | 2752 | Below average |
| 2005 | 520 | 0.85 | 2246 | 2366 | Below average |
| 2006 | 492 | 0.79 | 2206 | 2565 | Well below average |
| 2007 | 667 | 1.19 | 3072 | 3423 | Above average |
| 2008 | 868 | 1.43 | 3385 | 3535 | Wet |
| 2009 | 451 | 1.24 | 2965 | 3069 | Above average |
| 2010 | 1104 | 1.62 | 3833 | 3969 | Wet |
| 2011 | 645 | 1.33 | 3224 | 3470 | Wet |
| 2012 | 660 | 1.22 | 2920 | 3030 | Above average |
| 2013 | 459 | 0.95 | 2373 | 2607 | Average |
| 2014 | 541 | 0.93 | 2612 | 2945 | Average |
| 2015 | 336 | 0.78 | 2193 | 2292 | Well below average |
| 2016 | 698 | 0.93 | 2386 | 2503 | Average |
| 2017 | 594 | 1.05 | 2604 | 2755 | Average |
| 2018 | 432 | 0.79 | 2016 | 2165 | Well below average |
| 2019 | 257 | 0.46 | 1497 | 1570 | Drought |
| 2020 | 530 | 1.08 | 2690 | 2753 | Above average |
| 2021 | 556 | 1.01 | 2720 | 3168 | Average |
| 2022 | 814 | 0.92 | 2876 | 3303 | Below average |
| 2023 | 655 | 1.26 | 3150 | 3401 | Wet |
| 2024 | 480 | 0.96 | 2547 | 2709 | Average |
| 2025 | 599 | 1.20 | 2870 | 2960 | Above average |
| **Average of 29 years** | 560 | 0.999 | 2588 | 2795 | |
| **The average year** | | 1.000 | 2567 | 2693 | Average |

Five driest years by SILO rain, driest first:

| Year | Rain mm | Year factor | Grown, no stock | Grown, steady take | Season label on 31 Dec |
|---|---|---|---|---|---|
| 2019 | 257 | 0.46 | 1497 | 1570 | Drought |
| 2001 | 293 | 0.76 | 2029 | 2178 | Well below average |
| 2002 | 298 | 0.48 | 1375 | 1459 | Drought |
| 2015 | 336 | 0.78 | 2193 | 2292 | Well below average |
| 1999 | 367 | 0.97 | 2423 | 2529 | Average |

Five wettest years by SILO rain, wettest first:

| Year | Rain mm | Year factor | Grown, no stock | Grown, steady take | Season label on 31 Dec |
|---|---|---|---|---|---|
| 2010 | 1104 | 1.62 | 3833 | 3969 | Wet |
| 1998 | 956 | 0.92 | 2593 | 3153 | Below average |
| 2008 | 868 | 1.43 | 3385 | 3535 | Wet |
| 2022 | 814 | 0.92 | 2876 | 3303 | Below average |
| 2016 | 698 | 0.93 | 2386 | 2503 | Average |

#### Northern Tablelands (Armidale)

Steady take: 5.9 kg DM/ha a day.

| Year | Rain mm | Year factor | Grown, no stock | Grown, steady take | Season label on 31 Dec |
|---|---|---|---|---|---|
| 1997 | 964 | 1.14 | 2940 | 3499 | Above average |
| 1998 | 1020 | 0.93 | 2286 | 2495 | Average |
| 1999 | 772 | 1.10 | 2908 | 3437 | Above average |
| 2000 | 776 | 1.14 | 2947 | 3441 | Above average |
| 2001 | 609 | 0.84 | 2210 | 2428 | Below average |
| 2002 | 578 | 0.74 | 1967 | 2030 | Well below average |
| 2003 | 715 | 0.96 | 2591 | 3173 | Average |
| 2004 | 852 | 1.01 | 2693 | 3035 | Average |
| 2005 | 801 | 1.00 | 2917 | 3302 | Average |
| 2006 | 617 | 0.81 | 2206 | 2381 | Below average |
| 2007 | 896 | 1.15 | 2971 | 3466 | Above average |
| 2008 | 733 | 1.08 | 2842 | 3211 | Above average |
| 2009 | 810 | 0.88 | 2257 | 2473 | Below average |
| 2010 | 884 | 1.27 | 3264 | 3905 | Wet |
| 2011 | 1069 | 1.46 | 3345 | 4048 | Wet |
| 2012 | 626 | 0.86 | 2112 | 2120 | Below average |
| 2013 | 667 | 0.87 | 2183 | 2316 | Below average |
| 2014 | 564 | 0.67 | 2047 | 2169 | Well below average |
| 2015 | 655 | 0.93 | 2271 | 2349 | Average |
| 2016 | 891 | 1.01 | 2677 | 3117 | Average |
| 2017 | 813 | 1.04 | 2471 | 2761 | Average |
| 2018 | 613 | 0.85 | 2362 | 2559 | Below average |
| 2019 | 287 | 0.37 | 982 | 971 | Drought |
| 2020 | 1054 | 1.27 | 3056 | 3429 | Wet |
| 2021 | 1129 | 1.44 | 3318 | 4057 | Wet |
| 2022 | 995 | 1.31 | 2977 | 3423 | Wet |
| 2023 | 672 | 0.84 | 2265 | 2501 | Below average |
| 2024 | 774 | 0.99 | 2379 | 2525 | Average |
| 2025 | 897 | 1.04 | 2557 | 2722 | Average |
| **Average of 29 years** | 784 | 1.001 | 2552 | 2874 | |
| **The average year** | | 1.000 | 2579 | 2813 | Average |

Five driest years by SILO rain, driest first:

| Year | Rain mm | Year factor | Grown, no stock | Grown, steady take | Season label on 31 Dec |
|---|---|---|---|---|---|
| 2019 | 287 | 0.37 | 982 | 971 | Drought |
| 2014 | 564 | 0.67 | 2047 | 2169 | Well below average |
| 2002 | 578 | 0.74 | 1967 | 2030 | Well below average |
| 2001 | 609 | 0.84 | 2210 | 2428 | Below average |
| 2018 | 613 | 0.85 | 2362 | 2559 | Below average |

Five wettest years by SILO rain, wettest first:

| Year | Rain mm | Year factor | Grown, no stock | Grown, steady take | Season label on 31 Dec |
|---|---|---|---|---|---|
| 2021 | 1129 | 1.44 | 3318 | 4057 | Wet |
| 2011 | 1069 | 1.46 | 3345 | 4048 | Wet |
| 2020 | 1054 | 1.27 | 3056 | 3429 | Wet |
| 1998 | 1020 | 0.93 | 2286 | 2495 | Average |
| 2022 | 995 | 1.31 | 2977 | 3423 | Wet |

#### Central West NSW (Dubbo)

Steady take: 4.5 kg DM/ha a day.

| Year | Rain mm | Year factor | Grown, no stock | Grown, steady take | Season label on 31 Dec |
|---|---|---|---|---|---|
| 1997 | 415 | 0.80 | 2467 | 2490 | Below average |
| 1998 | 856 | 1.26 | 3485 | 3911 | Wet |
| 1999 | 646 | 1.27 | 3374 | 4083 | Wet |
| 2000 | 807 | 1.30 | 3556 | 3927 | Wet |
| 2001 | 601 | 1.20 | 3188 | 3933 | Above average |
| 2002 | 379 | 0.55 | 1456 | 1425 | Drought |
| 2003 | 517 | 1.05 | 3083 | 3318 | Average |
| 2004 | 475 | 0.84 | 2637 | 2614 | Below average |
| 2005 | 548 | 1.02 | 3124 | 3264 | Average |
| 2006 | 241 | 0.37 | 955 | 840 | Drought |
| 2007 | 580 | 0.81 | 2554 | 2297 | Below average |
| 2008 | 608 | 1.08 | 3238 | 3470 | Average |
| 2009 | 544 | 0.72 | 2082 | 1937 | Well below average |
| 2010 | 888 | 1.58 | 4052 | 4707 | Wet |
| 2011 | 577 | 1.14 | 3289 | 3683 | Above average |
| 2012 | 593 | 0.92 | 2487 | 2466 | Below average |
| 2013 | 472 | 0.73 | 2184 | 1974 | Well below average |
| 2014 | 558 | 0.97 | 2662 | 2527 | Average |
| 2015 | 639 | 1.12 | 3020 | 3623 | Above average |
| 2016 | 901 | 1.27 | 3551 | 3954 | Wet |
| 2017 | 431 | 0.81 | 2495 | 2608 | Below average |
| 2018 | 320 | 0.68 | 2265 | 2267 | Well below average |
| 2019 | 212 | 0.36 | 904 | 832 | Drought |
| 2020 | 773 | 1.38 | 3682 | 4122 | Wet |
| 2021 | 880 | 1.38 | 3618 | 4278 | Wet |
| 2022 | 993 | 1.54 | 4009 | 4523 | Wet |
| 2023 | 411 | 0.71 | 2106 | 1892 | Well below average |
| 2024 | 766 | 1.21 | 3296 | 3547 | Above average |
| 2025 | 505 | 0.91 | 2457 | 2853 | Below average |
| **Average of 29 years** | 591 | 1.000 | 2803 | 3013 | |
| **The average year** | | 1.000 | 2867 | 3127 | Average |

Five driest years by SILO rain, driest first:

| Year | Rain mm | Year factor | Grown, no stock | Grown, steady take | Season label on 31 Dec |
|---|---|---|---|---|---|
| 2019 | 212 | 0.36 | 904 | 832 | Drought |
| 2006 | 241 | 0.37 | 955 | 840 | Drought |
| 2018 | 320 | 0.68 | 2265 | 2267 | Well below average |
| 2002 | 379 | 0.55 | 1456 | 1425 | Drought |
| 2023 | 411 | 0.71 | 2106 | 1892 | Well below average |

Five wettest years by SILO rain, wettest first:

| Year | Rain mm | Year factor | Grown, no stock | Grown, steady take | Season label on 31 Dec |
|---|---|---|---|---|---|
| 2022 | 993 | 1.54 | 4009 | 4523 | Wet |
| 2016 | 901 | 1.27 | 3551 | 3954 | Wet |
| 2010 | 888 | 1.58 | 4052 | 4707 | Wet |
| 2021 | 880 | 1.38 | 3618 | 4278 | Wet |
| 1998 | 856 | 1.26 | 3485 | 3911 | Wet |

#### Western Victoria (Hamilton)

Steady take: 8.0 kg DM/ha a day.

| Year | Rain mm | Year factor | Grown, no stock | Grown, steady take | Season label on 31 Dec |
|---|---|---|---|---|---|
| 1997 | 475 | 1.01 | 2869 | 3497 | Average |
| 1998 | 549 | 0.98 | 2767 | 3379 | Average |
| 1999 | 559 | 1.04 | 2757 | 3497 | Average |
| 2000 | 577 | 1.05 | 2794 | 3522 | Average |
| 2001 | 732 | 1.25 | 3277 | 4158 | Above average |
| 2002 | 528 | 0.97 | 2753 | 3289 | Average |
| 2003 | 701 | 1.14 | 2983 | 3746 | Above average |
| 2004 | 657 | 1.03 | 2732 | 3393 | Average |
| 2005 | 426 | 0.82 | 2658 | 2914 | Below average |
| 2006 | 397 | 0.71 | 1783 | 1744 | Well below average |
| 2007 | 675 | 1.00 | 2834 | 3401 | Average |
| 2008 | 528 | 0.86 | 2466 | 2944 | Below average |
| 2009 | 557 | 0.94 | 2721 | 3232 | Average |
| 2010 | 728 | 1.20 | 3151 | 3982 | Above average |
| 2011 | 704 | 1.11 | 2920 | 3449 | Above average |
| 2012 | 594 | 0.97 | 2625 | 3237 | Average |
| 2013 | 556 | 1.00 | 3140 | 3608 | Average |
| 2014 | 486 | 0.79 | 2070 | 2347 | Well below average |
| 2015 | 463 | 0.77 | 2014 | 2208 | Well below average |
| 2016 | 818 | 1.11 | 2905 | 3689 | Above average |
| 2017 | 670 | 1.12 | 2956 | 3663 | Above average |
| 2018 | 552 | 0.90 | 2600 | 3150 | Below average |
| 2019 | 510 | 0.91 | 2758 | 3155 | Below average |
| 2020 | 686 | 1.13 | 2986 | 3794 | Above average |
| 2021 | 555 | 1.03 | 2802 | 3438 | Average |
| 2022 | 751 | 1.15 | 3276 | 3996 | Above average |
| 2023 | 635 | 1.04 | 2763 | 3328 | Average |
| 2024 | 479 | 0.90 | 2884 | 3261 | Below average |
| 2025 | 547 | 1.08 | 3251 | 3817 | Above average |
| **Average of 29 years** | 589 | 1.000 | 2776 | 3339 | |
| **The average year** | | 1.000 | 2719 | 3385 | Average |

Five driest years by SILO rain, driest first:

| Year | Rain mm | Year factor | Grown, no stock | Grown, steady take | Season label on 31 Dec |
|---|---|---|---|---|---|
| 2006 | 397 | 0.71 | 1783 | 1744 | Well below average |
| 2005 | 426 | 0.82 | 2658 | 2914 | Below average |
| 2015 | 463 | 0.77 | 2014 | 2208 | Well below average |
| 1997 | 475 | 1.01 | 2869 | 3497 | Average |
| 2024 | 479 | 0.90 | 2884 | 3261 | Below average |

Five wettest years by SILO rain, wettest first:

| Year | Rain mm | Year factor | Grown, no stock | Grown, steady take | Season label on 31 Dec |
|---|---|---|---|---|---|
| 2016 | 818 | 1.11 | 2905 | 3689 | Above average |
| 2022 | 751 | 1.15 | 3276 | 3996 | Above average |
| 2001 | 732 | 1.25 | 3277 | 4158 | Above average |
| 2010 | 728 | 1.20 | 3151 | 3982 | Above average |
| 2011 | 704 | 1.11 | 2920 | 3449 | Above average |


#### Dry and wet years: what to check

- Growth follows the rain in every district (rank correlations in the summary). With no stock, the driest year is the lowest or second lowest growth in every district, and the wettest year is the highest, or within 2% of it, in three districts. Western Victoria is the exception.
- **CHECK, Central Queensland 1998 and 2022.** The second and fourth wettest years, with only average growth. In both, January to March were dry (1998: 7, 67 and 11 mm) and the rain came from April on, when the district curve is low. The factor sat at or near 1.9 for months, but 1.9 times a curve of 1 to 6 kg DM/ha a day is little feed. A wet winter and spring in Central Queensland may grow more than this in real life. It is the limit of keeping the curve as the average year under a 1.9 ceiling.
- **CHECK, Central Queensland 1999.** The fifth driest year (367 mm) with average growth. January had 115 mm on soil left wet by late 1998, and January is near the top of the curve.
- **CHECK, Western Victoria 2016.** The wettest year (818 mm) and a year factor of only 1.11. Most of the rain fell from May to October (100, 66, 132, 74, 149 and 91 mm), when the soil is full in most years anyway. The extra could not be held.
- **Northern Tablelands 1998.** 1,020 mm and a year factor of 0.93. March had no rain and December 25 mm. December is the top of the curve.
- **Western Victoria 1997.** 475 mm, the fourth driest, and a year factor of 1.01. The rain fell from May to November, when the district grows.
- A calendar year cuts the northern growing season in two. A year that looks odd here can be the tail of the summer before.

#### Against AussieGRASS

AussieGRASS shire series (DATA.md), pasture growth added up by calendar year, read on 13 Nov 2026. A rank correlation of 1 means the two put the 29 years in the same order.

| District | AussieGRASS shire | AussieGRASS growth, 29-year average, kg/ha | Rank correlation with AussieGRASS: year factor / grown, steady take / grown, no stock | Spread of the years (standard deviation ÷ average): AussieGRASS / year factor / grown, steady take |
|---|---|---|---|---|
| Central Queensland | Central Highlands Regional, Qld | 2,415 | 0.60 / 0.68 / 0.64 | 0.35 / 0.25 / 0.20 |
| Northern Tablelands | Armidale Regional Council, NSW | 2,638 | 0.61 / 0.59 / 0.65 | 0.28 / 0.23 / 0.24 |
| Central West NSW | Dubbo Regional Council, NSW | 4,198 | 0.97 / 0.94 / 0.96 | 0.42 / 0.31 / 0.35 |
| Western Victoria | Southern Grampians Shire, Vic | 7,593 | 0.56 / 0.63 / 0.62 | 0.20 / 0.13 / 0.16 |

Each year. "AG" is AussieGRASS growth in kg/ha and, in brackets, as a share of its own 29-year average. "Model" is the year factor.

| Year | Central Queensland AG | Model | Northern Tablelands AG | Model | Central West NSW AG | Model | Western Victoria AG | Model |
|---|---|---|---|---|---|---|---|---|
| 1997 | 2,664 (1.10) | 1.00 | 2,663 (1.01) | 1.14 | 2,952 (0.70) | 0.80 | 6,298 (0.83) | 1.01 |
| 1998 | 3,891 (1.61) | 0.92 | 2,586 (0.98) | 0.93 | 5,951 (1.42) | 1.26 | 8,698 (1.15) | 0.98 |
| 1999 | 2,445 (1.01) | 0.97 | 2,732 (1.04) | 1.10 | 5,632 (1.34) | 1.27 | 6,704 (0.88) | 1.04 |
| 2000 | 3,524 (1.46) | 1.15 | 2,424 (0.92) | 1.14 | 5,962 (1.42) | 1.30 | 9,511 (1.25) | 1.05 |
| 2001 | 1,940 (0.80) | 0.76 | 2,249 (0.85) | 0.84 | 4,871 (1.16) | 1.20 | 8,685 (1.14) | 1.25 |
| 2002 | 1,312 (0.54) | 0.48 | 1,669 (0.63) | 0.74 | 1,745 (0.42) | 0.55 | 5,469 (0.72) | 0.97 |
| 2003 | 1,169 (0.48) | 0.81 | 3,703 (1.40) | 0.96 | 4,870 (1.16) | 1.05 | 9,463 (1.25) | 1.14 |
| 2004 | 1,261 (0.52) | 0.92 | 3,058 (1.16) | 1.01 | 3,654 (0.87) | 0.84 | 7,671 (1.01) | 1.03 |
| 2005 | 2,369 (0.98) | 0.85 | 2,764 (1.05) | 1.00 | 5,013 (1.19) | 1.02 | 7,680 (1.01) | 0.82 |
| 2006 | 1,273 (0.53) | 0.79 | 2,241 (0.85) | 0.81 | 1,006 (0.24) | 0.37 | 4,596 (0.61) | 0.71 |
| 2007 | 2,933 (1.21) | 1.19 | 3,116 (1.18) | 1.15 | 3,546 (0.84) | 0.81 | 9,268 (1.22) | 1.00 |
| 2008 | 3,326 (1.38) | 1.43 | 2,538 (0.96) | 1.08 | 5,082 (1.21) | 1.08 | 5,988 (0.79) | 0.86 |
| 2009 | 2,165 (0.90) | 1.24 | 2,051 (0.78) | 0.88 | 2,598 (0.62) | 0.72 | 9,289 (1.22) | 0.94 |
| 2010 | 4,325 (1.79) | 1.62 | 3,510 (1.33) | 1.27 | 7,168 (1.71) | 1.58 | 8,494 (1.12) | 1.20 |
| 2011 | 2,999 (1.24) | 1.33 | 2,640 (1.00) | 1.46 | 4,787 (1.14) | 1.14 | 6,568 (0.87) | 1.11 |
| 2012 | 3,310 (1.37) | 1.22 | 1,854 (0.70) | 0.86 | 3,808 (0.91) | 0.92 | 7,392 (0.97) | 0.97 |
| 2013 | 2,233 (0.92) | 0.95 | 2,583 (0.98) | 0.87 | 3,254 (0.78) | 0.73 | 8,632 (1.14) | 1.00 |
| 2014 | 1,649 (0.68) | 0.93 | 2,694 (1.02) | 0.67 | 4,548 (1.08) | 0.97 | 4,604 (0.61) | 0.79 |
| 2015 | 1,966 (0.81) | 0.78 | 3,053 (1.16) | 0.93 | 4,887 (1.16) | 1.12 | 6,398 (0.84) | 0.77 |
| 2016 | 2,904 (1.20) | 0.93 | 2,774 (1.05) | 1.01 | 6,112 (1.46) | 1.27 | 9,950 (1.31) | 1.11 |
| 2017 | 2,362 (0.98) | 1.05 | 2,643 (1.00) | 1.04 | 2,197 (0.52) | 0.81 | 7,095 (0.93) | 1.12 |
| 2018 | 1,702 (0.70) | 0.79 | 2,339 (0.89) | 0.85 | 1,398 (0.33) | 0.68 | 5,883 (0.77) | 0.90 |
| 2019 | 1,275 (0.53) | 0.46 | 442 (0.17) | 0.37 | 609 (0.15) | 0.36 | 7,492 (0.99) | 0.91 |
| 2020 | 1,248 (0.52) | 1.08 | 4,662 (1.77) | 1.27 | 6,561 (1.56) | 1.38 | 8,796 (1.16) | 1.13 |
| 2021 | 2,316 (0.96) | 1.01 | 3,169 (1.20) | 1.44 | 6,062 (1.44) | 1.38 | 7,544 (0.99) | 1.03 |
| 2022 | 3,476 (1.44) | 0.92 | 2,724 (1.03) | 1.31 | 6,329 (1.51) | 1.54 | 9,714 (1.28) | 1.15 |
| 2023 | 2,474 (1.02) | 1.26 | 1,740 (0.66) | 0.84 | 2,299 (0.55) | 0.71 | 5,946 (0.78) | 1.04 |
| 2024 | 2,595 (1.07) | 0.96 | 3,319 (1.26) | 0.99 | 4,973 (1.18) | 1.21 | 7,996 (1.05) | 0.90 |
| 2025 | 2,940 (1.22) | 1.20 | 2,555 (0.97) | 1.04 | 3,872 (0.92) | 0.91 | 8,360 (1.10) | 1.08 |

- **Central West follows AussieGRASS closely.** The same years are low and high, in nearly the same order.
- **The model's swings are smaller than AussieGRASS's** in every district. The 1.9 ceiling holds the wet years down, and AussieGRASS falls further in the driest years (2019 at Armidale and Dubbo).
- **CHECK, Central Queensland 2003, 2004 and 2020.** AussieGRASS has them at about half of its average. The model has them at 0.81, 0.92 and 1.08. Each came straight after one or two very dry years. AussieGRASS tracks standing feed and cover from month to month (they are columns in its file), so a dry year can carry into the next. The weather factor has no such memory, and these runs all start from the same pasture. In a game the pasture a player carries out of a dry year does that job.
- **Northern Tablelands and Western Victoria follow less closely.** Both are cool districts where temperature sets a large part of the growth, and the factor only knows soil water. AussieGRASS's own growth at Armidale follows its rain weakly (rank correlation 0.35).
- **Not like for like.** A shire is not a point: the Central Highlands shire rain averages 607 mm against 560 mm at the Emerald point. AussieGRASS is a different model, with stocking in it, averaged over a whole shire.
- **Not an independent check of the soil capacity.** The capacity was picked with this same series (below). It is a fair check of the method.
- **Seen on the way, not acted on.** AussieGRASS spreads the year's growth differently from the district curves in places. Armidale Regional has 72% of its growth from September to December, where the Northern Tablelands curve has 47%, and 17% from January to March, where the curve has 40%. Central Highlands has 56% from December to March, where the Central Queensland curve has 75%. The curves are the MVP's calibrated figures and were not touched. For Claudia.

#### Picking the soil capacity

The year factor against the AussieGRASS series, by soil capacity (easy share 0.6, ceiling 1.9). Each cell: rank correlation with AussieGRASS (share of days at the ceiling, lowest scaling figure, year factor range).

| Capacity mm | Central Queensland | Northern Tablelands | Central West | Western Victoria |
|---|---|---|---|---|
| 50 | stops: September's scaling figure falls under 0.01 | 0.56 (3%, 0.390, 0.43 to 1.38) | 0.96 (27%, 0.067, 0.41 to 1.51) | 0.65 (14%, 0.039, 0.72 to 1.35) |
| 75 | 0.63 (35%, 0.021, 0.48 to 1.60) | 0.62 (1%, 0.465, 0.39 to 1.43) | 0.97 (23%, 0.112, 0.38 to 1.54) | 0.61 (11%, 0.069, 0.72 to 1.29) |
| **100 (used)** | 0.60 (32%, 0.036, 0.46 to 1.62) | 0.61 (0.4%, 0.504, 0.37 to 1.46) | 0.97 (20%, 0.145, 0.36 to 1.58) | 0.56 (9%, 0.092, 0.71 to 1.25) |
| 150 | 0.61 (27%, 0.052, 0.43 to 1.66) | 0.57 (0%, 0.548, 0.36 to 1.47) | 0.97 (16%, 0.186, 0.34 to 1.59) | 0.43 (7%, 0.128, 0.70 to 1.19) |
| 200 | 0.65 (24%, 0.060, 0.41 to 1.66) | 0.54 (0%, 0.565, 0.35 to 1.48) | 0.96 (14%, 0.216, 0.34 to 1.63) | 0.40 (6%, 0.171, 0.70 to 1.19) |
| 250 | 0.68 (21%, 0.071, 0.39 to 1.66) | 0.51 (0%, 0.580, 0.35 to 1.46) | 0.95 (12%, 0.234, 0.34 to 1.67) | 0.29 (5%, 0.185, 0.69 to 1.22) |

150 mm, the middle of FAO-56's ranges, was the first choice. At 150 mm Western Victoria's soil hardly dries from July to October, so every year grew the curve, give or take a few per cent, in the months that matter most there. 100 mm lets October vary, follows AussieGRASS better there, and costs a little in Central Queensland (more days at the ceiling). 75 mm does a little better again in Western Victoria, but Central Queensland's lowest scaling figure falls to 0.021, and at 50 mm it falls under the 0.01 limit and the build stops. Through the whole grass model with the steady take, 100 mm against 150 mm gives rank correlations with AussieGRASS of 0.68 against 0.67 (Central Queensland), 0.59 against 0.60 (Northern Tablelands), 0.94 against 0.95 (Central West) and 0.63 against 0.57 (Western Victoria). One soil for four districts is a compromise. A soil for each district is the obvious next step, if Claudia wants it.

#### Bounded and well behaved

Held by tests on the real tables, all four districts:

- Every factor from 1990 to November 2026 is a number from 0 to 1.9. The season factor stays above 0 and under 1.9.
- With no rain, the month factor never rises by more than 0.05 in a day (the most seen is 0.041), and rises at all on fewer than one dry day in five. It can creep up when the soil holds water going into a time of year that is usually dry.
- The season factor moves less than 0.03 in a day (six years from 2004 checked in each district).
- The same table gives the same figures every time it is built, and a day gives the same answer in whatever order days are asked for.
- A table with a day missing, a blank or negative figure, a date out of order, Windows line ends, or a table that stops before 31 December 2025 or starts too late for the soil water to settle, stops with an error. So does asking for a day the table does not hold.

#### Nudge checks

Each line was broken on purpose, the season tests run, and the line put back.

38 lines were broken, one at a time. 36 were caught at once. One was caught after a test was added for it. One changes nothing.

- **Caught, the factor:** no scaling (the raw index is used); no ceiling; ceiling 2.0; soil 110 mm; easy share 0.55; water over capacity kept; dry soil gives up the full evapotranspiration; the index read before the day's rain; scaling years ending 2024; pan evaporation read in place of `et0`.
- **Caught, bad data:** a short table not refused; a day before the tally settles served; a day outside the table served; a gap in the dates not noticed; negative figures read; a blank figure read as 0.
- **Caught, real years:** the shuffle drawing from `Math.random`; the same year twice running; no going back to 1997 in order; game years not moved onto their real years; 29 February not handled; lead days not needed (two places); a year not needing its whole 12 months; the chosen first year ignored at random; run-up years not the real years before the start.
- **Caught, the season factor and run-up:** a 180-day look back; a look back one day too long; the label edge at 0.775; a label edge at "above" in place of "at or above"; a plain average in place of one weighted by the curve (season factor, and run-up share); the run-up floor ignored; the floor lifting play; the floor lifting a run-up that was already over it; rain read from the farm calendar date in place of the real date.
- **Caught after a test was added:** no floor on the scaling figures. No test could fail on that alone. A test now builds Emerald on a 50 mm soil, where September's figure falls under the floor, and checks the build stops.
- **Changes nothing:** a different step size in the scaling solver. It reaches the same figures by another route, so no test should fail.
- **Lint:** an import of `node:fs`, an import of the server-only file reader and a `Math.random`, each put into the model code, each fail lint.

### 14 Nov 2026, rebuild milestone 1.4 (real years wired in): engine 0.6.0

**Two faults found by the realism check and fixed before this was pushed.** A real year was being scored on the next day's prices, which with years at random, or in order after 2025, are another year's: one Central West farm went into 31 December 2025 worth $809,926 and closed the year at $337,374 on 1 January 1997 prices. A year now closes on its own last prices. And national price rows resting on under 20 head were being used (147 c/kg on 1 head at Christmas 2004). They are now passed over. Neither changes the steer and herd tables below: those runs buy once and sell nothing, and gain and deaths do not read prices.

**No model figure changed.** Engine 0.6.0 adds the real-year farm: real weather, real prices and real sale days behind `createFarm`, `stepDay` and `applyAction` (MODEL.md, section 1A and section 8). A farm with random seasons runs exactly as it did on 0.5.0, and every 1.3 benchmark test passes with no figure changed: steers, herds, grain, steers on oats, 500 head on 4 ha.

This entry is the build plan's check for 1.4: "Averaged over 1997 to now, growth matches each district curve, so 1.3 still passes. Known dry and wet years look right to Claudia." The first half is held by tests, as far as it is true (below). **The second half is Claudia's to judge**, from the tables here and the ones in the 1.4b entry.

**What was run.** The steers suite and the herds suite of 1.3, on real-year farms made by `createFarm` with `years: { kind: 'real', order: 'in-order' }`. So the pasture run-up, each day's growth, the prices and the date all come through the engine's own wiring, not a source passed by hand. Each run starts in a given real year and goes for 365 days.

- **Steers:** weaner steers at about 60% of carrying capacity on a 260 ha block with one water, set-stocked from a scratch start, nothing sold and nothing fed but the lick where the case has it. Each case starts in its usual month (Central Qld September, Northern Tablelands October, Central West and Western Victoria April) in every year from 1997 to 2025, on seeds 1, 2 and 3. That is 435 runs.
- **Herds:** a running farm of the district's medium size on medium difficulty, left alone from 1 September of every year from 1997 to 2025, on seeds 1 and 2. That is 232 runs.
- **"The average year"** is the same blocks or herds as 1.3 runs them: every day at the district curve.
- **"Season of the run"** is the season factor on the last day: the feed the weather allowed over the run's own 12 months, as a share of the district curve. **"Season before the run"** is the same figure on day 0, for the 12 months before.

**How to run it again.** `pnpm test` runs both as tests (`packages/engine/src/calibration/realYearSteers.*.test.ts` and `realYearHerds.*.test.ts`, one file a case so they run side by side). To print the tables below:

```bash
GG_REAL_YEARS_RUN=1 pnpm exec vitest run packages/engine/src/calibration/realYearSteers --disable-console-intercept --no-file-parallelism
GG_REAL_YEARS_RUN=1 pnpm exec vitest run packages/engine/src/calibration/realYearHerds --disable-console-intercept --no-file-parallelism
```

#### Steers: summary

Kg a head over the year, seeds 1 to 3 together.

| Case | Target | The average year | 29 real years, average | The middle year of the 29 | Lowest and highest year | Years under the band | Years over the band | Deaths, 29 years |
|---|---|---|---|---|---|---|---|---|
| Central Qld, no lick | 20 to 60 | 44 | 34 | 39 | -20 (2019) to 53 (2012) | 3 | 0 | 3.4% |
| Central Qld, with lick | 75 to 130 | 131 | 124 | 126 | 93 (2019) to 137 (2010, 2012) | 0 | 11 | 1.6% |
| Northern Tablelands | 90 to 105 | 104 | 98 | 101 | 45 (2025) to 124 (2020) | 7 | 10 | 2.5% |
| Central West NSW | 115 to 130 | 130 | 102 | 126 | -48 (2019) to 149 (2020) | 11 | 11 | 5.8% |
| Western Victoria | 155 to 185 | 183 | 180 | 182 | 160 (2006) to 195 (2010) | 0 | 10 | 2.3% |

**What the tests hold** (each is true of these runs, and each test fails if it stops being true):

1. Over the 29 real years the average gain is no higher than the top of the band, in every case.
2. It is no higher than the same blocks gain in the average year, and not far under it. "Not far" is a guard set 3 kg past what the runs gave (10, 7, 6, 28 and 3 kg under). It is there so a change shows up. It is not a benchmark.
3. The middle year of the 29 is inside the band, in every case.
4. A named dry year gains less than a named wet year, on every block: Central Qld 2002 against 2010, Northern Tablelands 2018 against 2020, Central West 2019 against 2016, Western Victoria 2006 against 2016. The test also checks the weather calls the first one dry (season of the run under 0.8) and the second wet (over 1.075).
5. In every year whose own 12 months grew average feed or better (season of the run 0.925 or more), the three blocks together lose 1.5 to 3.6% of the steers.
6. The same run gives the same figures again.

**What the tests do not hold.** A single real year is not held to its band. The build plan says "an average or better year outside the target fails". On real years that is not met, in the same way it is not met on single blocks in 1.3 (the first CHECK there, still open): the years over the band are listed under each table. Nothing was tuned.

**Against the lead's rough read** (seed 1, a weather source passed by hand): Central Qld no lick 47 and with lick 129, Northern Tablelands 109, Central West 110 with a middle year of 129, Western Victoria 191. Through the wiring, seed 1 gives 46, 127, 109, 108 and 191. Central West seed 1 in 2002, 2006, 2018 and 2019 gives -21, -50, 1 and -57 kg, where the rough read had -17, -40, 34 and -61, and loses 63% of its steers in 2019 where the rough read had 65%. The small differences were not chased down. The likeliest cause is the run-up: the wired farm runs its pasture up on the real weather before the start, with the 0.85 floor.

#### Steers: Central Qld, no lick

| Start | Gain, kg a head (seeds 1, 2, 3) | Average | Deaths % | Season before the run | Season of the run |
|---|---|---|---|---|---|
| 1997 | 41, 23, 16 | 27 | 1.6 | Above average (1.13) | Below average (0.81) |
| 1998 | 56, 41, 36 | 44 | 1.6 | Below average (0.81) | Above average (1.18) |
| 1999 | 69, 46, 42 | 52 | 1.6 | Above average (1.18) | Average (1.06) |
| 2000 | 41, 22, 14 | 26 | 1.6 | Average (1.06) | Below average (0.83) |
| 2001 | 25, 9, 7 | 14 | 1.6 | Below average (0.83) | Well below average (0.61) |
| 2002 | 0, -10, -3 | -4 | 17.1 | Below average (0.83) | Well below average (0.67) |
| 2003 | 29, 18, 17 | 21 | 1.6 | Below average (0.87) | Below average (0.82) |
| 2004 | 47, 32, 32 | 37 | 1.6 | Below average (0.85) | Average (0.94) |
| 2005 | 54, 33, 29 | 38 | 1.6 | Average (0.95) | Well below average (0.76) |
| 2006 | 44, 31, 30 | 35 | 1.6 | Below average (0.86) | Average (1.01) |
| 2007 | 62, 48, 40 | 50 | 1.6 | Average (1.01) | Wet (1.50) |
| 2008 | 57, 41, 30 | 43 | 1.6 | Wet (1.50) | Wet (1.44) |
| 2009 | 53, 37, 30 | 40 | 1.6 | Wet (1.44) | Wet (1.31) |
| 2010 | 59, 42, 31 | 44 | 1.6 | Wet (1.31) | Wet (1.46) |
| 2011 | 53, 36, 28 | 39 | 1.6 | Wet (1.46) | Wet (1.42) |
| 2012 | 65, 51, 44 | 53 | 1.6 | Wet (1.42) | Average (0.94) |
| 2013 | 44, 30, 27 | 33 | 1.6 | Average (0.94) | Well below average (0.72) |
| 2014 | 35, 23, 23 | 27 | 1.6 | Well below average (0.72) | Below average (0.90) |
| 2015 | 49, 37, 35 | 40 | 1.6 | Below average (0.90) | Average (0.97) |
| 2016 | 58, 42, 37 | 46 | 1.6 | Average (0.97) | Average (0.99) |
| 2017 | 54, 35, 28 | 39 | 1.6 | Average (0.99) | Average (0.93) |
| 2018 | 29, 23, 29 | 27 | 1.6 | Average (0.93) | Drought (0.59) |
| 2019 | -20, -23, -17 | -20 | 41.1 | Below average (0.83) | Below average (0.86) |
| 2020 | 54, 38, 36 | 42 | 1.6 | Below average (0.86) | Below average (0.83) |
| 2021 | 48, 28, 23 | 33 | 1.6 | Below average (0.87) | Below average (0.87) |
| 2022 | 63, 46, 43 | 51 | 1.6 | Below average (0.87) | Wet (1.35) |
| 2023 | 39, 21, 14 | 25 | 1.6 | Wet (1.35) | Average (1.04) |
| 2024 | 55, 40, 37 | 44 | 1.6 | Average (1.04) | Wet (1.31) |
| 2025 | 59, 43, 34 | 45 | 1.6 | Wet (1.31) | Average (0.99) |
| **29 years** | 46, 30, 27 | **34** (middle year 39) | 3.4 | | |
| **The average year** | 57, 38, 39 | **44** | 1.6 | | |

Under the band (20): 2001, 2002, 2019.
Over the band (60): none.

#### Steers: Central Qld, with lick

| Start | Gain, kg a head (seeds 1, 2, 3) | Average | Deaths % | Season before the run | Season of the run |
|---|---|---|---|---|---|
| 1997 | 129, 121, 118 | 123 | 1.6 | Above average (1.13) | Below average (0.81) |
| 1998 | 132, 128, 126 | 129 | 1.6 | Below average (0.81) | Above average (1.18) |
| 1999 | 144, 133, 132 | 136 | 1.6 | Above average (1.18) | Average (1.06) |
| 2000 | 127, 122, 120 | 123 | 1.6 | Average (1.06) | Below average (0.83) |
| 2001 | 105, 106, 104 | 105 | 1.6 | Below average (0.83) | Well below average (0.61) |
| 2002 | 98, 99, 108 | 102 | 1.6 | Below average (0.83) | Well below average (0.67) |
| 2003 | 119, 116, 118 | 118 | 1.6 | Below average (0.87) | Below average (0.82) |
| 2004 | 126, 122, 123 | 124 | 1.6 | Below average (0.85) | Average (0.94) |
| 2005 | 131, 124, 122 | 126 | 1.6 | Average (0.95) | Well below average (0.76) |
| 2006 | 125, 121, 123 | 123 | 1.6 | Below average (0.86) | Average (1.01) |
| 2007 | 138, 131, 131 | 133 | 1.6 | Average (1.01) | Wet (1.50) |
| 2008 | 141, 133, 129 | 135 | 1.6 | Wet (1.50) | Wet (1.44) |
| 2009 | 137, 132, 131 | 133 | 1.6 | Wet (1.44) | Wet (1.31) |
| 2010 | 145, 135, 131 | 137 | 1.6 | Wet (1.31) | Wet (1.46) |
| 2011 | 138, 130, 130 | 133 | 1.6 | Wet (1.46) | Wet (1.42) |
| 2012 | 137, 136, 137 | 137 | 1.6 | Wet (1.42) | Average (0.94) |
| 2013 | 123, 124, 123 | 123 | 1.6 | Average (0.94) | Well below average (0.72) |
| 2014 | 117, 115, 116 | 116 | 1.6 | Well below average (0.72) | Below average (0.90) |
| 2015 | 127, 126, 125 | 126 | 1.6 | Below average (0.90) | Average (0.97) |
| 2016 | 135, 130, 130 | 132 | 1.6 | Average (0.97) | Average (0.99) |
| 2017 | 135, 124, 123 | 127 | 1.6 | Average (0.99) | Average (0.93) |
| 2018 | 100, 106, 109 | 105 | 1.6 | Average (0.93) | Drought (0.59) |
| 2019 | 88, 89, 100 | 93 | 1.6 | Below average (0.83) | Below average (0.86) |
| 2020 | 128, 123, 124 | 125 | 1.6 | Below average (0.86) | Below average (0.83) |
| 2021 | 131, 122, 122 | 125 | 1.6 | Below average (0.87) | Below average (0.87) |
| 2022 | 138, 133, 131 | 134 | 1.6 | Below average (0.87) | Wet (1.35) |
| 2023 | 130, 121, 122 | 124 | 1.6 | Wet (1.35) | Average (1.04) |
| 2024 | 135, 128, 129 | 131 | 1.6 | Average (1.04) | Wet (1.31) |
| 2025 | 137, 130, 128 | 131 | 1.6 | Wet (1.31) | Average (0.99) |
| **29 years** | 127, 123, 123 | **124** (middle year 126) | 1.6 | | |
| **The average year** | 135, 129, 129 | **131** | 1.6 | | |

Under the band (75): none.
Over the band (130): 1999, 2007, 2008, 2009, 2010, 2011, 2012, 2016, 2022, 2024, 2025.

#### Steers: Northern Tablelands

| Start | Gain, kg a head (seeds 1, 2, 3) | Average | Deaths % | Season before the run | Season of the run |
|---|---|---|---|---|---|
| 1997 | 119, 96, 88 | 101 | 2.5 | Above average (1.09) | Above average (1.18) |
| 1998 | 109, 89, 84 | 94 | 2.5 | Above average (1.18) | Below average (0.84) |
| 1999 | 123, 98, 92 | 105 | 2.5 | Below average (0.84) | Above average (1.20) |
| 2000 | 114, 94, 87 | 98 | 2.5 | Above average (1.19) | Average (1.02) |
| 2001 | 94, 85, 81 | 87 | 2.5 | Average (1.02) | Below average (0.82) |
| 2002 | 112, 105, 104 | 107 | 2.5 | Below average (0.82) | Well below average (0.79) |
| 2003 | 114, 96, 91 | 100 | 2.5 | Below average (0.86) | Average (1.00) |
| 2004 | 90, 86, 80 | 85 | 2.5 | Average (1.00) | Below average (0.87) |
| 2005 | 100, 88, 82 | 90 | 2.5 | Below average (0.88) | Average (1.05) |
| 2006 | 121, 102, 99 | 107 | 2.5 | Average (1.05) | Average (0.95) |
| 2007 | 111, 97, 93 | 100 | 2.5 | Average (0.95) | Above average (1.14) |
| 2008 | 118, 100, 95 | 104 | 2.5 | Above average (1.14) | Average (1.03) |
| 2009 | 120, 107, 103 | 110 | 2.5 | Average (1.03) | Average (0.96) |
| 2010 | 128, 103, 96 | 109 | 2.5 | Average (0.96) | Wet (1.48) |
| 2011 | 114, 92, 83 | 96 | 2.5 | Wet (1.48) | Wet (1.26) |
| 2012 | 102, 102, 100 | 101 | 2.5 | Wet (1.26) | Below average (0.83) |
| 2013 | 87, 93, 92 | 91 | 2.5 | Below average (0.83) | Well below average (0.66) |
| 2014 | 121, 109, 109 | 113 | 2.5 | Below average (0.86) | Average (0.96) |
| 2015 | 105, 100, 100 | 102 | 2.5 | Average (0.96) | Below average (0.80) |
| 2016 | 125, 97, 92 | 105 | 2.5 | Below average (0.81) | Above average (1.16) |
| 2017 | 87, 81, 75 | 81 | 2.5 | Above average (1.16) | Below average (0.81) |
| 2018 | 52, 60, 55 | 56 | 2.5 | Below average (0.81) | Well below average (0.64) |
| 2019 | 114, 108, 112 | 112 | 2.5 | Below average (0.85) | Average (0.94) |
| 2020 | 138, 118, 117 | 124 | 2.5 | Average (0.95) | Above average (1.25) |
| 2021 | 131, 105, 99 | 112 | 2.5 | Above average (1.25) | Wet (1.49) |
| 2022 | 98, 78, 70 | 82 | 2.5 | Wet (1.49) | Average (0.94) |
| 2023 | 128, 107, 105 | 113 | 2.5 | Average (0.94) | Average (1.04) |
| 2024 | 137, 105, 101 | 114 | 2.5 | Average (1.05) | Average (1.00) |
| 2025 | 38, 52, 45 | 45 | 2.5 | Average (1.00) | Drought (0.58) |
| **29 years** | 109, 95, 91 | **98** (middle year 101) | 2.5 | | |
| **The average year** | 118, 97, 97 | **104** | 2.5 | | |

Under the band (90): 2001, 2004, 2005, 2017, 2018, 2022, 2025.
Over the band (105): 2002, 2006, 2009, 2010, 2014, 2019, 2020, 2021, 2023, 2024.

#### Steers: Central West NSW

| Start | Gain, kg a head (seeds 1, 2, 3) | Average | Deaths % | Season before the run | Season of the run |
|---|---|---|---|---|---|
| 1997 | 92, 84, 80 | 85 | 1.8 | Wet (1.28) | Well below average (0.74) |
| 1998 | 139, 122, 120 | 127 | 1.8 | Well below average (0.74) | Wet (1.29) |
| 1999 | 149, 133, 127 | 136 | 1.8 | Wet (1.30) | Wet (1.34) |
| 2000 | 151, 131, 125 | 135 | 1.8 | Wet (1.34) | Above average (1.24) |
| 2001 | 148, 129, 123 | 134 | 1.8 | Above average (1.24) | Above average (1.24) |
| 2002 | -21, -4, -7 | -11 | 5.5 | Above average (1.25) | Drought (0.47) |
| 2003 | 135, 121, 122 | 126 | 1.8 | Well below average (0.69) | Average (1.00) |
| 2004 | 114, 101, 102 | 106 | 1.8 | Average (1.00) | Below average (0.86) |
| 2005 | 82, 72, 75 | 76 | 1.8 | Below average (0.86) | Average (1.00) |
| 2006 | -50, -34, -33 | -39 | 24.5 | Average (1.01) | Drought (0.43) |
| 2007 | 138, 134, 135 | 136 | 1.8 | Well below average (0.75) | Average (0.94) |
| 2008 | 115, 104, 103 | 108 | 1.8 | Average (0.96) | Average (0.93) |
| 2009 | 126, 124, 121 | 123 | 1.8 | Below average (0.92) | Below average (0.88) |
| 2010 | 157, 139, 138 | 145 | 1.8 | Below average (0.88) | Wet (1.47) |
| 2011 | 144, 130, 126 | 133 | 1.8 | Wet (1.47) | Wet (1.35) |
| 2012 | 108, 108, 101 | 106 | 1.8 | Wet (1.35) | Well below average (0.72) |
| 2013 | 118, 116, 118 | 117 | 1.8 | Well below average (0.72) | Below average (0.81) |
| 2014 | 140, 135, 132 | 136 | 1.8 | Below average (0.88) | Below average (0.90) |
| 2015 | 154, 133, 132 | 139 | 1.8 | Below average (0.90) | Above average (1.10) |
| 2016 | 131, 115, 114 | 120 | 1.8 | Above average (1.10) | Above average (1.24) |
| 2017 | 85, 87, 78 | 84 | 1.8 | Above average (1.25) | Well below average (0.74) |
| 2018 | 1, 1, 11 | 4 | 39.2 | Well below average (0.73) | Well below average (0.74) |
| 2019 | -57, -47, -41 | -48 | 53.5 | Below average (0.82) | Drought (0.52) |
| 2020 | 164, 142, 141 | 149 | 1.8 | Well below average (0.76) | Wet (1.39) |
| 2021 | 154, 131, 126 | 137 | 1.8 | Wet (1.39) | Wet (1.37) |
| 2022 | 145, 123, 115 | 128 | 1.8 | Wet (1.37) | Wet (1.43) |
| 2023 | 80, 87, 86 | 85 | 1.8 | Wet (1.43) | Below average (0.83) |
| 2024 | 156, 141, 139 | 145 | 1.8 | Below average (0.83) | Above average (1.08) |
| 2025 | 136, 125, 121 | 127 | 1.8 | Above average (1.08) | Below average (0.90) |
| **29 years** | 108, 99, 98 | **102** (middle year 126) | 5.8 | | |
| **The average year** | 139, 125, 127 | **130** | 1.8 | | |

Under the band (115): 1997, 2002, 2004, 2005, 2006, 2008, 2012, 2017, 2018, 2019, 2023.
Over the band (130): 1999, 2000, 2001, 2007, 2010, 2011, 2014, 2015, 2020, 2021, 2024.

#### Steers: Western Victoria

| Start | Gain, kg a head (seeds 1, 2, 3) | Average | Deaths % | Season before the run | Season of the run |
|---|---|---|---|---|---|
| 1997 | 191, 174, 173 | 179 | 2.3 | Average (0.94) | Average (1.00) |
| 1998 | 205, 187, 183 | 192 | 2.3 | Average (1.00) | Average (1.06) |
| 1999 | 190, 173, 171 | 178 | 2.3 | Average (1.06) | Average (0.99) |
| 2000 | 201, 181, 178 | 187 | 2.3 | Average (0.98) | Above average (1.09) |
| 2001 | 205, 181, 178 | 188 | 2.3 | Above average (1.09) | Above average (1.23) |
| 2002 | 196, 179, 174 | 183 | 2.3 | Above average (1.23) | Average (1.02) |
| 2003 | 202, 184, 181 | 189 | 2.3 | Average (1.02) | Above average (1.12) |
| 2004 | 198, 177, 174 | 183 | 2.3 | Above average (1.12) | Average (1.00) |
| 2005 | 170, 156, 159 | 162 | 2.3 | Average (1.00) | Below average (0.83) |
| 2006 | 160, 162, 159 | 160 | 2.3 | Below average (0.83) | Well below average (0.71) |
| 2007 | 196, 180, 180 | 186 | 2.3 | Below average (0.82) | Average (0.97) |
| 2008 | 184, 170, 166 | 173 | 2.3 | Average (0.98) | Below average (0.87) |
| 2009 | 193, 180, 180 | 184 | 2.3 | Below average (0.87) | Average (0.96) |
| 2010 | 211, 188, 186 | 195 | 2.3 | Average (0.96) | Wet (1.25) |
| 2011 | 202, 178, 175 | 185 | 2.3 | Wet (1.26) | Average (1.06) |
| 2012 | 177, 166, 165 | 169 | 2.3 | Average (1.06) | Below average (0.90) |
| 2013 | 194, 178, 179 | 184 | 2.3 | Below average (0.89) | Average (1.06) |
| 2014 | 177, 164, 160 | 167 | 2.3 | Average (1.06) | Well below average (0.79) |
| 2015 | 174, 170, 171 | 172 | 2.3 | Well below average (0.79) | Well below average (0.79) |
| 2016 | 201, 183, 181 | 188 | 2.3 | Below average (0.89) | Above average (1.12) |
| 2017 | 197, 171, 168 | 179 | 2.3 | Above average (1.12) | Average (1.06) |
| 2018 | 189, 173, 170 | 177 | 2.3 | Average (1.06) | Below average (0.90) |
| 2019 | 191, 177, 178 | 182 | 2.3 | Below average (0.90) | Average (0.94) |
| 2020 | 204, 184, 180 | 189 | 2.3 | Average (0.94) | Above average (1.15) |
| 2021 | 195, 178, 174 | 182 | 2.3 | Above average (1.15) | Average (1.02) |
| 2022 | 198, 180, 180 | 186 | 2.3 | Average (1.02) | Above average (1.17) |
| 2023 | 196, 172, 169 | 179 | 2.3 | Above average (1.17) | Average (0.98) |
| 2024 | 169, 160, 162 | 164 | 2.3 | Average (0.97) | Below average (0.92) |
| 2025 | 185, 170, 170 | 175 | 2.3 | Below average (0.92) | Above average (1.08) |
| **29 years** | 191, 175, 173 | **180** (middle year 182) | 2.3 | | |
| **The average year** | 195, 176, 179 | **183** | 2.3 | | |

Under the band (155): none.
Over the band (185): 1998, 2000, 2001, 2003, 2007, 2010, 2011, 2016, 2020, 2022.

#### Years that look odd, with the figures

These are recorded, not failed. Each is a set-stocked mob with nothing done: no sales, no feeding, no move.

- **Central Qld, no lick, from September 2019: -20 kg and 41% of the steers lost, in a year the season reads "Below average" (0.86).** The label is for the 12 months as a whole, weighted by when the grass usually grows. The months tell it: the growth factor was 0.07, 0.20, 0.09 and 0.00 from September to December 2019, then 0.94, 1.78 and 1.37 from January to March 2020. On seed 1 the standing feed fell from 1,170 to 530 kg DM/ha by the end of December, the steers went from 201 kg at the end of September to 155 kg at the end of January, and 28 of the 86 died between December and March (36 over the whole year). The rain then came, and the steers left were at 196 kg by the end of July. With the lick the same year loses 1.6% and gains 93 kg.
- **Central Qld, no lick, from September 2018: 27 kg and 1.6% lost, in a year that reads "Drought" (0.59).** The other way round: October 2018 and March to May 2019 grew well (1.41, 1.10, 1.77, 1.46), and the dry months fell where little grows anyway.
- **Central Qld, no lick, from September 2002: -4 kg and 17% lost** (season 0.67).
- **Central West, from April 2002, 2006, 2018 and 2019: -11, -39, 4 and -48 kg, with 5.5, 24.5, 39 and 53.5% lost.** These four years take the 29-year average from 126 (the middle year) down to 102. From April 2018 on seed 1: the block started with 970 kg DM/ha, the growth factor was 0.15 to 0.41 from April to September, the steers fell from 210 kg at the end of April to 151 kg at the end of September, and 38 of 91 died by the end of November. From April 2019 the factor was under 0.4 from June to December and 57 of 91 died.
- **Northern Tablelands, from October 2025: 45 kg, in a year that reads "Drought" (0.58).** The run goes to September 2026, the newest weather in the table. January to April 2026 read 0.38, 0.39, 0.22 and 0.10. The last days of the SILO table are provisional (DATA.md).
- **Western Victoria never leaves its band on the low side.** Its lowest year is 160 kg, from April 2006 ("Well below average", 0.71), against a band of 155 to 185. Its herds gain 175 kg from September 2006. The weather moves Western Victoria much less than the other three districts.
- **Deaths do not move until condition falls a long way.** In every case the deaths are the same figure in 25 or more of the 29 years (1.6, 1.6, 2.5, 1.8 and 2.3%), because each seed draws the same luck every year. They rise only in the years above.
- **A scratch block starts with about 1,000 kg DM/ha.** The 540-day run-up with no stock left 970 to 1,230 kg DM/ha on day 0 on the six blocks looked at (nearly all dry feed in Central Qld in September). That is the 1.3 set-up, unchanged. It means a run that starts into a dry spell has little feed in hand.

#### Herds: summary

Seeds 1 and 2 together. Deaths as % of the head at the start. Gain is kg for each head at the start.

| District | Head at the start | Deaths, the average year | Deaths, the years that grew average feed or better | Deaths, all 29 years | Gain, the average year | Gain, 29 years | Highest deaths in a year |
|---|---|---|---|---|---|---|---|
| Central Qld (on lick) | 790 and 786 | 2.8% | 2.9% (17 years) | 2.9% | 129 kg | 123 kg | 3.1% (2019) |
| Northern Tablelands | 271 and 269 | 3.9% | 3.7% (18 years) | 3.8% | 97 kg | 91 kg | 5.0% (2019) |
| Central West NSW | 418 and 416 | 3.0% | 3.1% (19 years) | 4.8% | 121 kg | 97 kg | 32.4% (2006) |
| Western Victoria | 223 and 221 | 3.6% | 3.6% (21 years) | 3.6% | 175 kg | 174 kg | 3.6% |

**What the tests hold:** over the years that grew average feed or better, the two herds lose within half a point of what the same two herds lose in the average year. A named dry year puts on less weight than a named wet one (Central Qld 2002 against 2010, Northern Tablelands 2018 against 2020, Central West 2018 against 2010, Western Victoria 2006 against 2010). The same run gives the same figures again.

**What they do not hold: the 1.5 to 3.6% deaths benchmark.** Two herds are too few for it. Each seed is the same herd with the same luck in every year, so 29 years do not average the luck out: the Tablelands herd on seed 1 loses 4.1% in nearly every year, and does in the average year too (1.3 found single herds from 0.9 to 4.1%). The benchmark is held by `herds.test.ts` on 16 herds in the average year (2.4 to 2.6%). What these runs add is that a real year with fair weather loses what the average year loses.

- **Central West herds in the droughts, left alone:** 11.4% lost from September 2002, 32.4% from 2006, 4.6% from 2017 and 12.6% from 2019.
- **Central Qld herds on the lick hold through every year:** 2.8 to 3.1% lost, 91 to 138 kg gained.

#### Herds: Central Qld

| Start | Deaths % (seeds 1, 2) | Deaths %, both | Gain a head, kg | Season before the run | Season of the run |
|---|---|---|---|---|---|
| 1997 | 2.9, 2.7 | 2.8 | 121 | Above average (1.13) | Below average (0.81) |
| 1998 | 3.0, 2.7 | 2.9 | 127 | Below average (0.81) | Above average (1.18) |
| 1999 | 2.9, 2.8 | 2.9 | 134 | Above average (1.18) | Average (1.06) |
| 2000 | 3.0, 2.9 | 3.0 | 121 | Average (1.06) | Below average (0.83) |
| 2001 | 3.0, 2.7 | 2.9 | 104 | Below average (0.83) | Well below average (0.61) |
| 2002 | 2.9, 2.9 | 2.9 | 101 | Below average (0.83) | Well below average (0.67) |
| 2003 | 2.9, 2.7 | 2.8 | 118 | Below average (0.87) | Below average (0.82) |
| 2004 | 3.0, 2.7 | 2.9 | 123 | Below average (0.85) | Average (0.94) |
| 2005 | 2.9, 2.8 | 2.9 | 124 | Average (0.95) | Well below average (0.76) |
| 2006 | 3.0, 2.7 | 2.9 | 124 | Below average (0.86) | Average (1.01) |
| 2007 | 2.9, 2.7 | 2.8 | 131 | Average (1.01) | Wet (1.50) |
| 2008 | 2.9, 2.9 | 2.9 | 131 | Wet (1.50) | Wet (1.44) |
| 2009 | 2.9, 2.8 | 2.9 | 134 | Wet (1.44) | Wet (1.31) |
| 2010 | 2.9, 2.7 | 2.8 | 132 | Wet (1.31) | Wet (1.46) |
| 2011 | 2.9, 2.7 | 2.8 | 131 | Wet (1.46) | Wet (1.42) |
| 2012 | 2.9, 2.9 | 2.9 | 138 | Wet (1.42) | Average (0.94) |
| 2013 | 3.0, 2.7 | 2.9 | 123 | Average (0.94) | Well below average (0.72) |
| 2014 | 3.0, 2.9 | 3.0 | 116 | Well below average (0.72) | Below average (0.90) |
| 2015 | 3.0, 2.7 | 2.9 | 126 | Below average (0.90) | Average (0.97) |
| 2016 | 2.9, 3.1 | 3.0 | 131 | Average (0.97) | Average (0.99) |
| 2017 | 2.9, 2.7 | 2.8 | 125 | Average (0.99) | Average (0.93) |
| 2018 | 2.9, 2.7 | 2.8 | 108 | Average (0.93) | Drought (0.59) |
| 2019 | 3.2, 3.1 | 3.1 | 91 | Below average (0.83) | Below average (0.86) |
| 2020 | 2.9, 2.8 | 2.9 | 125 | Below average (0.86) | Below average (0.83) |
| 2021 | 2.9, 2.8 | 2.9 | 122 | Below average (0.87) | Below average (0.87) |
| 2022 | 3.0, 2.8 | 2.9 | 131 | Below average (0.87) | Wet (1.35) |
| 2023 | 3.0, 2.7 | 2.9 | 123 | Wet (1.35) | Average (1.04) |
| 2024 | 3.0, 2.8 | 2.9 | 131 | Average (1.04) | Wet (1.31) |
| 2025 | 3.0, 2.7 | 2.9 | 131 | Wet (1.31) | Average (0.99) |
| **29 years** | | **2.9** | **123** | | |
| **Years that grew average feed or better** (17) | | **2.9** | **130** | | |
| **The average year** | 2.9, 2.7 | **2.8** | **129** | | |

Head at the start: 790 and 786.

#### Herds: Northern Tablelands

| Start | Deaths % (seeds 1, 2) | Deaths %, both | Gain a head, kg | Season before the run | Season of the run |
|---|---|---|---|---|---|
| 1997 | 4.1, 4.1 | 4.1 | 90 | Above average (1.09) | Above average (1.17) |
| 1998 | 4.4, 3.3 | 3.9 | 85 | Above average (1.17) | Below average (0.86) |
| 1999 | 4.1, 4.1 | 4.1 | 94 | Below average (0.88) | Above average (1.20) |
| 2000 | 4.1, 3.0 | 3.5 | 95 | Above average (1.20) | Average (1.03) |
| 2001 | 4.1, 3.0 | 3.5 | 84 | Average (1.03) | Below average (0.82) |
| 2002 | 4.1, 3.0 | 3.5 | 110 | Below average (0.82) | Below average (0.80) |
| 2003 | 4.1, 3.3 | 3.7 | 88 | Below average (0.86) | Average (0.96) |
| 2004 | 4.1, 3.7 | 3.9 | 75 | Average (0.96) | Below average (0.86) |
| 2005 | 4.4, 4.1 | 4.3 | 86 | Below average (0.89) | Above average (1.09) |
| 2006 | 4.1, 3.0 | 3.5 | 98 | Above average (1.09) | Average (0.93) |
| 2007 | 4.1, 3.0 | 3.5 | 94 | Average (0.93) | Above average (1.14) |
| 2008 | 4.4, 3.7 | 4.1 | 98 | Above average (1.14) | Average (1.04) |
| 2009 | 4.1, 3.0 | 3.5 | 99 | Average (1.04) | Average (0.93) |
| 2010 | 4.4, 3.3 | 3.9 | 98 | Average (0.93) | Wet (1.48) |
| 2011 | 4.4, 3.3 | 3.9 | 90 | Wet (1.48) | Wet (1.28) |
| 2012 | 4.4, 3.3 | 3.9 | 104 | Wet (1.28) | Below average (0.85) |
| 2013 | 4.1, 3.7 | 3.9 | 89 | Below average (0.86) | Well below average (0.64) |
| 2014 | 4.1, 3.3 | 3.7 | 108 | Below average (0.83) | Average (0.95) |
| 2015 | 4.1, 3.0 | 3.5 | 95 | Average (0.95) | Well below average (0.78) |
| 2016 | 4.1, 3.3 | 3.7 | 99 | Below average (0.83) | Above average (1.22) |
| 2017 | 4.4, 3.3 | 3.9 | 74 | Above average (1.22) | Well below average (0.78) |
| 2018 | 4.1, 3.0 | 3.5 | 59 | Well below average (0.78) | Well below average (0.68) |
| 2019 | 4.8, 5.2 | 5.0 | 90 | Below average (0.87) | Below average (0.89) |
| 2020 | 4.1, 3.3 | 3.7 | 113 | Below average (0.90) | Above average (1.24) |
| 2021 | 4.1, 3.0 | 3.5 | 101 | Above average (1.24) | Wet (1.49) |
| 2022 | 4.1, 3.0 | 3.5 | 84 | Wet (1.49) | Average (1.01) |
| 2023 | 4.1, 3.3 | 3.7 | 98 | Average (1.01) | Average (0.99) |
| 2024 | 4.1, 3.0 | 3.5 | 101 | Average (0.99) | Average (0.99) |
| 2025 | 4.1, 3.0 | 3.5 | 47 | Average (0.99) | Well below average (0.63) |
| **29 years** | | **3.8** | **91** | | |
| **Years that grew average feed or better** (18) | | **3.7** | **96** | | |
| **The average year** | 4.1, 3.7 | **3.9** | **97** | | |

Head at the start: 271 and 269.

#### Herds: Central West NSW

| Start | Deaths % (seeds 1, 2) | Deaths %, both | Gain a head, kg | Season before the run | Season of the run |
|---|---|---|---|---|---|
| 1997 | 2.9, 3.4 | 3.1 | 136 | Above average (1.14) | Average (0.97) |
| 1998 | 2.9, 3.4 | 3.1 | 118 | Average (0.98) | Wet (1.28) |
| 1999 | 3.1, 3.1 | 3.1 | 133 | Wet (1.28) | Wet (1.45) |
| 2000 | 2.9, 3.4 | 3.1 | 133 | Wet (1.45) | Above average (1.15) |
| 2001 | 2.9, 3.1 | 3.0 | 85 | Above average (1.16) | Average (1.03) |
| 2002 | 7.2, 15.6 | 11.4 | 4 | Average (1.02) | Well below average (0.61) |
| 2003 | 2.9, 3.1 | 3.0 | 104 | Below average (0.85) | Average (0.93) |
| 2004 | 2.9, 3.4 | 3.1 | 69 | Average (0.93) | Below average (0.80) |
| 2005 | 3.1, 3.1 | 3.1 | 66 | Below average (0.86) | Average (0.99) |
| 2006 | 27.0, 37.7 | 32.4 | -32 | Average (0.99) | Drought (0.57) |
| 2007 | 3.1, 3.4 | 3.2 | 93 | Below average (0.86) | Well below average (0.78) |
| 2008 | 2.9, 3.1 | 3.0 | 117 | Below average (0.80) | Average (1.07) |
| 2009 | 2.9, 3.1 | 3.0 | 142 | Average (1.07) | Average (1.02) |
| 2010 | 3.1, 3.4 | 3.2 | 101 | Average (1.02) | Wet (1.32) |
| 2011 | 2.9, 3.6 | 3.2 | 121 | Wet (1.32) | Wet (1.34) |
| 2012 | 2.9, 3.4 | 3.1 | 102 | Wet (1.34) | Well below average (0.69) |
| 2013 | 3.1, 3.4 | 3.2 | 147 | Well below average (0.78) | Average (1.01) |
| 2014 | 3.1, 3.1 | 3.1 | 135 | Average (1.01) | Below average (0.88) |
| 2015 | 2.9, 3.4 | 3.1 | 120 | Below average (0.88) | Average (1.00) |
| 2016 | 2.9, 3.4 | 3.1 | 86 | Average (1.00) | Above average (1.16) |
| 2017 | 5.0, 4.1 | 4.6 | -19 | Above average (1.16) | Drought (0.58) |
| 2018 | 2.9, 3.1 | 3.0 | 64 | Below average (0.81) | Well below average (0.77) |
| 2019 | 9.3, 15.9 | 12.6 | 52 | Below average (0.91) | Below average (0.89) |
| 2020 | 2.9, 3.4 | 3.1 | 125 | Average (0.93) | Wet (1.28) |
| 2021 | 2.9, 3.1 | 3.0 | 131 | Wet (1.28) | Wet (1.47) |
| 2022 | 2.9, 3.1 | 3.0 | 94 | Wet (1.47) | Above average (1.17) |
| 2023 | 2.9, 3.1 | 3.0 | 132 | Above average (1.17) | Above average (1.08) |
| 2024 | 2.9, 3.1 | 3.0 | 133 | Above average (1.09) | Average (0.99) |
| 2025 | 2.9, 3.1 | 3.0 | 121 | Average (0.99) | Well below average (0.79) |
| **29 years** | | **4.8** | **97** | | |
| **Years that grew average feed or better** (19) | | **3.1** | **117** | | |
| **The average year** | 2.9, 3.1 | **3.0** | **121** | | |

Head at the start: 418 and 416.

#### Herds: Western Victoria

| Start | Deaths % (seeds 1, 2) | Deaths %, both | Gain a head, kg | Season before the run | Season of the run |
|---|---|---|---|---|---|
| 1997 | 3.6, 3.6 | 3.6 | 175 | Average (0.95) | Average (1.01) |
| 1998 | 3.6, 3.6 | 3.6 | 177 | Average (1.01) | Average (1.03) |
| 1999 | 3.6, 3.6 | 3.6 | 180 | Average (1.03) | Average (1.05) |
| 2000 | 3.6, 3.6 | 3.6 | 184 | Average (1.05) | Above average (1.10) |
| 2001 | 3.6, 3.6 | 3.6 | 166 | Above average (1.10) | Above average (1.16) |
| 2002 | 3.6, 3.2 | 3.4 | 180 | Above average (1.16) | Average (1.04) |
| 2003 | 3.6, 3.6 | 3.6 | 178 | Average (1.04) | Above average (1.13) |
| 2004 | 3.6, 3.6 | 3.6 | 140 | Above average (1.13) | Below average (0.87) |
| 2005 | 3.6, 3.6 | 3.6 | 186 | Below average (0.87) | Average (0.97) |
| 2006 | 3.6, 3.6 | 3.6 | 175 | Average (0.97) | Well below average (0.66) |
| 2007 | 3.6, 3.6 | 3.6 | 175 | Well below average (0.78) | Average (0.98) |
| 2008 | 3.6, 3.6 | 3.6 | 176 | Average (0.98) | Below average (0.85) |
| 2009 | 3.6, 3.6 | 3.6 | 186 | Below average (0.85) | Average (1.04) |
| 2010 | 3.6, 3.6 | 3.6 | 182 | Average (1.04) | Wet (1.27) |
| 2011 | 3.6, 3.2 | 3.4 | 177 | Wet (1.27) | Average (0.98) |
| 2012 | 3.6, 3.6 | 3.6 | 161 | Average (0.98) | Below average (0.87) |
| 2013 | 3.6, 3.6 | 3.6 | 177 | Below average (0.87) | Above average (1.12) |
| 2014 | 3.6, 3.6 | 3.6 | 186 | Above average (1.12) | Well below average (0.79) |
| 2015 | 3.6, 3.6 | 3.6 | 190 | Well below average (0.79) | Well below average (0.79) |
| 2016 | 3.6, 3.6 | 3.6 | 182 | Well below average (0.79) | Above average (1.15) |
| 2017 | 3.6, 3.2 | 3.4 | 170 | Above average (1.15) | Average (1.00) |
| 2018 | 3.6, 3.6 | 3.6 | 169 | Average (1.00) | Below average (0.88) |
| 2019 | 3.6, 3.6 | 3.6 | 184 | Below average (0.88) | Average (1.02) |
| 2020 | 3.6, 3.6 | 3.6 | 170 | Average (1.02) | Above average (1.10) |
| 2021 | 3.6, 3.2 | 3.4 | 169 | Above average (1.10) | Average (0.98) |
| 2022 | 3.6, 3.6 | 3.6 | 183 | Average (0.98) | Wet (1.29) |
| 2023 | 3.6, 3.2 | 3.4 | 142 | Wet (1.29) | Below average (0.81) |
| 2024 | 3.6, 3.6 | 3.6 | 164 | Below average (0.81) | Average (0.94) |
| 2025 | 3.6, 3.6 | 3.6 | 179 | Average (0.94) | Above average (1.17) |
| **29 years** | | **3.6** | **174** | | |
| **Years that grew average feed or better** (21) | | **3.6** | **177** | | |
| **The average year** | 3.6, 3.6 | **3.6** | **175** | | |

Head at the start: 223 and 221.

**CHECK, for Claudia** (real years):

1. **Do the dry and wet years look right?** The build plan leaves this to Claudia. The steer and herd tables above give every year from 1997 to 2025, and the 1.4b entry gives the feed grown and the rain. Years to look at first: Central West 2002, 2006, 2018 and 2019. Central Qld 2002 and 2019. Northern Tablelands 2018.
2. **Central West loses a lot of steers in its four worst years** when nothing is done: 5.5 to 53.5% of set-stocked weaners at 60% of carrying capacity, and 11 to 32% of a breeding herd left alone. Is that the right size for doing nothing through 2002, 2006, 2018 and 2019 at Dubbo? A grazier would have sold or fed. The game lets the player do both.
3. **Central Qld without lick loses 41% from September 2019** in a year the label calls "Below average", because the rain came late. The label states the 12 months as a whole. Should the season label look at the months that have just gone by more than at the year?
4. **Western Victoria hardly answers the weather.** Its lowest steer year is 160 kg (2006) against 183 in the average year, and no year is under the band. Is a year like 2006 at Hamilton really only 12% under an average one for stock?
5. **Eleven of 29 years are over the band** for Central Qld with lick and Central West, and ten for the Tablelands and Western Victoria. It is the same question as the first CHECK of 1.3: is a band for the average, or a limit on every year?
6. **The 29-year averages sit under the average year** by 3 to 10 kg in four cases and by 28 kg in Central West. The bands were held on the average year in 1.3. If a band is meant for the long run of real years, Central West (102) is under its band (115 to 130) and the others are inside.
7. **The newest year uses weather to 12 Nov 2026**, which SILO marks as provisional for its last few days. A Northern Tablelands run from October 2025 reads as a drought year.
8. **How herd deaths are held on real years.** The first real-year herd test held the 1.5 to 3.6% band on two herds a district and failed: the two Northern Tablelands herds lose 3.7% over the years with fair weather, and 3.9% in the average year. Two herds are too few, because a seed is the same herd with the same luck every year. The test now runs six herds through the years whose own 12 months grew average feed or better and holds the band on the six together: Central Qld 2.5%, Northern Tablelands 2.7%, Central West 2.5%, Western Victoria 2.7%. It is still the reading of CHECK 4 in 1.3 (herds together, not herd by herd), which is yours to decide. A second test holds the first two herds within half a point of their own average year.
9. **Steers on real years are held loosely.** The 29-year average must be no higher than the top of the band and above 0, and not far under the same blocks' average year. The second limit was set from the runs plus 3 kg, so it only guards against a change. Central West's 29-year average (102) passes while under its band (115 to 130), because the droughts are in it.
10. **Can a farm pay its way in 1997 to 2003?** A farm played in order with no year picked starts in 1997. In today's dollars Dubbo restocker steers are about 188 c/kg then against about 457 in 2025, and the game's costs are the same in every year. No run has checked that a farm starting in 1997 can make money. It needs a look once buying and selling on sale days are in (milestone 1.5).

**Not tested here:** real years played at random through the calibration suites (the wiring is tested at random in `sim/realYears.test.ts`, the suites only in order). May starts for herds. Mixed farms and crops on real years. More than three steer blocks or two herds a year.

### 14 Nov 2026, milestone 1.5c: 180 days with three kinds of player

Engine 0.9.0. BUILD_PLAN row 1.5 asks for a test that plays ordinary, careless and absent players for 180 days and reports who goes under and why. The players are plain functions over the public engine API (`packages/engine/test-support/players.ts`, with their rules written at the top of that file). Each ran a medium running farm on medium difficulty, from 1 September 2023 with random seasons, for 180 days, in each of the four districts on two seeds (1 and 2). The absent player does nothing but press Next day. The careless player looks at the farm once every 21 days (days 0, 21, 42 and so on). On a day it looks it does each thing in the things-to-do list that has an action ready (mark calves, harvest, refill a portable trough, fix a fence) and moves any mob that has no water to a paddock with water, and on every other day it only presses Next day. The ordinary player acts every day: on a sale day it sells every steer of 300 kg or more, it does what things to do lists where an action is ready (it does not pause plans), it moves any mob without water to a paddock with water, it moves stock out of the yards, and it puts each mob on a rotation plan round the paddocks that have water, moving every 7 days for ever (a plan that moves into a paddock with another mob joins the two). None of them builds, buys, weans or changes a supplement. Two seeds were used, not more, so the test (`day/players.test.ts`) runs in about 11 seconds, which includes a second run of one seed for each player and district to check that the same run gives the same result.

To print this table, run exactly: `GG_PLAYERS_RUN=1 pnpm exec vitest run packages/engine/src/day/players.test.ts`

| District | Seed | Player | Head, start to end | Deaths | Live weight gained | Cash, start to end | Net worth, start to end | Game ended | Days a mob was on dry ground at the end of the day | Things to do left | Plan moves made | Plans waiting at the end |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| cq | 1 | absent | 894 to 1101 | 11 natural, 1 orphaned | 68,954 kg | $148,000 to $114,026 | $623,556 to $1,017,852 | no, 180 days | 0 | 1 | 0 | none |
| cq | 1 | careless | 894 to 1101 | 11 natural, 1 orphaned | 68,954 kg | $148,000 to $113,312 | $623,556 to $1,017,138 | no, 180 days | 0 | 0 | 0 | none |
| cq | 1 | ordinary | 894 to 1080 | 11 natural, 1 orphaned | 68,651 kg | $148,000 to $132,608 | $623,556 to $1,016,353 | no, 180 days | 0 | 0 | 25 | none |
| cq | 2 | absent | 889 to 1088 | 12 natural | 69,163 kg | $148,000 to $115,491 | $620,701 to $987,934 | no, 180 days | 0 | 1 | 0 | none |
| cq | 2 | careless | 889 to 1088 | 12 natural | 69,163 kg | $148,000 to $114,826 | $620,701 to $987,268 | no, 180 days | 0 | 0 | 0 | none |
| cq | 2 | ordinary | 889 to 1058 | 12 natural | 71,223 kg | $148,000 to $139,513 | $620,701 to $991,226 | no, 180 days | 0 | 0 | 50 | none |
| nsw | 1 | absent | 307 to 379 | 4 natural | 29,275 kg | $50,000 to $43,586 | $213,239 to $366,486 | no, 180 days | 0 | 1 | 0 | none |
| nsw | 1 | careless | 307 to 379 | 4 natural | 29,275 kg | $50,000 to $43,386 | $213,239 to $366,286 | no, 180 days | 0 | 0 | 0 | none |
| nsw | 1 | ordinary | 307 to 345 | 4 natural | 28,708 kg | $50,000 to $76,560 | $213,239 to $366,434 | no, 180 days | 0 | 0 | 25 | none |
| nsw | 2 | absent | 304 to 371 | 5 natural, 2 orphaned | 31,289 kg | $50,000 to $43,633 | $212,775 to $359,733 | no, 180 days | 0 | 1 | 0 | none |
| nsw | 2 | careless | 304 to 371 | 5 natural, 2 orphaned | 31,289 kg | $50,000 to $43,417 | $212,775 to $359,516 | no, 180 days | 0 | 0 | 0 | none |
| nsw | 2 | ordinary | 304 to 328 | 5 natural, 2 orphaned | 30,237 kg | $50,000 to $84,279 | $212,775 to $358,422 | no, 180 days | 0 | 0 | 50 | none |
| cw | 1 | absent | 473 to 584 | 6 natural | 38,823 kg | $78,000 to $69,058 | $330,778 to $550,893 | no, 180 days | 0 | 1 | 0 | none |
| cw | 1 | careless | 473 to 584 | 6 natural | 38,823 kg | $78,000 to $68,689 | $330,778 to $550,524 | no, 180 days | 0 | 0 | 0 | none |
| cw | 1 | ordinary | 473 to 553 | 6 natural | 38,418 kg | $78,000 to $97,994 | $330,778 to $552,757 | no, 180 days | 0 | 0 | 25 | none |
| cw | 2 | absent | 471 to 576 | 7 natural | 39,868 kg | $78,000 to $69,101 | $329,054 to $536,309 | no, 180 days | 0 | 1 | 0 | none |
| cw | 2 | careless | 471 to 576 | 7 natural | 39,868 kg | $78,000 to $68,732 | $329,054 to $535,940 | no, 180 days | 0 | 0 | 0 | none |
| cw | 2 | ordinary | 471 to 538 | 7 natural | 38,678 kg | $78,000 to $106,902 | $329,054 to $535,425 | no, 180 days | 0 | 0 | 50 | none |
| wv | 1 | absent | 252 to 307 | 4 natural | 27,445 kg | $43,000 to $37,504 | $177,929 to $309,799 | no, 180 days | 0 | 1 | 0 | none |
| wv | 1 | careless | 252 to 307 | 4 natural | 27,445 kg | $43,000 to $37,320 | $177,929 to $309,614 | no, 180 days | 0 | 0 | 0 | none |
| wv | 1 | ordinary | 252 to 257 | 4 natural | 26,005 kg | $43,000 to $87,236 | $177,929 to $306,814 | no, 180 days | 0 | 0 | 25 | none |
| wv | 2 | absent | 250 to 307 | 4 natural, 1 orphaned | 27,976 kg | $43,000 to $37,504 | $176,242 to $302,798 | no, 180 days | 0 | 1 | 0 | none |
| wv | 2 | careless | 250 to 307 | 4 natural, 1 orphaned | 27,976 kg | $43,000 to $37,311 | $176,242 to $302,605 | no, 180 days | 0 | 0 | 0 | none |
| wv | 2 | ordinary | 250 to 260 | 4 natural | 25,442 kg | $43,000 to $81,629 | $176,242 to $297,786 | no, 180 days | 0 | 0 | 50 | none |

What the table shows, as facts:

- No run ended early: no farm reached the bank's limit or was eaten out in 180 days, for any player. Every run kept all 180 days.
- No mob was on ground with no water at the end of any day, in any run. Deaths were natural causes and orphaned calves only. None was from no water or poor condition.
- The absent and careless players ended with the same head, deaths and live weight gained in every run. Their cash differs by $184 to $714 (the absent player's is higher), and net worth differs by about the same. It is the cost of marking calves, the only job the careless player did.
- The ordinary player's plans moved: 25 plan moves in each seed 1 run and 50 in each seed 2 run, and no plan was waiting at the end. It had no things to do left. The absent player had one (calves to mark).
- The ordinary player sold steers over 300 kg on sale days, so in every run its head is lower and its cash higher than the others'. Its net worth at the end differs from the absent player's by -1.66% to +0.34% across the eight farms (-$5,012 to +$3,292); the two Western Victoria farms are the lowest, at -0.96% and -1.66%.
- Live weight gained is the cattle step's total for the 180 days (birth weights are added). Net worth is the engine's own sum (cash, stock at today's price and infrastructure in place).

The play test asserts only what must hold: nothing throws, every figure on the farm is finite, no mob shares a paddock with another and no animal is in two mobs or on its way as well, the farm has run all 180 days or the game ended with a reason, and the same run gives the same result again. It also holds a floor against a broken run (some head left at the end, some live weight gained, plan moves made by the ordinary player and none by the others). That floor is a check on the engine, not a judgement of any player. It does not assert who does well.

#### Why nobody went under in 180 days

Only these reasons are supported by the runs, and whether they matter is for Claudia to judge:

- Every run starts on 1 September, so the 180 days run to the end of February. In three of the four districts that holds no winter and no dry season.
- A running farm starts with a herd at 35 to 65% of the district's carrying capacity (`START_HERD_SHARE`), which leaves room before the feed runs short.
- There are only two seeds for each district, so two farms and two sets of seasons.

A longer run that goes through a dry season, with more seeds, would test it harder.

### Earlier checks (build sessions, older model versions)

- **v1, after the intake tune (260 ha, 25–60 steers):**
  - Central Qld: no lick ~74 kg in a wet year; with lick 129 kg (60 head).
  - Overstock test: 265 steers in one Central Qld paddock ran it to 712 kg/ha with 77% cover and weight loss. 30 days in the lot cost $31.2k at 1.35 kg/day.
- **v9 (ground-cover fix):** 24 months ungrazed kept cover at ~100% (it had dropped to 59% visually before). Central Qld no lick 61, lick 117; Western Vic 173; Tablelands 105.
- **v10 (rankness):** first run gave Central Qld no lick −5 and lick 87. After softening:
  - Central Qld no lick 20–22, lick 73; Tablelands 88; Western Vic 156; Central West 114; Top End lick 43.
  - Sward heights: Tablelands day 219 at 35–39 cm (52% green); Central Qld rank paddocks 42–45 cm; Western Vic rank paddocks 40 cm (24% green).
- **v11 breeding:** 40 cows and 1 bull at CS 3.8 gave 15 in calf after 3 weeks, 28 after 6, and a preg test of 35/40 (88%, ~95% expected). Other tests: 73% at CS 3.3 (91% expected), 57% at CS 2.4 (67% expected). Weaning weights 148–249 kg at about 9 months.
- **v12, established medium farms, one year:** Central Qld 118 kg; Tablelands 99; Western Vic 182; Central West 131; Top End 40 kg with 161 deaths. Speed: Top End 4,244 head at ~3.9 ms/day.
- **v13 crops:** steers on oats ME 10.7, CP 18, 1.47 kg/day. Oats grazed after lock-up dropped to 1.98 t/ha. Top End mixed farm: 9.6% deaths, which led to the v14 tuning.
- **v14 Top End fixes:**
  - Before: 18.3% deaths in an average season with a September start.
  - After: 50,000 ha 2.0–4.7% deaths and 24–54 kg; 15,000 ha 2.6%; Central Qld ~2%, 124–130 kg; Tablelands 1.6%, 100 kg; Western Vic 1.5%, 186 kg; Central West 1.8%, 123 kg.
  - A July drought (0.5) with no action: 17.9% deaths, kept on purpose.
- **v15 layout:**
  - First Top End established runs: 78%, 61%, 2.2%, 7.7%, 2.0% deaths. The cause was 2 waters per 14,000–20,000 ha paddock, with cattle 3.3–4.2 km out.
  - After the waters fix: 1.9 / 2.7 / 1.8 / **19.1** / 3.6 / 1.8%. The 19.1% run followed a failed run-up season, which led to the 0.85 spin-up floor. That floor wasn't re-tested until the 13 Nov 2026 run above.
- **Other checks to keep:**
  - 40 random farms: every paddock had a gate.
  - No water: all dead on day 4.
  - Plan test: 20 days, 16 moves, 8 rounds, 61 t DM, 0.54 kg/head/day.

More detail on what was tested and changed is in [LESSONS.md](LESSONS.md) and [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md).
