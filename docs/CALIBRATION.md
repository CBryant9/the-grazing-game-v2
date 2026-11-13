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

### How a benchmark is judged

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
| Central West NSW (9.8, 6.9) | 2.80 / 2.52 / 2.24 | 1.65 / 1.48 / 1.32 |
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
| **Peak green digestibility 0.70 to 0.69, 0.68, 0.67, 0.66** | **142, 129, 115, 102** | Nothing else |

Less winter or frosted feed did not move the year, because the steers made it up in spring. Less growth lowered carrying capacity before it lowered the gain enough. Only peak digestibility moved the year without moving anything else. 0.68 is the smallest step that puts the average year inside the band.

**Established herds.** A running medium farm on medium difficulty, left alone for a year, seeds 1 to 8, September and May starts. Deaths are over all the herds together, with the lowest and highest single herd in brackets.

| District | Head at the start | Deaths, average year | Deaths, random seasons, September start | Gain a head, September start | Gain a head, May start | In calf at preg tests | Preg tests against the expected rate |
|---|---|---|---|---|---|---|---|
| Central Qld (on lick) | 629 to 938 | 2.4% (1.5 to 3.0) | 2.4% (1.5 to 3.0) | 130 kg | 150 kg | 91% | 4.1 points over |
| Northern Tablelands | 216 to 323 | 2.6% (0.9 to 4.1) | 2.6% (0.9 to 4.1) | 97 kg | 135 kg | 89% | 5.5 points over |
| Central West NSW | 333 to 496 | 2.4% (1.2 to 3.4) | 2.4% (1.2 to 3.1) | 123 kg | 135 kg | 91% | 3.4 points over |
| Western Victoria | 178 to 265 | 2.6% (1.1 to 3.6) | 2.6% (1.1 to 3.6) | 177 kg | 171 kg | 92% | 2.7 points over |

- Deaths pass in every district (1.5 to 3.6%). A single small herd can sit outside the range on a handful of deaths.
- Central West herd gain before the tune was 144 kg (September start) and 161 kg (May start). Deaths before were 2.3 to 2.4%.
- **Recorded, not failed:** with random seasons and a May start, Northern Tablelands herds that drew a drought from 1 July lost 13 to 20% with no destocking (seen on 12 seeds before the tune; the Tablelands figures did not change). That is the intended result of doing nothing in a drought.

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

The benchmark (ME about 10.7, CP about 18%, about 1.4 kg a day) is the fortnight straight after lock-up. That is when the MVP check behind it was made. Passes.

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

**Speed:** 1.96 ms a simulated day with 4,895 head and 411 calves in three mobs, on its own on the build PC (`pnpm test:speed`). Target under 5 ms. Passes.

**CHECK, for Claudia:**

1. **Central Qld with lick is 1 kg over its band in the average year** (131 against 75 to 130). It is inside over the long run of seasons (126). Nothing was tuned. The test records the gap and fails if it grows past 5 kg or goes away.
2. **The bands are narrower than the spread between blocks.** In the average year single blocks ran 91 to 118 kg on the Tablelands (band 90 to 105), 119 to 139 in Central West (115 to 130) and 171 to 195 in Western Victoria (155 to 185). The tests hold the average over twelve blocks to the band. Is that how the bands are meant, or should every block in an average year be inside?
3. **Three districts sit at the top of their bands in the average year** (Tablelands 103, Central West 128, Western Victoria 182) and in the middle or below over the long run (93, 109, 162). Central West's long run is under its band because three of the twelve years drew a drought (48 to 81 kg). If the bands are meant for the long run and not the average year, Central West wants about 0.69, not 0.68.
4. **Barley is 2.88 t/ha in the average year** against "about 2.5". Nothing was changed. The test allows 2.0 to 3.0.
5. Still open from 1.2a: heavier dry stock eat under the intake ranges, and a 9-week joining at CS 3 exactly gives 84.0%.

**Not in this milestone:** several moves a day at whole-farm level and a mob walked a long way (both need grazing plans and walking times, milestone 1.5; several moves a day is tested against the MVP at mob level in `cattle/simMob.test.ts`). Real dry and wet years (1.4). The 180-day run from BUILD_PLAN section 3.

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
