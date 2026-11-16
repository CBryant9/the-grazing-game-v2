# Grass quality review: what the paddocks offer, against real country

An evidence review for Claudia to rule on. 15 Nov 2026, branch `m2.6-grass-quality-review` (from `m2.1-hands-and-contractors`, engine 0.13.0).

**Nothing in the model or the tests was changed.** Every game figure below was measured with throwaway probes run outside the repo, on a copy of the sheep branch (`m2.3-sheep-model`). That branch's grass and cattle code is the same as this branch's (the only difference is where `DSE_PER_AE` is defined). The copy reproduced the steer benchmark figures logged in CALIBRATION.md exactly (41, 131, 103, 128 and 182 kg a head in the average year), so the probe runs are the game's own numbers. The candidate fixes in part 5 were tried only in that copy, behind probe switches.

## Why this review

Three pieces of work ran into the grass model and none was allowed to change it, because it is the calibrated core:

1. **Sheep.** Tablelands ewes fall from CS 3 to about 1.4 by lambing at any stocking rate, even at 30% of carrying capacity. Dry cows on the same block also lose condition.
2. **Carrying capacity.** The game gives 3.5 DSE/ha on Tablelands native and 5.5 to 7.7 on sown pasture, against published 5 and 12 to 23.
3. **Calves** grow slower than published, and the herd paddocks run at ME 7 to 8.

Also noted: the diet does not get better when feed is plentiful.

## Contents

1. For Claudia: the short version
2. What the model offers (measured)
3. What real country offers (sourced)
4. Side by side, and which rule is responsible
5. What each candidate fix would do (tried, not made)
6. For the builder
7. What I could not source or measure
8. Sources

---

## 1. For Claudia: the short version

### What looks wrong

- **Tablelands winter.** In July and August a Tablelands native paddock in the game holds 35 to 55 kg DM/ha of green and about 900 to 1,000 kg DM/ha of dead feed. The stock eat almost nothing but dead feed (ME 7.0, CP 5.2%). A dry cow eats 1.0 to 1.1% of her live weight and is 11 to 14 MJ a day short. A dry ewe eats 1.3% and is about 3 MJ short. That is why the ewes reach lambing at CS 1.4 whatever the stocking rate.
- **Stock eat too little of poor feed.** On dry feed at 50% digestibility the game's cows eat 1.0 to 1.2% of live weight. Cows measured in Central Queensland on that quality of diet ate 1.4 to 1.5%. The game's own benchmark says 1.5 to 2%.
- **Carrying capacity is low,** but that is not a grass quality problem. The game's rule only lets stock eat about 23% of the year's growth on the Tablelands. The published 5 DSE/ha on unimproved Tablelands native means about a third of the growth is eaten, and the published 12 to 17.5 DSE/ha on sown pasture means about half. The game also uses the same share for sown pasture as for native, and a paddock's carrying capacity ignores what is sown in it.
- **Calves** grow 0.34 to 0.58 kg a day to 150 days old. The grass changes tried here move that by only a few hundredths. The calf figure is held mostly by the milk rule, not the grass.

### What the evidence says

- **The game's dead feed is not too poor.** It is 50% digestible all year (51% in Western Victoria). PROGRAZE assumes dead pasture is 47% digestible (45% for tropical pasture). Agriculture Victoria says dry perennial pasture starts near 60% and falls about 5 points a month to as low as 35%. Central Queensland cows on dry-season native pasture selected a diet of 49 to 52% digestibility. So raising dead feed quality is not supported. If anything the game's 50% is on the generous side, and it was itself tuned (LESSONS row 1: raised from 0.46 to 0.50 to fit the steer bands).
- **Central Queensland is right on quality.** The game's CQ diet (wet season about 61% digestible and 9% CP, late dry 50% and 4.9% CP) matches the measured diets of cows on CQ native pasture (60 to 62% and 8.4% in the wet, 49 to 52% and 3.8 to 4.9% in the dry) almost exactly.
- **Tablelands natives are not all red grass.** The game's Tablelands growth curve matches PROGRAZE's curve for red grass pasture (1 kg DM/ha a day through winter). PROGRAZE's curve for microlaena (weeping grass) with clover grows 3, 3 and 7 kg a day in June, July and August. Microlaena and wallaby grass are winter-active, year-long green natives. The game's district list names weeping rice grass and wallaby grass, but grows them as red grass. The game also treats a cold winter as if it were a drought: green feed hays off at nearly the summer-drought rate, with frost on top, so most autumn green is gone within six weeks.
- **Diet selection.** Graziers and the CQ researchers say stock select a better diet than the sward average. I found no published number for how much better. The game's rule gives almost no selection when green is short, which is the case that matters in winter, and the one tried here did not help winter at all.

### What I recommend

A package of three changes, each to a sourced figure, made one at a time with the benchmarks re-run after each:

1. **Let stock eat more of poor feed** (intake at 50% digestibility from about 1.1% to about 1.4% of live weight for a dry cow), to match the measured intake.
2. **Set dead feed to PROGRAZE's 47% (45% in Central Queensland)**, from the tuned 50%, and **slow the breakdown of standing dead feed in summer** to PROGRAZE's "about half is gone by autumn".
3. **Give the Tablelands native pasture its winter-active natives:** winter growth from PROGRAZE's microlaena curve and half the frost loss.

Then, as a **separate decision, carrying capacity:** raise the share of growth that can be eaten so the Tablelands native reads about 5 DSE/ha, give sown pasture its own share and its own growth in the paddock figure, and add the published DSE/ha figures as benchmarks.

### What it would change in the game you play

Tried together in the copy (variant CEFG in part 5):

