# Datasets and figures

Every real-world number the game runs on, copied out of `grazing-game.html` (v15). A rebuild should start from these tables, not from memory. If you change a figure, change it here too and say why in `docs/DEVELOPMENT_LOG.md`.

## Districts (`REGIONS`)

`g` is typical native pasture growth, kg DM/ha/day, Jan to Dec. Multiply by `scale` for the district. `annual` = sum(g) × 30.4 × scale. `peak` = the highest month × scale.

The rebuild carries the four launch districts (cq, nsw, cw, wv) in `packages/engine/src/data/districts.ts`, checked figure for figure against the MVP by a test. The Top End (nt) figures stay here for when it comes back.

| Key | District (place) | Grasses | Rain pattern |
|---|---|---|---|
| cq | Central Queensland (Emerald) | Black spear grass, Qld bluegrass, Indian couch | Summer rain, long dry winter–spring, light frosts |
| nt | Top End NT (Katherine) | Ribbon grass, black spear grass, annual sorghum | Monsoon Dec–Mar, then a 7-month dry |
| nsw | Northern Tablelands NSW (Armidale) | Red grass, wallaby grass, weeping rice grass | Summer-dominant rain, hard frosty winters |
| cw | Central West NSW (Dubbo) | Wallaby grass, speargrass, red grass | Rain through the year, big spring flush |
| wv | Western Victoria (Hamilton) | Kangaroo grass, wallaby grass, weeping grass | Winter–spring rain, dry summer |

| Key | g (Jan→Dec) | scale | bmax kg DM/ha | DMD max / min / dead | CP max % | Frost months (sen/day) | Heading months | Safe util |
|---|---|---|---|---|---|---|---|---|
| cq | 42,46,34,15,6,2,1,1,2,6,18,32 | 1 | 5500 | .66 / .48 / .50 | 11 | Jun–Aug (.012) | Feb–Apr | .25 |
| nt | 56,60,44,14,3,1,0,0,0,3,14,40 | .45 | 7000 | .64 / .47 / .48 | 10 | none | Mar–May | .20 |
| nsw | 34,31,25,16,7,2,1,3,10,24,33,37 | .9 | 5000 | .70 / .51 / .50 | 14 | May–Aug (.010) | Nov–Feb | .35 |
| cw | 16,16,20,22,15,8,7,12,28,38,26,18 | .8 | 4500 | .70 / .51 / .50 | 14 | Jun–Aug (.006) | Oct–Dec | .30 |
| wv | 5,4,8,16,18,12,10,18,40,55,40,15 | 1 | 5000 | .72 / .52 / .51 | 16 | none | Oct–Jan | .40 |

(Month indexes in code are 0-based: `head:[1,2,3]` = Feb–Apr.)

## District towns, for daylight

First light and last light are worked out for each district's town (PRD 14.4), using the standard NOAA solar equations for civil dawn and dusk (sun 6 degrees below the horizon). Coordinates are the Bureau of Meteorology station for each town, read from the Bureau's climate statistics pages on 13 Nov 2026 (`https://www.bom.gov.au/climate/averages/tables/cw_<station number>.shtml`).

| District | Town | Station | Latitude | Longitude | Time zone |
|---|---|---|---|---|---|
| cq | Emerald | Emerald Airport (035264) | 23.57 S | 148.18 E | Australia/Brisbane (no daylight saving) |
| nsw | Armidale | Armidale Airport AWS (056238) | 30.53 S | 151.62 E | Australia/Sydney |
| cw | Dubbo | Dubbo Airport AWS (065070) | 32.22 S | 148.58 E | Australia/Sydney |
| wv | Hamilton | Hamilton Airport (090173) | 37.65 S | 142.06 E | Australia/Melbourne |

Daylight saving comes from the time zone database, so past real years use the rules of their day.

