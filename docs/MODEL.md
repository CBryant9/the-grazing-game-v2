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

The rebuild's tick follows this order exactly. The detail of each step as built, and what the whole farm adds around the formulas, is in section 8.

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

The grass formulas ask one question of the season: what are the season factor and the month factor for this day. Two sources answer it. The MVP's random seasons (see DATA.md) answer it from the farm's seed. Each season and each month has its own named random stream, so any day can be asked for in any order and gets the same answer. From milestone 1.4 a real-year game answers it from real weather (section 1A). `averageYear` answers 1 and 1 for every day, and is what calibration runs are judged against.

## 1A. Growth from real weather (rebuild, milestone 1.4)

In a real-year game the season factor and the month factor come from the district's real weather, not from random seasons. `growGrass` and every calibrated formula are unchanged. This section only supplies `seasonF`, `monthF` and the season label, behind the same interface as the random seasons. The district curves stay as the average year.

Code: `packages/engine/src/season/` (`weatherTable.ts`, `weatherGrowth.ts`, `realYears.ts`, `weatherSeasons.ts`). The figures and where each came from are in [DATA.md](DATA.md) ("Growth from real weather"). The run that checks it is in [CALIBRATION.md](CALIBRATION.md).

### The soil-water tally

One tally for each district, one step a day, from the first day of the SILO table (1 January 1990).

```
C      = 100 mm                       water the grass can reach when the soil is full
p      = 0.6                          the share of C the grass can take before it starts to struggle
index(W) = min(1, W / ((1 − p) × C))  how freely the grass can draw water, 0 to 1

used   = index(W yesterday) × ET0 today
W      = clamp(W yesterday + rain today − used, 0, C)
growth index today = index(W)         worked out after today's rain and use
```

- `rain` and `ET0` are SILO's daily rain and FAO-56 short crop evapotranspiration, both in mm. ET0 is the water a short, well-watered grass would use that day.
- With C = 100 and p = 0.6 the index is 1 while the soil holds 40 mm or more. Below 40 mm it falls in step with the water left, and the grass takes less water out as it does.
- Rain that would take the soil over 100 mm is lost. There is no other run-off.
- This is the daily root-zone water balance and water stress figure of FAO-56 (its page on soil water availability, equations 82 to 84), with no crop coefficient: the pasture is treated as the reference grass.

**Settling.** The starting water is not known. The tally is run twice, from an empty soil and from a full one. From the first day the two agree (to a billionth of a mm) the starting guess no longer matters, and the tally can be used. All four districts settle during 1990. A day before that is refused.

### The growth factor (`monthF`)

```
scale(date) = the district's twelve scaling figures, read off for the date
factor      = min(1.9, growth index ÷ scale(date))
```

- The twelve scaling figures are one for the middle of each month. A date between two mid-months reads a straight line between them, the same way the district curve is read (`interpMonth`). So the scaling has no step on the 1st of a month.
- The figures are solved so that the factor, averaged over every day of a calendar month in 1997 to 2025, is exactly 1 for each of the twelve months (to 1 part in 10 billion). The district curve is therefore still the average year, month by month.
- How they are solved: start each month at its average growth index. Each round, work out the average factor for each month and multiply that month's figure by the square root of it. Stop when every month is within the tolerance. It takes a few hundred rounds. Only +, ×, ÷ and square roots are used, so every machine gets the same figures.
- **The scaling years are fixed at 1997 to 2025** (`SCALING_YEARS`). A later weather pull that adds 2026 does not move the factor of any past year. Changing the scaling years, or a pull that changes old SILO figures, is a model change: the scaling figures are pinned in a test so it gets noticed.
- **The ceiling is 1.9**, the MVP's own upper limit on the month factor. The same `monthF` multiplies sown pastures and crops, so going past the MVP's limit would push them outside the range they were tuned in.
- If a month is dry too often for its average to reach 1 under the ceiling, the build stops with an error. So does a scaling figure under 0.01.

**Why monthly figures, read off smoothly.** A figure for each day of the year would have only 29 samples behind it and would need smoothing anyway, and then no calendar month would average exactly 1. One flat figure a month would jump on the 1st with no rain. Twelve mid-month figures with straight lines between give both: no step, and every calendar month averages exactly 1.

The scaling figures (January to December):

| District | Scaling figures |
|---|---|
| cq | 0.2585, 0.5606, 0.2010, 0.1786, 0.0957, 0.2080, 0.2112, 0.0902, 0.0365, 0.0447, 0.2032, 0.3139 |
| nsw | 0.5045, 0.7034, 0.6088, 0.6620, 0.6145, 0.8126, 0.8552, 0.8077, 0.7118, 0.5727, 0.6613, 0.6682 |
| cw | 0.1450, 0.2569, 0.2442, 0.3502, 0.4113, 0.7824, 0.7846, 0.7148, 0.5524, 0.3478, 0.2588, 0.2059 |
| wv | 0.0919, 0.1889, 0.1420, 0.4314, 0.8279, 0.9779, 0.9998, 0.9981, 1.0097, 0.9240, 0.6253, 0.2822 |

A low figure means the soil is usually dry at that time of year, so a little water is already better than usual. In Central Queensland in September the figure is 0.0365: the factor reaches the 1.9 ceiling with under 3 mm of water in the soil. The district curve is only 2 kg DM/ha a day then, so the growth involved is small.

### The season factor (`seasonF`) and the label

```
seasonF(day) = Σ curve(k) × monthF(k)  ÷  Σ curve(k)      over the 365 farm days ending today
```

`curve(k)` is the district curve for farm day k, before any factor. So `seasonF` is the feed the weather allowed over the last 12 months of the game, as a share of what the average year gives over the same days. 0.5 means the last 12 months grew half the usual feed. It always holds one whole growing season, so it does not swing on a week's rain. `growGrass` hays green feed off faster while it is under 0.8, and crop yields use it at harvest, as before.

