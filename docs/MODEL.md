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

The rebuild's tick follows this order exactly, and then puts the farm clock back to first light for the new day. The detail of each step as built, and what the whole farm adds around the formulas, is in section 8. What the player does between two ticks, and how long it takes, is the working day: section 9.

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

**A real year is scored on its own prices.** The year closes on the prices of its own last day, before the market moves to the next day. That next day can belong to any real year (years at random, or back to 1997 after the newest), and a jump in prices between two real years is in neither year's score: the year that closed is valued at its last day's prices (`worth1`), and the new year opens valued at its own first day's prices (`worth0`). With years in order before the wrap the two days are one real day apart, so the two figures differ only by a day's price move. A farm with random seasons closes its year after the market has moved, as the MVP did.

**The 1 July "new season" event on a real-year farm** reports the season of the 12 months just gone, because the season factor is a rolling 365-day figure (above). It does not say what the season ahead will be. The label can also change on any other day, and no event marks that. On a farm with random seasons the event is the new season drawn for the year ahead. The screens must word the two differently. A question for Claudia (CALIBRATION.md, real years, CHECK 3).

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

### The herd record: when a cow shows as PTIC (Claudia, 14 Nov 2026)

There is no preg test job. A cow or heifer goes on the record as **PTIC by herself once she is `PTIC_DAYS` (50) days in calf**. Before that she is an ordinary cow or heifer on the record (a dry cow with no calf at foot, a cow with calf, a heifer), whether or not she is really in calf. `PTIC_DAYS` is `PREG_PREMIUM.fromDays`, the day the sale price starts paying the in-calf premium, so the record and the price agree: a female sells at the PTIC price only once she is on the record as PTIC, and all others sell as cows. Nothing about the price changed.

The one rule is in `sim/told.ts`: `onRecordPtic`, `recordClassOf` and `recordGroupOf`. Every class and sale group the player sees or picks from uses it: the mob card and the herd list (`breedingReports`: head PTIC, how far along in whole months, the class table), the map's mob classes (`farmView`), selling by sale group and booking a sale (`sellGroup`), and moving part of a mob by class (`moveCattle`). Selling by market class, by tag, marking, weaning and plan moves do not select by pregnancy. A cow 10 days in calf shows exactly as an empty cow everywhere the player looks: the class tables, the sale groups, the mob card's "why" lines (`predictGains` grouped by `recordClassOf`), the joining and no-bull notes (counted by the record: `readyOnRecord`, joining-age females not PTIC on the record), and the inbox (a slipped calf is reported only for a female that was PTIC on the record; the note carries `days`). One small give-away is accepted: the joining and no-bull notes are still raised by the model's own count, so a note can stay silent when every female is in calf but under 50 days. `classOf`, `groupKey` and an animal's `preg` (live, from the day she conceives) stay for tests, calibration and the cattle formulas.

Cattle bought as PTIC come 100 to 210 days in calf, so they are on the record as PTIC from arrival. The cattle step still makes its joining notes (`joiningStarted`, `joiningProgress`, `pregTest`), which the old game comparison checks; the screens show only the joining's dates and the PTIC head by the rule, and the inbox leaves the progress and preg test notes out.