**Checked against a published table (13 Nov 2026).** The calculated times were compared with the US Naval Observatory's civil twilight times for the same coordinates (`https://aa.usno.navy.mil/api/rstt/oneday?date=<date>&coords=<lat>,<lon>&tz=10`, read 13 Nov 2026). Six dates for each of the four towns: 20 Mar, 21 Jun, 23 Sep and 21 Dec 2026, 15 Jan 1997 and 4 Jul 2010. The published times are rounded to the minute. The biggest difference in 48 times was 1.2 minutes, and 46 of the 48 were under one minute. The published times are kept in `packages/engine/src/daylight/daylight.test.ts`, and the test fails if any calculated time is more than 2 minutes out.

## Farm sizes (`FARMS`, ha: small / medium / large)

| cq | nt | nsw | cw | wv |
|---|---|---|---|---|
| 1,000 / 4,000 / 12,000 | 15,000 / 50,000 / 150,000 | 300 / 1,000 / 3,000 | 500 / 2,000 / 6,000 | 200 / 600 / 1,500 |

The grid is always 40 × 26 squares, so `HA` (ha per square) = farm ha ÷ 1,040 and `S.side` (m per square) = √(HA × 10,000).

## Seasons (`drawSeason`, redrawn each July)

| Factor × normal growth | Label | Chance |
|---|---|---|
| 0.5 | Drought | 10% |
| 0.7 | Well below average | 14% |
| 0.85 | Below average | 20% |
| 1.0 | Average | 24% |
| 1.15 | Above average | 18% |
| 1.35 | Wet | 14% |

Each month wobbles: `monthF = rainF × rand(0.65–1.35)`, clamped 0.15–1.9. It is redrawn on the 1st of every month, including the farm's first day. The season is redrawn on 1 July, but not if 1 July is the farm's first day.

The 540-day spin-up before the start has its own season, drawn separately and lifted to at least 0.85. Its monthly wobble is smaller: `rainF × rand(0.7–1.3)`, clamped 0.2–1.8. The wobble starts on the first 1st of a month in the spin-up. Until then the month factor is the season factor.

With these six seasons neither pair of limits is ever reached (the lowest month factor is 0.5 × 0.65 = 0.325 and the highest 1.35 × 1.35 = 1.82).

In the rebuild the same chances, ranges and limits are drawn from the farm's seed (`packages/engine/src/season/randomSeasons.ts`), so a farm's seasons are repeatable. Real weather replaces them in milestone 1.4.

## Market

`MKT`: restocker yearling steer indicator, c/kg live weight, monthly Jan 2019 to Dec 2025 (eastern Australia).

> **Warning: approximate.** This series was written from memory during the build, not from a data source. It follows the real shape (the 2019 low, the 2021–22 peak near 690, the 2023 crash near 200, then the recovery), but the monthly values are not exact. In the rebuild, replace it with real MLA restocker yearling steer indicator data and record the source and date here.

```
2019: 280 255 262 272 282 292 302 312 302 305 330 352
2020: 385 425 432 452 470 452 442 462 472 482 492 522
2021: 562 602 622 612 602 622 642 652 642 652 642 662
2022: 682 692 662 642 602 582 562 542 522 482 422 402
2023: 412 392 342 302 292 262 272 242 202 242 282 332
2024: 342 332 312 322 302 292 312 332 332 352 352 362
2025: 372 382 392 402 412 402 412 422 432 442 452 452
```

After 2025 it continues as a random walk pulling toward 430 c/kg (6% a month), ±20 c/kg noise, a 5% chance of a ±60 shock, clamped 180–760. A daily wobble (`S.noise`) and a per-class drift of ±20% sit on top.

Class multipliers on the indicator (`MCLS`):

| Class | Who | × |
|---|---|---|
| wean | steers < 280 kg | 1.08 |
| feed | steers 280–450 kg | 1.00 |
| heavy | steers ≥ 450 kg | 0.90 |
| wheif | heifers < 280 kg | 0.92 |
| heifer | heifers ≥ 280 kg | 0.85 |
| cow | cows | 0.64 |
| bull | bulls | 0.58 |
| calf | calves | 1.10 |