The look back runs over the game's own days. With years in order that is the real 12 months before today, until the years run out and the game goes back to 1997. With years at random, the days before the start of a game year are the game year the farm has just played.

The label uses the random seasons' own six labels:

| seasonF | Label |
|---|---|
| under 0.6 | Drought |
| 0.6 to under 0.8 | Well below average |
| 0.8 to under 0.925 | Below average |
| 0.925 to under 1.075 | Average |
| 1.075 to under 1.25 | Above average |
| 1.25 and over | Wet |

Each edge is halfway between two of the MVP's season factors, except 0.8. That one is the edge `growGrass` uses, so the label changes on the same day the grass does.

### Real years and the real date

- A game year is the 12 months from the farm's start month. Game year 1 starts in the real year the player picks. Each later game year is the next real year in the chosen order (`planRealYears`).
- **In order:** each next year in turn. After the newest playable year it goes back to 1997.
- **At random:** every playable year once, shuffled from the farm's seed, then all of them again in a new shuffle. The same year never comes up twice running. Each round of the shuffle has its own stream, `real-years:<round>`. The first year can be chosen or left to the shuffle.
- **The real date behind a farm day** (`realDateOn`): the farm's own calendar runs straight on from its start. Each game year is moved, whole, onto its real year, keeping the month and day. Within a game year the real days run on without a break, so a growing season that crosses New Year stays in one piece. If the farm calendar has 29 February and the real year does not, 28 February is read twice. A real 29 February the farm calendar does not have is passed over. In order, the real date is the farm calendar date until the newest playable year has been played. After that the game goes back to 1997 and the two part: a farm that starts in 2025 reads 1 January 1997 on day 365.
- **Playable years** (`weatherYears`): from 1997, each year whose whole 12 months from the start month are in the weather table, with 905 days of table before it (the 540-day run-up and the 365-day look back). With a January start and the table as pulled these are 1997 to 2025. On a farm the list is cut again to the years the prices and the sale calendar cover (`DistrictRealData.years`). As pulled that is 1997 to 2025 for a start in any month from January to November, and 1997 to 2024 for a December start.
- Weather, prices and sale days all read the real date from the same plan, so they agree on the day.

### A real-year farm (milestone 1.4, wired in)

Code: `sim/create.ts`, `sim/derived.ts`, `sim/tick.ts`, `real/realData.ts`, `server/realDataFiles.ts`. Tests: `sim/realYears.test.ts`.

**Making one.** `createFarm(options, env)` takes `years`:

- left out, or `{ kind: 'random' }`: the MVP's random seasons and the stand-in market. Such a farm runs exactly as it did before real years were wired in, bit for bit.
- `{ kind: 'real', order: 'in-order' | 'random' }`: real years. `start.month` is the start month. `start.year` is the first real year and can be left out: in order the oldest year is then used, and at random the first year is drawn from the seed. A first year that can't be played is refused.

On a real-year farm the pasture run-up uses the real weather before the start (above), the market opens on the real prices of day 0, and a running farm's herd is valued at those prices.

**How the engine gets the tables.** Engine model code never reads a file, and a save never holds a table. The server (or a test) builds one bundle, once, and passes it as `data` in the `env` of `createFarm`, `stepDay`, `applyAction` and the summaries:

```
import { loadRealData } from '@gg/engine/server';   // server code and tests only
const data = loadRealData();
const farm = createFarm({ ..., years: { kind: 'real', order: 'in-order' } }, { data });
stepDay(farm, { data });
```

The bundle (`RealData`) is given one thing, a way to get a table's text by its path, and reads a district's tables the first time that district is asked for: its SILO weather, the six national and six yard cattle indicators, the yard's yardings and the CPI. A test can build a bundle from changed or made-up tables with `buildRealData(reader)`.

**What the farm keeps.** Only what it needs to lay its years out again and to price stock today: the order, the first year, the oldest and newest year that could be played when it started, the data version, and today's prices (`farm.seasons`, `farm.market`). A real-year farm's save is the same size as any other.

**The data version.** Each district's data has a version: 16 hex digits worked from the text of every table that district's farms read. A farm records the version it started on. `stepDay`, `applyAction` and the summaries refuse data of any other version, so a later pull can't change a running farm's past without anyone knowing. Any change to any of those tables changes the version, including a pull that only adds new days. Moving a running farm to new data is not built: it is a decision for the server milestone (the same question as moving a farm to a new engine version, PRD 14.3).

**Failing loudly.** A real-year farm with no `data` in the `env` stops with an error in `stepDay`, in every `applyAction` (whether or not the action reads the weather) and in the summaries that read the season. Nothing on the farm changes. It never falls back to random seasons or the stand-in market. Today's prices and the date are on the farm itself, so `pricesOf`, `mobSummaries` and `dateOn` work without the bundle.

**A season source handed in.** `env.seasons` still replaces the farm's growth factors, as on any farm (the calibration runs use it for the average year). The prices, the date and the sale days stay real, and the bundle is still needed.

### The calendar on a real-year farm

Two calendars run side by side, and they are kept in step by how the real date is made:

- **The farm calendar** is `dateAt(farm.start, day)`: an ordinary calendar that runs straight on from the farm's first day. `farm.start` is the first real year and the start month. The grass, the crops, the water and the 1 July and 1st-of-the-month events read their month and day from it, exactly as on a farm with random seasons.
- **The real date** is `realDateOn(day)`: the farm calendar's month and day, in the real year of the game year the day falls in. It is what the weather, the prices and the sale days are read by, and it is the date the game reports (`DayResult.date`, `farmTotals().date`, `dateOn(farm)`).

So the month and day the grass grows by are the real date's month and day. A new season is reported on the real 1 July, and ground cover is read on the real 1st of each month. There is one kind of day where the two differ:

| Case | What happens |
|---|---|
| In order, from the start until the newest year has been played | The real date is the farm calendar date, every day, leap days included. From 1997 that is 29 years with nothing out |
| In order, after the newest year | The game goes back to the oldest year. A farm that started in 2025 reads 1 January 1997 on day 365. The weather, the prices and the date all jump together. The pasture and the cattle carry over as they are |
| The farm calendar has 29 February and the real year does not | The real date reads 28 February again. That day's weather, prices and sale day are used twice. The grass reads 29 February from the farm calendar. At most one day in a year |
| The real year has 29 February and the farm calendar does not | The real 29 February is passed over. It is not played |
| At random | Every game year is some real year, whole. One year ends on the day before the start month's 1st and the next begins on the 1st, in another real year. The two leap-day cases above can come up in any year |

**The year closes when the game year ends** on a real-year farm: on the last day before the start month's 1st, 365 or 366 days after it opened. So each scored year is exactly one real year, and the year's record carries that year (`YearRecord.realYear`). The score still counts years 1, 2, 3 (`YearRecord.n`). A farm with random seasons closes its year every 365 days, as the MVP does.

Not changed: running costs are still a 365th of the yearly figure each day, so a 366-day year costs one day more.

### The run-up

The 540 days before day 0 use the real weather straight before the start. As in the MVP, a farm does not start straight after a very dry run-up (LESSONS 7):

```
went  = Σ curve × factor ÷ Σ curve      over the run-up days
if went < 0.85:  t = (0.85 − went) / (1 − went),  and each run-up day gets  factor + t × (1 − factor)
```

Each run-up day is moved the same share of the way to an average day, which brings the run-up as a whole to exactly 85% of average growth. From day 0 the factor is the real one.

The season factor on a run-up day is never under 0.85 either: `seasonF = max(0.85, the 365-day figure)`. This is the MVP's rule (its run-up season was floored, not only its months). Without it the grass would hay off at the faster rate through a dry stretch of the run-up, because the 365-day figure can sit well under 0.8 even when the 540 days as a whole reach 85%. From day 0 the season factor is the plain 365-day figure again. Its look back still counts the lifted run-up days, so it can start under 0.85 after a dry year, and the label says so. Days before the run-up are only ever looked back over and stay as the weather really was. The floor can be set to 0 to start a farm as the weather really left it.

### Rain on screen

`rainOn(day)` is the SILO rain for the real date, in mm, straight from the table.

### What it does not do

- Temperature, frost and day length are not in the factor. They stay in the district curve, so a warm winter or a cold spring grows the same as an average one.
- One soil for all four districts.
- Rain out of season can lift growth to at most 1.9 times the curve for that time of year. Where the curve is very low (a Central Queensland spring), a wet spell still grows little.
- No carry-over in the factor itself. A paddock's condition after a dry year is carried by the pasture state, not by the weather factor.
- No waterlogging and no run-off from heavy rain other than the overflow.

## 2. Where cattle graze (`dietOf`, `grazeAlloc`)

Each square in the grazing area gets a preference weight:

```
w = (G + 0.25·D + 20) × exp((ME − 8) × 0.45) × exp(−distance to water m / 3000)
w × 0.15 if G + D < 350
```

The mob's diet is the weighted average of DMD and CP. Availability = 1 − exp(−mass/650). Walking distance to water feeds into energy needs.

Each day's intake is taken from squares in proportion to weight, leaving a 250 kg DM/ha residual, over up to 4 passes. In each square, green is taken in proportion to `pg` first, then dead. Trampling removes extra dead: `trample = 0.04 + 0.12 × min(1, head per ha / 4)` × amount eaten. A square counts as grazed (`lastG`) if more than 15 kg DM/ha was taken.

Details from the code (milestone 1.2a):

- Head per ha counts every animal in the mob, calves included, over the area's hectares (never less than 0.25 ha).
- Trampling takes dead feed only, and it can take a square below the residual.
- Each graze raises the square's recent-grazing mark by kg DM/ha eaten ÷ 120, up to 1.
- Distance to water is counted in squares, in a straight line from each square to the nearest water point in the same grazing area, then turned into metres. With no water in the area there is no pull towards water and no walk.
- The weights are stored as 32-bit numbers, as are the amounts taken from each square. Like the pasture arrays, the storage size is part of the model.

**Several shifts a day.** When a plan moves a mob more than once a day, the day's stops that have water are the shifts. With two or more shifts, the diet is the plain average of the diet on each one (DMD, CP, feed, availability and walk), and the day's pasture demand is split equally between them, each grazed in turn. The same paddock can come up twice in a day. With one watered stop or none, the mob grazes the area it is standing in.

In the rebuild the farm hands the cattle step each grazing area (its squares, its hectares and whether it has water) and the distance-to-water array. Planted squares that were grazed come back as a list for the crop model to act on.

## 3. Cattle (`intakeOf`, `simMob`)

### Intake, kg DM/day

```
k = 3.0% LW (< 300 kg), 2.7% (300 to under 450), 2.4% (450 and over); calves 3% × clamp((age−30)/120, 0, 1)
+0.6% LW if milking a calf
× max(0.55, 1 − (CS − 3.5) × 0.4) if CS > 3.5       (fat cattle eat less)
pasture = LW × k × clamp(0.62 + (DMD − 0.5) × 2, 0.5, 1.05) × availability
lick: × 1.25 if CP < 7, × 1.08 if CP 7–9
hay: 3 kg fed, pasture − 0.5 kg per kg of hay;  pellets: 2 kg fed, pasture − 0.3 kg per kg
no lick and CP of the mix < 7%: × (1 − (7 − CP of the mix) × 0.05)   (rumen slows)
```

The protein that counts is the mix: pasture plus hay or pellets, by weight. So the penalty applies on hay and pellets too, while the mix is still under 7%. With a lick there is no penalty. Calves get 40% of the hay or pellet ration and pay 40% of the lick cost. In the feedlot an animal eats LW × k of the ration (calves 60% of that) and no pasture.

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

