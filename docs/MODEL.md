# How the model works

The rules the simulation follows, written so a rebuild can reproduce them exactly. Numbers are from `grazing-game.html` v15. The figures they draw on are in [DATA.md](DATA.md), and the targets they must hit are in [CALIBRATION.md](CALIBRATION.md).

One simulated day runs in this order (`stepDay`):

1. Season and month factor
2. Crop and pasture events
3. Grass growth
4. Each mob eats, gains or loses, breeds and may die
5. Deaths are logged
6. Water use, breakouts, mob merging
7. Running costs and interest
8. Grazing plans move mobs
9. Market moves
10. End-of-year score
11. Game-over checks

## 1. Pasture, per square

State per square:

- `G`: green kg DM/ha
- `D`: dead kg DM/ha
- `A`: average leaf age in days
- `X`: rankness 0–1
- `F`: soil fertility 0.6–1.35, smooth noise
- `land`: 0 native, 1 sown pasture, 2 annual or forage, 3 grain crop, 4 fallow, 5 stubble

### Growth (`growGrass`)

```
curve  = district curve for today (interpolated mid-month) × scale
pot    = curve × monthF      (or the planting's own potential × the square's stand density)
leaf   = min(1, (G+150)/(G+500) × 1.35)        phase 1: little leaf, slow growth
ceil   = max(0, 1 − (G + 0.6·D)/(bmax × F))     phase 3: shaded by its own bulk and dead
ageF   = 1 if A ≤ 60, else max(0.45, 1 − (A−60)/200)   old stemmy plants slow down (not for crops)
growth = pot × F × leaf × ceil × ageF × (1 − 0.4·X)
```

`bmax` is the district's, or the planting's own. Rankness is updated first (below), and the day's growth and senescence use the new value.

Senescence (green turning dead) each day:

```
wet  = clamp(curve / district peak, 0, 1.2);  dry = clamp(1 − wet, 0, 1) × (1.25 if season < 0.8)
sen  = G × (0.003 + 0.018·dry + frost + cropSen) × (0.45 + min(A,160)/110) × (1 + 0.5·X)
crops: sen = G × (0.002 + 0.006·dry + stageSen)
```

So young leaf hays off slower than old leaf, and rank grass dies back faster.

`wet` and `dry` follow the time of year only. They use the district curve before the month factor, so a poor month slows growth but does not by itself speed up haying off. Only a season factor under 0.8 does that. Sown pastures and crops use the district's `wet`, `dry` and frost too, not their own curves. "Crops" in these rules means annual forages and grain crops. Frost applies to native and sown pasture, not to crops.

Dead material: `D += min(G, sen) − D × decay`, where `decay = 0.003 + 0.009·wet` (it breaks down faster when wet).

Fallow and stubble squares with nothing sown skip all of the above. Green, leaf age and rankness are set to 0 and nothing grows. What is lying there breaks down by 3% a day on fallow and 0.4% a day on stubble. Stubble under 400 kg DM/ha becomes fallow. (The code also adds 0.006 to `decay` for a planting on a square still marked fallow. Sowing always changes the land use, so this never happens in play.)

Leaf age: new growth lowers the average. `A = (G_left × (A+1)) / (G_left + growth)`, or 0 if the new green total is 1 kg DM/ha or less. Grazing removes old leaf: `A *= 1 − 0.8 × (green eaten ÷ G)`.

The feed figures are stored as 32-bit numbers, as in the MVP. Each day's stored value is rounded to that size and read back the next day, so the storage size is part of the model.

### Rankness (`X`)

- +0.009/day in the district's heading months if leaf age > 40 and G > 1,000.
- +0.0015 × D/2,500 per day if D > 2,500 (thatch keeps it stale).
- −0.004/day when total mass < 1,400.
- Grazing knocks it down: `X *= 1 − clamp(eaten × (1 + 3·trample) / (0.45 × (G+D) + 1), 0, 0.9)`. A big mob on a small area resets rank grass fast. A light mob barely touches it.
- Rankness is held between 0 and 1.
- Crops, fallow and stubble have no rankness.

### Quality (`cellQuality`)

```
green DMD = clamp(DMDmax − 0.0012·A − 0.05·X, DMDmin − 0.02, DMDmax)
green CP  = clamp(CPmax − 0.055·A − 2·X, 4.5, CPmax)
dead DMD  = DMDdead − 0.01·X;   dead CP = 5 − 0.5·X                       (native pasture)
share green in the diet  pg = G/(G + 0.25·D + 1), × G/150 if G < 150    (cattle select green leaf)
diet DMD = pg·greenDMD + (1−pg)·deadDMD   (same for CP)
ME (MJ/kg DM) = 0.172 × DMD × 100 − 1.707                                (CSIRO)
```

What changes by land use:

| Square | Green feed | Dead feed |
|---|---|---|
| Native pasture | The formulas above with the district's DMDmax, DMDmin and CPmax | DMD = DMDdead − 0.01·X, CP = 5 − 0.5·X |
| Sown pasture | The same formulas with the planting's DMD and CP as the maximums. The floor is still the district's DMDmin − 0.02 | DMD as for native. CP is the planting's own dead-feed figure, with no rankness penalty |
| Annual forage or grain crop | The planting's stage DMD and CP, with no leaf age or rankness penalty | DMD 0.50. CP 5 (4 before it is sown) |
| Stubble, nothing sown | None. `pg` = 0 | DMD 0.45, CP 4 |
| Fallow, nothing sown | None. `pg` = 0 | DMD 0.42, CP 3 |

### Phase labels (`phaseOf`, per square, describing only)

| Condition | Label |
|---|---|
| G + D < 450 | Bare: losing ground cover |
| G + D < 1,000 and X < 0.55 | Very short (green if over half green) |
| X > 0.55 | Gone to head: tall, rank, stale |
| G < 200 | Hayed off, dormant |
| G < 900 | Phase 1, short regrowth |
| A < 45 and G < 2,600 | Phase 2, leafy, best quality |
| otherwise | Phase 3, maturing, losing quality |

### Paddock summary (`padStats`)

- G, D, X, ME, CP and fertility are plain averages over the paddock's squares. `age` is leaf age averaged by green feed (0 if there is next to no green).
- maturity `mat = clamp(max(X, (age−25)/80, (1−green%)×0.7), 0, 1)`
- height cm `= min(90, mass/70 × (0.65 + 0.9·mat))`. Leafy swards are short for their weight; rank swards are tall.
- green leaf reaches `min(height, max(2, G/55 × (1 − 0.45·X)))` cm.
- Paddock label (neutral). The first that fits wins:
  - **Short** if mass < 800
  - **Green** if green > 50%
  - **Dry & rank** if X > 0.5, or height > 40 cm and green < 30%
  - **Mixed** otherwise
- Ground cover = min(1, (G+D)/1,000), worked out for each square and then averaged. About 1,000 kg DM/ha covers the ground. The farm's ground cover figure (`coverPct`) leaves out cropping country: annuals, crops, fallow and stubble.
- Rest = days since each square was last grazed, counting at most 400 for any square, averaged.
- Carrying capacity per ha = annual growth × fertility × 0.65 × util ÷ 3,285.
- Days of feed = (mass − 800, not below 0) × ha ÷ (AE × 9 kg). With no stock it has no limit.

In the rebuild the summary takes the cattle figures (AE, head, feed eaten) as inputs. The cattle model works them out for the grazing area and gives each paddock its share by area.

### Seasons behind one interface (rebuild)

The grass formulas ask one question of the season: what are the season factor and the month factor for this day. The MVP's random seasons (see DATA.md) answer it from the farm's seed until milestone 1.4 puts real weather behind the same interface. Each season and each month has its own named random stream, so any day can be asked for in any order and gets the same answer.

## 2. Where cattle graze (`dietOf`, `grazeAlloc`)

Each square in the grazing area gets a preference weight:

```
w = (G + 0.25·D + 20) × exp((ME − 8) × 0.45) × exp(−distance to water m / 3000)
w × 0.15 if G + D < 350
```

The mob's diet is the weighted average of DMD and CP. Availability = 1 − exp(−mass/650). Walking distance to water feeds into energy needs.

Each day's intake is taken from squares in proportion to weight, leaving a 250 kg DM/ha residual, over up to 4 passes. In each square, green is taken in proportion to `pg` first, then dead. Trampling removes extra dead: `trample = 0.04 + 0.12 × min(1, head per ha / 4)` × amount eaten. A square counts as grazed (`lastG`) if more than 15 kg DM/ha was taken.

## 3. Cattle (`intakeOf`, `simMob`)

### Intake, kg DM/day

```
k = 3.0% LW (< 300 kg), 2.7% (300–450), 2.4% (> 450); calves 3% × clamp((age−30)/120, 0, 1)
+0.6% LW if milking a calf
× max(0.55, 1 − (CS − 3.5) × 0.4) if CS > 3.5       (fat cattle eat less)
pasture = LW × k × clamp(0.62 + (DMD − 0.5) × 2, 0.5, 1.05) × availability
no lick and diet CP < 7%: × (1 − (7 − CP) × 0.05)   (rumen slows)
lick: × 1.25 if CP < 7, × 1.08 if CP 7–9
```

Mob intake is then limited by what the paddock supplies (`f` = supplied ÷ demand).

### Energy and weight