**Reversed:** the design from earlier the same day, where the player was told only what a joining report or a preg test had said (`farm.knownInCalf`, a mob's `reports`, engine 0.10.0 and 0.11.0, save format 7). Save format 8 drops those fields from an older save.

**Late pregnancy (a question for Claudia).** A cow more than 190 days in calf counts 1.1 times in AE and gives a "late pregnancy" reason on the mob card; that is well after she is PTIC on the record.

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
- **Hubs can be removed and moved (Claudia, 14 Nov 2026).** A hub on a fence line or corner moves to another corner with the checks for building one: a fence or gate there, and water reaching one of its squares. A hub on a square is a fixed trough with a gate on every side that is not the boundary (`isSquareHub`; this is what building one makes, so nothing new is kept). It moves to a square with no trough that water reaches; the trough goes with it and the new square gets its open gates, while the old square keeps its gates. Taking a hub on a square out takes its trough out and leaves the gates as they are, so no paddock or grazing area changes. Moving costs what moving a trough costs ($300), plus the gates a hub on a square needs at its new square.
- **What depended on a hub or trough that moves or comes out** follows the rule troughs already follow: water is checked where a trough or hub goes, when it goes, against the water as it stands. Once placed, a trough or hub waters its squares whether or not water still reaches it, so a trough placed past a hub keeps watering when the hub moves or comes out. Pipe that no longer reaches the bore shows as dry on the map, and nothing new can be placed past it. (This is the MVP's rule, kept.)
- The farm view carries both kinds of hub: `water.hubs` (grid corners) and `water.squareHubs` (squares; each also in `water.troughs` as a fixed trough).
- **Portable troughs** hold 6,000 L. Each day the stock in the grazing area need 10% of live weight in litres (× 1.3 December to February, × 0.8 June to August), added up beast by beast. That need is shared evenly over every watered square in the area, and each portable trough gives up one share. So a portable trough that shares an area with one fixed trough drains at half the rate. Under 25% a warning goes out once, with the days left at the day's rate. At empty it stops being a watered square and the clock stops. Fixed troughs and hubs never run dry.
- **Building a fence run** changes every edge in the run to the new type except gates and the boundary. Only edges that were not already that type count as built. Tape comes off the roll first. Permanent and electric fence use the materials of that kind on hand first, along the line in the order drawn (14 Nov 2026). Fence under a new run is gone, tape included (it does not go back on the roll and its materials are not kept).
- **Pulling down** takes out every fence and gate in the run. Tape, standing or knocked down, goes back on the roll. **Permanent and electric fence materials are kept**, by the metre and by kind (knocked-down electric counts as electric), in `layout.fenceOnHand`. Gates are not kept. `materialsOnHand(farm)` gives the metres of each kind on hand, tape on the roll included.
- **Gates** go only in a standing fence, never in the boundary, and start shut. A gate takes the place of one fence segment.
- **Strays.** The MVP decided which side of a new fence each beast was on from where it was drawn. The rebuild does not. A change to the fences reports which grazing areas were split, and into which new areas, and which were joined. The mob is shared out by a seeded rule (section 8, "A fence through a mob").
- **Money is left out of these rules.** Each job reports what was built or removed (segments, metres, gates, troughs, tape off the roll and tape bought) and the caller applies the costs. The energiser is charged for electric fence only.

### The stock yards (new in the rebuild, PRD 5.13, changed 14 Nov 2026)

Every farm gets a set of stock yards when it is generated, on one square. They are where bought cattle will arrive, for the player to move out to a paddock. Stock never have to come to the yards for marking, weaning or selling: that is done where the mob is (section 9).

- The yards are within two squares of the boundary.
- They are at least three squares from the bore and never on a square with a trough.
- They are drawn from their own random stream (`gen:buildings`) after the fences and water are laid, so they never change the rest of the farm for a seed.

**There is no homestead** (Claudia, 14 Nov 2026). The first version placed a homestead on the boundary and the yards two to five squares from it. The homestead's square is still drawn from the stream and used to place the yards, then thrown away, so the yards of every farm stand exactly where they did. Checked on 480 farms against the generator as it was, and pinned in `farm/generate.test.ts`.

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

After the last leg the plan either repeats or stays. Moves skip a paddock with no water and pause the clock. (The rebuild, with one fix, is in section 10.) Each move predicts gains, and warns with the reason if any class will lose weight. The plan report shows days, moves, rounds, t DM eaten, kg gained, kg/head/day and average days per paddock.

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

`FarmState` holds everything a farm is, as plain data and typed arrays: the seed, district, start date and day; cash, the overdraft and the bank's limit; the pasture, crops, fences and water; the stock yards; every mob with its cattle; the id counters; the market; the saved state of each random stream; the year's totals and the years finished; the ledger of infrastructure spending; the inbox; the days-eaten-out count; whether the game is over; and every action taken, in order. Paddocks, grazing areas, watered squares and the distance to water are worked out from it when needed and never stored.

A mob is in one of three places: on pasture (it holds one square of its grazing area, its "anchor"), in the feedlot, or in the stock yards.

### The day, as built

0. **A real-year farm checks its real data first.** With no data bundle, or one of another version, the day stops with an error before anything changes (section 1A).
1. **Season and month factor** for the day, from the season source. On the 1st of a month the farm's ground cover is read for the year's score, before anything grows or is eaten. A new season on 1 July is reported (not on the farm's first day).
2. **Crop events** (`fieldTick`).
3. **Grass growth**. The feed grown is added to the year's total.
4. **Each mob in turn.** If its drop is due for weaning (a calf has reached 280 days with its dam on the farm), every calf of 90 days or more is weaned. The weaners go to another grazing area with water: an empty one first, then the one with the best feed (highest average ME). They become a new mob, named "Weaners" and its number, on the supplement of the mob they came from. With no other area with water they stay where they are. Then the mob has its day. A mob made today by weaning goes on the end of the list and has its day too. The day's feed bill comes off cash mob by mob.
5. **Deaths are settled** (a cow whose calf died is dried off).
6. **Portable troughs drain.** If one runs dry, the watered squares are worked out again. Then **breakouts** (below). Then **mobs that share ground join** (below).
7. **Running costs and interest.** Overheads are $4,000 + $0.60 a hectare a year. Animal health is the district's figure a head a year, counted on every head, calves included. Both are charged a 365th each day. Interest is worked on the balance after the day's feed bill and before the day's running costs: 9.5% a year on an overdraft, 3% a year earned on money in the bank.
8. **Grazing plans** move mobs here (section 10). The cattle step in step 4 has already been given the day's stops for a mob whose plan moves it more than once a day. Each plan move takes the ordinary move time off the day's light.
9. **The day counter goes up, then the market moves** to the new day. Mobs with no cattle left are dropped.
10. **The year closes.** On a farm with random seasons that is every 365 farm days (not on a calendar date, and leap years make no difference). On a real-year farm it is when the game year ends, 365 or 366 days after it opened, so each scored year is one real year (section 1A, "The calendar on a real-year farm"). The year is scored and filed, and a new one opens at the farm's net worth.
11. **Game over** if cash is at or past the bank's limit. Otherwise, if there are cattle on pasture, the feed cattle can reach is averaged over every square of the farm: `max(0, G + D − 250)`. Under 40 kg DM/ha counts as eaten out. A warning event goes out on the first day, and after 10 days in a row the game is over. Cattle in the feedlot don't count, and the count starts again on any day the farm is not eaten out or has no cattle on pasture.

12. **The farm clock goes back to first light** for the new day (section 9).

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

The engine reads prices through a `PriceSource`: the market on day 0, a step to each new day, and today's prices (the young cattle indicator and a price for each class). There are two sources, and a farm has one or the other for its whole life.

**The stand-in market** (`market/standIn.ts`) is the MVP's mechanism, matched exactly: the approximate 2019 to 2025 monthly series joined mid-month to mid-month, the random walk after it, the daily wobble and the slow drift of each class. See DATA.md, Market. A farm with random seasons has this one.

**The real market** (`market/realMarket.ts`, milestone 1.4) is for a real-year farm. On each farm day:

```
real date   = realDateOn(day)                                  (section 1A)
figure(i)   = indicator i at the district yard on the real date (the fill-in rules, DATA.md)
class price = figure(the class's indicator) × the class's multiple (the mapping, DATA.md)
indicator   = figure(restocker yearling steer)
in today's dollars: every price × CPI(September quarter 2026) ÷ CPI(the real date's quarter)
```

- The mapping from MLA's indicators to the game's classes is **proposed, for Claudia**. It, the fill-in rules, the yard premiums, the feeder stand-in before June 2003 and the CPI are all in DATA.md ("Real prices: indicators to classes" and "Inflation").
- There is no random part. The real market never draws from the market stream, and has no daily wobble or class drift of its own: the real figures move by themselves.
- The farm keeps only today's prices and which dollars they are in (`farm.market`). So today's prices can be read with no tables to hand. Moving the market to a new day needs the data bundle.
- Inflation has one switch, `REAL_PRICE_DOLLARS`: `today` (the default) or `of-the-day`. A farm keeps the setting it started with.
- With years at random, or in order after the newest year, the market on the first day of a game year is another real year's market, so prices step between the last day of one game year and the first of the next. The step is in neither year's score (section 1A, "A real year is scored on its own prices"), but the player's stock is worth more or less overnight.
- Cattle only. The sheep tables are not read yet.

**Sale days** (`market/saleCalendar.ts`). A real-year farm can ask whether its district yard holds a cattle sale on a farm day, of what type, and when the next one is (`saleDayOn`, `nextSaleDay`). Past years use the days the yard really sold, with a weekly stand-in for the stretches MLA has nothing for (DATA.md, "Sale calendars"). Nothing uses the calendar yet: buying and selling are not tied to sale days. Booking stock onto a sale, and delivery into the stock yards, are the next part of milestone 1.5.

What an animal is worth is the MVP's rule and does not depend on the source: its class price, the condition adjustments, the pregnancy premium, 5% commission and $30 a head.

### Money

Costs are the MVP's (DATA.md, Infrastructure and running costs). Each layout job reports lengths and counts, and the action applies the price. The MVP's cost faults are fixed:

- The **energiser** is bought once, with the first electric fence. Permanent fence and tape never buy one. (The MVP also charged it on the first tape.) A farm that comes with electric fence comes with an energiser.
- **Tape**: new tape is paid for by the metre. Rolling tape up costs $10. Running out tape that was on the roll costs $10. All-new tape pays no fee. (The MVP charged the $10 on every tape job.)
- **Fence materials kept (Claudia, 14 Nov 2026).** A segment of permanent or electric fence built from materials on hand costs half a new one (`REUSED_FENCE_SHARE`). The rest of the line is full price. The ledger records each segment at what it cost, so a reused segment is in it at half. The result of building says the metres from materials on hand, what that saved and what is left on hand; the result of taking fence down says the metres kept and what is on hand. The job card has the same (`fenceMaterials`, `materialsKept`), for the whole line and for the part built today. The time to take fence down and to put it up is unchanged. The MVP kept nothing, so the comparison run that takes a fence down and builds again checks the difference and then sets the MVP's cash level.
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
- **Fence materials on hand count for nothing** (a builder's choice, for Claudia). Taking a fence down takes its entry off; building from the materials adds the half that was paid.

The MVP counted the improvements a farm came with at full price, and never took anything off when it was removed.

### Actions

Everything a player does is an action: a plain record that `applyAction(farm, action)` checks and carries out. It never changes the farm it is given. It returns the farm after the action with the events, or a refusal with a reason code and a plain message and nothing changed. So a server can check every action before it saves. Every action done is added to the farm's action log with its day.

From milestone 1.5a every action is a job on the farm clock: it takes its work off the day's light, and it fits today or it does not (section 9). The rules below say what each action does. They are unchanged, and live in `actions/apply.ts` (`tryAction`), which knows nothing about time. Section 9 says whether a job fits and how much of a line is built.

The actions: buy cattle (on the clock, only on a sale day, arriving in the yards at first light the next day; straight into an area or a mob on the instant path used for tests and calibration: section 9); sell animals, a group from a mob, or a market class across the farm (booked onto the next sale on a day with no sale), and cancel a booking; move a whole mob or part of one by class and number, into an area or the feedlot; set a supplement; wean; mark calves; build and pull down fence; roll up tape; hang, open, shut and remove a gate; fix a knocked-down fence; lay pipe; place, move and remove a trough; both kinds of water hub; place, move, refill and sell a portable trough; sow; harvest.

Moving cattle onto ground with no water, or onto a crop that is not ready to graze, is allowed. The events say so as data (`no-water`, `crop-risks`), and the screen asks first.

Rules that were screen code in the MVP are actions here: buying a sowing, removing troughs, hubs and portable troughs, and changing a supplement.

### Reads for the web server (14 Nov 2026)

The web server had copied some engine logic because it could not ask the engine. Each of these reuses the engine's own code, returns plain facts, and is in the "looking is free" test:

- `supplementCosts(farm, env)`: for each mob, dollars a day for each supplement as today's tick would charge it. It runs the start of the day (season, crop events, growth: `startOfDay`, the tick's own steps 1 to 3) on a copy, finds where the mob spends the day as the cattle step does (`placeFor`), and takes the day's diet from `dayDiet`, the function the cattle step uses. So a mob on a plan that moves it more than once a day is priced on the average of the day's stops with water, not on the paddock it stands in. In the feedlot every option is the ration's price. It prices the cattle in the mob now: a drop weaned at the start of the tick would be priced at the calf's share.
- `husbandryNow(farm, env)`: for each mob, how many calves `markCalves` would mark and `wean` would wean (the actions' own lists, `markable` and `weanable`), and whether each can be done now with the job's own reason if not (from `previewAction`).
- `portableRefund(farm, port)`: what removing a portable trough pays back ($300), or null if there is no such trough.
- Whether a grazing area has water: `areaWatered(points, areaId)`, already exported.
- `materialsOnHand(farm)` (fence materials) and `breedingReports(farm)` (the herd record) are in sections 5 and 3.

### Stock yards (a stand-in)

Bought cattle land in the yards at first light the day after they are bought (section 9, "Buying and selling on sale days"). The tick gives a mob in the yards water and lets it graze only the square the yards stand on. The water is Claudia's rule (the yards have water). The grazing is a placeholder.

### Random streams

Each part draws from its own named stream, and each stream's state is saved with the farm: `cattle:breeding`, `cattle:deaths`, `breakouts`, `strays`, `market` and `buying` (the cattle that turn up when a class is bought). The starting herd has its own stream (`gen:herd`), and the seasons and the farm's layout have theirs already. A draw in one never moves another.

### Saves and the farm hash

`saveFarm` packs a farm as plain data that survives JSON. The big arrays and the cattle are packed as base64 text, bit for bit, so a farm that is saved, loaded and carried on is exactly the farm that ran straight through. The day's growth on each square is saved too, so a paddock sheet reads the same after a reload. Every save records the save format and the engine version. The save format is 2 from milestone 1.4: a farm's `seasons` and `market` can be a real-year farm's. A format 1 save loads as it is, because nothing was added to a farm with random seasons. The save format is 4 from milestone 1.5a: a farm has a clock, and the homestead is gone (section 9, "Saves"). `loadFarm` fills in defaults for anything an older save does not have, refuses a save from a newer format, and stamps the farm with the current versions.

`farmHash` is 16 hex digits worked from the whole saved form, with keys in order. The same seed and the same actions always give the same hash.

### MVP behaviour kept as it is, for Claudia to rule on

- A new mob in Central Queensland made from a mob that was taken off the lick goes back on the lick (weaners, and cattle moved out by class and number).
- Cattle moved out of a mob by class and number become a new mob with its own counters, so their days without water start again at 0. Moving the whole mob keeps the count.
- When mobs join, the bigger mob's joining record carries on and the smaller mob's is dropped.
- Animal health is charged on calves at the same rate as on adults.
- Selling a very small calf can net less than $0 (its value less 5% and $30), and that is what is banked. Net worth never counts a beast below $0.
- The energiser is counted in net worth but not in the year's "spent on infrastructure" total.
- Weaners from a mob in the feedlot are sent out to a paddock, not kept in the feedlot.
- On a farm with random seasons the year closes every 365 days, so over the years it drifts off the calendar date by a day each leap year. (A real-year farm closes its year when the real year ends.)
- A harvest goes by the season the last day ran on, so a crop harvested on 1 July before the day runs is scored on the old season.
- A hungry mob with no tape round it still uses a number from the breakouts stream each day.

## 9. The working day (rebuild, milestone 1.5a)

Every game day runs from first light to last light. Looking is free, doing takes time, and a job fits in today's light or it does not (PRD 5.1 to 5.4, as Claudia simplified them on 14 Nov 2026: REQUIREMENTS.md, "14 Nov 2026: the working day made simpler").

Code: `packages/engine/src/sim/clock.ts`, `data/jobTimes.ts` and `day/` (`spec.ts`, `act.ts`, `days.ts`, `look.ts`). Tests: `day/*.test.ts`. No grass, cattle, crop or price formula was changed. The daily tick is section 8's, with one step added at its end (the clock goes back to first light).

**What is not in the working day, by Claudia's decision.** There is no driving, no drive home and no place on the farm the player has to be. There is no homestead. Stock work is done where the mob is: nothing is walked to the yards. Sowing and harvest happen at once. Moving a mob is "pick the paddock, done": no route through gates and no walking time. Nothing carries over from one day to the next: there are no jobs in progress. The first cut of this milestone had all of those. They were taken out because they made the day's time hard to follow (LESSONS D9).

### The clock

- **First and last light** are civil dawn and dusk for the district town (DATA.md, "District towns, for daylight"), on **the date the game reports**: `dateOn(farm)`, which is the real date on a real-year farm. A farm in order from 2025 reads 1 January 1997 on day 365, and its light is that day's.
- The farm keeps today's first and last light and the minutes of light used so far (`farm.clock`). Times of day are minutes after midnight on the town's clock, daylight saving included.
- A day starts with nothing used. The daily tick sets this for the new day as its last step (`startDay`), so it is true however the day was ended.
- **Looking never moves the clock.** Previews, summaries and every other read leave the farm exactly as it was. Only a job that is done moves it. A job that is refused moves nothing. A test walks every function the engine exports that takes a farm, so a new read can't be missed.
- **When the light is used up no more jobs can start.** The refusal is `no-daylight`: "It is last light. No more jobs can start today." Less than a millionth of a minute of light counts as none, so rounding can't start a job.
- Still allowed after last light, because they take none of the day: looking, buying, sowing, harvest, and taking a mob off its supplement.

### How long a job takes

A job's time is its work only. The times are one table, `JOB_TIMES` in `data/jobTimes.ts`, with every figure marked Decided, Proposed or Builder. They are set out in DATA.md, "Job times", with the rules the builder chose and the figures that were taken out. In brief:

```
permanent fence   metres ÷ (500 ÷ the day's minutes of light)      a whole day builds 500 m
electric fence    metres ÷ 1,000 m an hour
tape              metres ÷ 3,000 m an hour, out or rolled up
pipe              metres ÷ 400 m an hour
gate 60 min       trough or hub 180 min       portable trough 30 min
move a mob        15 min for each mob cattle come from + head ÷ 100
wean              30 min + 0.5 min × head in the mob
mark              2 min × calves at foot in the mob
sell              60 min + head loaded ÷ 10
supplement        none of the day (switched on or off at a daily price)
muster            none: husbandry is done where the mob is
taking out        as long as putting in
buy, sow, harvest none of the day
```

**"500 m a working day".** The builder's reading: a working day is that day's light. A whole day on the fence builds 500 m in any season, and the fence gets the share of 500 m that it gets of the day.

### Doing a job: one path for the card and the real thing

`applyAction(farm, action, env)` does a job and `previewAction(farm, action, env)` returns its job card. Both run the same function and the preview throws the farm away, so the card can't disagree with what happens. Neither changes the farm it is given.

```
1. trial = the action tried all at once on a copy, with no clock
           (every rule, the bank, the cost). A refusal there is the refusal.
2. spec  = the job's work
3. with no light left: refused (no-daylight)
4. by kind:
   free          done on the spot. The clock does not move.
   in one go     done if its work fits in the light left. Refused if not.
   a line        the whole pieces that fit are built. The rest is not.
```

There are three kinds of job (`day/spec.ts`):

- **Done in one go** (a gate, a trough, a hub, a move, a muster, a sale). If its work fits in the light left, it is done and the clock moves on by the work. If it does not, it is refused with `not-enough-daylight`: "You don't have enough time to do this today. It takes 3 h 0 m and there is 1 h 0 m of light left." Nothing is built, nothing is charged and nothing waits for tomorrow. So a card can never show a job worked that has not taken effect.
- **A line** (fence, tape, pipe, pulling down, rolling up). A piece is one fence segment or one square of pipe. Only pieces the action would change are work: fence of the same kind, gates and the boundary in the run take no time, and a piece drawn twice is one piece. **The whole pieces that fit in the light left are built, in the order drawn, and charged.** They are built by the same action on just those pieces, so a line drawn again each day until it is done is the same fence, at the same cost, as one built at once. **The rest is not built and not remembered. The player draws it again another day.** If not even one whole piece fits, the line is refused with the reason.
- **Free** (buying, sowing, harvest, taking a mob off its supplement). Done on the spot, at any time of day. Sowing and harvest are exactly the at-once jobs the crop calibration uses.

**The builder's rule for a job longer than a day** (for Claudia to check). A job done in one go that needs more than a whole day's light, such as mustering 4,000 ha, can be done at first light, before anything else that day, and it uses the whole day. Otherwise it could never be done. Once anything has been done that day it is refused, and the reason says to do it at first light.

**The job card** (`JobCard`) has: when the job starts and finishes, the minutes of light it uses, the day's minutes with what was used before and what is left after (for the daylight bar), whether all of it is done today, the work in the whole job and how it is made up, the cost of the whole job and the cost charged today. For a line it has **the pieces that fit and the pieces that do not, with the metres of each**, so a screen can draw the first in the line's own colour and the rest in red, and for a line cut short the reason in Claudia's words: "You don't have enough time to do this today." `usesRestOfDay` is true when the job leaves no light, or is a line cut short: the screen says "this would use up your full day". REQUIREMENTS has both "the line stops drawing when the day is used up, with a warning that this is the full day" and, from 14 Nov, "the part that fits is built, the rest shows red". They are built as one: the engine gives the split and the flag, and the wording and the red line are the screen's.

### Money

- A line cut short is charged for the pieces that were built, and nothing more is owed.
- The bank must cover the **whole** line as drawn before any of it is built (a builder's rule): the player sees the whole cost on the card. A shorter line can be drawn in its place.
- Each job is its own: the $10 for running tape off the roll, or rolling it up, is paid by each tape job. The energiser is bought with the first electric fence built.

### Next day and skips

**Next day** (`endDay`): the daily tick runs (section 8), the clock goes back to first light, and first light's work is done (cattle bought the day before land in the yards and booked stock sells: "Buying and selling on sale days" below). It is the daily tick and first light's work on a copy of the farm. Nothing is built: there is nothing to carry on.

**A skip** (`skipDays`) runs a week (7 days), a month (30, as in the MVP) or a year (365), or a number of days. It is Next day that many times, and it stops after any day that held a reason to.

**What stops a skip.** Everything the MVP stopped its clock for (its `U.queue = 0` lines and its "Check the water first"):

| Reason | When |
|---|---|
| A mob on pasture with no water | Before the first day: nothing runs. The MVP asked before +1 week and +1 month |
| A portable trough with under 3 days of water at its last day's use | Before the first day: nothing runs |
| A mob's first day without water | After that day |
| A portable trough running dry | After that day |
| A crop ready to harvest | After that day |
| A year closing | After that day |
| Game over (the bank, or the farm eaten out for 10 days) | After that day. Nothing runs on a farm that is over |

The two checks before the first day can be passed with `anyway: true`, as the MVP's "Run time anyway". Next day is not checked, as in the MVP. A day's reasons are also given by `endDay`, and `stopsIn` reads them from any day's events. The MVP's seventh stop, a grazing plan whose next paddock has no water, is built with plans (section 10). A skip does not stop for an arrival or a booked sale either: cattle landing in the yards and booked stock selling at first light are reported in `dawn`, and the skip carries on.

**The summary** (`PeriodSummary`, from both) states facts: the dates, cash, net worth, head, calves, live weight, feed and green feed per hectare and ground cover before and after; births, deaths by cause, feed grown and eaten, weight gained, money by kind; every mob as it stands; and a count of each kind of event. No praise and no blame.

### What needs doing, and evening

**Things to do** (`thingsToDo(farm)`), for the banner and the mob card. A read-only list of what needs doing now, as plain facts with the mob or the place and a count. It uses only what the model already knows and adds no rule about when something should be done:

| Item | The fact | The model's own rule it reads | The action |
|---|---|---|---|
| `no-water` | A mob on ground with no water, its head and its days dry so far | The mob's grazing area has no water point | `moveMob` (the player picks the paddock) |
| `trough-low`, `trough-empty` | A portable trough under a quarter full, or empty, and the litres left | The trough's own low-water mark (1,500 L) | `refillPortable` |
| `calves-to-mark` | Unmarked bull calves of 60 days or more (young bulls are counted on the item for information, but do not make it show) | The age at which the model notes calves for marking | `markCalves` |
| `crop-ready` | A grain crop that has reached maturity, and its hectares | The crop's days to maturity | `harvest` |
| `fence-down` | A segment of electric fence or tape that is knocked down | The fence code | `fixFence` |

Weaning is not listed, because the model weans a drop by itself when it is due. Weaning earlier is the player's choice, offered on the mob card.

Each item names the action that deals with it, and gives that action ready to send when it needs no further choice. The list is in the order water, stock, crops, fences. It holds no words, so it can't nag or judge.

**Evening** (`clockView(farm)`). The clock view gives the light used and left, and two plain flags. `canStartJobs` is false once the light is used up. `evening` is true when less light is left than the shortest job in the table that takes time and is done in one go (moving a mob, 15 minutes: `shortestJobMin`). From then only jobs shorter than that still fit (a few segments of tape, for example), so a screen can dim the farm and light up Next day. `canStartJobs` is false only when no light is left. The farm can still be looked at after dark.

### The time of day on what happens

- Every job done on the clock is in the action log with when it started and finished (`LoggedAction.at`). `jobsToday(farm)` gives today's in order.
- A `job-worked` event comes first in a job's events: the action, the times, the work, whether all that was asked was done, and for a line the pieces built and not built.
- A `mob-moved` event carries the time the mob arrived (`at`), and every inbox message from a job carries the time the job finished. So a later part can split a mob's day of grazing at the time it was moved: the share of the day before the move is `(at − first light) ÷ the day's minutes`. **A mob's grazing is not changed in this part**: a mob still grazes where it stands when the tick runs.
- What the daily tick reports has no time of day.

### The instant path (calibration and tests only)

`applyInstant` (in `actions/apply.ts`) does a whole action at once with no clock: no job time and no daylight limit. It exists because the calibration suites and the MVP comparisons were written before jobs took time, and their figures depend on a farm being set up all at once on day 0. With it they pass with no change to an expected number.

**The public API can't be made instant.** `applyAction` and `previewAction` take an env with no switch for the clock, and ignore one if it is passed anyway. `applyInstant` is not exported from the engine's index. Test support reaches it by importing the engine's own file (`test-support/instant.ts`, `applyInstantly`). Lint forbids engine and server code from importing it, and tests hold all of this: a public call with `instant: true` cast into the env still runs on the clock; the env type has no such field; the function is named in two files only; and nothing outside the engine names it. The tick never reads the clock, so a farm driven this way runs exactly as it did on engine 0.6.0.

### Saves

The clock is part of the farm: saved, loaded and hashed. The save format was 4 for the clock; it is now 5 (arrivals and sale bookings, above). A format 1 or 2 save (before the clock) loads at first light. Format 3 was the first cut of this milestone and was never released: such a save loads with the player's place, the travel switches, the jobs in progress and the bookings dropped. From any older save the homestead is dropped and the stock yards are kept, and a mob in the yards stays in the yards. A save made part-way through a day keeps its time of day. Save, load and carry on equals running straight through.

### Buying and selling on sale days

Built in milestone 1.5b (engine 0.8.0, save format 5), on Claudia's rule that **the stock yards are the place bought cattle arrive** and she does not want the player made to watch the clock. Everything here runs on the farm clock. The instant path is unchanged (below).

**A sale calendar for every farm.** `saleDayOn(farm, env, day)` and `nextSaleDay(farm, env, from, type?)` answer for both kinds of farm, with the same names and shape as before.

- A farm that plays real years reads its district yard's real sale days (docs/DATA.md, "Sale calendars"). It needs the real data in `env`.
- A farm with random seasons has a weekly prime sale at its district's yard on a set weekday, with no sale from 16 December to 7 January (`STAND_IN_BREAK`, the same rule as the real calendar's stand-ins). Central Queensland Wednesday, Northern Tablelands Thursday, Central West Thursday, Western Victoria Monday. These are the weekdays each yard sold on in its most recent records. **Builder's choice, for Claudia** (docs/DATA.md). It needs no data, and the day's weekday comes from the date the game reports.
- `marketView(farm, env)` (read-only) gives: whether today is a sale day; the next sale after today (farm day, date, days from today); the stock booked onto a sale (by sale day, with head and tag numbers); and the cattle on their way to the yards.

**Buying.** `{ type: 'buyCattle', cls, qty }` is done only on a sale day.

- On any other day it is refused (reason `not-a-sale-day`), nothing changes, and the message names the next sale: "Cattle can only be bought on a sale day. The next cattle sale is on Thursday 7 September, in 6 days." The job card shows the same refusal.
- On a sale day the price is today's, shown on the job card before the money is spent, as before. Buying takes none of the day's light (`free`). The money is spent now: cash goes down by the cost, freight included.
- The cattle are **not** put on any ground. They go on the farm's books as an arrival (`farm.arrivals`): paid for, counted in net worth at what was paid, grazing nothing, and not able to die. The `to` field is not used.
- **At first light the next day** they land in the stock yards as a mob with `where: { kind: 'yards', since: <day> }`. If a mob is already in the yards they join it (one mob in the yards, which keeps its name and its `since`). A `cattle-arrived` event is reported the day they land.
- The player moves them out with the ordinary `moveMob`. `thingsToDo` lists `in-yards` for a mob in the yards: the mob, its head (calves at foot included) and how many days it has been there. It is a fact. `does: 'moveMob'`, `action: null`, because the player picks the paddock. The item also says, as fields a screen can word, that the yards have water (`hasWater: true`) and almost no feed (`feed: 'almost-none'`, with `grazingHa`, the one square the mob can graze). No rule and no tick change: it only states what the tick above already does.
- While in the yards the mob has water and grazes only the square the yards stand on (the tick is unchanged: section 8).

**Selling.** `sellAnimals`, `sellGroup` and `sellClass` choose animals as they always did.

- **On a sale day** the stock is sold today at today's price, as before.
- **On any other day** the stock is **booked onto the next sale** (`sale-booked` event). Nothing is paid and the job card says so: its `booking` part has `nothingPaidNow: true` and `priceSetOnSaleDay: true` as well as the sale day (`booking`), and the stock stay where they are and graze as usual. They can be moved about; they are sold wherever they are. Asking again books further animals, never the same ones twice.
- **At first light on the sale day**, booked animals that are still alive and still on the farm are sold at that day's price, with the usual selling costs (commission and freight, the same function as a sale on the day). A `cattle-sold` event with `booked: true` reports the head and the money. An animal that has died or was already sold is skipped without fuss: if none is left, nothing is sold and nothing is said. Calves at foot go with their booked mothers, as they do in any sale.
- `cancelSale` takes stock off the sale any day before it: the tag numbers given, or every booking if none. It takes none of the day. With nothing booked it is refused (`nothing-booked`). It counts only animals still on the farm, as `marketView` does: a tag that has died or been sold since the booking comes off the booking but is not counted in the `sale-cancelled` head, and if none of the named stock is still booked it is refused with that reason (fixed in 1.5c; it used to count every tag in the booking).
- **The time for selling** (1 hour and 1 minute for each 10 head, `data/jobTimes.ts`) is spent on the day the player asks, whether the sale is today or booked. Calves at foot count in the head.
- Booked animals show as booked in `marketView` and on the mob (`MobSummary.booked`), so a screen can mark them.

**The state** (kept small): `farm.arrivals` is a list of `{ arriveDay, cls, cost, animals }`. `farm.saleBookings` is a list of `{ saleDay, animalIds }` with one entry for each sale day. In play there is only ever one, for the next sale. `animalIds` is a whole-number array, smallest first, packed in a save like the other numeric arrays. Tag numbers are stable. Both lists are empty when nothing is on the way and nothing is booked.

**First light** (`day/dawn.ts`, `dawn(farm)`). Arrivals landing and booked sales selling happen once, at the start of the farm day they are due, in this one function. `endDay` and `skipDays` call it after the daily tick for each new day, so it is done before the player can act, and a skip does the same as stepping a day at a time. Arrivals land first, then booked stock sells. Their events go to the inbox and to `DayEnd.dawn` and `SkipResult.dawn`. The period summary adds `arrived` (head and calves that landed) and `bookedSold` (head, calves at foot and dollars banked) and counts the events. **A skip does not stop for a sale day or an arrival or a booked sale.** The daily tick (`stepDay`) is unchanged and does nothing about either: what it does to grass and cattle is exactly what it was.

**Net worth** counts what was paid for cattle on their way (`arrivalsWorth`) until they land, then their net sale value.

**The instant path** (`applyInstant`, calibration and the comparisons with the old game) is unchanged: `buyCattle` with `to` buys straight into a paddock or a mob on any day, and the sell actions sell at once. The job card and the real job both run on the clock, where these rules apply.

**Saves.** Format 5. A save from an older format loads with nothing on the way and nothing booked. Save, load and carry on equals running straight through, across a buy, an arrival, a booking and its sale day. Nothing here reads the clock or `Math.random`. The cattle that turn up with a buy are drawn from the farm's own `buying` stream when the buy is made.

**Not built (questions for Claudia, DEVELOPMENT_LOG):** whether cattle left in the yards need hay (PRD 5.13 proposed "after one day"); store and prime sales are not told apart (any sale day takes any cattle); no limit on the head that can be booked.

### What it does not do

- Putting a mob on a supplement still takes 30 minutes. Claudia has said that in Fast Farm it is switched on at a daily price with no daylight cost, and that in Daily Farm feed is stock on hand in a feeder or a lick block. That is a later part.
- Nothing a mob eats depends on the time of day yet.
- Farm hands and contractor fencing are section 11 (milestones 2.1 and 2.2).

## 10. Grazing plans (rebuild, milestone 1.5c)

Built in milestone 1.5c (engine 0.9.0, save format 6). Code: `sim/plans.ts` (the rules and `plansView`), `actions/apply.ts` (the four actions), `data/plans.ts` (figures), `sim/tick.ts` (step 4 reads the stops, step 8 runs the plans). The old game's plan code (`normPlan`, `perDayOf`, `planSubs`, `planStep` and the plan part of `stepDay`) is ported exactly. Tests: `sim/plans.mvp.test.ts` (the old game's own code run beside the engine, compared with no tolerance every day) and `sim/plans.test.ts`. No grass, cattle, crop or price formula changed, and a farm with no plan runs exactly as it did on 0.8.0.

### What a plan is

A plan is a **template** (`farm.plans`): one or more **legs**, and what to do after the last one.

- A leg has the squares to graze, in order (`stops`, one square in each grazing area to visit), a **rule** for moving on, and a number of **rounds** (0 keeps going round that leg for ever).
- After the last leg the plan either **repeats** (starts again at leg 1) or **stays** (the plan ends and the mob stays where it is).
- A mob **runs** a template (`mob.plan`): the leg and stop it is on, the round it is in, the day its stay on the stop started (`moved`), and a report (the day the plan was set, moves, full rounds, feed eaten in kg DM and head-days). Any number of mobs can run one template, each from its own step.
- A **step** counts the stops from the first stop of the first leg ("this is paddock 3 of the template" is step 2).

### The rule options (the old game's)

| Rule | Moves the mob |
|---|---|
| `days`, every N | when it has been N days on the stop. N can be a part of a day: under 1 the plan moves `round(1 ÷ N)` times a day (0.25 is 4 a day, the lowest), and the day's stops are grazed in turn (below). N is 0.25 to 60 |
| `kg`, to X kg DM/ha, with a day limit | when the area has been grazed down to X kg DM/ha or less (green plus dead feed, averaged over the area's squares), after at least a day on it. With a day limit above 0 it moves on that day whatever is left. A note ("still here") is given once a week while it stays |

Rounds and the order of legs are as the old game's. The figures (defaults, limits) are in `data/plans.ts` and DATA.md, "Grazing plans".

### The order of events in the day

1. **Step 4 (each mob's day).** If a plan moves a mob more than once a day, `stopsToday(farm, mob)` gives the cattle step the day's stops: the stop the mob is on and the ones after it (`stops[(idx + j) mod n]` for j under the moves a day; the same paddock can come up twice). With two or more of them with water the diet is the plain average and the day's grazing is split equally between them (section 2, "Several shifts a day"). With one watered stop or none, the mob grazes the area it is standing in. A paused plan, or a plan that moves once a day or less, gives no stops. After the mob's day, what a mob on a running plan ate (`st.demand × st.f`) and its head are added to the plan's report.
2. **Step 8 (after the day's running costs and before the market moves).** For each mob in the farm's order, with a running plan (not paused), on pasture, with cattle:
   - A rule under a day makes all of its moves for the day, one after another. It stops at the first move that can not be made.
   - Any other rule is checked once. `days`: `stay = day + 1 − moved` and the mob moves when `stay` is at least N. `kg`: it moves when `stay` is at least 1 and the area's feed is at or under X, or when `stay` has reached the day limit.
3. **A plan move** (`planStep`) works out the next stop. If the leg's stops are used up it is the first stop of the next round, and a round is done. When the leg's rounds are done it is the first stop of the next leg, or, after the last leg, of the first leg (repeat) or the plan **ends** (stay: the mob stays, a `plan-finished` event gives the report, the last round counts). Then the move is **made** unless it can not be (below). When it is made, the mob is put on the stop's square (`where.anchor` is that square, as the old game's `anchor`), the days on the stop start from tomorrow (`moved = day + 1`), the move is counted and the "still here" count starts again.

### What stops a move, and the one fix

A plan can not move a mob when the next area has **no water**. That is the only thing the old game checked, and the only thing checked here: there is no route and no gate (Claudia, 14 Nov 2026), and no rule about another mob being in the area (below).

When a move can not be made:

- The mob stays where it is. Nothing about the plan changes: not the stop, not the round, not the leg, not the counts. **This is the fix (BUILD_PLAN 2.4, "A plan stuck at a stop with no water keeps counting rounds"): rounds count only when the mob moves.** In the old game the round count, and with a finite number of rounds the leg, went up every day the plan was stuck.
- A `plan-waiting` event gives the reason (`no-water`), the area wanted and the step. It is given **once for each stop**, as the old game said it once for each stop. The plan records it (`waiting`) and tries again every day. The plan moves on the first day the area has water.
- `thingsToDo` lists it (`plan-waiting`: the mob, the area, the reason, the step and the head), and `plansView` shows it and `next: waiting`. A paused plan is not waiting.
- **A skip stops for it**, after the day, once for each stop (`SkipStop` `plan-waiting`). This is the old game's seventh stop (`U.queue=0` in `planStep`).

### When a plan moves into a paddock that holds another mob

The old game did not stop a plan for this. `planStep` called `moveMob`, which called `mergeStrays`, so the mob moved in and **the two mobs joined** (a "joined" line in the diary). The engine does the same, through its ordinary joining (`mergeShared`, the old game's `mergeShared`): the bigger mob keeps its id and name and the animals of the other; on a tie the earlier mob in the farm's order keeps them. **Which plan survives:** the bigger mob keeps its own plan. If it has none it takes the moving mob's plan, the same record, so the moves, rounds and report carry on and the plan's count goes on from the move that joined them. If both have plans the mover's is dropped. The mob that was joined into the other stays in the plan loop for the rest of that tick with no cattle (the old game did the same), so a plan that moves several times a day goes on through its stops and the counts go on.

The engine gives the `mobs-joined` event, naming both mobs and the paddock, and the `plan-moved` event after it (with the mover's head from before the join). Facts only. (A first build of this milestone made a plan wait when another mob was in the next paddock. It was a new rule, it broke two other things, and it is out: LESSONS P4.)

**Up front.** When a plan is set or resumed, the `plan-set` (or `plan-resumed`) event and the job card (`card.plan`) say, for every stop of the plan that holds another mob now, the paddock and that mob's name and head (`joins`), beside the paddocks with no water (`dryAreas`). A screen can warn before the player commits.
### What pauses a plan

- **A mob moved by hand** (`moveMob`) pauses its plan (`plan-paused`, because `manual-move`). The old game ended the plan. The engine keeps its place on the template. Moving part of a mob (`moveCattle`) does not pause it: the plan stays with the mob that stays.
- **Moving a mob to the feedlot** ends its plan (the old game's `toLot`), with a `plan-cleared` event. In the old game every move by hand ended the plan. Here a move to the feedlot still ends it and any other move by hand pauses it. This difference is the builder's choice, for Claudia.
- **Editing a template** (`setPlan` with the template's `id`) puts the mob it is set on at its step, and for every other mob running the template it resets the round and the waiting state; a mob whose step is gone goes back to the start. This is the builder's choice, for Claudia.
- `pausePlan` pauses it. A paused plan moves nothing, gives the cattle step no stops, and adds nothing to its report.
- **`resumePlan`** (from a step, or where it was) puts the mob on that step's stop (the ordinary move, below; if another mob is in the area the two join), starts the days on the stop and the round again, clears any waiting, and keeps the report's counts. **`setPlan`** makes or changes a template, or picks one that exists (`{ template }`), and puts a mob on it at a step with its report at nothing. **`clearPlan`** takes the mob off its plan; the template stays and the event carries the report.
- Mobs that join (`mergeShared`): the biggest keeps its own plan, or takes the other's if it has none (the old game's `mergeStrays`).

### Daylight, and what setting a plan costs

**The moves a plan makes by itself take none of the day**, as in the old game. They are step 8 of the tick, after the player has finished the day, and they do not change the light left. (A first build of this milestone took the move time off the day's light. The review found that it only lowered the reported light and never competed with the player's jobs, and Claudia does not want time made much of. PRD 5.15 proposed that a plan move uses the farmer's daylight: this is a question for Claudia, in the log.)

**Setting or resuming a plan is a move when the mob is not already on the stop.** Putting the mob on the stop costs the ordinary move time (`data/jobTimes.ts`: 15 minutes and 1 minute for each 100 head, the same as `moveMob`) through the same clock path as every job, and is refused with the plain reason (`not-enough-daylight`) if the light left does not cover it. If the mob is already on the stop it is free. Making the plan, pausing it, and clearing it are decisions and take none of the day, even after last light. The instant path (calibration and the comparison with the old game) puts the mob on the stop with no clock, as the old game's `commitPlan` did.
### Looking at plans

`plansView(farm)` gives, for each plan: its legs with the squares (the area each is in and whether it has water), the rule and the rounds, and, for each mob running it: the step, leg and stop it is on, rounds done, the round in this leg, moves, days since it was set, days on the stop, whether it is paused or waiting (and why), and what it will do next: `paused`; `waiting`; `finish` (the next move ends the plan); or `move` to an area, with the day it falls on for a `days` rule, or the feed now, the figure and the latest day for a `kg` rule. Plus the feed eaten, head-days and the live weight gained (`gainKg`). Facts only. A farm with no plan gives an empty list.

### Events

`plan-set`, `plan-paused`, `plan-resumed` and `plan-cleared` come from the actions. `plan-moved` (with the reason it moved, the rounds and, for a plan that moves once a day or less, the classes expected to lose weight in the new area, and why, as the old game's "Heads up"), `plan-waiting`, `plan-staying` and `plan-finished` come from the daily tick. They go to the inbox and the period summary like any other event. None of them praises or blames.

### Saves

Format 6. `farm.plans`, `farm.nextPlanId` and each mob's `plan` are saved, hashed and loaded. An older save loads with no plans. Save, load and carry on equals running straight through, part-way through a plan, a pause and a wait (`plans.test.ts`). Nothing here reads a clock or draws a random number.

### Proved against the old game

`plans.mvp.test.ts` sets the same plan on the same mob in the old game and the engine, and compares every day, with no tolerance: every pasture array, every animal, where each mob is (the square), and the plan's stop, days on it, "still here" count, waiting, moves, rounds, feed eaten and head-days (and kg gained, to 1e-6 kg: see "Kg gained" below). It covers a rotation every 3 days for 120 days in two districts, the "grazed down to" rule (the day limit, the note, and moving each day), several moves a day (4, 2, and 2 with a dry stop in the way), a plan that runs out of rounds (stay, and repeat), a move by hand with a resume from a step, the "grazed down to" rule at 1,500 kg DM/ha where the paddock really crosses the figure part-way through a stay (stays of a day and of many days, no day limit), a plan that moves into the paddock of a smaller and of a bigger mob (the two join, and the plan survives or moves to the bigger mob as the old game did), two mobs both on plans, and the no-water case. In the no-water case the engine differs from the old game only in the round counts, which the test leaves out of the comparison and then asserts: the old game counted a round every day it was stuck, the engine none.

### Kg gained

The plan's report carries the live weight the mob's animals gained while on the plan (`gainKg`, in the plan's record, the `PlanReport` and `plansView`). The old game added each animal's gain for the day inside the cattle step (`sumAdgDay`, the gain before the weight floor). The cattle step is not changed, so the tick does what the old game's report amounts to by reading weights: it notes the weight of each animal before the mob's day and adds the change in weight after it, for the animals that were there before (a calf born today is not counted), on days a mob on a running plan is on pasture. The sum is the same figure but not the same bits (a weight plus a gain, less the weight, is not exactly the gain, and the weight floor of 25 kg is not applied), so the comparison with the old game checks it to 1e-6 kg and every other figure with no tolerance.

### Not built

- The old game's confirmation before a plan moves stock onto a planting that is not ready to graze (`confirmGraze`, asked on a manual move). A plan move reports nothing about crops in the new area.
- The old game's save-time water check dialog: `plan-set` carries `dryAreas` for a screen to ask.
- The plan card and "Run today's plan" (screens). Plan moves still need nobody: they take none of the day. On a day a farm hand is on the books, the worker report shows them as done by the hand (section 11).

## 11. Farm hands and contractor fencing (rebuild, milestones 2.1 and 2.2)

PRD 5.11, BUILD_PLAN 2.1 and 2.2, as Claudia wants it: "simple to play, realistic numbers". There is no roster, no daily assigning and no clock to watch. The player hires or lets go; a hand works their own days, does standing duties and takes the first part of the player's jobs; pay comes out by itself on pay day. Contract fencing is ordered once and carries on by itself.

Code: `packages/engine/src/labour/` (`pool.ts`, `help.ts`, `actions.ts`, `contract.ts`, `day.ts`, `reads.ts`, `types.ts`) and the figures in `data/labour.ts` (DATA.md, "Farm hands and contractor fencing"). Tests: `labour/labour.test.ts`, `labour/noHands.test.ts`. No grass, cattle, crop, season or price formula was changed, and the daily tick (`stepDay`) is untouched.

**A farm with no hands is unchanged.** A farm keeps no labour state (`farm.labour` is left out) until its first hire or contract order. With none, first light does nothing new and draws nothing from any stream, so the farm saves, hashes and plays exactly as on engine 0.12.1. A test runs a seeded year on random seasons and half a year on real years and checks the farm's digest against one taken on 0.12.1 before any of this was written.

### The labour pool

- The people looking for work are worked out, never stored (`labourPool(farm, day?)`). Each week (farm day ÷ 7) 1 to 3 new people start looking, drawn from the stream `labour:week:<n>` of the farm's seed. Each stays listed for 14 to 42 days. So the list on a given day is always the same for a farm, and it changes over time.
- Each person has a name (made up, from a short list), a kind (casual 40%, short contract 30%, salaried 30%), a Pastoral Award level (1 to 8), three skills from 1 to 5 (fencing, stock work, water and pipe; around half their level), whether they bring dogs (likelier with stock skill), and the days they work. Casual and contract hands work Monday to Friday. Salaried hands work Monday to Friday, or 3 in 10 a 5-day week that takes in the weekend (Wednesday to Sunday): "Salaried hands don't work weekends. Some long-term hands do."
- **What they ask:** the award. Salaried, the full-time weekly rate for their level; casual and contract, the casual day rate (the hourly rate with 25% loading, for 7.6 hours). Super (12%) is paid on top of every dollar of wages.
- **The farm's standing with workers** (0 to 100, 80 to start) changes the list. With standing `s`, the list keeps a share `0.4 + 0.6 × s/100` of its people, dropping the most skilled first, and everyone asks `1 + 0.2 × (1 − s/100)` times the award. At 80 that is 4% above the award; at 100, the award.
- A person once hired is never listed again.

### Hiring, letting go, contracts

- `hireHand { person }` takes someone on today's list. It is a decision: none of the day. They start the next day. A contract hand's contract runs 91 days from then; at first light on its last day they leave, paid what they are owed (`hand-left`, `contract-finished`). At most 6 hands.
- `letHandGo { hand }` pays what the hand is owed at once and they leave. If the bank won't cover it, it is refused (`bank-limit`).
- Hands leave only for a reason: let go, contract ended, or wages not paid. Nobody quits at random. Because there is no roster the player can't overwork a hand, so the PRD's "limit on how hard they can be worked" is not modelled (DEVELOPMENT_LOG, calls).

### Wages and pay day

At first light each day, every hand on the books yesterday adds to what they are owed: a salaried hand a seventh of the weekly rate for every day; a casual or contract hand the day rate for a day they worked. Super is added on top. A hand off injured earns nothing from the farm (workers compensation pays them).

Pay day is every 14 days, the first 14 days after the first hand is hired. At first light on pay day each hand is paid what they are owed, first hired first, if the bank allows (cash must not go past the overdraft limit). Wages are running costs (`year.running`).

- A hand who can't be paid leaves (`hand-left`, `not-paid`) and the standing falls by 20 for each (`wages-missed`, with the standing before and after).
- When every hand is paid, the standing rises by 5, to at most 100 (`wages-paid`, with wages, super and the total).

### A hand's share of the player's jobs

On a day a hand works (started, not injured, one of their days), the first part of any job that takes time is the hands' share, done from their own day. It uses none of the player's light. The rest of the job is the player's and fits today or not by the rules of section 9.

- An average hand's day is 0.6 of the player's day on their own. REQUIREMENTS: "with a farm hand on, one-man fencing assumes the farmer and the worker are both there, so about 800 m a day instead of 500 m". So a whole day of permanent fence with an average hand builds 800 m: 300 m by the hand and 500 m in the player's light.
- By skill, the job's skill (fencing for fence, tape, gates and pulling down; water for pipe, troughs, hubs and portable troughs; stock for moves, plans, weaning, marking and selling): skill 1 to 5 is 2/3, 5/6, 1, 7/6 or 4/3 of the average. A hand with dogs does stock work 2.5 ÷ 1.5 times as fast (PRD 21 row 17: 2.5 km/h with dogs against 1.5).
- Measured in the player's minutes: a hand can take `(1 − share used today) × the day's minutes × their share` minutes of the job's work. Several hands take it in the order they were hired. What is used is kept for the day (`labour.help`) and reset at first light.
- For a line, the pieces wholly in the hands' share are the first part of the line (`JobCard.hands.pieces` and `metres`): the screen can mark them. The player's minutes (`workMin`) are the rest. A line still stops at the whole pieces that fit in the hands' share and the player's light left. At last light no job can start, as before.
- The job card and the `job-worked` event carry the hands' minutes (`hands.workMin`, `handsMin`) and each hand's part.

### Standing duties

At first light, on a day hands work, they do from their own day, by the same rules and at the same price as the player: fill each portable trough under its low mark (a quarter full), and put each knocked-down electric fence or tape back up. Each uses the hands' share as the job would (30 minutes for a trough; a segment of fence at its pace). A duty the hands have no time left for, or the bank won't cover, is not done. Each is a `hand-duty` event. Plan moves need nobody (section 10); the worker report shows them as done by a hand on the days one is on the books (PRD 5.2: "A farm hand does the planned moves").

### Injury

At first light, for each hand who worked yesterday, one draw from the farm's own injury stream (kept in `labour.rng`, so a farm's injuries are repeatable and no other stream moves): hurt with chance `9.6 per million hours × 7.6 hours`, times 1.5 on a day they were fencing (about 1 in 14,000 a day worked, about 1 in 50 a year of full-time work). A hurt hand is off for 45 days (the median time lost), earns nothing from the farm, and the farm pays one week of their wages as its share of the claim (a stand-in; it differs by state). `hand-injured` says when, whether they were fencing and when they are back; `hand-back` when they are.

### Contract fencing

`orderContractFence { edges, team: 1 | 2, handsHelp? }`: permanent fence only, by a 1-man team (500 m a day) or a 2-man team (1,000 m a day). It is a decision: none of the player's day.

- The pieces are the segments of the line that are not the boundary, a gate or permanent fence already, in the order drawn. The bank must be able to cover the whole run when it is ordered (materials, with materials on hand at half price first, plus labour at $5 a metre, the same for either team). Nothing is charged when it is ordered.
- The team works Monday to Friday and starts at first light on the next day it works. Each working day at first light it adds its metres (and, with `handsHelp`, the hands' fencing day in metres of permanent fence at the player's pace) to its progress, and builds whole segments in order while the progress covers one. It is charged for what it builds that day: materials by the player's own rules and price, and labour by the metre. Materials are infrastructure (in the ledger, as for the player's fence); labour is spent (`year.infra`, not in the ledger).
- It needs nothing from the player each day. It carries on through Next day and skips, and a skip does not stop for it.
- `contract-built` reports each day's metres, the hands' part, the metres left, the cost and the day it will be done. `contract-finished` reports the whole.
- **It stops for a reason only**, with `contract-stopped` and why: `no-money` (the bank won't cover the day's work; nothing is built or charged that day), or `line-changed` (a segment still to build has a different fence on it from when the run was ordered: the player put tape or electric there). A segment the player built in permanent fence, or put a gate on, is skipped without fuss.
- `cancelContractFence { run }` stops it. What is built stays and what was charged stays paid.
- **The player's own fence alongside is told apart in the read.** `contractView` gives each run's segments built (`built`, the contractor's fence) and still to build (`left`). Any other fence is the player's. The map draws the first in the contractor's colour while the run is under way.
- `contractView` also gives "under way, N m left, done on <day>": the metres left, the next working day and the day it will be done at the team's pace (hands helping make it sooner and are not counted, as they may be off).

### Reads and what a screen may show

`labourPool`, `standingOf`, `workforceView`, `contractView`, `workerReport` (`labour/reads.ts`), and on the job card `hands` and `contract`. A screen shows names, kinds, days, pay, skill ratings, dogs, the standing as a number, pay days, what is owed, what was done, and contract fencing under way. It never shows a chance of injury, the draws behind the list, or a formula (CLAUDE.md rule 14). Every event states facts: people are described by what they do, their days and their pay. The worker report (`workerReport(farm, sinceSeq)`) is one item for each speech bubble: the workforce's inbox messages since a message number, and plan moves on days a hand was on the books.

### Saves

Save format 9. `farm.labour` (hands, standing, people taken, the next pay day, runs under way, today's help and the injury stream) is saved, loaded and hashed with the farm. A save from format 8 or older has none and loads with no hands and no contract fencing. Save, load and carry on equals running straight through, mid-run.