Details from the code (milestone 1.2a):

- "Young growing stock" is anything under 900 days old that is not a cow or a bull.
- Live weight never falls below 25 kg. CS is held between 1 and 5.
- The daily gain shown for an animal is smoothed: 93% of yesterday's figure plus 7% of today's.
- Calves are worked out after the adults in their mob, so a calf gets its dam's milk for the same day. The milk energy is added to the calf's intake as it is.
- In the feedlot the ration is DMD 0.77, ME 11.6, CP 14%. Milk in the lot is worked from the DMD (ME about 11.5).
- Each animal carries a running cost for the stock book: its feed, plus the district's health cost a day.

### Breeding

- Cycling: heifers from 400 days and 270 kg. After calving, anoestrus = 45 + max(0, 3 − CS) × 40 days (45 at CS 3, 85 at CS 2).
- Conception per 21-day cycle by CS:

  | CS | 1 | 1.5 | 2 | 2.5 | 3 | 3.5 | 4 | 5 |
  |---|---|---|---|---|---|---|---|---|
  | rate | 5% | 12% | 25% | 38% | 50% | 60% | 65% | 55% |

  - × 0.85 if lactating, × bull coverage
  - daily chance = rate ÷ 21
- Bull coverage = min(1, bulls × 40 ÷ open females). Unmarked young bulls (from 300 days) count 0.6 each. Open females are all the cows and heifers in the mob that are not in calf, including barren ones and heifers too young to cycle.
- Expected 9-week rate = 0.96 × (1 − (1 − p)³). About 4% are barren.
- Gestation 283 days. Calf losses at birth are 7% for first calvers and 2.5% for cows, +6% if CS < 1.8. Abortion is 0.2%/day if CS < 1.6.
- Calves weigh 32 kg (heifer's first) or 36 kg. Bull calves stay entire until marked, and become fertile young bulls once weaned unmarked.
- When a calf reaches 280 days with its dam still on the farm, the drop is weaned: every calf in the mob that is 90 days or older. Younger calves stay on their dams. A calf with no dam is weaned at 100 days. Under 100 days it has a 2%/day death risk.
- A calf is a bull calf or a heifer calf, 50:50. About 4% of heifer calves are barren.
- Joining reports every 3 weeks; a preg test at 9 weeks compares against the expected rate and leaves out recently calved cows.

### Deaths

- Base 0.004% a day.
- Plus (1.4 − CS) × 1.5% a day below CS 1.4.
- Everything dies on day 4 without water.
- The cause recorded: "no water" from the third day without water, "poor condition" if CS is under 1.6, otherwise "natural causes". An orphan lost to its 2% risk is "orphaned".

### Adult equivalents (`aeOf`)

- 1 AE = 450 kg dry beast at maintenance, scaled by (LW/450)^0.75.
- Lactating × 1.3; late pregnant × 1.1.
- Calves count 0 under 90 days, then 0.5 × (LW/450)^0.75.
- DSE = AE × 8.

### Expected gains and the reasons (`gainOn`, `gainWhy`, `predictGains`)

The forecast for a class on an area's feed uses the same intake and energy rules, with the mob getting its fill (no shortfall) and calves left out. When the forecast is under 0.05 kg a day it comes with up to two reasons, in this order: not much feed where they graze (availability under 0.75), low energy (ME under 8), protein under 7% with no lick, milking for a calf, late pregnancy (over 190 days). If none applies, intake is just short of needs. In the rebuild the reasons are data, and the screens write the words.

### The rebuild: cattle (milestone 1.2a)

The formulas above are matched to the MVP number for number. Around them:

- **The day's order.** For each mob in turn: wean the drop if it is due, then run the mob's day. A mob made by weaning goes on the end and has its day too. After the last mob, the deaths are settled: counted, dams and calves unhooked, and the dead taken out.
- **Nothing stops the clock.** The cattle step returns what happened as data: deaths with their cause, births, weanings, notes for the inbox, the mob's figures, the feed cost, and the planted squares grazed. The screens decide what to show and when to stop a skip.
- **Random draws.** Breeding (conception, slipped calves, calving losses, calf sex, barren females) and deaths (daily deaths, orphans) draw from their own seeded streams.

**MVP faults fixed. These are the rules now:**

- **The feedlot has water.** A mob's days-without-water count is set to 0 in the lot. (In the MVP a mob sent to the lot while out of water kept losing 4% a day, and died there if it went in on day 4.)
- **A cow whose calf dies is dried off** when the day's deaths are settled: no calf at foot, not milking. (The MVP left her milking: eating more, spending energy on milk, counted at 1.3 AE and slower back in calf.) A dam that has since had a newer calf is left alone.
- **Weaning dries off the dam wherever she is on the farm.** (The MVP only looked in the calf's own mob.)
- **Making an animal draws no map position.** The engine draws nothing, so a new animal uses up no extra random numbers.

**MVP behaviour kept as it is, for Claudia to rule on:**

- A note made on a farm's first day (day 0) for short feed, low condition or fertile young bulls is made again on day 1, because the MVP reads a stored day of 0 as "not noted yet".
- A calf born on the fourth day without water has no day of its own until tomorrow, so it dies on day 5, not day 4.
- From the third day without water, any death is recorded as "no water", though only day 4 kills by thirst.
- Bull coverage counts barren females and heifers too young to cycle as open females, so a mob with many young heifers lowers conception for the cows.
- A cow that loses her calf at birth, or slips a calf, can cycle again the next day. There is no wait.
- Intake as a share of potential (the mob's `pct` figure) ignores the extra appetite of a milking cow, so a mob of cows with calves can read over 100%.

## 4. Crops and plantings (`fieldState`, `fieldTick`, `cropGrazed`)

- Every planting establishes over its `estab` days. Grazing before then damages the stand by up to 60% (yield too).
- Grain-only crops (barley, grain sorghum) lose yield if grazed at any time before maturity, by up to 80%.
- Dual-purpose crops (oats, wheat) take a small yield hit when grazed before lock-up. After lock-up, grazing eats the heads (up to 90%).
- A warning goes out 10 days before lock-up (dual-purpose crops only). At maturity the game pauses and an on-map Harvest button appears. Ripe grain left standing sheds 0.2% a day from the day after maturity and 3% a day from day +31. A notice goes out at +30 days, and at +60 days the crop becomes stubble with the grain lost.
- Finished annuals become stubble 30 days after they finish. Annual ryegrass comes back at 12% the next sowing window, once.
- Mixed farms start part-way through the rotation for the start month.

### Detail confirmed against the code (milestone 1.2b)

The rebuild's crop code is in `packages/engine/src/crops/`. Each rule below is tested against the MVP's own function.

**What a planting is doing today (`fieldState`).**

- Perennial pasture: growth is its curve × (20% rising to 100% over `estab` days) × stand strength × the month factor. Stand strength is 1 until its life is up, then falls 15% a year to a floor of 55%. Its top DMD falls by 0.1 and its top CP by 8 points for each whole unit of strength lost, so at the 55% floor the most it can lose is **0.045 DMD and 3.6 CP points**.
- Oversown stylo: the native curve × 1.05, with no establishment cut. Top DMD is the district's + 0.02, top CP the district's + 4, dead CP 5 + 2 = 7, and `bmax` the district's. It thins with age like other pastures but loses no quality, and gives no thinning notice.
- Annual forages and grain crops: growth is the curve × the district's crop factor × a stage factor × the month factor × the strength of a self-sown stand. The stage factor is 25% rising to 100% while establishing, 100% until heading, 30% while heading, and 0 once finished. A finished crop has no growth at all, so it never regrows.
- Heading starts at the crop's `head` day. An annual forage has no lock-up, and heads at 75% of its life, rounded to a whole day (forage sorghum 150, millet 98, annual ryegrass 188, brassica 105).
- Extra green lost each day (the `sen` figure the pasture step adds for crops): **1.5% a day while heading and 4% a day once finished**. Nothing before heading.
- Dead CP is 5 for every forage and crop. A crop not yet sown reads DMD 0.5, CP 5, dead CP 4, `bmax` 1,000 and no growth.

**Grazing damage (`cropGrazed`)**, for each square with more than 3 kg DM/ha taken. `r` is the feed taken, `rg` the green part, `g` the green there before:

| When | What it costs |
|---|---|
| Any planting before it is established | Stand density and yield both × (1 − min(0.6, r/500)) |
| Grain-only crop, established, before maturity | Yield × (1 − min(0.8, r/800)) |
| Dual-purpose crop from lock-up to maturity | Yield × (1 − min(0.9, 1.3 × rg/(g + 1))) |
| Dual-purpose crop before lock-up | Yield × (1 − 0.04 × min(1, r/1,000)) |
| After maturity, and established pasture or forage | Nothing |

Each planting gives one notice for grazing before establishment or of a grain-only crop, and one for grazing after lock-up.

**Sowing.** Only in the species' sowing months, only what the district grows. Pasture can go anywhere. Forages and grain crops only go on arable land. Nothing is sown over a forage or grain crop still in the ground. Squares taken from an older planting leave it. A new pasture starts at 120 kg DM/ha green with dead feed cut to 400 at most. A new forage or crop starts at 40 green with dead cut to 150 at most. Oversown stylo keeps what is there. Yield in prospect starts at the species yield × the district's crop factor.

**The end of a planting (`endField`).** On arable land the square becomes stubble with dead feed of max(800, dead + green) and no green. Off arable land it goes back to native pasture as it stands. An annual pasture with a seed bank (annual ryegrass) comes up again on the 15th of the first month of its sowing window, at least 30 days later, at 12% strength, only on squares that are native, fallow or stubble with nothing else sown. That stand keeps the feed that is there, gives no "established" notice, and leaves no seed of its own.

**Harvest.** Allowed from the day of maturity until the crop is lost at +60 days. Grain crops only.

**The daily step (`fieldTick`)** runs before the pasture step and gives events, not diary lines: self-sown, pasture established, pasture thinning (each year once past its life), crop established, lock-up in 10 days, harvest ready (the screen stops the clock), grain shedding, forage finished, not harvested, and a sowing window opening (on the 1st of the month, for a mixed farm or any farm with fallow or stubble). Events only come from plantings still in the ground, so a harvested crop gives none.

**Starting rotation (`startCropping`).** Every rotation block starts as bare fallow. For each crop in the rotation, the code looks back from the start day for the most recent day in its sowing window, no further back than the crop lives. If that is the start day the crop is sown that day. Otherwise it was sown 10 days before that day. Feed on the block is then set by age: 40 + 6 × days while establishing, min(45% of `bmax`, 500 + 40 × days since establishment) until heading, then 1,800 green and 1,500 dead. The last block stays in fallow.

**One fault in the MVP fixed here.** When the rotation blocks came to as many squares as the arable land asked for (for example Northern Tablelands at 30% arable, all cropped), the MVP marked none of the blocks arable, so the rotation sat on land that could not be cropped again. The rebuild always counts the blocks as arable.

## 5. Water, fences, mobs

- Paddock = area closed by any fence or gate (open, shut or knocked down). Grazing area = what cattle can reach (open gates and knocked-down fences join paddocks).
- One mob per grazing area: mobs that share one merge (`mergeShared`). A fence built through a mob splits off the far side as "strays".
- Water reaches anything connected to the bore through pipe, troughs or hubs. A fence-line or corner hub waters the 2–4 squares that touch it.
- Portable troughs drain by the mob's water use and stop watering when empty.
- Breakouts: only through **temporary tape**, only when the mob gets < 85% of its feed or has no water, at most once every 21 days. Chance 3.5%/day (25% if thirsty) × min(1.5, head/20 + 0.3). One tape segment at a time. Permanent and electric fences hold.

### Detail confirmed against the code (milestone 1.2b)

The rebuild's code is in `packages/engine/src/farm/`. Paddock ids, grazing area ids, watered squares and the distance to water are tested against the MVP's `recompute` on hand-made and random layouts, and must be equal exactly.

- **The grid** is exactly 40 × 26 squares. There is no yards strip, saleyard or feedlot on it.
- **Edges.** Fences and gates sit on the lines between squares. The codes are the MVP's: 0 nothing, 1 permanent, 2 electric, 3 tape, 4 gate shut, 5 gate open, 6 electric knocked down, 7 tape knocked down, 9 boundary. Codes 1, 2, 3, 4 and 9 stop stock. Every code but 0 bounds a paddock.
- **Ids.** Paddocks and grazing areas are numbered in the order their first square is met, scanning row by row from the top left. Names are "Paddock 1", "Paddock 2", and "Paddocks 1 + 2" for an area joined by open gates.
- **Distance to water** is kept for every square: the straight-line distance, in squares, to the nearest watered square in the same grazing area, and 999 where the area has none. Multiply by the square's side for metres. Watered squares are fixed troughs, the squares a fence hub touches, and portable troughs that still hold water.
- **Where a trough can go.** On the bore, or on any square water reaches from the bore through pipe, troughs and hubs, moving square to square. A fence hub links all the squares it touches, so pipe can carry on from its far side.
- **A hub on a square** puts a trough there (if there is none) and turns every side of the square that is not the boundary or already a gate into an **open gate**, whether or not a fence was there. The square becomes its own small paddock, joined to its neighbours for grazing until gates are shut.
- **A hub on a fence line or corner** needs a fence or gate at that corner, and water reaching one of the squares it touches. It waters every square that touches it: four in the open, two on the boundary, one in a farm corner.
- **Portable troughs** hold 6,000 L. Each day the stock in the grazing area need 10% of live weight in litres (× 1.3 December to February, × 0.8 June to August), added up beast by beast. That need is shared evenly over every watered square in the area, and each portable trough gives up one share. So a portable trough that shares an area with one fixed trough drains at half the rate. Under 25% a warning goes out once, with the days left at the day's rate. At empty it stops being a watered square and the clock stops. Fixed troughs and hubs never run dry.
- **Building a fence run** changes every edge in the run to the new type except gates and the boundary. Only edges that were not already that type count as built. Tape comes off the roll first. Fence under a new run is gone, tape included (it does not go back on the roll).
- **Pulling down** takes out every fence and gate in the run. Tape, standing or knocked down, goes back on the roll.
- **Gates** go only in a standing fence, never in the boundary, and start shut. A gate takes the place of one fence segment.
- **Strays.** The MVP decided which side of a new fence each beast was on from where it was drawn. The rebuild does not. A change to the fences reports which grazing areas were split, and into which new areas, and which were joined. The mob is shared out by a seeded rule (section 8, "A fence through a mob").
- **Money is left out of these rules.** Each job reports what was built or removed (segments, metres, gates, troughs, tape off the roll and tape bought) and the caller applies the costs. The energiser is charged for electric fence only.

### The homestead and stock yards (new in the rebuild, PRD 5.13)

Every farm gets a homestead and a set of stock yards when it is generated. Each is one square.

- The homestead is on a square that touches the boundary.
- The yards are within two squares of the boundary, and two to five squares from the homestead (counting diagonals as one).
- Both are at least three squares from the bore and never on a square with a trough.
- They are drawn from their own random stream (`gen:buildings`) after the fences and water are laid, so they never change the rest of the farm for a seed.

Buildings, travel from the homestead and yard work come in milestone 1.5.

### The farm at the start (rebuild)

Each piece of a new farm draws from its own named random stream: soil (`gen:fertility`), the bore (`gen:bore`), the run-up pasture (`gen:pasture`), fences and water (`gen:layout`), arable land (`gen:arable`) and buildings (`gen:buildings`). Seasons have their own streams already. Each piece draws its numbers in the same order as the MVP did, and is tested against the MVP given the same numbers.

- **Soil fertility:** an 8 × 6 lattice of values from 0.72 to 1.25, smoothed across the farm, plus or minus 0.06 on each square, held between 0.6 and 1.35.
- **The bore:** a random square at least 4 squares in from every boundary.
- **The run-up:** every square starts at 700 green, 1,400 dead, leaf age 70 and rankness 0 to 0.3. The pasture step runs for the 540 days before the start with no stock. Then the last owner's uneven grazing is laid over it from a smooth random surface `h` (0 to 1): rankness × (0.1 + 0.9h), dead × (0.35 to 1), green × (0.75 to 1), leaf age × (0.5 to 1).
- **From scratch:** a trough on the bore. Half the time there is also one old permanent fence line down the farm with one shut gate, at least 3 squares from the bore.
- **A running farm:** as set out in DATA.md, Established farm layout.

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

Utilisation over 60% never scores below 0. Cover is the average of the readings taken on the 1st of each month, or today's cover if the year has none yet. The total is rounded to a whole number.

Net worth = cash + 80% of infrastructure spend + net sale value of stock. The rebuild counts infrastructure differently from the MVP: see section 8, "Net worth".

## 8. The whole farm (rebuild, milestone 1.2c)

The code is in `packages/engine/src`: `sim/` (the farm's state, making a farm, the daily tick, mobs, summaries), `market/`, `money/`, `actions/` and `save/`. The tick, the market, the costs and the starting herd are tested against the MVP's own `stepDay`, day by day, on whole farms.

### The farm in one object

`FarmState` holds everything a farm is, as plain data and typed arrays: the seed, district, start date and day; cash, the overdraft and the bank's limit; the pasture, crops, fences and water; the homestead and yards; every mob with its cattle; the id counters; the market; the saved state of each random stream; the year's totals and the years finished; the ledger of infrastructure spending; the inbox; the days-eaten-out count; whether the game is over; and every action taken, in order. Paddocks, grazing areas, watered squares and the distance to water are worked out from it when needed and never stored.

A mob is in one of three places: on pasture (it holds one square of its grazing area, its "anchor"), in the feedlot, or in the stock yards.

### The day, as built

1. **Season and month factor** for the day, from the season source. On the 1st of a month the farm's ground cover is read for the year's score, before anything grows or is eaten. A new season on 1 July is reported (not on the farm's first day).
2. **Crop events** (`fieldTick`).
3. **Grass growth**. The feed grown is added to the year's total.
4. **Each mob in turn.** If its drop is due for weaning (a calf has reached 280 days with its dam on the farm), every calf of 90 days or more is weaned. The weaners go to another grazing area with water: an empty one first, then the one with the best feed (highest average ME). They become a new mob, named "Weaners" and its number, on the supplement of the mob they came from. With no other area with water they stay where they are. Then the mob has its day. A mob made today by weaning goes on the end of the list and has its day too. The day's feed bill comes off cash mob by mob.
5. **Deaths are settled** (a cow whose calf died is dried off).
6. **Portable troughs drain.** If one runs dry, the watered squares are worked out again. Then **breakouts** (below). Then **mobs that share ground join** (below).
7. **Running costs and interest.** Overheads are $4,000 + $0.60 a hectare a year. Animal health is the district's figure a head a year, counted on every head, calves included. Both are charged a 365th each day. Interest is worked on the balance after the day's feed bill and before the day's running costs: 9.5% a year on an overdraft, 3% a year earned on money in the bank.
8. **Grazing plans** move mobs here. Plans are a later milestone. The place for them is `sim/plans.ts`: the cattle step already takes a mob's stops for the day.
9. **The day counter goes up, then the market moves** to the new day. Mobs with no cattle left are dropped.
10. **The year closes** every 365 farm days (not on a calendar date, and leap years make no difference). The year is scored and filed, and a new one opens at the farm's net worth.
11. **Game over** if cash is at or past the bank's limit. Otherwise, if there are cattle on pasture, the feed cattle can reach is averaged over every square of the farm: `max(0, G + D − 250)`. Under 40 kg DM/ha counts as eaten out. A warning event goes out on the first day, and after 10 days in a row the game is over. Cattle in the feedlot don't count, and the count starts again on any day the farm is not eaten out or has no cattle on pasture.

Once the game is over the tick does nothing and every action is refused.

### Events, not diary lines

The tick changes the farm and returns a `DayResult`: the day, and every event in the order it happened. Nothing stops a clock or opens a dialog. The screens decide the wording and what stops a skip. The events are: a new season; crop events (established, lock-up soon, harvest ready, shedding, finished, a sowing window); stock grazing a planting at a time that costs stand or grain; the cattle notes for each mob (no water, short of feed, losing weight with the reasons, joining, preg test and the rest); a drop weaned and where it went; births; deaths by mob and cause; a portable trough low or empty; a breakout with its reason; mobs joining; the year's end with its score; the farm eaten out; and game over with the reason. The result also lists every animal that died, with its cause, and every calf born.

Events are also kept on the farm as the inbox (the last 120), as data.

### Breakouts

Exactly the MVP's rule. For each mob on pasture that has had a day:

- It must be hungry or thirsty: it got under 85% of the pasture it wanted, or it has no water.
- It must be 21 days or more since it last pushed through tape.
- A number is drawn. The mob breaks out if the number is no more than its chance: 3.5% a day when hungry, 25% when thirsty, times `min(1.5, head ÷ 20 + 0.3)`. Head counts calves.
- One segment of **temporary tape** on the edge of its grazing area is picked at random and knocked down. With no tape round the area nothing happens. Permanent and electric fences hold.

The areas used are the ones from before the day's breakouts, so two mobs breaking out the same day each go by the fences as they stood. The number is drawn before the tape is looked for, so a hungry mob with no tape round it still uses one number from the breakouts stream. The mob's "last breakout" day is only set when tape goes down.

### One mob to a grazing area

Mobs that share a grazing area join, and so do mobs in the feedlot, and mobs in the yards. The biggest mob (by head, calves included) keeps its name, its number and its own figures (days without water, joining record, notes). With two the same size, the one earlier in the farm's list keeps them. The others' cattle are added to the end of its list. If it had no supplement and another had one, it takes that one. This runs after every action that moves cattle or changes a fence or gate, and each day after the troughs and breakouts.

A new mob takes the supplement of the mob it came from. With none to take (or one set to "none") it starts on the district's usual one: a lick in Central Queensland, nothing elsewhere. This is the MVP's rule.

### A fence through a mob (the rebuild's own rule)

When a new fence, a shut gate or a repaired fence divides a grazing area that holds a mob, the engine can't ask where the cattle are standing: it draws nothing. Instead:

- Each beast goes to one of the new areas with a **chance in proportion to that area's hectares**.
- A **calf stays with its dam** when she is in the same mob. A calf with no dam in the mob is shared out like any other beast.
- The part that lands in the area holding the mob's old square keeps the mob: its name, number and figures. If none lands there, the part in the first of the new areas keeps it.
- Every other part becomes a new mob named "<name> strays", with the same supplement, the same days without water and the same last-breakout day. It stands on its area's first water point, or the middle of the area if it has none.
- If the whole mob lands on one side it stays one mob, on that side.

One number is drawn for each beast that is not a calf at its dam's side, from the `strays` stream. A mob in the feedlot, and a mob whose area the fence did not divide, are not touched and draw nothing.

### The market, behind an interface

The engine reads prices through a `PriceSource`: the market on day 0, a step to each new day, and today's prices (the young cattle indicator and a price for each class). Milestone 1.4 puts real MLA data behind it. Until then the source is the MVP's mechanism, matched exactly (`market/standIn.ts`): the approximate 2019 to 2025 monthly series joined mid-month to mid-month, the random walk after it, the daily wobble and the slow drift of each class. See DATA.md, Market.

What an animal is worth is the MVP's rule and does not depend on the source: its class price, the condition adjustments, the pregnancy premium, 5% commission and $30 a head.

### Money

Costs are the MVP's (DATA.md, Infrastructure and running costs). Each layout job reports lengths and counts, and the action applies the price. The MVP's cost faults are fixed:

- The **energiser** is bought once, with the first electric fence. Permanent fence and tape never buy one. (The MVP also charged it on the first tape.) A farm that comes with electric fence comes with an energiser.
- **Tape**: new tape is paid for by the metre. Rolling tape up costs $10. Running out tape that was on the roll costs $10. All-new tape pays no fee. (The MVP charged the $10 on every tape job.)
- The bank is asked (`spend`) wherever the MVP asked: buying cattle, building, sowing, harvest costs, repairs, moving and refilling troughs. If the cost would take the account past the overdraft limit the action is refused and nothing changes. Feed, running costs, interest, marking and the $10 to roll tape up come straight off the account, as in the MVP, and can take it past the limit.

### Net worth (the rebuild's rule)

Net worth = cash + the cattle at net sale value (a beast never counts below $0) + **80% of what has been spent on infrastructure that is still in place**.

The farm keeps a ledger of that spending, item by item: each fence segment and gate, pipe, each trough and water hub, each portable trough, the energiser, and each sown pasture. When something is pulled out, its entry goes and net worth falls. What counts:

- Fence, gates, pipe, troughs and hubs the player built: what was paid. A gate takes the place of one fence segment, so that segment's entry goes.
- Tape: every segment the farm owns, standing, knocked down or on the roll, at the price of new tape. Tape lost under a new fence or a gate is gone.
- A portable trough: $555 of its $600 (the first fill of water is not infrastructure). Selling it back takes it off.
- A sown perennial pasture: half its establishment cost, for the squares still in that planting. Sowing over it takes those squares off.
- The energiser: $900, once bought.
- **Fences, gates, troughs and pipe that came with the farm count for nothing**, because nothing was spent on them.

The MVP counted the improvements a farm came with at full price, and never took anything off when it was removed.

### Actions

Everything a player does is an action: a plain record that `applyAction(farm, action)` checks and carries out. It never changes the farm it is given. It returns the farm after the action with the events, or a refusal with a reason code and a plain message and nothing changed. So a server can check every action before it saves. Every action done is added to the farm's action log with its day.

The actions: buy cattle straight into an area or a mob (an instant buy for tests and calibration; sale days and delivery to the yards come later); sell animals, a group from a mob, or a market class across the farm; move a whole mob or part of one by class and number, into an area or the feedlot; set a supplement; wean; mark calves; build and pull down fence; roll up tape; hang, open, shut and remove a gate; fix a knocked-down fence; lay pipe; place, move and remove a trough; both kinds of water hub; place, move, refill and sell a portable trough; sow; harvest.

Moving cattle onto ground with no water, or onto a crop that is not ready to graze, is allowed. The events say so as data (`no-water`, `crop-risks`), and the screen asks first.

Rules that were screen code in the MVP are actions here: buying a sowing, removing troughs, hubs and portable troughs, and changing a supplement.

### Stock yards (a stand-in)

Deliveries to the yards and yard work are milestone 1.5. Until then no action puts a mob in the yards. So the engine can carry such a mob, the tick gives it water and lets it graze only the square the yards stand on. This is a placeholder, not a rule Claudia has set.

### Random streams

Each part draws from its own named stream, and each stream's state is saved with the farm: `cattle:breeding`, `cattle:deaths`, `breakouts`, `strays`, `market` and `buying` (the cattle that turn up when a class is bought). The starting herd has its own stream (`gen:herd`), and the seasons and the farm's layout have theirs already. A draw in one never moves another.

### Saves and the farm hash

`saveFarm` packs a farm as plain data that survives JSON. The big arrays and the cattle are packed as base64 text, bit for bit, so a farm that is saved, loaded and carried on is exactly the farm that ran straight through. The day's growth on each square is saved too, so a paddock sheet reads the same after a reload. Every save records the save format and the engine version. `loadFarm` fills in defaults for anything an older save does not have, refuses a save from a newer format, and stamps the farm with the current versions.

`farmHash` is 16 hex digits worked from the whole saved form, with keys in order. The same seed and the same actions always give the same hash.

### MVP behaviour kept as it is, for Claudia to rule on

- A new mob in Central Queensland made from a mob that was taken off the lick goes back on the lick (weaners, and cattle moved out by class and number).
- Cattle moved out of a mob by class and number become a new mob with its own counters, so their days without water start again at 0. Moving the whole mob keeps the count.
- When mobs join, the bigger mob's joining record carries on and the smaller mob's is dropped.
- Animal health is charged on calves at the same rate as on adults.
- Selling a very small calf can net less than $0 (its value less 5% and $30), and that is what is banked. Net worth never counts a beast below $0.
- The energiser is counted in net worth but not in the year's "spent on infrastructure" total.
- Weaners from a mob in the feedlot are sent out to a paddock, not kept in the feedlot.
- The year closes every 365 days, so over the years it drifts off the calendar date by a day each leap year.
- A harvest goes by the season the last day ran on, so a crop harvested on 1 July before the day runs is scored on the old season.
- A hungry mob with no tape round it still uses a number from the breakouts stream each day.