```
maintenance  = 0.45 × LW^0.75 × (1 + walk),  walk = 0.05 + 0.12 × min(1, distance to water / 3000)
pregnancy    = + 0.13 × LW^0.75 × (days − 190)/93 after day 190
milk MJ/day  = 24 × (1 until 60 days, then falling to 0 by 280) × clamp(0.55 + 0.15·CS, 0.6, 1.2) × clamp((ME − 6)/3, 0.45, 1)
lactation    = + milk / 0.65
calf energy  = its pasture + its dam's milk
balance      = ME intake − needs
gain kg/day  = balance/(20 + 0.045·LW) if positive, balance/22 if negative
caps: steers 1.6, bulls 1.4, calves 1.15, others 1.1; floor −1.5
no water: −4% of LW a day
condition    CS += gain/(0.15·LW) (× 0.3 for gains in young growing stock under 900 days). 1 CS ≈ 15% of LW.
```

### Breeding

- Cycling: heifers from 400 days and 270 kg. After calving, anoestrus = 45 + max(0, 3 − CS) × 40 days (45 at CS 3, 85 at CS 2).
- Conception per 21-day cycle by CS:

  | CS | 1 | 1.5 | 2 | 2.5 | 3 | 3.5 | 4 | 5 |
  |---|---|---|---|---|---|---|---|---|
  | rate | 5% | 12% | 25% | 38% | 50% | 60% | 65% | 55% |

  - × 0.85 if lactating, × bull coverage
  - daily chance = rate ÷ 21
- Bull coverage = min(1, bulls × 40 ÷ open females). Unmarked young bulls (from 300 days) count 0.6 each.
- Expected 9-week rate = 0.96 × (1 − (1 − p)³). About 4% are barren.
- Gestation 283 days. Calf losses at birth are 7% for first calvers and 2.5% for cows, +6% if CS < 1.8. Abortion is 0.2%/day if CS < 1.6.
- Calves weigh 32 kg (heifer's first) or 36 kg. Bull calves stay entire until marked, and become fertile young bulls once weaned unmarked.
- The whole drop is weaned when the oldest calf reaches about 280 days. An orphan under 100 days has a 2%/day death risk.
- Joining reports every 3 weeks; a preg test at 9 weeks compares against the expected rate and leaves out recently calved cows.

### Deaths

- Base 0.004% a day.
- Plus (1.4 − CS) × 1.5% a day below CS 1.4.
- Everything dies on day 4 without water.

### Adult equivalents (`aeOf`)

- 1 AE = 450 kg dry beast at maintenance, scaled by (LW/450)^0.75.
- Lactating × 1.3; late pregnant × 1.1.
- Calves count 0 under 90 days, then 0.5 × (LW/450)^0.75.
- DSE = AE × 8.

## 4. Crops and plantings (`fieldState`, `fieldTick`, `cropGrazed`)

- Perennial pasture establishes over `estab` days. Grazing before then damages the stand by up to 60% (yield too).
- Grain-only crops (barley, grain sorghum) lose yield if grazed at any time before maturity, by up to 80%.
- Dual-purpose crops (oats, wheat) take a small yield hit when grazed before lock-up. After lock-up, grazing eats the heads (up to 90%).
- A warning goes out 10 days before lock-up. At maturity the game pauses and an on-map Harvest button appears. Shedding starts at +30 days, and at +60 days the crop becomes stubble.
- Finished annuals become stubble. Annual ryegrass comes back at 12% the next sowing window, once.
- Mixed farms start part-way through the rotation for the start month.

## 5. Water, fences, mobs

- Paddock = area closed by any fence or gate (open, shut or knocked down). Grazing area = what cattle can reach (open gates and knocked-down fences join paddocks).
- One mob per grazing area: mobs that share one merge (`mergeShared`). A fence built through a mob splits off the far side as "strays".
- Water reaches anything connected to the bore through pipe, troughs or hubs. A fence-line or corner hub waters the 2–4 squares that touch it.
- Portable troughs drain by the mob's water use and stop watering when empty.
- Breakouts: only through **temporary tape**, only when the mob gets < 85% of its feed or has no water, at most once every 21 days. Chance 3.5%/day (25% if thirsty) × min(1.5, head/20 + 0.3). One tape segment at a time. Permanent and electric fences hold.

## 6. Plans

A plan is one or more legs. Each leg has:

- a list of paddocks
- a rule: every N days (as low as 0.25 = 4 moves a day, which splits the day's grazing across the shifts), or move when grazed down to X kg DM/ha with an optional maximum days
- a number of rounds (0 = keep going)

After the last leg the plan either repeats or stays. Moves skip a paddock with no water and pause the clock. Each move predicts gains, and warns with the reason if any class will lose weight. The plan report shows days, moves, rounds, t DM eaten, kg gained, kg/head/day and average days per paddock.

## 7. Scoring (per year)

- profit points = change in net worth ÷ 20
- gain points = kg gained × 0.5
- utilisation (eaten ÷ grown): ≤ 45% scores util × 22; 45–60% scores 1,000; over 60% scores 1,000 − (util − 60) × 40
- cover points = min(500, cover% × 7) − (40 − cover) × 25 if cover < 40%
- deaths cost 60 points each

Net worth = cash + 80% of infrastructure spend + net sale value of stock.
