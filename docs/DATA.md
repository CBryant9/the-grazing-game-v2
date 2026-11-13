# Datasets and figures

Every real-world number the game runs on, copied out of `grazing-game.html` (v15). A rebuild should start from these tables, not from memory. If you change a figure, change it here too and say why in `docs/DEVELOPMENT_LOG.md`.

## Districts (`REGIONS`)

`g` is typical native pasture growth, kg DM/ha/day, Jan to Dec. Multiply by `scale` for the district. `annual` = sum(g) × 30.4 × scale.

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

Each month wobbles: `monthF = rainF × rand(0.65–1.35)`, clamped 0.15–1.9. The 540-day spin-up before the start uses a season of at least 0.85.

## Market

`MKT`: restocker yearling steer indicator, c/kg live weight, monthly Jan 2019 to Dec 2025 (eastern Australia).

> **Warning: approximate.** This series was written from memory during the build, not from a data source. It follows the real shape (the 2019 low, the 2021–22 peak near 690, the 2023 crash near 200, then the recovery), but the monthly values are not exact. In the rebuild, replace it with real MLA restocker yearling steer indicator data and record the source and date here.
>
> **Superseded from milestone 1.4.** The real MLA series has been pulled and is recorded under "Real data sources" below. Once milestone 1.4 wires it into the engine, the game no longer plays from this approximate series or the random walk after 2025. They are not deleted: BUILD_PLAN section 9 keeps a stand-in series as the fallback if MLA withdraws permission.

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

## Real data sources

Real price and weather history, pulled once by the scripts in `scripts/data/` (see the README there) and kept in `packages/engine/data/raw/`. `manifest.json` in that folder lists every table with its source address, units, first and last date, row count and the date pulled. A test (`packages/engine/src/data/raw-data.test.ts`) checks every table against it.

**Status: pulled, not wired in.** Nothing in the engine reads these tables yet. Milestone 1.4 wires them in, with the mapping from MLA indicators to the game's classes and the soil-water growth factor. From then the approximate `MKT` series above is superseded for play, and kept only as the fallback.

These tables are server-side engine data. Browser code must never import them (rule 14).

### Prices: Meat & Livestock Australia

- **Source:** Meat & Livestock Australia's public statistics service, which carries the National Livestock Reporting Service figures. `https://api-mlastatistics.mla.com.au`, no key. Documentation: `https://app.nlrsreports.mla.com.au/statistics/documentation`.
- **Credit line** (wherever these prices are shown): "Reproduced courtesy of Meat & Livestock Australia Limited – www.mla.com.au".
- **Terms:** every answer from the service points to MLA's Market Report and Information Terms of Use. Claudia emails MLA for written confirmation of commercial use before launch (PRD 5.14).
- **Pulled:** 13 Nov 2026, up to 12 Nov 2026. About 1,300 requests over about 105 minutes, one at a time: 1,207 answers kept in the cache, about 90 tries that failed on MLA's side, and about 17 test requests made by hand. The script's own tally (1,046 requests, 69 failed) is lower because it misses three runs that were stopped by hand. **The pull is not finished.** What is left is listed below.
- **Checked on the day:** the indicator IDs against the service's `/indicator` list and the yard IDs against `/saleyard`. For every series pulled, the row count matches the count the service gives for the whole range.
- **Changed in form only:** one file per series, values rounded to 2 decimal places, head counts to whole numbers. Rows are as served.

**What a price row is.** `date,value,head`. One row for each calendar day the service gives, weekends included. `value` is cents per kg, live weight (lwt) or carcase weight (cwt) as listed. `head` is the head counted in the indicator. Each figure covers the last seven days of sales. At a yard that means the value repeats for seven days after a sale, then the rows stop if no sale follows. Nationally the value changes on most days, in every year from 1997.

**National indicators pulled** (all yards that feed the indicator):

