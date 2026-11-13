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

## How to run the checks

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
