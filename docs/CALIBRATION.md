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