Adjustments: cows CS < 2 × 0.85, CS ≥ 3 × 1.05; other non-bull, non-calf stock at CS < 2 × 0.86. Pregnant females (≥ 50 days) add $320 × (indicator ÷ 400). Selling costs 5% commission plus $30/head. Bulls bought for the starting herd are valued at $5,500 × (indicator ÷ 400).

## Saleyard classes (`BUYS`)

| Class | Weight kg | Age days | CS | Extra |
|---|---|---|---|---|
| Weaner steers | 190–235 | 220–270 | 2.4–3.2 | |
| Yearling steers | 300–360 | 420–500 | 2.6–3.3 | |
| Weaner heifers | 180–225 | 220–270 | 2.4–3.2 | |
| Joining heifers (15 mo) | 300–345 | 430–480 | 2.8–3.4 | parity 0 |
| Dry cows (empty) | 410–470 | 1500–2400 | 2.3–3.0 | |
| PTIC cows | 450–520 | 1500–2400 | 2.8–3.4 | 100–210 days pregnant |
| Cow & calf units | 430–490 | 1500–2400 | 2.6–3.2 | calf 60–140 days |
| Bulls | 700–820 | 1000–1500 | 3.0–3.6 | |

About 4% of females are born or bought barren (never get in calf).

## Infrastructure and running costs

| Item | Cost |
|---|---|
| Permanent fence | $7/m |
| Electric fence | $3.60/m, plus a $900 solar energiser once |
| Temporary tape | $0.90/m new; $10 to roll up or roll out reused tape (shown as $45 a square on the default farm) |
| Pipe | $4.80/m |
| Trough | $1,500; moving one $300 |
| Gate | $450 |
| Water hub on a square | trough + $450 per gate (4 gates, all open) |
| Water hub on a fence line or corner | trough + $500 |
| Portable trough | $600 with 6,000 L; refill $45; move $10; sells back for half |
| Fix a knocked-down fence | $25 |
| Marking | $8 per calf, $25 per older unmarked bull (castrating an older bull costs 3% of its weight) |
| Health (vaccines, drench, tags) | $20/head/yr cq, $12 nt, $30 elsewhere |
| Overheads (rates, fuel, repairs, insurance) | $4,000 + $0.60/ha/yr |
| Interest | 9.5% on overdraft, 3% earned on credit |
| Convert pasture to cropping | $150/ha |

Fence and pipe costs are per metre, so a segment costs `PER_M × S.side`, and big northern farms pay more per square.

Water use: 10% of live weight in litres a day, × 1.3 in summer (Dec–Feb), × 0.8 in winter (Jun–Aug).

## Supplements (`FEED`)

| Feed | Cost | What it does |
|---|---|---|
| Lick (urea/protein) | $0.15/head/day when CP < 9%, 20% of that on green feed; calves 40% | Pasture intake × 1.25 if diet CP < 7%, × 1.08 if CP 7–9% |
| Hay | $0.28/kg, 3 kg/head/day | ME 8.4, CP 9%; replaces 0.5 kg pasture per kg |
| Pellets | $0.50/kg, 2 kg/head/day | ME 12.5, CP 16%; replaces 0.3 kg pasture per kg |
| Feedlot | $0.40/kg ration + $0.35/head/day yard | ME 11.6, CP 14%; full intake (calves 60%) |

## Money and difficulty

`ccAEfor(region, ha)` = ha × annual growth × 0.65 × util ÷ 3,285 (long-term carrying capacity, AE).
`cashBase` = max($50,000, ccAE × 0.5 × $950, rounded to $10k).

| Difficulty | Cash × base | Overdraft × base | Bank takes the farm at × base |
|---|---|---|---|
| Easy | 2 | 1 | 1.3 |
| Medium | 1 | 0.6 | 0.8 |
| Hard | 0.45 | 0.3 | 0.4 |