| File | MLA indicator (ID) | Unit | First | Last | Rows |
|---|---|---|---|---|---|
| `mla/national/restocker-yearling-steer.csv` | National Restocker Yearling Steer (2) | c/kg lwt | 21 Oct 1996 | 12 Nov 2026 | 10,770 |
| `mla/national/restocker-yearling-heifer.csv` | National Restocker Yearling Heifer (12) | c/kg lwt | 2 Dec 1996 | 12 Nov 2026 | 10,736 |
| `mla/national/feeder-steer.csv` | National Feeder Steer (3) | c/kg lwt | 16 Jun 2003 | 12 Nov 2026 | 8,390 |
| `mla/national/feeder-heifer.csv` | National Feeder Heifer (17) | c/kg lwt | 16 Jun 2003 | 12 Nov 2026 | 8,379 |
| `mla/national/heavy-steer.csv` | National Heavy Steer (4) | c/kg lwt | 12 Jul 1996 | 12 Nov 2026 | 10,916 |
| `mla/national/processor-cow.csv` | National Processor Cow (13) | c/kg lwt | 12 Jul 1996 | 12 Nov 2026 | 10,916 |
| `mla/national/eastern-young-cattle.csv` | Eastern Young Cattle Indicator (0) | c/kg cwt | 15 Jul 1996 | 12 Nov 2026 | 10,882 |

Gaps (days with no row):

- **Christmas and New Year.** Most years have a break, but not all: each table has 21 to 25 of them in 30 years. They run from a day or two up to 11 days (12 for the Eastern Young Cattle Indicator, 14 for the two restocker indicators at Christmas 1996).
- **Early 1997, inside the first game year.** Restocker steers: 30 Jan to 2 Feb 1997. Restocker heifers: 27 to 29 Jan and 24 Feb to 2 Mar 1997.
- **Late 1996, before the game's years.** Restocker steers: 4 to 10 Nov and 18 Nov to 1 Dec 1996.
- The other five tables have no gaps outside Christmas and New Year.
- Feeder steers and heifers start in June 2003, so the 1997 to 2003 game years need another indicator to stand in for them.

**Yard indicators pulled.** Only the restocker yearling steer indicator, at each district's cattle yard:

| File | Yard | First | Last | Rows | Gaps to know about |
|---|---|---|---|---|---|
| `mla/yards/GME/restocker-yearling-steer.csv` | CQLX Gracemere (cq) | 10 Oct 2014 | 12 Nov 2026 | 3,810 | Nothing before October 2014 |
| `mla/yards/ARM/restocker-yearling-steer.csv` | Armidale (nsw) | 23 Jan 1997 | 11 Nov 2026 | 8,701 | No rows from 11 Jun to 4 Nov 2026, though the yard held 10 sales in that time. Fewer rows from 2020, when sales went fortnightly |
| `mla/yards/DUB/restocker-yearling-steer.csv` | Dubbo (cw) | 6 Mar 1997 | 12 Nov 2026 | 9,378 | Thin in 1997 and 1998 (50 and 25 rows). The longest gap is 4 May 1997 to 23 Apr 1998 |
| `mla/yards/MTL/restocker-yearling-steer.csv` | Mortlake (wv) | 29 Jan 2018 | 8 Mar 2026 | 1,141 | Nothing before 2018. None in 2023, and one week a year in 2024, 2025 and 2026 |

Where a yard's own history is short or thin, the national indicator or a nearby yard fills in (BUILD_PLAN section 3). The rule for that is milestone 1.4 work.

**What each district yard has on the service** (first date and row count, from one request per series on 13 Nov 2026):

| Indicator | Gracemere `GME` | Armidale `ARM` | Dubbo `DUB` | Mortlake `MTL` |
|---|---|---|---|---|
| Restocker yearling steer | Oct 2014, 3,810 (pulled) | Jan 1997, 8,701 (pulled) | Mar 1997, 9,378 (pulled) | Jan 2018, 1,141 (pulled) |
| Restocker yearling heifer | Oct 2014, 3,810 | Jan 1997, 7,245 | Jan 1997, 8,714 | Jan 2018, 1,218 |
| Feeder steer | Oct 2014, 3,808 | Jun 2003, 5,981 | Jun 2003, 7,962 | Jan 2018, 2,629 |
| Feeder heifer | Oct 2014, 3,808 | Jul 2003, 5,344 | Jun 2003, 7,853 | Jan 2018, 2,657 |
| Heavy steer | Nov 1999, 5,270 | Sep 1996, 8,389 | Jul 1996, 10,385 | Jan 2018, 2,783 |
| Processor cow | Nov 1999, 5,368 | Sep 1996, 8,970 | Jul 1996, 10,405 | Jan 2018, 2,825 |
| Eastern Young Cattle Indicator | nothing served | Sep 1996, 8,970 | Jul 1996, 10,412 | nothing served |
| National Young Cattle (14) | not given by yard | not given by yard | not given by yard | not given by yard |