- **Central Queensland and Western Victoria steers stay in their bands** (35 and 173 kg, Central Qld with lick 133 as now). Changes 1 and 2 pull in opposite directions and cancel out there.
- **Tablelands ewes reach lambing at about CS 1.95 instead of 1.4,** their deaths fall from 15 to 18% to about 8%, and lambs marked rise from about 50 to 62 per 100 ewes. They still lose condition through winter on native pasture alone, which is what the published green feed targets say should happen without a sown paddock or supplement.
- **Tablelands cows lose about a quarter as much condition from June to September** (3.13 to 2.91, against 2.99 to 2.16 now).
- **Tablelands steers gain 23 kg a year more (126) and Central West steers 15 kg more (143)**, above their current bands.
- At the published 5 DSE/ha, Tablelands dry cows bottom out at CS 2.4 in September instead of 1.8.
- **Two things go the other way.** Western Victoria ewes come into lambing a little lower (CS 2.72 against 2.95, still just inside the sheep test's window of 2.7 to 3.3), and calves in Western Victoria and the Central West grow 0.03 to 0.09 kg a day slower, because dead feed is poorer.

### What you need to rule on

1. **The steer bands.** None of them has an outside source (CALIBRATION.md gives a reason for each, not a source). The recommended package puts Tablelands steers at 126 and Central West at 143, over bands of 90 to 105 and 115 to 130. Keep the bands and tune something else, or replace them with sourced figures? (I could not find sourced steer gains by district in this review.)
2. **Tablelands native pasture.** Should "native" on the Tablelands mean a red grass pasture with winter-active natives through it (microlaena, wallaby grass), as the district list says? Or pure red grass, with winter green only on sown paddocks?
3. **Intake on poor feed.** Accept the measured Central Queensland intake (1.4 to 1.5% of live weight at 49 to 51% digestibility) as the target for every district?
4. **Carrying capacity.** Accept the published 5 DSE/ha for unimproved Tablelands native and 12 to 17.5 for sown as the targets, and raise the game's safe-use share to fit?
5. **Central West peak digestibility.** It was tuned from 0.70 to 0.68 to fit the steer band. With the package in, should it go back toward 0.70, or stay?
6. **Calves.** Look at the milk rule next (a separate piece of work), since the grass is not what holds them back?

---

## 2. What the model offers (measured)

### How it was measured

- **The block.** The steer benchmark block: 260 ha, one water, scratch start, the game's own run-up of the pasture. Each run is one year from 1 April. The tables show calendar months.
- **The stock.** Dry cows (about 440 kg) set-stocked at 30%, 60% and 100% of the game's carrying capacity for that pasture. These are the light, benchmark and heavy rates.
- **Who eats what.** Every day the probe asked the game what four animals would eat on that paddock: a 450 kg dry cow at CS 3, the same cow milking a 60-day-old calf, a 300 kg growing steer, and a 50 kg dry Merino ewe (the sheep branch's rules). In the game all cattle in a paddock eat the same diet; only how much they eat differs. Energy balance is ME eaten minus what the animal needs (maintenance, walking, milk), in MJ a day, as the game works it.
- **Sown pasture** was made established (sown long ago) across the whole paddock and stocked at 60% of a carrying capacity worked from the sown pasture's own growth curve (the game's rule, with the district's safe-use share).
- **Real years:** the dry and wet years the real-year steer tests name for each district, at the benchmark rate.
- **Seeds:** seed 1 shown. Seed 2 differs in level (its block grows 10% less) but not in pattern.
- "Grown" is the feed the paddock actually grew in the year under that grazing. The district curve that the carrying capacity rule uses is in part 4.

### Native pasture at the benchmark stocking (60%), average year

**Central Queensland, native pasture**

| Month | Green kg DM/ha | Dead kg DM/ha | DMD green % | DMD dead % | Diet DMD % | Diet ME | Diet CP % | Dry cow intake % LW | Dry cow MJ/day | Lactating cow MJ/day | 300 kg steer kg/day | Dry ewe intake % LW | Dry ewe MJ/day |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Jan | 1354 | 479 | 63 | 50 | 62 | 8.9 | 9.2 | 1.93 | 30 | 14 | 0.70 | 2.20 | 1.9 |
| Feb | 2002 | 449 | 61 | 50 | 61 | 8.8 | 8.7 | 1.96 | 30 | 16 | 0.70 | 2.18 | 1.6 |
| Mar | 2230 | 627 | 59 | 50 | 58 | 8.3 | 7.6 | 1.86 | 23 | 12 | 0.52 | 2.05 | 0.5 |
| Apr | 1071 | 821 | 57 | 49 | 56 | 8.0 | 6.9 | 1.68 | 13 | 4 | 0.31 | 1.93 | -0.2 |
| May | 637 | 1165 | 56 | 49 | 54 | 7.6 | 6.0 | 1.50 | 4 | -2 | 0.11 | 1.77 | -1.2 |
| Jun | 235 | 1369 | 55 | 50 | 52 | 7.2 | 5.3 | 1.32 | -4 | -10 | -0.12 | 1.59 | -2.2 |
| Jul | 59 | 1318 | 55 | 50 | 50 | 6.9 | 4.9 | 1.17 | -11 | -18 | -0.33 | 1.41 | -3.1 |
| Aug | 20 | 1143 | 56 | 50 | 50 | 6.9 | 4.9 | 1.10 | -13 | -21 | -0.41 | 1.32 | -3.5 |
| Sep | 22 | 958 | 60 | 50 | 50 | 6.9 | 5.0 | 1.05 | -15 | -23 | -0.47 | 1.29 | -3.6 |
| Oct | 63 | 785 | 63 | 50 | 52 | 7.2 | 5.5 | 1.06 | -13 | -21 | -0.42 | 1.45 | -2.6 |
| Nov | 221 | 639 | 64 | 50 | 58 | 8.2 | 7.8 | 1.37 | 4 | -11 | 0.09 | 1.81 | -0.2 |
| Dec | 656 | 540 | 64 | 50 | 61 | 8.8 | 9.1 | 1.70 | 21 | 3 | 0.48 | 2.08 | 1.3 |

**Northern Tablelands, native pasture**

| Month | Green kg DM/ha | Dead kg DM/ha | DMD green % | DMD dead % | Diet DMD % | Diet ME | Diet CP % | Dry cow intake % LW | Dry cow MJ/day | Lactating cow MJ/day | 300 kg steer kg/day | Dry ewe intake % LW | Dry ewe MJ/day |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Jan | 1667 | 347 | 65 | 50 | 64 | 9.3 | 11.3 | 2.07 | 40 | 25 | 0.91 | 2.34 | 2.9 |
| Feb | 1797 | 464 | 62 | 50 | 62 | 8.9 | 10.2 | 1.98 | 32 | 17 | 0.74 | 2.22 | 1.9 |
| Mar | 1630 | 727 | 60 | 50 | 59 | 8.5 | 9.2 | 1.89 | 25 | 13 | 0.59 | 2.12 | 1.1 |
| Apr | 807 | 789 | 61 | 50 | 59 | 8.4 | 8.9 | 1.74 | 18 | 6 | 0.43 | 2.04 | 0.7 |
| May | 439 | 1046 | 61 | 50 | 57 | 8.0 | 8.0 | 1.62 | 12 | 1 | 0.28 | 1.97 | 0.2 |
| Jun | 157 | 1129 | 61 | 50 | 54 | 7.5 | 6.6 | 1.39 | 0 | -7 | 0.00 | 1.80 | -0.9 |
| Jul | 55 | 1030 | 61 | 50 | 51 | 7.0 | 5.3 | 1.13 | -11 | -19 | -0.36 | 1.48 | -2.7 |
| Aug | 36 | 875 | 64 | 50 | 50 | 7.0 | 5.2 | 1.04 | -14 | -23 | -0.47 | 1.34 | -3.3 |
| Sep | 93 | 705 | 67 | 50 | 54 | 7.6 | 6.8 | 1.16 | -7 | -18 | -0.23 | 1.65 | -1.2 |
| Oct | 300 | 544 | 68 | 50 | 62 | 9.0 | 10.4 | 1.51 | 14 | -6 | 0.33 | 1.98 | 1.3 |
| Nov | 736 | 423 | 68 | 50 | 65 | 9.5 | 11.8 | 1.85 | 32 | 15 | 0.73 | 2.25 | 2.9 |
| Dec | 1269 | 346 | 67 | 50 | 65 | 9.5 | 11.9 | 2.04 | 41 | 26 | 0.93 | 2.36 | 3.3 |

**Central West NSW, native pasture**

| Month | Green kg DM/ha | Dead kg DM/ha | DMD green % | DMD dead % | Diet DMD % | Diet ME | Diet CP % | Dry cow intake % LW | Dry cow MJ/day | Lactating cow MJ/day | 300 kg steer kg/day | Dry ewe intake % LW | Dry ewe MJ/day |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Jan | 866 | 911 | 59 | 50 | 57 | 8.1 | 9.0 | 1.72 | 16 | 5 | 0.38 | 2.00 | 0.3 |
| Feb | 687 | 1043 | 59 | 50 | 56 | 8.0 | 8.5 | 1.67 | 13 | 4 | 0.31 | 1.96 | -0.0 |
| Mar | 625 | 1059 | 59 | 50 | 57 | 8.0 | 8.6 | 1.67 | 13 | 3 | 0.32 | 1.97 | 0.1 |
| Apr | 453 | 748 | 61 | 50 | 58 | 8.3 | 9.3 | 1.58 | 12 | -2 | 0.28 | 1.95 | 0.3 |
| May | 506 | 723 | 62 | 50 | 59 | 8.5 | 9.8 | 1.63 | 15 | 0 | 0.36 | 2.00 | 0.7 |
| Jun | 397 | 791 | 62 | 50 | 58 | 8.3 | 9.2 | 1.57 | 12 | -2 | 0.28 | 1.95 | 0.4 |
| Jul | 255 | 836 | 62 | 50 | 57 | 8.0 | 8.4 | 1.46 | 6 | -6 | 0.15 | 1.86 | -0.2 |
| Aug | 223 | 789 | 63 | 50 | 57 | 8.1 | 8.6 | 1.44 | 5 | -7 | 0.14 | 1.86 | -0.1 |
| Sep | 414 | 660 | 65 | 50 | 60 | 8.7 | 10.3 | 1.61 | 16 | -1 | 0.37 | 2.02 | 1.1 |
| Oct | 862 | 509 | 65 | 50 | 63 | 9.1 | 11.5 | 1.85 | 28 | 10 | 0.65 | 2.20 | 2.1 |
| Nov | 1174 | 492 | 63 | 50 | 62 | 9.0 | 11.2 | 1.91 | 30 | 13 | 0.70 | 2.21 | 2.0 |
| Dec | 1103 | 676 | 61 | 50 | 59 | 8.5 | 10.0 | 1.82 | 23 | 9 | 0.52 | 2.09 | 1.0 |

**Western Victoria, native pasture**

| Month | Green kg DM/ha | Dead kg DM/ha | DMD green % | DMD dead % | Diet DMD % | Diet ME | Diet CP % | Dry cow intake % LW | Dry cow MJ/day | Lactating cow MJ/day | 300 kg steer kg/day | Dry ewe intake % LW | Dry ewe MJ/day |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Jan | 867 | 1597 | 61 | 51 | 58 | 8.3 | 9.2 | 1.83 | 21 | 10 | 0.48 | 2.10 | 0.9 |
| Feb | 381 | 1813 | 60 | 51 | 55 | 7.8 | 7.5 | 1.67 | 11 | 4 | 0.27 | 1.96 | -0.1 |
| Mar | 200 | 1716 | 62 | 51 | 54 | 7.6 | 7.0 | 1.60 | 8 | 2 | 0.19 | 1.93 | -0.3 |
| Apr | 125 | 1078 | 67 | 51 | 55 | 7.8 | 7.2 | 1.43 | 3 | -6 | 0.08 | 1.91 | 0.0 |
| May | 253 | 862 | 69 | 51 | 61 | 8.7 | 10.2 | 1.64 | 17 | 0 | 0.41 | 2.12 | 1.9 |
| Jun | 327 | 743 | 69 | 51 | 63 | 9.1 | 11.2 | 1.69 | 22 | 2 | 0.51 | 2.17 | 2.3 |
| Jul | 321 | 679 | 69 | 51 | 63 | 9.1 | 11.2 | 1.65 | 20 | 0 | 0.47 | 2.12 | 2.1 |
| Aug | 402 | 615 | 69 | 51 | 64 | 9.3 | 12.0 | 1.71 | 25 | 6 | 0.57 | 2.18 | 2.6 |
| Sep | 829 | 540 | 69 | 51 | 67 | 9.8 | 13.4 | 2.01 | 41 | 27 | 0.94 | 2.41 | 4.0 |
| Oct | 1572 | 465 | 69 | 51 | 68 | 9.9 | 13.9 | 2.23 | 52 | 40 | 1.19 | 2.52 | 4.6 |
| Nov | 2002 | 546 | 67 | 51 | 66 | 9.7 | 13.2 | 2.22 | 50 | 37 | 1.13 | 2.47 | 4.0 |
| Dec | 1633 | 1019 | 64 | 51 | 62 | 9.0 | 11.5 | 2.05 | 36 | 21 | 0.83 | 2.30 | 2.5 |

### Sown pastures at 60%, average year (three examples)

**Northern Tablelands, phalaris and sub clover**

| Month | Green kg DM/ha | Dead kg DM/ha | DMD green % | DMD dead % | Diet DMD % | Diet ME | Diet CP % | Dry cow intake % LW | Dry cow MJ/day | Lactating cow MJ/day | 300 kg steer kg/day | Dry ewe intake % LW | Dry ewe MJ/day |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Jan | 2327 | 697 | 65 | 50 | 64 | 9.3 | 15.4 | 2.15 | 43 | 29 | 0.98 | 2.37 | 3.1 |
| Feb | 2059 | 870 | 62 | 49 | 61 | 8.8 | 14.1 | 2.00 | 32 | 18 | 0.74 | 2.22 | 1.9 |
| Mar | 1591 | 1168 | 61 | 49 | 59 | 8.5 | 13.0 | 1.90 | 25 | 13 | 0.58 | 2.13 | 1.1 |
| Apr | 891 | 778 | 66 | 50 | 63 | 9.1 | 14.7 | 1.95 | 33 | 16 | 0.76 | 2.30 | 2.7 |
| May | 683 | 1063 | 67 | 50 | 63 | 9.1 | 14.3 | 1.95 | 32 | 15 | 0.74 | 2.33 | 3.0 |
| Jun | 381 | 1249 | 68 | 50 | 60 | 8.6 | 12.7 | 1.80 | 23 | 8 | 0.53 | 2.24 | 2.3 |
| Jul | 185 | 1212 | 69 | 50 | 57 | 8.1 | 11.0 | 1.61 | 12 | 0 | 0.28 | 2.08 | 1.1 |
| Aug | 165 | 1060 | 71 | 50 | 58 | 8.2 | 11.3 | 1.58 | 12 | -1 | 0.28 | 2.09 | 1.4 |
| Sep | 460 | 910 | 72 | 50 | 64 | 9.4 | 15.0 | 1.92 | 34 | 18 | 0.78 | 2.41 | 4.0 |
| Oct | 1197 | 818 | 72 | 50 | 68 | 10.1 | 17.2 | 2.26 | 55 | 44 | 1.26 | 2.62 | 5.5 |
| Nov | 1906 | 751 | 70 | 50 | 69 | 10.1 | 17.3 | 2.34 | 59 | 49 | 1.34 | 2.62 | 5.4 |
| Dec | 2292 | 674 | 68 | 50 | 67 | 9.8 | 16.7 | 2.28 | 54 | 42 | 1.23 | 2.53 | 4.5 |

**Western Victoria, perennial ryegrass and white clover**

| Month | Green kg DM/ha | Dead kg DM/ha | DMD green % | DMD dead % | Diet DMD % | Diet ME | Diet CP % | Dry cow intake % LW | Dry cow MJ/day | Lactating cow MJ/day | 300 kg steer kg/day | Dry ewe intake % LW | Dry ewe MJ/day |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Jan | 1159 | 2124 | 66 | 51 | 61 | 8.8 | 14.7 | 2.02 | 34 | 19 | 0.77 | 2.33 | 2.8 |
| Feb | 523 | 2386 | 66 | 51 | 58 | 8.2 | 12.1 | 1.84 | 21 | 11 | 0.49 | 2.18 | 1.5 |
| Mar | 321 | 2249 | 68 | 51 | 57 | 8.1 | 11.4 | 1.79 | 18 | 9 | 0.43 | 2.17 | 1.5 |
| Apr | 193 | 1045 | 73 | 51 | 60 | 8.6 | 12.7 | 1.66 | 17 | 3 | 0.41 | 2.19 | 2.3 |
| May | 445 | 817 | 75 | 51 | 67 | 9.9 | 17.3 | 1.98 | 41 | 26 | 0.94 | 2.50 | 5.1 |
| Jun | 539 | 724 | 74 | 51 | 69 | 10.1 | 18.2 | 2.04 | 46 | 32 | 1.04 | 2.53 | 5.4 |
| Jul | 502 | 689 | 74 | 51 | 68 | 10.0 | 17.9 | 1.99 | 43 | 28 | 0.97 | 2.49 | 5.1 |
| Aug | 666 | 657 | 74 | 51 | 70 | 10.3 | 18.8 | 2.12 | 51 | 38 | 1.16 | 2.56 | 5.6 |
| Sep | 1328 | 624 | 74 | 51 | 72 | 10.7 | 20.2 | 2.39 | 67 | 59 | 1.52 | 2.68 | 6.5 |
| Oct | 2292 | 573 | 74 | 51 | 72 | 10.7 | 20.6 | 2.49 | 73 | 66 | 1.60 | 2.72 | 6.7 |
| Nov | 2775 | 713 | 72 | 51 | 71 | 10.4 | 19.9 | 2.47 | 69 | 61 | 1.55 | 2.71 | 6.2 |
| Dec | 2198 | 1369 | 69 | 51 | 67 | 9.7 | 17.7 | 2.27 | 53 | 41 | 1.20 | 2.54 | 4.6 |

**Central Queensland, buffel grass and butterfly pea**

| Month | Green kg DM/ha | Dead kg DM/ha | DMD green % | DMD dead % | Diet DMD % | Diet ME | Diet CP % | Dry cow intake % LW | Dry cow MJ/day | Lactating cow MJ/day | 300 kg steer kg/day | Dry ewe intake % LW | Dry ewe MJ/day |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Jan | 2184 | 611 | 61 | 50 | 60 | 8.6 | 10.1 | 1.93 | 28 | 14 | 0.63 | 2.14 | 1.2 |
| Feb | 3015 | 613 | 59 | 50 | 58 | 8.4 | 9.5 | 1.89 | 24 | 13 | 0.55 | 2.07 | 0.6 |
| Mar | 3230 | 915 | 56 | 50 | 56 | 7.9 | 8.3 | 1.76 | 15 | 8 | 0.36 | 1.92 | -0.5 |
| Apr | 1151 | 821 | 56 | 49 | 55 | 7.8 | 8.2 | 1.65 | 11 | 3 | 0.26 | 1.88 | -0.7 |
| May | 765 | 1197 | 55 | 49 | 53 | 7.5 | 7.5 | 1.57 | 6 | 1 | 0.15 | 1.80 | -1.2 |
| Jun | 320 | 1451 | 55 | 50 | 52 | 7.2 | 6.8 | 1.46 | 1 | -4 | 0.03 | 1.72 | -1.7 |
| Jul | 96 | 1410 | 55 | 50 | 50 | 7.0 | 6.3 | 1.31 | -6 | -12 | -0.17 | 1.60 | -2.3 |
| Aug | 41 | 1204 | 57 | 50 | 50 | 6.9 | 6.1 | 1.21 | -9 | -17 | -0.29 | 1.46 | -2.9 |
| Sep | 49 | 983 | 60 | 50 | 51 | 7.0 | 6.2 | 1.16 | -11 | -18 | -0.34 | 1.47 | -2.8 |
| Oct | 122 | 792 | 62 | 50 | 54 | 7.5 | 7.5 | 1.25 | -5 | -13 | -0.14 | 1.66 | -1.4 |
| Nov | 434 | 670 | 62 | 50 | 59 | 8.4 | 9.6 | 1.55 | 11 | -3 | 0.27 | 1.93 | 0.3 |
| Dec | 1209 | 622 | 62 | 50 | 60 | 8.7 | 10.4 | 1.86 | 25 | 11 | 0.58 | 2.13 | 1.3 |

### Every case, in one line each

The poorest month is the month with the lowest diet ME. "300 kg steer, kg a year" adds up the gain the game forecasts each day for a 300 kg steer on that paddock (weight held at 300 kg), so it is a measure of the feed, not a steer benchmark.

| Case (pasture, stocking as % of the game's carrying capacity, real year) | Grown kg DM/ha/yr | Game carrying capacity DSE/ha | 300 kg steer, kg a year | Poorest month | Green kg DM/ha | Dead kg DM/ha | Diet DMD % | Diet ME | Diet CP % | Dry cow intake % LW | Dry cow MJ/day | Lactating cow MJ/day | Dry ewe intake % LW | Dry ewe MJ/day | Best month ME | Year average ME |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Central Qld native 30% | 3852 | 2.6 | 34 | Aug | 15 | 1340 | 50 | 6.8 | 4.8 | 1.14 | -12 | -20 | 1.33 | -3.5 | 8.8 | 7.7 |
| Central Qld native 60% | 4024 | 2.6 | 34 | Aug | 20 | 1143 | 50 | 6.9 | 4.9 | 1.10 | -13 | -21 | 1.32 | -3.5 | 8.9 | 7.8 |
| Central Qld native 100% | 4205 | 2.6 | 20 | Aug | 25 | 876 | 50 | 6.9 | 5.0 | 1.01 | -16 | -24 | 1.26 | -3.7 | 9.0 | 7.9 |
| Central Qld buffel 60% | 6176 | 3.8 | 57 | Aug | 41 | 1204 | 50 | 6.9 | 6.1 | 1.21 | -9 | -17 | 1.46 | -2.9 | 8.7 | 7.7 |
| Central Qld leucaena 60% | 6251 | 4.1 | 193 | Aug | 107 | 1413 | 52 | 7.3 | 11.3 | 1.45 | 1 | -4 | 1.84 | -0.8 | 9.3 | 8.4 |
| Central Qld stylo 60% | 4170 | 2.7 | 87 | Aug | 20 | 1193 | 50 | 6.9 | 7.0 | 1.25 | -8 | -15 | 1.48 | -3.0 | 9.2 | 8.0 |
| Central Qld native 60% 2002 | 2623 | 2.6 | -89 | Aug | 16 | 726 | 50 | 6.9 | 5.0 | 0.92 | -19 | -28 | 1.15 | -4.1 | 9.1 | 7.6 |
| Central Qld native 60% 2010 | 4906 | 2.6 | 63 | Aug | 17 | 1552 | 50 | 6.8 | 4.8 | 1.19 | -10 | -18 | 1.37 | -3.4 | 8.9 | 7.8 |
| Tablelands native 30% | 3758 | 3.5 | 114 | Aug | 30 | 1079 | 50 | 6.9 | 5.1 | 1.10 | -13 | -21 | 1.36 | -3.3 | 9.4 | 8.2 |
| Tablelands native 60% | 3989 | 3.5 | 117 | Aug | 36 | 875 | 50 | 7.0 | 5.2 | 1.04 | -14 | -23 | 1.34 | -3.3 | 9.5 | 8.4 |
| Tablelands native 100% | 4268 | 3.5 | 105 | Aug | 39 | 614 | 51 | 7.0 | 5.4 | 0.89 | -19 | -28 | 1.23 | -3.6 | 9.7 | 8.5 |
| Tablelands phalaris 60% | 6154 | 5.5 | 289 | Jul | 185 | 1212 | 57 | 8.1 | 11.0 | 1.61 | 12 | 0 | 2.08 | 1.1 | 10.1 | 9.1 |
| Tablelands ryegrass 60% | 6249 | 5.7 | 348 | Jul | 150 | 1119 | 57 | 8.1 | 11.4 | 1.57 | 10 | -1 | 2.10 | 1.4 | 10.6 | 9.5 |
| Tablelands lucerne 60% | 5268 | 4.7 | 154 | Jul | 60 | 927 | 51 | 7.1 | 12.6 | 1.20 | -9 | -16 | 1.54 | -2.3 | 9.6 | 8.5 |
| Tablelands multi-species 60% | 6518 | 6.0 | 338 | Jul | 164 | 1113 | 58 | 8.2 | 12.2 | 1.59 | 12 | -1 | 2.11 | 1.5 | 10.4 | 9.4 |
| Tablelands native 60% 2018 | 2851 | 3.5 | 58 | Aug | 19 | 619 | 50 | 6.9 | 5.1 | 0.85 | -21 | -31 | 1.11 | -4.2 | 9.6 | 8.3 |
| Tablelands native 60% 2020 | 4658 | 3.5 | 158 | Aug | 47 | 1238 | 50 | 7.0 | 5.2 | 1.19 | -10 | -17 | 1.48 | -2.7 | 9.5 | 8.4 |
| Central West native 30% | 3562 | 2.7 | 125 | Feb | 642 | 1224 | 55 | 7.7 | 7.7 | 1.62 | 9 | 2 | 1.88 | -0.6 | 8.9 | 8.2 |
| Central West native 60% | 3761 | 2.7 | 135 | Feb | 687 | 1043 | 56 | 8.0 | 8.5 | 1.67 | 13 | 4 | 1.96 | -0.0 | 9.1 | 8.4 |
| Central West native 100% | 3963 | 2.7 | 137 | Jul | 215 | 678 | 57 | 8.2 | 8.8 | 1.37 | 3 | -11 | 1.80 | -0.3 | 9.2 | 8.6 |
| Central West phalaris 60% | 6182 | 4.5 | 303 | Feb | 796 | 1838 | 58 | 8.2 | 11.9 | 1.82 | 20 | 10 | 2.12 | 1.0 | 10.1 | 9.2 |
| Central West lucerne 60% | 6745 | 5.1 | 202 | Jul | 168 | 661 | 57 | 8.1 | 15.7 | 1.32 | 1 | -13 | 1.77 | -0.4 | 9.7 | 8.9 |
| Central West multi-species 60% | 6603 | 4.9 | 361 | Mar | 991 | 1758 | 62 | 8.9 | 15.0 | 2.03 | 34 | 19 | 2.36 | 3.0 | 10.4 | 9.6 |
| Central West native 60% 2019 | 1975 | 2.7 | -85 | Aug | 48 | 589 | 51 | 7.0 | 5.4 | 0.88 | -19 | -29 | 1.20 | -3.7 | 9.2 | 8.1 |
| Central West native 60% 2016 | 4221 | 2.7 | 129 | Mar | 381 | 1398 | 53 | 7.4 | 6.7 | 1.48 | 2 | -4 | 1.76 | -1.4 | 9.2 | 8.2 |
| Western Vic native 30% | 4352 | 4.9 | 199 | Mar | 158 | 2076 | 52 | 7.3 | 6.0 | 1.47 | 1 | -3 | 1.80 | -1.2 | 9.7 | 8.6 |
| Western Vic native 60% | 4695 | 4.9 | 215 | Mar | 200 | 1716 | 54 | 7.6 | 7.0 | 1.60 | 8 | 2 | 1.93 | -0.3 | 9.9 | 8.8 |
| Western Vic native 100% | 5024 | 4.9 | 207 | Apr | 117 | 1032 | 55 | 7.8 | 7.2 | 1.41 | 2 | -7 | 1.90 | -0.0 | 10.1 | 9.1 |
| Western Vic phalaris 60% | 7007 | 7.1 | 306 | Mar | 289 | 2294 | 55 | 7.8 | 10.0 | 1.71 | 13 | 6 | 2.04 | 0.4 | 10.2 | 9.2 |
| Western Vic ryegrass 60% | 7292 | 7.7 | 368 | Mar | 321 | 2249 | 57 | 8.1 | 11.4 | 1.79 | 18 | 9 | 2.17 | 1.5 | 10.7 | 9.6 |
| Western Vic multi-species 60% | 7281 | 7.5 | 355 | Mar | 492 | 2274 | 59 | 8.4 | 12.8 | 1.88 | 24 | 12 | 2.25 | 2.1 | 10.6 | 9.6 |
| Western Vic native 60% 2006 | 3558 | 4.9 | 197 | Apr | 138 | 1054 | 56 | 7.8 | 7.5 | 1.44 | 4 | -6 | 1.92 | 0.1 | 9.7 | 8.9 |
| Western Vic native 60% 2016 | 5131 | 4.9 | 226 | Mar | 219 | 1933 | 54 | 7.6 | 6.8 | 1.60 | 7 | 2 | 1.91 | -0.4 | 9.9 | 8.9 |

### What the tables show

- **The winter diet is dead feed** in Central Queensland, on the Tablelands and in the Central West's dry years: 50 to 51% digestible, ME 6.9 to 7.0, CP 4.8 to 5.4%. Light stocking does not help. At 30% of carrying capacity the Tablelands paddock in August still has only 30 kg DM/ha green.
- **Even sown pasture on the Tablelands runs a winter gap.** Phalaris holds 165 to 185 kg DM/ha green in July and August under 1,000 to 1,200 kg dead, and the diet falls to ME 8.1.
- **The best diet on native pasture** is ME 8.8 to 9.0 in Central Queensland, 9.4 to 9.7 on the Tablelands, 8.9 to 9.2 in the Central West and 9.7 to 10.1 in Western Victoria. Green feed never reaches the district's top digestibility (`dmdMax`), because the leaf ages. Tablelands green is 60 to 68% digestible against a top of 70%.
- **Intake on dry feed** is 0.85 to 1.2% of live weight for a dry cow and 1.1 to 1.5% for a dry ewe, in the poorest month.
- **The paddock grows far less than the district curve** when grazed at these rates: 3,400 to 4,300 kg DM/ha a year on the Tablelands against the curve's 6,101. More stock means more growth (less dead feed shading the crowns).
- **Dry cows at 60% of carrying capacity end the year at CS 4.1 to 4.3 in every district** (they start at about 2.7). The paddocks carry more than the game's carrying capacity in summer. Winter is the limit.

---

## 3. What real country offers (sourced)

Each figure was read on the page or PDF named (part 8). Where a figure was seen only in a search summary it says so and was not used for any recommendation.

### Digestibility, ME and protein of green and dead feed

| Figure | Applies to | Source |
|---|---|---|
| Digestibility to ME: 40% = 4.8, 50% = 6.5, 60% = 8.2, 70% = 9.9, 80% = 11.6 MJ/kg DM | Pasture, general | PROGRAZE 9th ed. (S1) |
| Short vegetative pasture 80% digestible, 11.6 MJ, 25% CP. Flowering 60%, 8.2 MJ, 12% CP. Dry stalks 50%, 5.7 MJ, 8% CP | Pasture, general | S1, appendix 5 |
| Tropical: 65% (late vegetative) = 9.1 MJ, 60% (early flowering) 8.2, 55% 7.4, 50% (late flowering) 6.5. At the same stage tropical pasture is about 10 points less digestible than temperate | Tropical pasture | S1 |
| Dead pasture assumed 47% digestible (temperate) and 45% (tropical) in the PROGRAZE feed tables | Benchmark | S1 |
| Grass-dominant pasture: young 11 MJ and 25% CP; mature 7 MJ and 5% CP. Lucerne young 11 MJ and 30% CP, full bloom 8 MJ and 15% | Victoria | Agriculture Victoria drought manual, table 5.1 (S2) |
| Green pasture 10 to 12 MJ and 70 to 80% digestible; dry pasture 7 to 9 MJ and 50 to 65% | Queensland, sheep | Business Queensland (S3) |
| Perennial pasture is about 60% digestible when it dries off, then falls about 5 points a month to a minimum of 35%. Annual pasture about 70% at drying off, falls quickly to about 50% in 2 months, slowly after | Victoria, sheep | Agriculture Victoria useful tables (S4) |
| Calliope, July 1990, speargrass: green leaf 36% DMD and ME 4.8; dead 32% DMD, ME 4.3, N 0.74% (about 4.6% CP, my arithmetic). Bluegrass green leaf 49%, ME 6.7. Animals select a better diet than the analysis suggests | CQ native, hand-separated parts, drier than normal seasons | QDPI CQ pasture feed quality (S5) |
| Cows' diet (faecal NIRS), native pasture: June CP 4.9%, DMD 52%; August CP 3.8%, DMD 49%; February CP 8.4%, DMD 60%. With stylo: 6.8/55, 4.7/51, 10.7/62 | CQ dry tropics, 1998-99 | Dixon and others 2011 (S6) |
| Microlaena and wallaby grass are winter-active, year-long natives. Red grass is summer-growing, frost-tender, low in leaf, matures fast | Northern Tablelands | S1, appendix 4 |
| Green leaf of most winter-green natives was more digestible in winter than summer, and microlaena green leaf came close to the two introduced grasses tested. Search summary of the abstract only, no figures read | Northern Tablelands | Archer and Robinson 1988 (S7) |

### Growth through winter on the Northern Tablelands

PROGRAZE (S1) and Making More From Sheep (S8) give the same table. Median year, moderate soil, good management, kg DM/ha a day:

| Pasture | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec | Year (my sum × 30.4) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Red grass | 33 | 33 | 29 | 9 | 2 | 1 | 1 | 1 | 7 | 27 | 33 | 34 | 6,384 |
| Microlaena, white and sub clover | 39 | 36 | 29 | 18 | 8 | 3 | 3 | 7 | 19 | 33 | 40 | 44 | 8,482 |
| Phalaris, white and sub clover | 26 | 30 | 36 | 34 | 13 | 9 | 9 | 11 | 22 | 37 | 49 | 51 | 9,941 |
| Perennial ryegrass, white and sub clover | 20 | 28 | 38 | 34 | 13 | 9 | 9 | 11 | 23 | 43 | 47 | 35 | 9,424 |
| Fescue, white and sub clover | 58 | 57 | 51 | 28 | 12 | 9 | 9 | 11 | 23 | 38 | 51 | 59 | 12,342 |
| **The game, Tablelands native** (curve × 0.9) | 30.6 | 27.9 | 22.5 | 14.4 | 6.3 | 1.8 | 0.9 | 2.7 | 9 | 21.6 | 29.7 | 33.3 | 6,101 |
| **The game, Tablelands phalaris** | 25 | 20 | 22 | 28 | 20 | 8 | 5 | 12 | 35 | 55 | 48 | 32 | 9,424 |

### How much stock eat, and what they need

| Figure | Applies to | Source |
|---|---|---|
| Measured intake 14 to 15 g DM/kg LW a day (1.4 to 1.5%) in the late dry at 49 to 51% DMD; 18 to 19 g/kg in June (52 to 55%); 22 g/kg in the wet (60 to 62%). ME eaten fell from 56 to 61 MJ a day in June to 38 to 46 in August | CQ breeder cows, native pasture | S6 |
| A 450 kg steer at 50% DMD (6.9 MJ/kg) is predicted to eat 1.92% or 2.14% of live weight (two settings), 1.71% in one run. A 500 kg steer holding weight at 47.5% DMD eats 8.4 kg (1.7%). Intake predictions run high above 55% DMD and low below it | Standard animal | MLA final report B.GBP.0036, 2020 (S9) |
| Sheep intake rises sharply to about 800 kg DM/ha and gains little above 1,600. Cattle: 1,200 and 2,300 | Pasture | S1 |
| Least green feed for dry sheep to do well: 400, 600 and 1,200 kg green DM/ha at 75, 68 and 60% green digestibility. Dry cows: 700, 1,100 and 2,600. Assumes 500 kg DM/ha of dead at 47% | Temperate pasture | S1, tables 2.1 and 2.2 |
| A 50 kg dry sheep needs 7.0 MJ a day fed, 8.5 grazing | Sheep | Making More From Sheep tool 11.1 (S10) |
| One DSE needs 1.1 kg of dry feed a day | NSW | NSW Government, calculating stocking rates (S11) |
| 1 DSE (45 kg wether at maintenance) = 8.7 MJ a day | Standard | S9 |

### Dead feed breaking down

- PROGRAZE (S1): "about half" of the end-of-spring dry matter has decayed by the following autumn, even in an unstocked paddock.
- Agriculture Victoria (S4): perennial pasture loses about 5 points of digestibility a month after drying off, to a minimum of 35%.

### Diet selection

- No published figure read for how much better the selected diet is than the sward average.
- The CQ paper (S5) says stock select better than the analysis suggests. Its green leaf is the best part in every sample. The CQ cows' diet (S6, 49 to 52% in the dry) is far better than the CQ dead material (S5, 32%).
- Search summaries only, not used: a 1978 study found cattle on improved pasture selected a greener diet, and sheep a better diet than cattle on every pasture, most of all on native pasture (S12).

### Carrying capacity

These are recorded with their sources in `docs/SHEEP_BENCHMARKS.md` on the sheep branch (rows SB-59 to SB-62):

| District and pasture | DSE/ha | Source |
|---|---|---|
| Northern Tablelands, unimproved native | 5 (band 4 to 6) | MLA L.PDS.2003 (S13) |
| Northern Tablelands, sown and fertilised | 12 to 17.5 | S13 |
| Western Victoria, improved perennial | 13 to 23 (EverGraze site 25 to 31) | EverGraze (S14) |
| Central West, whole mixed farm | 1.09 to 1.48 per 100 mm of rain | MMFS Central West fact sheet (S15) |

### Calves

- CQ native pasture, Bos indicus cross calves: 0.63 kg a day April to July, 0.69 with stylo, 0.72 with supplemented cows. July to September 0.08, 0.22 and minus 0.03 (S6).
- Calf growth on temperate pasture by district: not found.

---

## 4. Side by side, and which rule is responsible

### Central Queensland

| Season | The game (native, 60%) | Published | Verdict |
|---|---|---|---|
| Wet (Jan, Feb) diet | DMD 61 to 62%, CP 8.7 to 9.2% | Cows' diet 60 to 62%, CP 8.4% (S6) | Inside |
| Late dry (Aug, Sep) diet | DMD 50%, ME 6.9, CP 4.9 to 5.0% | Cows' diet 49 to 51%, CP 3.8 to 4.7% (S6) | Inside on DMD, CP a little high |
| Dead feed | 50% | 45% (S1 benchmark); CQ dead parts 32% (S5) | The game is 5 points above PROGRAZE |
| Intake, late dry | Dry cow 1.05 to 1.10% LW | 1.4 to 1.5% (S6) | **About 25% low** |
| ME eaten, August | Dry cow 450 kg: about 34 MJ | 38 to 46 MJ (S6, cows of unstated weight) | A little low |
| Calves | 0.34 to 0.35 kg a day to 150 days | 0.63 April to July (S6) | **Low** |

The diet matches. What is low is the amount eaten. Two tuned figures sit against each other: the dead feed is a little better than PROGRAZE says, and intake is lower than measured. The steer bands were met with that pair.

### Northern Tablelands

| Season | The game (native, 60%) | Published | Verdict |
|---|---|---|---|
| Winter growth (Jun to Aug) | 1.8, 0.9, 2.7 kg/ha/day | Red grass 1, 1, 1; microlaena and clover 3, 3, 7 (S1) | The game is red grass |
| Winter green | 36 to 55 kg DM/ha | Year-long green natives hold green leaf in winter (S1, S7); no kg/ha figure found | **Probably low,** not measurable from sources |
| Winter diet | DMD 50 to 51%, ME 7.0, CP 5.2 to 5.3% | Dead 47% (S1); mature grass ME 7, CP 5% (S2) | Inside or a little generous |
| Green in growing season | 60 to 68% digestible, ME 9.0 to 9.5 in the diet | Short vegetative 80%; flowering 60% (S1); red grass matures fast, low leaf (S1) | Plausible for red grass |
| Intake on winter diet | Dry cow 1.04 to 1.13%, dry ewe 1.34 to 1.48% | Cattle 1.4 to 1.5% at this quality (S6) | **Low** |
| Year's growth | 3,400 to 4,300 kg/ha under grazing; curve 6,101 | Red grass 6,384 (S1) | **The grazed paddock grows 30 to 45% less** than the curve |
| Carrying capacity | 3.5 DSE/ha | 4 to 6 (S13) | **Low by 30%** |
| Sown carrying capacity | 5.5 to 6.0 DSE/ha (game rule, sown growth) | 12 to 17.5 (S13) | **Low by half or more** |

### Central West NSW

| Season | The game | Published | Verdict |
|---|---|---|---|
| Winter (Jul, Aug) diet | 220 to 255 kg green, DMD 57%, ME 8.0 to 8.1, CP 8.4 to 8.6% | No district figure found | Cannot judge |
| Steers in winter | Gain 0.14 to 0.15 kg a day (300 kg steer forecast) | Already a question for Claudia in CALIBRATION (1.3, CHECK 6) | Open |
| Dry years (2019) | Diet 51%, ME 7.0, cows short 19 MJ a day | | Behaves as a drought |
| Carrying capacity | 2.7 DSE/ha native | 6.5 to 8.8 whole farm (S15, my arithmetic, mostly sown and lucerne) | Cannot compare directly |

### Western Victoria

| Season | The game | Published | Verdict |
|---|---|---|---|
| Summer and autumn (Feb to Apr) diet | 125 to 380 kg green, dead 1,000 to 1,800, DMD 54 to 55%, ME 7.6 to 7.8, CP 7.0 to 7.5% | Dry perennial 60% falling to 35%; annual 70% falling to 50% (S4) | Inside the range |
| Winter and spring | Diet ME 9.1 to 9.9, CP 11 to 14% | Young grass 11 MJ, 25% CP (S2) | A little low, but the game's native is not ryegrass |
| Ryegrass diet, spring | ME 10.4 to 10.7, CP 20% | Young grass 11 MJ, 25% CP (S2); short vegetative 11.6 MJ (S1) | A little low |
| Carrying capacity, sown | 7.1 to 7.7 DSE/ha | 13 to 23 (S14) | **Low by half or more** |

### The rules responsible, by name

1. **Intake on poor feed** (`intakeOf` in `packages/engine/src/cattle/graze.ts`, and `qualityFactor` in the sheep branch's `sheep/energy.ts`). Appetite × `clamp(0.62 + (DMD − 0.5) × 2, 0.5, 1.05)` × availability `1 − exp(−mass/650)` × the protein penalty `1 − (7 − CP) × 0.05`. At 50% DMD, 900 kg DM/ha and 5% CP a 450 kg cow gets 2.4% × 0.62 × 0.75 × 0.90 = 1.0%. The 0.62 is a tuned figure (LESSONS row 1).
2. **No winter-active natives on the Tablelands** (`DISTRICTS.nsw.g` in `packages/engine/src/data/districts.ts`). Its winter months equal PROGRAZE's red grass curve.
3. **A cold winter hays green off like a drought** (`growGrass` in `packages/engine/src/pasture/grow.ts`). `dry = clamp(1 − curve/peak, 0, 1)` is about 0.95 in a Tablelands winter, because the curve is low from cold, not dry. Senescence is then `G × (0.003 + 0.018 × 0.95 + frost 0.01) × (0.45 + age/110)`, about 4% of the green a day, a half-life of about 17 days.
4. **Selection only works when green is plentiful** (`cellQuality` in `packages/engine/src/pasture/quality.ts`). `pg = G/(G + 0.25·D + 1)`, cut by `G/150` under 150 kg green. At 36 kg green and 875 kg dead the diet is 3% green, less than the 4% green in the sward. There is no selection of leaf within the green or of the better dead feed.
5. **Dead feed** (`dmdDead` 0.50, 0.51 in Western Victoria) is the same at any age, and breaks down at `0.003 + 0.009 × wet` a day, about 1.2% a day in a growing season. That loses about 85% of the late-spring dead feed by autumn, where PROGRAZE says about half.
6. **Carrying capacity** (`carryingCapacityAE` in `packages/engine/src/money/costs.ts`, `cc` in `packages/engine/src/pasture/summary.ts`). Annual growth × 0.65 × `util` ÷ 3,285 kg. That lets stock eat 16% (Central Qld), 23% (Tablelands), 20% (Central West) and 26% (Western Vic) of the curve. The published 5 DSE/ha on Tablelands native is about 32% of the red grass curve (5 DSE × 1.07 kg a day, the game's own 3,285 kg ÷ 8.4 ÷ 365, × 365 days ÷ 6,101). The published 12 to 17.5 on sown Tablelands pasture is 50 to 72% of the game's phalaris curve, and 13 to 23 in Western Victoria is 44 to 78% of its ryegrass curve. The paddock figure (`summary.ts`) uses the district's native growth whatever is sown.
7. **Growth under grazing** (`growGrass`). The ceiling `1 − (G + 0.6·D)/(bmax·F)` and the leaf, age and rankness terms hold a grazed paddock to 55 to 70% of its curve. Not part of quality, but it limits what any stocking rate can carry. Not tested here.
8. **Digestibility to ME** (`meFromDmd`). `0.172 × DMD% − 1.707` gives 6.9 MJ at 50% and 10.3 at 70%. PROGRAZE's table gives 6.5 and 9.9. The game's figure is about 0.4 MJ higher at every digestibility. Worth checking which one the CSIRO standards mean before any change: the same formula is often written for digestible organic matter, not digestibility.
9. **Protein** is inside the published ranges everywhere checked.
10. **Calves** (`milkMJ` in `packages/engine/src/cattle/gains.ts`). Milk is cut by `clamp((ME − 6)/3, 0.45, 1)`, so a cow on ME 8 gives two thirds of her milk. The CQ calves grew 0.63 kg a day on cows whose diet was 52 to 55% digestible. Outside this review's scope.

---

## 5. What each candidate fix would do (tried, not made)

### The variants

Each was a switch in the scratch copy, read from an environment variable. Nothing reached the repo.

| Code | Change | Basis |
|---|---|---|
| B | Dead feed digestibility falls with the age of the dead feed: `dmdDead` + 0.10 when fresh, 5 points a month, floor `dmdDead` − 0.10 (60% to 40% on the Tablelands) | Agriculture Victoria (S4) |
| C | Tablelands winter-active natives: native growth in June, July and August from PROGRAZE's microlaena curve (3, 3, 7 kg/ha/day), frost loss halved (0.010 to 0.005) | S1 |
| D | Selection: green counted as short only under 50 kg (not 150), and the green eaten is better than the green average by up to half the gap to the top digestibility and protein when green is 2,000 kg DM/ha or more | No figure found; a guess at the size |
| E | Intake on poor feed: the quality factor flattened below 60% DMD (0.80 at 50%, 0.82 at 60%, falling fast below 50%). A 450 kg dry cow at 50% DMD and 900 kg DM/ha eats about 1.3% instead of 1.0% | Measured intake (S6, S9) |
| F | Dead feed digestibility 0.47 (0.45 in Central Qld), from 0.50 (0.51) | PROGRAZE benchmark (S1) |
| G | Dead feed breaks down at `0.003 + 0.0035 × wet` a day instead of `0.003 + 0.009 × wet`: about half the late-spring dead feed left by autumn | PROGRAZE (S1) |

Combinations are written together: CEF is C, E and F at once.

### (a) The cattle benchmarks that hold the grass today

Steers, kg a head a year, mean of 12 blocks in the average year (random seasons in brackets). The bands are the CALIBRATION.md bands, none of them sourced.

| Case | Band | Now | B | C | D | E | F | G | EF | CEF | CEFG |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Central Qld, no lick | 20 to 60 | 41 (35) | -41 (-47) | 41 (35) | 74 (66) | 101 (96) | -25 (-30) | 35 (31) | 39 (32) | 39 (32) | 35 (30) |
| Central Qld, lick | 75 to 130 | 131 (126) | 57 (48) | 131 (126) | 142 (135) | 187 (180) | 79 (72) | 132 (128) | 133 (127) | 133 (127) | 133 (128) |
| Tablelands | 90 to 105 | 103 (93) | 50 (42) | 117 (106) | 130 (117) | 137 (126) | 75 (67) | 98 (90) | 116 (104) | 131 (119) | 126 (117) |
| Central West | 115 to 130 | 128 (109) | 90 (63) | 128 (109) | 143 (124) | 148 (130) | 112 (91) | 126 (111) | 139 (121) | 139 (121) | 143 (129) |
| Western Vic | 155 to 185 | 182 (162) | 144 (119) | 182 (162) | 196 (176) | 194 (174) | 161 (141) | 174 (158) | 179 (159) | 179 (159) | 173 (156) |

Deaths did not move in any variant except B and F alone (Central Qld no lick: 38.7% and 19.3%).

Established herds, average year, 8 farms each, September start: deaths % and live weight gained a head (kg, calves count).

| District | Now | B | C | D | E | F | G | EF | CEF | CEFG |
|---|---|---|---|---|---|---|---|---|---|---|
| Central Qld | 2.3%, 130 kg | 2.6%, 37 kg | 2.3%, 130 kg | 2.4%, 141 kg | 2.4%, 184 kg | 2.4%, 68 kg | 2.4%, 130 kg | 2.4%, 128 kg | 2.4%, 128 kg | 2.4%, 127 kg |
| Tablelands | 2.6%, 97 kg | 2.6%, 35 kg | 2.5%, 106 kg | 2.4%, 120 kg | 2.5%, 138 kg | 2.5%, 65 kg | 2.6%, 92 kg | 2.4%, 112 kg | 2.5%, 124 kg | 2.5%, 118 kg |
| Central West | 2.4%, 123 kg | 2.4%, 69 kg | 2.4%, 123 kg | 2.5%, 134 kg | 2.5%, 149 kg | 2.4%, 106 kg | 2.4%, 121 kg | 2.4%, 139 kg | 2.4%, 139 kg | 2.3%, 141 kg |
| Western Vic | 2.6%, 177 kg | 2.6%, 116 kg | 2.6%, 177 kg | 2.6%, 186 kg | 2.6%, 188 kg | 2.6%, 153 kg | 2.6%, 169 kg | 2.6%, 172 kg | 2.6%, 172 kg | 2.6%, 167 kg |

Herd deaths stayed between 2.3 and 2.6% in every district in every variant except B (Central Qld May start 40.9%, Tablelands May start 45.5%) and F alone (Tablelands May start 12.1%, Central Qld 4.1%).

### (b) Calf growth

Home-bred calves on the same established farms, kg a day from birth to 150 days old (birth weight taken as 35 kg). Published: 0.63 kg a day on CQ native pasture, April to July (S6).

| District and start | Now | B | C | D | E | F | G | EF | CEF | CEFG |
|---|---|---|---|---|---|---|---|---|---|---|
| Central Qld, September | 0.35 | 0.27 | 0.35 | 0.44 | 0.40 | 0.30 | 0.34 | 0.34 | 0.34 | 0.33 |
| Central Qld, May | 0.34 | 0.19 | 0.34 | 0.36 | 0.39 | 0.24 | 0.34 | 0.30 | 0.30 | 0.30 |
| Tablelands, September | 0.42 | 0.38 | 0.43 | 0.51 | 0.44 | 0.39 | 0.40 | 0.41 | 0.42 | 0.40 |
| Tablelands, May | 0.43 | 0.32 | 0.47 | 0.47 | 0.48 | 0.38 | 0.43 | 0.44 | 0.48 | 0.48 |
| Central West, September | 0.37 | 0.28 | 0.37 | 0.42 | 0.39 | 0.33 | 0.34 | 0.35 | 0.35 | 0.32 |
| Central West, May | 0.45 | 0.33 | 0.45 | 0.50 | 0.47 | 0.40 | 0.42 | 0.44 | 0.44 | 0.41 |
| Western Vic, September | 0.39 | 0.25 | 0.39 | 0.41 | 0.41 | 0.31 | 0.36 | 0.33 | 0.33 | 0.30 |
| Western Vic, May | 0.58 | 0.52 | 0.58 | 0.62 | 0.59 | 0.54 | 0.56 | 0.56 | 0.56 | 0.54 |

### (c) Cow condition through winter

Average CS of the cows on established farms that start in May, June against September:

| District | Now | B | C | D | E | F | G | EF | CEF | CEFG |
|---|---|---|---|---|---|---|---|---|---|---|
| Central Qld | 3.22 to 3.12 | 3.05 to 1.91 | 3.22 to 3.12 | 3.26 to 3.18 | 3.41 to 3.72 | 3.10 to 2.34 | 3.23 to 3.21 | 3.34 to 3.06 | 3.34 to 3.06 | 3.33 to 3.14 |
| Tablelands | 2.99 to 2.16 | 2.87 to 1.23 | 3.02 to 2.54 | 3.02 to 2.35 | 3.13 to 2.79 | 2.90 to 1.72 | 2.99 to 2.26 | 3.09 to 2.41 | 3.11 to 2.83 | 3.13 to 2.91 |
| Central West | 3.11 to 3.16 | 2.97 to 2.56 | 3.11 to 3.16 | 3.14 to 3.19 | 3.18 to 3.38 | 3.07 to 2.99 | 3.14 to 3.22 | 3.16 to 3.31 | 3.16 to 3.31 | 3.20 to 3.45 |
| Western Vic | 3.18 to 3.74 | 2.92 to 3.26 | 3.18 to 3.74 | 3.18 to 3.76 | 3.22 to 3.77 | 3.08 to 3.57 | 3.17 to 3.71 | 3.17 to 3.66 | 3.17 to 3.66 | 3.19 to 3.68 |

### (d) Ewes at lambing

The sheep branch's own year runs: Merino ewes joined in May on the Tablelands and April elsewhere, 4 blocks, average year. CS at lambing, ewe deaths in the year %, lambs marked per 100 ewes joined.

| District, stocking (share of carrying capacity) | Now | B | C | D | E | F | G | EF | CEF | CEFG |
|---|---|---|---|---|---|---|---|---|---|---|
| Tablelands, 30% | 1.41, 15.4%, 54 | 1.03, 45.3%, 38 | 1.85, 8.7%, 61 | 1.42, 15.4%, 53 | 1.80, 10.7%, 59 | 1.18, 31.8%, 46 | 1.38, 18.1%, 53 | 1.56, 13.1%, 57 | 2.00, 7.8%, 64 | 1.96, 8.1%, 62 |
| Tablelands, 80% | 1.39, 18.1%, 49 | 1.03, 48.7%, 38 | 1.85, 10.0%, 59 | 1.41, 17.1%, 51 | 1.73, 12.2%, 56 | 1.18, 33.5%, 44 | 1.39, 17.5%, 51 | 1.52, 16.1%, 52 | 1.94, 8.5%, 63 | 1.95, 8.3%, 62 |
| Central West, 30% | 2.14, 5.9%, 66 | 1.84, 12.2%, 57 | 2.14, 5.9%, 66 | 2.22, 5.2%, 70 | 2.30, 4.5%, 73 | 2.04, 7.5%, 66 | 2.07, 7.7%, 64 | 2.25, 4.9%, 70 | 2.25, 4.9%, 70 | 2.24, 5.6%, 69 |
| Central West, 80% | 2.23, 5.9%, 65 | 1.91, 14.1%, 54 | 2.23, 5.9%, 65 | 2.29, 7.2%, 67 | 2.33, 6.4%, 67 | 2.12, 7.0%, 62 | 2.17, 6.1%, 63 | 2.27, 6.8%, 65 | 2.27, 6.8%, 65 | 2.29, 7.8%, 65 |
| Western Vic, 30% | 2.92, 3.9%, 88 | 2.53, 4.2%, 76 | 2.92, 3.9%, 88 | 2.98, 3.6%, 90 | 2.96, 3.8%, 88 | 2.75, 3.4%, 80 | 2.78, 5.3%, 80 | 2.80, 4.7%, 84 | 2.80, 4.7%, 84 | 2.65, 4.7%, 78 |
| Western Vic, 80% | 2.95, 3.7%, 87 | 2.56, 4.6%, 77 | 2.95, 3.7%, 87 | 2.98, 3.7%, 87 | 2.98, 2.8%, 89 | 2.77, 3.7%, 84 | 2.85, 4.1%, 84 | 2.83, 3.6%, 85 | 2.83, 3.6%, 85 | 2.72, 3.6%, 82 |

### (e) Carrying capacity

No variant changes the game's carrying capacity figure, because the rule only reads the growth curve. What the variants change is whether stock do well at a stocking rate. Dry cows set-stocked on the Tablelands at 5 DSE/ha (143% of the game's carrying capacity), lowest average CS in the year (September) and the August figures:

| Figure | Now | B | C | D | E | F | G | EF | CEF | CEFG |
|---|---|---|---|---|---|---|---|---|---|---|
| Lowest herd CS (September) | 1.81 | 1.19 | 2.24 | 1.96 | 1.98 | 1.54 | 2.00 | 1.78 | 2.19 | 2.40 |
| August green, kg DM/ha | 38 | 39 | 83 | 28 | 36 | 38 | 37 | 36 | 80 | 78 |
| August dead, kg DM/ha | 378 | 449 | 332 | 362 | 305 | 412 | 455 | 321 | 282 | 351 |
| August diet ME | 7.1 | 5.5 | 7.7 | 7.3 | 7.1 | 6.6 | 7.1 | 6.6 | 7.3 | 7.2 |
| August dry cow intake, % LW | 0.70 | 0.60 | 0.83 | 0.71 | 0.76 | 0.67 | 0.77 | 0.74 | 0.85 | 0.97 |
| August dry cow, MJ a day | -25 | -32 | -18 | -24 | -23 | -27 | -22 | -25 | -19 | -16 |
| August dry ewe, MJ a day | -4.4 | -5.6 | -2.7 | -4.8 | -4.2 | -4.7 | -4.1 | -4.4 | -3.2 | -2.9 |

The carrying capacity figure itself needs the utilisation change in part 6. The share of growth that would make the game's own rule give the published figures: Tablelands native `util` about 0.49 (5 DSE/ha, 32% of the curve eaten). Sown Tablelands phalaris `util` 0.77 to 1.12 (12 to 17.5 DSE/ha, 50 to 73% of the curve eaten). Western Victoria ryegrass `util` 0.68 to 1.20 (13 to 23 DSE/ha, 44 to 78% of the curve). All with the 0.65 kept and 8.4 DSE to the AE (my arithmetic). Eating more than about half the curve does not look like safe long-term use (my judgement, not a source), so the sown figures also need more growth in the paddock than the model now delivers (rule 7 in part 4).

### Which existing benchmarks would break

| Benchmark | Sourced or tuned | Breaks under |
|---|---|---|
| Steer gain, Central Qld no lick, 20 to 60 | Reason given, no source | E alone (101), D with E (118), B (−41), F alone (−25). Holds under EF and CEFG |
| Steer gain, Central Qld lick, 75 to 130 (already 1 kg over) | Reason given, no source | E (187), B (57). EF and CEFG stay about where it is now (133) |
| Steer gain, Tablelands, 90 to 105 | Reason given, no source | C (117), E (137), D (130), EF (116), CEF (131), CEFG (126) |
| Steer gain, Central West, 115 to 130 | Reason given, no source. `dmdMax` 0.68 tuned to it | E (148), D (143), EF (139), CEFG (143) |
| Steer gain, Western Victoria, 155 to 185 | Reason given, no source | D with E (207), E (194). Holds under EF (179) and CEFG (173) |
| Sheep SB-43, Western Vic ewes "held near CS 3" (the sheep test reads it as 2.7 to 3.3 at lambing) | Deaths band sourced; the CS window is the test's reading | Holds under CEFG at the bottom (2.72); B (2.56) breaks it |
| Intake on dry feed 1.5 to 2% of live weight | No source | Fails now for heavy stock (open since 1.2a). E moves it toward the band |
| Herd deaths 1.5 to 3.6% | "Industry ranges", no source | Only B and F alone |
| `dmdDead` 0.50 | Tuned in the MVP (LESSONS row 1) | Changed by F |
| CW `dmdMax` 0.68 | Tuned in 1.3 (DATA.md) | Would want looking at again after E |

---

## 6. For the builder

### The changes, in order

Each one is a model change: bump `ENGINE_VERSION`, re-run every calibration file, log before and after in CALIBRATION.md, record each figure and its source in DATA.md, and keep the MVP comparison tests proving the formulas through `REBUILD_TUNES` in `packages/engine/test-support/mvp.ts`.

1. **Add the new benchmarks first** (tests that fail today, so each change is aimed at a sourced target):
   - **Intake on poor feed:** a 450 kg dry cow on a diet of 49 to 51% DMD and CP 3.8 to 4.7% eats 1.4 to 1.5% of live weight (S6). Test through `intakeOf` with availability above 0.8.
   - **CQ diet quality:** a set-stocked CQ native paddock in an average year gives cattle a diet of 49 to 52% DMD and CP 3.8 to 5.0% in August, and 60 to 62% DMD and CP about 8 to 9% in February (S6). It passes today; it guards the change.
   - **Dead feed:** native dead feed 47% digestible (45% tropical) (S1).
   - **Dead feed breakdown:** in an unstocked paddock with no growth, about half (say 40 to 60%) of the late-spring dead feed is left by the end of autumn (S1, "about half").
   - **Tablelands winter growth:** native pasture grows 2 to 4, 2 to 4 and 5 to 8 kg DM/ha a day in June, July and August in an average year (S1, microlaena and clover; the band is mine).
   - **Carrying capacity:** Tablelands native 4 to 6 DSE/ha, sown 12 to 17.5 (S13); Western Victoria sown 13 to 23 (S14). These are SB-59 to SB-61 on the sheep branch; bring them across.
   - **Stocking that holds:** dry cows set-stocked on Tablelands native at 5 DSE/ha in an average year stay above CS 2 through winter (my band, from S13's stocking rate). For Claudia to confirm.
2. **E, intake on poor feed.** In `intakeOf` (`cattle/graze.ts`) replace the quality factor below 60% DMD. The probe used `dmd ≥ 0.6: min(1.05, 0.62 + (dmd − 0.5) × 2); 0.5 ≤ dmd < 0.6: 0.82 − (0.6 − dmd) × 0.2; below 0.5: max(0.5, 0.8 − (0.5 − dmd) × 3)`. Fit the 0.80 to the new intake benchmark. Make the same change in the sheep `qualityFactor` (`sheep/energy.ts`), or have both call one function. Do E and F in the same change: alone, E puts Central Qld steers at 101 kg (band 20 to 60).
3. **F, dead feed digestibility.** `dmdDead` in `data/districts.ts`: 0.45 Central Qld, 0.47 elsewhere. Western Victoria loses its 0.51.
4. **G, dead feed breakdown.** `decay` in `growGrass` (`pasture/grow.ts`): `0.003 + 0.0035 × wet` in the probe. Fit to the breakdown benchmark.
5. **C, Tablelands winter-active natives.** In `DISTRICTS.nsw`: `g[5..7]` = 3, 3, 7 ÷ 0.9 (so the scaled curve reads PROGRAZE's microlaena figures), `frostSen` 0.010 to 0.005. A fuller version would treat a winter-cold month differently from a dry one in the senescence rule (`dry` in `growGrass`), so green holds in a wet cold winter and hays off in a dry one. That is a bigger change and needs its own benchmark; the probe did not try it.
6. **Then look at the steer bands with Claudia** (part 1, ruling 1) and at Central West `dmdMax`.
7. **Carrying capacity, a separate change.** `carryingCapacityAE` and the paddock `cc`: (i) give sown pasture its own growth (the species curve, not `R.annual`) in `summary.ts`, (ii) raise `util` so native Tablelands reads about 5 DSE/ha (about 0.49 with the 0.65 kept), (iii) give sown pasture its own safe-use share, (iv) look at why a grazed paddock grows only 55 to 70% of its curve (rule 7 in part 4) before raising sown utilisation past about 0.5 of growth. The starting herd (35 to 65% of carrying capacity), starting cash and the steer test stocking all read this figure, so every calibration result moves with it.
8. **Not recommended:** B (dead feed losing digestibility with age, to a 40% floor). It puts the CQ late-dry diet at 41% DMD and ME 5.3 against the measured 49 to 52%, and kills 39 to 46% of some herds. D (selection) has no sourced size, raises summer gains everywhere, and does nothing in winter, when the green is too short to select. If selection is wanted, it needs a source for its size first.

### The figures the probes used

- Probe code: `lib.ts`, `measure.test.ts` and `calib.test.ts` in a `probe` folder, and `probeSwitch.ts`, in a scratch copy of `m2.3-sheep-model`. Not kept.
- Steers: `steerRun` on seeds 1 to 12, average year and the farm's own seasons. Herds: a running medium farm on medium difficulty, seeds 1 to 8, September and May starts, average year. Ewes: `sheepYearRun`, Merino, share 0.3 and 0.8, seeds 1 to 4, average year.
- The sheep runs used the sheep branch exactly as it is (including its stand-ins); they show the direction and size of a change, not a final sheep figure.

---

## 7. What I could not source or measure

- **Northern Tablelands native pasture quality by season** (red grass, wiregrass, microlaena, wallaby grass, kangaroo grass). The NSW DPI pages that hold it refused every fetch (HTTP 403). The 1988 Northern Tablelands study (S7) and the 1983 north-west slopes study were seen only as search summaries.
- **How much green Tablelands natives carry through winter,** in kg DM/ha. Only growth rates were found.
- **Central West and Western Victoria native pasture quality by season.** The Feed on Offer library PDFs are scanned images; a CSIRO south-west Victoria paper timed out.
- **Phalaris, fescue, ryegrass, white and sub clover green and dry rows by species.** Only grouped figures (S1, S2).
- **The size of diet selection** (selected minus sward), for cattle or sheep.
- **District carrying capacity for Central Qld** (ha per AE on native and buffel), and native pasture DSE/ha for the Central West and Western Victoria.
- **Calf growth by district on temperate pasture,** and calf growth against pasture ME.
- **Steer gains by district from a source,** to replace the current bands.
- **Not measured:** sown pasture in real years, sown pasture at light and heavy stocking, every seed for sown pasture, and a breeding herd (rather than dry cows) at 5 DSE/ha.
- The claim from the sheep work that a ewe needs 7.8 MJ a day was not found in any source read. Making More From Sheep gives 7.0 MJ fed and 8.5 MJ grazing for a 50 kg dry sheep (S10).

---

## 8. Sources

Read in this review unless marked. Dates as given on the source.

- S1. NSW DPI and MLA, *PROGRAZE Manual*, 9th edition, March 2017 (CC BY-SA). Segment 2 digestibility to ME; appendix 4 (pasture species and Northern Tablelands growth); appendix 5 (feed values); tables 2.1 to 2.4; tropical stage guide; dead pasture assumptions; decay of dry matter. https://www.mla.com.au/globalassets/mla-corporate/extensions-training-and-tools/creative-commons/prograze-ninth-edition-cc.pdf
- S2. Agriculture Victoria, *Drought Feeding and Management of Beef Cattle* (CS 1717, V4), chapter 5, table 5.1, file dated 2025. https://www.feedinglivestock.vic.gov.au/wp-content/uploads/2025/06/CS-1717-Drought-Feeding-and-Management-of-Beef-Cattle_V4_Chapter-5.pdf
- S3. Business Queensland, "Assessing pasture quantity and quality for sheep", updated 2017. https://www.business.qld.gov.au/industries/farms-fishing-forestry/agriculture/livestock/animal-welfare/sheep-health/supplementary-feeding/pasture-quantity
- S4. Agriculture Victoria, Feeding Livestock, "Useful tables – sheep", about 2024. https://www.feedinglivestock.vic.gov.au/tools-calculators/useful-tables-sheep
- S5. Queensland DPI, "Pasture feed quality in central Queensland", trials 1990 to 1994. https://era.dpi.qld.gov.au/id/eprint/15292/1/PastureFeedQuality_centralQueensland_1990-1994.pdf
- S6. Dixon, Playford and Coates, "Nutrition of beef breeder cows in the dry tropics. 2.", *Animal Production Science* 51: 529–540, 2011. https://era.dpi.qld.gov.au/id/eprint/6734/1/AN10083.pdf
- S7. Archer and Robinson, "Agronomic potential of native grass species on the Northern Tablelands of New South Wales. II. Nutritive value", *Australian Journal of Agricultural Research* 39: 425–436, 1988. Search summary of the abstract only. https://publish.csiro.au/CP/AR9880425
- S8. AWI and MLA, Making More From Sheep, "Tool 8.1 Daily pasture growth estimates". https://www.makingmorefromsheep.com.au/manual/module-8-turn-pasture-into-product/tool-8-1-daily-pasture-growth-estimates/
- S9. McLennan, McLean and Paton, "Re-defining the animal unit equivalence (AE) for grazing ruminants", MLA final report B.GBP.0036, January 2020. https://era.dpi.qld.gov.au/id/eprint/7964/1/B.GBP.0036_Final_Report.pdf
- S10. AWI and MLA, Making More From Sheep, "Tool 11.1 Energy and protein requirements of sheep". https://www.makingmorefromsheep.com.au/manual/module-11-healthy-and-contented-sheep/tool-11-1-energy-and-protein-requirements-of-sheep/
- S11. NSW Government, "Calculating stocking rates". https://www.nsw.gov.au/regional-and-primary-industries/livestock/production/stocking-rates
- S12. *Australian Journal of Agricultural Research* 29: 863, 1978 (diet selected by cattle and sheep on native and improved pasture). Search summary only, not used. https://www.publish.csiro.au/AR/AR9780863
- S13. MLA final report L.PDS.2003, "Restoring pasture productivity in the Northern Tablelands", p. 12 and the farm reports (as recorded in `docs/SHEEP_BENCHMARKS.md`, S57, on the sheep branch). https://www.mla.com.au/globalassets/mla-corporate/research-and-development/final-reports/l.pds.2003-final-report.pdf
- S14. EverGraze proof site, Western Victoria, 2006 to 2010 (as recorded in `docs/SHEEP_BENCHMARKS.md`, S54 and S55, on the sheep branch).
- S15. Making More From Sheep, Central West fact sheet, "Profitable integration of cropping and livestock", table 2 (as recorded in `docs/SHEEP_BENCHMARKS.md`, S59, on the sheep branch).