Taking over an established farm with a herd gives 25% of the cash (the herd is the capital). The defaults without setup are $50,000 cash, -$80,000 overdraft and game over at -$100,000. The game also ends after 10 days of the whole farm under 40 kg DM/ha available with cattle on it.

## Established farm layout

- One to two vertical and zero to one horizontal full-length fence lines (30% electric), each with a shut gate. Every paddock gets at least one gate.
- A running farm pipes water to a trough in every paddock over 2% of the farm. It adds waters until no point is more than about 2 km from water, at about one water per 2,500 ha and at most 8 per paddock.
- Starting herd: 35–65% of carrying capacity. Cows = AE × 0.65 ÷ 1.05 (55% PTIC, 25% with calves, 20% dry), one bull per 40 cows, weaners = AE × 0.3 ÷ 0.55, split steers and heifers. Northern places (cq, nt) start on lick.

## Sown pastures, forages and crops (`SPECIES`)

`g` = growth kg DM/ha/day Jan→Dec once established. `cost` = $/ha to establish. Days are from sowing. Sow months are 1-based here.

### Perennial pastures

| Key | Name | DMD | CP % (dead) | bmax | Estab days | Life yrs | Sow | $/ha |
|---|---|---|---|---|---|---|---|---|
| buffel | Buffel grass + butterfly pea | .64 | 12 (6) | 8000 | 150 | 25 | Nov–Feb | 120 |
| leucaena | Leucaena + buffel | .70 | 20 (10) | 7000 | 365 | 30 | Nov–Jan | 450 |
| stylo | Stylo, oversown into native | native +.02 | native +4 (dead +2) | native | 120 | 20 | Dec–Feb | 40 |
| jarra | Jarra digit grass | .64 | 10 (5) | 9000 | 120 | 15 | Dec–Jan | 150 |
| phal | Phalaris + sub clover | .74 | 20 (7) | 6500 | 200 | 6 | Mar–May, Sep | 350 |
| rye | Perennial ryegrass + white clover | .77 | 23 (7) | 6000 | 150 | 5 | Mar–May, Sep | 300 |
| lucerne | Lucerne | .70 | 22 (12) | 6000 | 150 | 6 | Mar, Apr, Sep | 400 |
| multi | Multi-species mix (chicory, plantain, clovers, cocksfoot, fescue) | .76 | 22 (8) | 6000 | 120 | 5 | Mar–May, Sep–Oct | 450 |

Growth curves (kg DM/ha/day, Jan→Dec):

- buffel 60,62,48,22,9,4,2,2,4,10,30,50
- leucaena 50,55,45,28,14,8,6,7,12,20,35,45
- stylo: native curve × 1.05
- jarra 50,55,40,12,4,1,0,0,0,3,15,40
- phal: nsw 25,20,22,28,20,8,5,12,35,55,48,32; cw 12,10,18,30,22,12,10,20,45,60,38,18; wv 8,6,15,32,28,18,14,28,55,72,55,20
- rye: nsw 28,22,24,30,18,6,4,10,38,60,50,35; wv 10,8,15,30,28,18,15,30,60,80,60,25
- lucerne: cw 45,38,30,22,10,4,3,8,25,45,55,50; nsw 38,32,25,15,6,2,1,5,18,38,45,42
- multi: nsw 35,30,28,30,18,7,5,12,35,52,48,40; cw 25,22,25,30,20,10,8,18,40,52,40,30; wv 20,15,20,32,26,15,12,25,52,68,55,30

Establishing pasture grows at 20% rising to 100% over the establishment days. Past its life it loses 15% a year (floor 55%), with DMD down to 0.1 and CP down to 8 points.

### Grain crops