The service will not give the National Young Cattle Indicator by yard. Its answer: "Indicators that contain online livestock sales data are not available via the Indicators by Saleyard endpoint."

Sheep, sized but not pulled: Dubbo has all six sheep indicators (light, trade, heavy, Merino and restocker lamb, and mutton) from between July 1996 and January 1997, 8,525 to 10,185 rows each. Hamilton `HAM` has the same six from between April and November 1997, 6,179 to 10,276 rows each.

**Sale days pulled** (from the service's yardings report, cattle):

| File | Yard | First | Last | Sale days | Pattern in the data |
|---|---|---|---|---|---|
| `mla/sales/GME-cattle.csv` | CQLX Gracemere | 8 Nov 1999 | 11 Nov 2026 | 788 | Prime sales on Mondays 1999 to 2004, Fridays from October 2014 to 2019, Wednesdays from 2020. One or two store sales a year from 2018. **Nothing served from 17 Aug 2004 to 9 Oct 2014** (2004 has 30 sale days, the last on 16 Aug) |
| `mla/sales/ARM-cattle.csv` | Armidale | 5 Sep 1996 | 5 Nov 2026 | 1,301 | Thursdays. About weekly to 2019 (38 to 52 a year), about fortnightly from 2020 (24 to 31 a year). A few store sales on Fridays |
| `mla/sales/DUB-cattle.csv` | Dubbo | 15 Jul 1996 | 12 Nov 2026 | 2,474 | Prime sales on Mondays and Thursdays to 2004, Thursdays only from 2005. Store sales on Fridays from 2001 (about 30 a year to 2017, fewer since) |
| `mla/sales/MTL-cattle.csv` | Mortlake | 29 Jan 2018 | 12 Nov 2026 | 499 | Prime sales on Mondays. Store sales on Thursdays from 2023 (20 to 25 a year). **Nothing before 2018** |

- `mla/sales/*.csv` is `date,head`: each day the yard held a sale and the head yarded, every sale type that day added together.
- `mla/yardings/*.csv` is the report as served, `date,type,head`, with `type` Prime or Store.
- How the sale days were found: straight from the yardings report, which is small (500 to 2,477 rows a yard). As a check, 547 of the 554 changes in Gracemere's restocker steer indicator fall on a sale day in the yardings table.
- **Sale days missing from the service** need a stand-in in milestone 1.4: Gracemere from 1997 to 7 Nov 1999 and from 17 Aug 2004 to 9 Oct 2014, and Mortlake before 29 Jan 2018.
- **Fill-in yards are proposed, not agreed.** The milestone brief named Emerald (for Gracemere), IRLX Inverell (for Armidale) and CVLX Ballarat (for Mortlake and Hamilton) as nearby yards to cover short histories. They are not in the PRD or the build plan, and none has been pulled. Armidale's own history turns out to be long, so Inverell may not be needed. **A question for Claudia** before any of them is used.

**Not pulled yet** (the scripts carry on from the cache, so nothing above is fetched again):

| What | Size |
|---|---|
| National Young Cattle Indicator (14), from 21 Oct 1996 | about 110 requests |
| Six national sheep indicators: Light Lamb (6), Trade Lamb (7), Heavy Lamb (8), Merino Lamb (9), Restocker Lamb (10), Mutton (11), all from mid to late 1996 | about 670 requests |
| The other cattle indicators at Gracemere, Armidale, Dubbo and Mortlake (table above) | about 1,730 requests |
| Sheep indicators at Dubbo and Hamilton | about 1,320 requests |
| Sheep and lamb yardings and sale days at Dubbo and Hamilton | not sized, small |
| Proposed fill-in yards, if Claudia agrees: Emerald `EME`, IRLX Inverell `INV`, CVLX Ballarat `BAL` (indicators, yardings, sale days) | not sized |

To carry on: `pnpm data:mla`, or a stage at a time, for example `node scripts/data/pull-mla.mjs --only=national --species=Sheep`.

**How the service behaved on 13 Nov 2026:**

- 100 rows a page, no bulk download, and no page-size setting (an unknown setting gets HTTP 404).
- Deep pages of a long range fail: page 60 of a 30-year request timed out after 29 seconds. The script asks for fixed 100-day windows instead.
- About 7 requests in 100 came back as HTTP 500 from inside the service ("Throttling ... ListExports", "Endpoint currently unavailable due to loging request issue"). The same request worked after a wait. The rate was the same at one request every two seconds and one every three. Once a request failed three times running and the script stopped, as designed. Once a request needed four tries.
- Asking for today's date returned HTTP 500. The script asks up to yesterday.
- Two indicators in one request returned HTTP 500. The `/report` list of endpoints returned HTTP 500.
- Yardings pages come back in no date order, so the script walks them by date window.

### Weather: SILO

- **Source:** SILO Data Drill, Queensland Government (Long Paddock). `https://www.longpaddock.qld.gov.au/cgi-bin/silo/DataDrillDataset.php`. It asks for an email address as the user name. The address is kept in `SILO_CONTACT_EMAIL` in the untracked `.env.local`, never in the repo.
- **Credit line, with its change notice:** "Climate data: SILO, Queensland Government (© State of Queensland), CC BY 4.0, built from Bureau of Meteorology observations. The data has been reformatted." Use the two sentences together. The same wording is in `manifest.json`.
- **Licence:** Creative Commons Attribution 4.0 International. SILO's access page says users may copy, change and pass on the data if they credit SILO as the source and say whether the data was changed. **Ours was changed in form only:** one file per district, six of SILO's variables, the source-code columns counted and then dropped. The values are as served. Once milestone 1.4 works a soil-water figure out of it, the change notice needs to say so.
- **Pulled:** 13 Nov 2026, four requests, one per district. 1 Jan 1990 to 12 Nov 2026, 13,465 days each, no gaps.
- **What a row is:** one day at one point on SILO's 0.05 degree grid. Data Drill values are worked out from the weather stations around the point, so they are not one station's record.

| File | Town | Grid point | Elevation SILO gives |
|---|---|---|---|
| `silo/cq.csv` | Emerald, Qld | 23.55 S, 148.20 E | 182.3 m |
| `silo/nsw.csv` | Armidale, NSW (the grid point nearest the airport) | 30.55 S, 151.60 E | 1,045.0 m |
| `silo/cw.csv` | Dubbo, NSW | 32.20 S, 148.60 E | 265.0 m |
| `silo/wv.csv` | Hamilton, Vic | 37.65 S, 142.05 E | 233.9 m |

| Column | SILO variable (code) | Unit |
|---|---|---|
| `rain` | Daily rainfall (R) | mm |
| `tmax` | Maximum temperature (X) | °C |
| `tmin` | Minimum temperature (N) | °C |
| `rad` | Solar radiation (J) | MJ/m² |
| `evap` | Evaporation, "combination" (C): SILO's synthetic estimate before 1970, Class A pan from 1970. Every day here is after 1970, so it is Class A pan | mm |
| `et0` | Evapotranspiration, FAO-56 short crop (F) | mm |

The variable codes were checked on SILO's climate variables page on 13 Nov 2026.

**Where the grid points came from.** The four points were given in the milestone brief, snapped to SILO's grid. Armidale's is the grid point nearest the airport. They were not checked against a gazetteer here, and it is not recorded whether the other three sit on the town or on its airport. SILO confirmed each point it answered for and gave the elevations above. **To check before 1.4:** that each point is where Claudia wants the district's weather taken from. Moving a point is one new request.

**Gaps and soft spots:**

- **The last three days are provisional.** Evaporation for 10 to 12 Nov 2026 and maximum temperature for 12 Nov 2026 carry SILO's source code 75, which means "interpolated from the long term averages", used until the observations arrive. Pull again before using November 2026.
- **A few radiation days are long-term averages** (source code 75): 20 days at Hamilton, 9 at Dubbo, 2 at Armidale, none at Emerald, all between 1996 and 2013. Most radiation days are SILO's satellite estimate (code 42).
- Rain, minimum temperature, and maximum temperature on every other day, are interpolated from that day's observations (code 25).
- The count of each source code for each variable is in `manifest.json` under `sourceCodes`.

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
- Fallow: bare worked soil. DMD 0.42, CP 3%. No growth until sown.
- An unharvested crop becomes stubble 60 days after maturity, with the grain lost. Grain starts shedding (3% a day) 30 days after maturity.