| Key | Name | Veg DMD / CP | Estab | Lock-up | Heading | Mature | Yield t/ha | $/t | Harvest $/ha | Sow $/ha | Sow months | Graze while growing? |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| oats | Oats (graze & grain) | .78 / 22 | 50 | 110 | 150 | 200 | 2.5 | 300 | 60 | 220 | Feb–May | yes, until lock-up |
| wheat | Dual-purpose wheat | .78 / 24 | 60 | 100 | 150 | 200 | 3.0 | 330 | 65 | 320 | Mar–May | yes, until lock-up |
| barley | Barley (grain) | .76 / 20 | 50 | 70 | 130 | 180 | 3.2 | 280 | 60 | 300 | May–Jun | no |
| grsorg | Grain sorghum | .70 / 14 | 35 | 45 | 80 | 120 | 3.5 | 300 | 60 | 300 | Oct–Jan | no |

### Annual forages

| Key | Name | DMD / CP | Estab | Life days | bmax | $/ha | Sow | Notes |
|---|---|---|---|---|---|---|---|---|
| forsorg | Forage sorghum | .72 / 16 | 45 | 200 | 14000 | 200 | Oct–Jan | prussic acid risk before 6–8 weeks |
| millet | Japanese millet | .72 / 16 | 40 | 130 | 9000 | 150 | Oct–Dec | summer curve × 0.8 |
| annrye | Annual ryegrass | .80 / 24 | 50 | 250 | 7000 | 180 | Mar–May | about 10–12% comes back from seed for one year |
| brass | Summer brassica (rape/turnip) | .84 / 18 | 50 | 140 | 8000 | 260 | Oct–Nov | |

Crop curves: WINTER 5,5,15,30,35,30,30,45,75,85,55,15; SUMMER 90,95,70,30,8,2,0,0,10,40,70,85; BRASS 60,55,40,20,5,0,0,0,15,45,65,65.

Crop stage quality: leafy until lock-up, then DMD falls by 0.1 and CP to 60% by heading, then to DMD 0.58 and CP 7% at maturity. A finished crop is DMD 0.52, CP 5%. Growth is 25% → 100% while establishing, then 30% while heading, and nothing once done.

How well crops do by district (`CROPF`): cq 0.8, nt 0.8, nsw 0.95, cw 0.9, wv 1.1. Yield is scaled by (season factor, clamped 0.4–1.4)^0.8.

### What each district can plant (`LAND_OPTS`) and its rotation (`ROTATION`)

| District | Options | Rotation blocks |
|---|---|---|
| cq | buffel, leucaena, stylo, forage sorghum, grain sorghum, wheat, oats | wheat, grain sorghum, forage sorghum (+ fallow) |
| nt | stylo, jarra, forage sorghum, grain sorghum | grain sorghum, forage sorghum (+ fallow) |
| nsw | phalaris, ryegrass, multi-species, lucerne, oats, annual rye, millet | oats, annual rye, millet (+ fallow) |
| cw | lucerne, phalaris, multi-species, wheat, barley, oats, forage sorghum | wheat, barley, oats (+ fallow) |
| wv | ryegrass, phalaris, multi-species, annual rye, oats, wheat, barley, brassica | wheat, barley, annual rye (+ fallow) |

### Arable share of the farm (`ARABLE`, %)

| District | Grazing farm (random range) | Mixed farm choices |
|---|---|---|
| cq | 0–12 | 10, 25, 40, 60 |
| nt | 0–1 | 1, 2, 3, 5 |
| nsw | 0–8 | 5, 10, 20, 30 |
| cw | 5–20 | 20, 40, 60, 80 |
| wv | 0–10 | 10, 20, 35, 50 |

## Stubble and fallow

- Stubble after harvest: dead = clamp(old dead × 0.5 + yield t/ha × 600, 1,500–3,500) kg DM/ha. Quality DMD 0.45, CP 4%. No regrowth. It breaks down 0.4% a day and becomes fallow under 400 kg DM/ha.
- Fallow: bare worked soil. DMD 0.42, CP 3%. No growth until sown. Any dead material lying on it breaks down 3% a day.
- An unharvested crop becomes stubble 60 days after maturity, with the grain lost. Grain starts shedding (3% a day) 30 days after maturity.
