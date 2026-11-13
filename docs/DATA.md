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
| cw | 16,16,20,22,15,8,7,12,28,38,26,18 | .8 | 4500 | .68 / .51 / .50 | 14 | Jun–Aug (.006) | Oct–Dec | .30 |
| wv | 5,4,8,16,18,12,10,18,40,55,40,15 | 1 | 5000 | .72 / .52 / .51 | 16 | none | Oct–Jan | .40 |

(Month indexes in code are 0-based: `head:[1,2,3]` = Feb–Apr.)

**Central West `DMD max` is .68 in the rebuild. The MVP had .70.** It was tuned down in milestone 1.3 (14 Nov 2026) because Central West steers gained 154 kg a head in an average year against a benchmark of 115 to 130. At .68 they gain 128. It is a tuning value with no outside source. It sits between Central Queensland (.66) and the Northern Tablelands (.70). The other levers that were tried, and why they did not work, are in CALIBRATION.md. For Claudia to confirm.

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

The rebuild carries the four launch districts' sizes in `packages/engine/src/data/farms.ts`, checked against the MVP by a test. The grid has no yards strip beside it.

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

In the rebuild the same chances, ranges and limits are drawn from the farm's seed (`packages/engine/src/season/randomSeasons.ts`), so a farm's seasons are repeatable. From milestone 1.4 a real-year game takes its factors from real weather instead ("Growth from real weather", below). The random seasons stay for the tests that match the MVP, and their labels, the 1.9 limit and the 0.85 run-up floor carry over.

## Market

`MKT`: restocker yearling steer indicator, c/kg live weight, monthly Jan 2019 to Dec 2025 (eastern Australia).

> **Warning: approximate.** This series was written from memory during the build, not from a data source. It follows the real shape (the 2019 low, the 2021–22 peak near 690, the 2023 crash near 200, then the recovery), but the monthly values are not exact. In the rebuild, replace it with real MLA restocker yearling steer indicator data and record the source and date here.
>
> **Superseded from milestone 1.4.** A real-year farm plays on the real MLA prices ("Real prices: indicators to classes", below). It never reads this approximate series or the random walk after 2025. They are not deleted: a farm made with random seasons still runs on them, the tests that match the MVP need them, and BUILD_PLAN section 9 keeps a stand-in series as the fallback if MLA withdraws permission.

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

**The rebuild keeps this series as a stand-in, behind an interface (milestone 1.2c).** It is still the approximate series above, not real data. It lives in `packages/engine/src/market/standIn.ts` behind the engine's `PriceSource` interface, so milestone 1.4 can put real MLA prices in its place without touching the rest of the engine. Detail from the code, matched to the MVP exactly:

- The indicator for a day joins the monthly values mid-month to mid-month. Before January 2019 it holds the first value (280).
- Each month of the random walk is the last value + 6% of the gap to 430 + noise (normal, 20 c/kg) + a shock in 5% of months (normal, 60 c/kg), held between 180 and 760 and rounded to a whole c/kg. Months are drawn as they are first needed and kept with the farm.
- The daily wobble: yesterday's × 0.97 + a normal draw × 0.006, as a share of the indicator.
- Each class's drift: yesterday's × 0.985 + a normal draw × 0.007, held within ±20% of its usual multiple.
- The last 31 days of class prices are kept for the market chart.

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

Corrections from the code (milestone 1.2c):

- **Bulls are priced by the head whenever they are bought**, not only in the starting herd: $5,500 × (indicator ÷ 400) each, whatever they weigh. When a bull is sold it is priced by weight like any other beast (the bull class, 0.58 × the indicator).
- **Buying has freight**, which this table left out: $30 a head, plus $100 for each cow and calf unit. The calf at foot carries no freight of its own. Every other class is bought at its sale value (weight × its class price, with the condition and pregnancy adjustments) plus the freight.
- The starting herd is valued at the day-0 market with no freight.
- A calf at foot is sold with its mother, at the calf class price for its weight.
- The saleyard list's quick estimate for a class uses the middle of its weight range at CS 3 (150 days in calf for PTIC cows; a 110 kg calf and the $100 for cow and calf units), plus $30 a head.
## Real data sources

Real price and weather history, pulled once by the scripts in `scripts/data/` (see the README there) and kept in `packages/engine/data/raw/`. `manifest.json` in that folder lists every table with its source address, units, first and last date, row count and the date pulled. A test (`packages/engine/src/data/raw-data.test.ts`) checks every table against it.

**Status: weather, cattle prices, cattle sale days and the CPI are read. The sheep tables are not yet.** The SILO tables feed the soil-water growth factor (milestone 1.4b, "Growth from real weather" below). The MLA cattle tables feed the real market and the sale calendars, and the ABS table puts past prices into today's dollars (milestone 1.4, the three sections after AussieGRASS below). The engine's model code takes every table as data. Only the server-only helpers in `packages/engine/src/server/` read the files, and they hand the engine one bundle (`loadRealData`). The sheep and lamb tables wait for the sheep milestone.

These tables are server-side engine data. Browser code must never import them (rule 14).

### Prices: Meat & Livestock Australia

- **Source:** Meat & Livestock Australia's public statistics service, which carries the National Livestock Reporting Service figures. `https://api-mlastatistics.mla.com.au`, no key. Documentation: `https://app.nlrsreports.mla.com.au/statistics/documentation`.
- **Credit line** (wherever these prices are shown): "Reproduced courtesy of Meat & Livestock Australia Limited – www.mla.com.au".
- **Terms:** every answer from the service points to MLA's Market Report and Information Terms of Use. Claudia emails MLA for written confirmation of commercial use before launch (PRD 5.14).
- **Pulled:** 13 and 14 Nov 2026, up to 12 Nov 2026, in two goes. All runs together made 5,032 requests, one at a time. The second go (the rest of the national indicators, then every indicator, yarding and sale day for the five main yards) made about 3,960 requests and met 5 failures on MLA's side, each of which worked on a later try. The first go: About 1,300 requests over about 105 minutes, one at a time: 1,207 answers kept in the cache, about 90 tries that failed on MLA's side, and about 17 test requests made by hand. The script's own tally (1,046 requests, 69 failed) is lower because it misses three runs that were stopped by hand. **The pull is not finished.** What is left is listed below.
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
| `mla/national/young-cattle.csv` | National Young Cattle (14) | c/kg lwt | 21 Oct 1996 | 12 Nov 2026 | 10,845 |
| `mla/national/light-lamb.csv` | National Light Lamb (6) | c/kg cwt | 12 Jul 1996 | 12 Nov 2026 | 10,902 |
| `mla/national/trade-lamb.csv` | National Trade Lamb (7) | c/kg cwt | 12 Jul 1996 | 12 Nov 2026 | 10,902 |
| `mla/national/heavy-lamb.csv` | National Heavy Lamb (8) | c/kg cwt | 16 Jul 1996 | 12 Nov 2026 | 10,650 |
| `mla/national/merino-lamb.csv` | National Merino Lamb (9) | c/kg cwt | 11 Dec 1996 | 12 Nov 2026 | 10,677 |
| `mla/national/restocker-lamb.csv` | National Restocker Lamb (10) | c/kg cwt | 5 Dec 1996 | 12 Nov 2026 | 10,749 |
| `mla/national/mutton.csv` | National Mutton (11) | c/kg cwt | 12 Jul 1996 | 12 Nov 2026 | 10,902 |

Gaps (days with no row):

- **Christmas and New Year.** Most years have a break, but not all: each table has 21 to 25 of them in 30 years. They run from a day or two up to 11 days (12 for the Eastern Young Cattle Indicator, 14 for the two restocker indicators at Christmas 1996).
- **Early 1997, inside the first game year.** Restocker steers: 30 Jan to 2 Feb 1997. Restocker heifers: 27 to 29 Jan and 24 Feb to 2 Mar 1997.
- **Late 1996, before the game's years.** Restocker steers: 4 to 10 Nov and 18 Nov to 1 Dec 1996.
- The other five tables have no gaps outside Christmas and New Year.
- Feeder steers and heifers start in June 2003, so the 1997 to 2003 game years need another indicator to stand in for them.

**Yard indicators pulled.** Every cattle indicator the service gives at each district's cattle yard, and every sheep indicator at Dubbo and Hamilton. First date and row count for each (to 11 or 12 Nov 2026 unless a last date is shown):

| Indicator | Gracemere `GME` | Armidale `ARM` | Dubbo `DUB` | Mortlake `MTL` |
|---|---|---|---|---|
| Restocker yearling steer | 10 Oct 2014, 3,810 rows | 23 Jan 1997, 8,701 rows | 6 Mar 1997, 9,378 rows | 29 Jan 2018, 1,141 rows, last 8 Mar 2026 |
| Restocker yearling heifer | 10 Oct 2014, 3,810 rows | 30 Jan 1997, 7,245 rows | 6 Jan 1997, 8,714 rows | 29 Jan 2018, 1,218 rows, last 24 May 2026 |
| Feeder steer | 10 Oct 2014, 3,808 rows | 19 Jun 2003, 5,981 rows | 16 Jun 2003, 7,962 rows | 29 Jan 2018, 2,629 rows |
| Feeder heifer | 10 Oct 2014, 3,808 rows | 24 Jul 2003, 5,344 rows | 16 Jun 2003, 7,853 rows | 29 Jan 2018, 2,657 rows |
| Heavy steer | 8 Nov 1999, 5,270 rows | 5 Sep 1996, 8,389 rows | 15 Jul 1996, 10,385 rows | 29 Jan 2018, 2,783 rows |
| Processor cow | 8 Nov 1999, 5,368 rows | 5 Sep 1996, 8,970 rows | 15 Jul 1996, 10,405 rows | 29 Jan 2018, 2,825 rows |
| Eastern Young Cattle Indicator | nothing served | 5 Sep 1996, 8,970 rows | 15 Jul 1996, 10,412 rows | nothing served |
| National Young Cattle (14) | not given by yard | not given by yard | not given by yard | not given by yard |

| Indicator (all c/kg cwt) | Dubbo `DUB` | Hamilton `HAM` |
|---|---|---|
| Light lamb | 21 Jul 1996, 10,185 rows | 30 Apr 1997, 10,276 rows |
| Trade lamb | 21 Jul 1996, 10,167 rows | 30 Apr 1997, 10,156 rows |
| Heavy lamb | 3 Oct 1996, 8,525 rows | 26 Nov 1997, 6,382 rows |
| Merino lamb | 13 Jan 1997, 9,849 rows | 28 May 1997, 6,179 rows |
| Restocker lamb | 9 Jan 1997, 9,736 rows | 30 Apr 1997, 9,337 rows |
| Mutton | 21 Jul 1996, 10,030 rows | 30 Apr 1997, 10,161 rows |

- The service will not give the National Young Cattle Indicator by yard. Its answer: "Indicators that contain online livestock sales data are not available via the Indicators by Saleyard endpoint."
- It serves nothing for the Eastern Young Cattle Indicator at Gracemere or Mortlake.
- **Gracemere** has nothing before October 2014 for the restocker and feeder indicators, and nothing before November 1999 for heavy steers and cows.
- **Armidale** restocker steers: no rows from 11 Jun to 4 Nov 2026, though the yard held 10 sales in that time. Fewer rows from 2020, when sales went fortnightly.
- **Dubbo** restocker steers are thin in 1997 and 1998 (50 and 25 rows). The longest gap is 4 May 1997 to 23 Apr 1998.
- **Mortlake** has nothing before 2018. Its restocker steers have none in 2023 and one week a year in 2024, 2025 and 2026.
- **Odd rows, kept as served.** Hamilton Merino lamb reads 11.95 c/kg on 27 and 28 Nov 2006 and **-6.67 c/kg from 6 to 12 Dec 2006** (37 and 46 head in the indicator). Hamilton mutton reads 12.82 c/kg from 18 to 24 Oct 2006 (3,994 head). Every other price row is between 20 and 3,000 c/kg. The price mapping in milestone 1.4 must not pass a negative price to the game. A test pins these 16 rows, so a new odd row fails the build.

Where a yard's own history is short or thin, the national indicator fills in (BUILD_PLAN section 3). The rule is under "Real prices: indicators to classes" below. No nearby yard is used.

**Sale days pulled** (from the service's yardings report, cattle and sheep):

| File | Yard | First | Last | Sale days | Pattern in the data |
|---|---|---|---|---|---|
| `mla/sales/GME-cattle.csv` | CQLX Gracemere | 8 Nov 1999 | 11 Nov 2026 | 788 | Prime sales on Mondays 1999 to 2004, Fridays from October 2014 to 2019, Wednesdays from 2020. One or two store sales a year from 2018. **Nothing served from 17 Aug 2004 to 9 Oct 2014** (2004 has 30 sale days, the last on 16 Aug) |
| `mla/sales/ARM-cattle.csv` | Armidale | 5 Sep 1996 | 5 Nov 2026 | 1,301 | Thursdays. About weekly to 2019 (38 to 52 a year), about fortnightly from 2020 (24 to 31 a year). A few store sales on Fridays |
| `mla/sales/DUB-cattle.csv` | Dubbo | 15 Jul 1996 | 12 Nov 2026 | 2,474 | Prime sales on Mondays and Thursdays to 2004, Thursdays only from 2005. Store sales on Fridays from 2001 (about 30 a year to 2017, fewer since) |
| `mla/sales/MTL-cattle.csv` | Mortlake | 29 Jan 2018 | 12 Nov 2026 | 499 | Prime sales on Mondays. Store sales on Thursdays from 2023 (20 to 25 a year). **Nothing before 2018** |
| `mla/sales/DUB-sheep.csv` | Dubbo, sheep and lambs | 8 Jul 1996 | 9 Nov 2026 | 1,938 | Not yet looked at day by day |
| `mla/sales/HAM-sheep.csv` | Hamilton, sheep and lambs | 30 Apr 1997 | 11 Nov 2026 | 1,970 | Not yet looked at day by day. On 502 of the 1,970 sale days no sheep were yarded, only lambs: the sheep yardings file has a 0 for those days, as served |

- `mla/sales/*.csv` is `date,head`: each day the yard held a sale and the head yarded, every sale type that day added together.
- `mla/yardings/*.csv` is the report as served, `date,type,head`, with `type` Prime or Store. Sheep and lambs are separate files: `DUB-sheep` (1,938 rows), `DUB-lamb` (1,899), `HAM-sheep` (1,970) and `HAM-lamb` (1,567). A sheep sale day is any day in either file.
- How the sale days were found: straight from the yardings report, which is small (500 to 2,477 rows a yard). As a check, 547 of the 554 changes in Gracemere's restocker steer indicator fall on a sale day in the yardings table.
- **Sale days missing from the service** have a stand-in ("Sale calendars" below): Gracemere from 1997 to 7 Nov 1999 and from 17 Aug 2004 to 9 Oct 2014, and Mortlake before 29 Jan 2018.
- **Fill-in yards are proposed, not agreed.** The milestone brief named Emerald (for Gracemere), IRLX Inverell (for Armidale) and CVLX Ballarat (for Mortlake and Hamilton) as nearby yards to cover short histories. They are not in the PRD or the build plan, and none has been pulled. Armidale's own history turns out to be long, so Inverell may not be needed. **A question for Claudia** before any of them is used.

**Not pulled** (the scripts carry on from the cache, so nothing above is fetched again):

| What | Size |
|---|---|
| Proposed fill-in yards, if Claudia agrees: Emerald `EME`, IRLX Inverell `INV`, CVLX Ballarat `BAL` (indicators, yardings, sale days) | about 3,300 requests, around four hours |

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
- **Licence:** Creative Commons Attribution 4.0 International. SILO's access page says users may copy, change and pass on the data if they credit SILO as the source and say whether the data was changed. **The tables were changed in form only:** one file per district, six of SILO's variables, the source-code columns counted and then dropped. The values are as served. From milestone 1.4b the game works a soil-water figure out of them, so the change notice needs to say so (see "SILO change notice" below).
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

### Growth from real weather (milestone 1.4b)

The figures behind the soil-water growth factor (`packages/engine/src/season/`). The formulas are in MODEL.md, section 1A. "Tuning" means the figure was chosen for this game and has no outside source. Every tuning figure is on the list for Claudia.

| Figure | Value | Where it came from | In code |
|---|---|---|---|
| Evaporation used | SILO `et0` column, mm a day | SILO's FAO-56 short crop evapotranspiration (variable F). By its definition it is the water use of a short, well-watered grass, so no pan factor is needed. SILO's Class A pan column (`evap`) is not used | `weatherTable.ts` |
| Share of soil water the grass takes before it struggles (`p`) | 0.6 | **Sourced.** FAO Irrigation and Drainage Paper 56, table 22, "Grazing Pasture" (both rotated and extensive grazing): depletion fraction 0.60. Read 13 Nov 2026 at `https://www.fao.org/4/X0490E/x0490e0e.htm` | `SOIL_WATER.easyShare` |
| The water stress rule | index = 1 above (1 − p) × C, then falls in step with the water left | **Sourced for water use. Tuning as a growth index.** FAO-56 gives this figure for how much water a stressed crop uses. Using the same figure as the day's growth index is this game's own step. FAO-56, same page: total available water (equation 82), readily available water = p × total (83), and the stress figure Ks = (total − depletion) ÷ (total − readily available) once depletion passes the readily available water (84). Equation 84 is a picture on the FAO page, so its form was checked against a search result that quotes it from Rallo and others 2014 (the paper itself was not read) | `waterIndex` |
| Water over field capacity is lost the same day | yes | **Sourced.** FAO-56, same page: water above field capacity "is assumed to be lost the same day by deep percolation" | `soilWaterDay` |
| Soil water capacity (`C`) | 100 mm | **Tuning, inside a sourced range.** FAO-56 gives 0.13 to 0.18 m of available water per metre of loam (table 19, read at `https://www.fao.org/4/X0490E/x0490e0c.htm`) and 0.5 to 1.5 m of roots for grazed pasture (table 22). That is 65 to 270 mm. 50, 75, 100, 150, 200 and 250 mm were tried against the AussieGRASS shire series. 100 mm follows it clearly better than 150 mm in Western Victoria and about the same in the other three districts (the table is in CALIBRATION.md). The same soil is used for all four districts | `SOIL_WATER.capacityMm` |
| Crop coefficient | none (the same as 1) | **Tuning.** The pasture is treated as FAO-56's reference grass, to keep the tally simple | |
| FAO-56's daily adjustment of `p` for the day's demand | not used | **Tuning.** FAO-56 gives p = table value + 0.04 × (5 − ETc). Left out to keep the tally simple | |
| Ceiling on the growth factor | 1.9 | **Tuning, carried over.** The MVP's own upper limit on the month factor (Seasons, above). The same factor multiplies sown pastures and crops, which were tuned with it no higher than this | `WEATHER_FACTOR_CEILING` |
| Scaling years | 1997 to 2025 | The playable years in the table as pulled (PRD 5.14, section 21 row 32). Fixed so a later pull does not move past years | `SCALING_YEARS` |
| How fine the scaling is | twelve mid-month figures, straight lines between | **Tuning.** The same shape as the district curve. See MODEL.md 1A for why | `solveScaling` |
| Lowest scaling figure allowed | 0.01 | **Tuning, a safety limit.** Under it a month is so nearly always dry that the factor would read the last millimetre of water. The lowest real figure is 0.0365 (Central Queensland, September) | `SCALING_FLOOR` |
| Season factor look back | 365 farm days, each day weighted by the district curve | **Tuning.** A whole year, so every part of the growing season is counted once | `SEASON_WINDOW_DAYS` |
| Season label edges | 0.6, 0.8, 0.925, 1.075, 1.25 | **Tuning.** Halfway between the MVP's six season factors, except 0.8, the edge under which `growGrass` hays green feed off faster | `SEASON_LABEL_EDGES` |
| Run-up floor | 0.85 | **Carried over** from the MVP (Seasons, above; LESSONS 7) | `RUN_UP_SEASON_FLOOR` |
| Days of table needed before a playable year | 905 | The 540-day run-up plus the 365-day look back | `weatherYears` |
| Earliest real year | 1997 | PRD section 21, row 32 | `FIRST_REAL_YEAR` |

The scaling figures themselves are worked out from the SILO tables, not typed in. They are listed in MODEL.md 1A and pinned in `weatherGrowth.test.ts`.

**SILO change notice.** The game now works a soil-water tally and a growth factor out of SILO's rain and evapotranspiration. The credit line in `manifest.json` still says only that the data was reformatted. A line such as "Soil water and pasture growth figures are worked out from this data by The Grazing Game" needs adding wherever the credit is shown. The wording is Claudia's call.

**Rain on screen** is SILO's `rain` for the real date, as served.

### AussieGRASS (comparison only, not used by the game)

- **Source:** AussieGRASS time series for shires, Queensland Government (Long Paddock). One text file a shire, a row a month from January 1890, with rain, temperature, evaporation, pasture growth (kg/ha), standing dry matter, utilisation and cover. Address pattern: `https://data.longpaddock.qld.gov.au/TimeSeriesGraphs/lga/<STATE>/<Shire>_<STATE>.txt`. The files are reached from the "Time Series Graphs" tab of `https://www.longpaddock.qld.gov.au/aussiegrass/`.
- **Read:** 13 Nov 2026, in a browser, for Central Highlands Regional (Qld), Armidale Regional Council (NSW), Dubbo Regional Council (NSW) and Southern Grampians Shire (Vic). Rows ran to October 2026. The pasture growth column was added up by calendar year for 1997 to 2025. The yearly totals are in CALIBRATION.md. The files themselves are not kept in the repo.
- **What it is:** a shire-wide average from the AussieGRASS model. The file also carries standing feed, feed eaten and utilisation, so stocking is in that model. It is not a point and not a potential. Its level can't be compared with the district curve. Its ups and downs from year to year can.
- **Licence:** the Long Paddock pages carry a Creative Commons Attribution 4.0 badge. The page does not say in words that the badge covers the AussieGRASS files. **Not confirmed.** The figures are used here for checking only and are not shipped.
- The FAO-56 pages above, and the search result for the Rallo paper (`https://iris.unipa.it/retrieve/e3ad8916-c841-da0e-e053-3705fe0a2b96/Rallo%202014%20JIDE-FAO56%20SWD%20Olive.pdf`, 13 Nov 2026), are the only other outside sources used.

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

From the code (milestone 1.2a):

- Weight and condition are drawn anywhere in the range. Ages, days pregnant and calf ages are whole days, both ends included.
- A bought cow has had 1 to 4 calves.
- The calf with a cow and calf unit is already marked: a steer calf or a heifer calf, 50:50. It weighs 36 kg plus 0.8 kg for each day of its age.
- These classes carry no prices here. Prices come from the market model.

Names used for cattle on the farm (`label`): Weaner steer (under 280 kg), Yearling steer (280 to under 450 kg), Bullock (450 kg and over), Weaner heifer (under 280 kg), Heifer, PTIC heifer, Dry cow, Cow with calf, PTIC cow, PTIC cow with calf, Bull, Young bull (unmarked), Heifer calf, Steer calf, Bull calf (unmarked).

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

Corrections from the code (milestone 1.2b):

- A water hub on a square gets one gate on each side that is not the boundary or already a gate, so a hub against the boundary has fewer than 4. Sides with no fence get a gate too. The trough is only charged if the square has none.
- A portable trough gives up the grazing area's daily need divided by the number of watered squares in the area. It warns once under 25% (1,500 L).
- Tape under a new permanent or electric fence is lost, not rolled up. A gate hung in tape takes that segment of tape with it.
- In the rebuild the layout rules report lengths and counts and the caller applies these costs. The energiser is charged for electric fence only (BUILD_PLAN 2.4).

Corrections from the code (milestone 1.2c):

- **A segment's price is rounded to a whole dollar**: `round(price a metre × the side of a square)`, then times the segments. On the 260 ha default farm (50 m squares) that is $350 permanent, $180 electric, $45 tape and $240 pipe a segment.
- **Tape in the rebuild:** new tape at 90c a metre and nothing more. $10 to roll a run up. $10 to run out tape that was on the roll, whatever the length, plus the price of any new tape needed to finish the run. The MVP charged the $10 on every tape job, new tape included, and bought an energiser with the first tape. Both are fixed (BUILD_PLAN 2.4).
- **The energiser** ($900) is bought once, with the first electric fence. A farm that comes with electric fence comes with one.
- Pulling down permanent or electric fence, and taking out a gate, trough or water hub, cost nothing and give nothing back. A portable trough sells back for $300.
- Marking, the $10 to roll up tape, supplements and the feedlot, overheads and interest come straight off the account. Everything else is refused if it would take the account past the overdraft limit.
- Animal health is charged on every head, calves included, a 365th of the yearly figure each day. Overheads are charged the same way.
- Interest is worked each day on the balance after the day's feed bill and before the day's overheads and health.
- **What counts as infrastructure in net worth (the rebuild's rule):** what was paid for fence, gates, pipe, troughs and hubs still in place; the tape the farm owns at the price of new tape; $555 of a portable trough's $600 (not its first fill of water); the $900 energiser; and half the establishment cost of a sown perennial pasture still in the ground. Net worth counts 80% of that. Improvements that came with the farm count for nothing. See MODEL.md, section 8.
- Sowing a forage or grain crop, and harvest costs, go to the year's cropping costs. Sowing a perennial pasture goes to the year's infrastructure total in full.

## Supplements (`FEED`)

| Feed | Cost | What it does |
|---|---|---|
| Lick (urea/protein) | $0.15/head/day when CP < 9%, 20% of that on green feed; calves 40% | Pasture intake × 1.25 if diet CP < 7%, × 1.08 if CP 7–9% |
| Hay | $0.28/kg, 3 kg/head/day | ME 8.4, CP 9%; replaces 0.5 kg pasture per kg |
| Pellets | $0.50/kg, 2 kg/head/day | ME 12.5, CP 16%; replaces 0.3 kg pasture per kg |
| Feedlot | $0.40/kg ration + $0.35/head/day yard | ME 11.6, CP 14%; full intake (calves 60%) |

From the code (milestone 1.2a):

- Calves get 40% of the hay or pellet ration (1.2 kg of hay, 0.8 kg of pellets), and pay 40% of the lick cost.
- The low-protein intake penalty uses the CP of pasture plus hay or pellets together, so it still applies on hay or pellets while the mix is under 7%. See MODEL.md, section 3.
- The feedlot ration has a DMD of 0.77. It is used for a cow's milk in the lot.

## Money and difficulty

`ccAEfor(region, ha)` = ha × annual growth × 0.65 × util ÷ 3,285 (long-term carrying capacity, AE).
`cashBase` = max($50,000, ccAE × 0.5 × $950, rounded to $10k).

| Difficulty | Cash × base | Overdraft × base | Bank takes the farm at × base |
|---|---|---|---|
| Easy | 2 | 1 | 1.3 |
| Medium | 1 | 0.6 | 0.8 |
| Hard | 0.45 | 0.3 | 0.4 |

Taking over an established farm with a herd gives 25% of the cash (the herd is the capital). The defaults without setup are $50,000 cash, -$80,000 overdraft and game over at -$100,000. The game also ends after 10 days of the whole farm under 40 kg DM/ha available with cattle on it.

Detail from the code (milestone 1.2c): the cash base is rounded to the nearest $10,000 before the $50,000 floor is applied, and each of the three figures is rounded to the nearest $1,000. "Available" is the feed above the 250 kg DM/ha cattle leave behind, averaged over every square of the farm. Cattle in the feedlot don't count as on the farm for this. The bank takes the farm when cash is at or below its limit. In the rebuild a farm's money always comes from the difficulty (or is given outright for a test), so the $50,000 defaults are not used.

## Established farm layout

- One to two vertical and zero to one horizontal full-length fence lines (30% electric), each with a shut gate. Every paddock gets at least one gate.
- A running farm pipes water to a trough in every paddock over 2% of the farm. It adds waters until no point is more than about 2 km from water, at about one water per 2,500 ha and at most 8 per paddock.
- Detail from the code: the lines down the farm sit 7 or more squares in from the sides, more than 2 squares from the bore and more than 5 from each other. The line across sits 6 or more squares in and more than 2 from the bore. Each line's own gate is at least 2 squares from its ends. A paddock left without a gate gets one at a random spot in its fences. The first trough in a paddock goes at its middle, piped from the bore. Each later one goes on the square furthest from water, piped from the paddock's first trough, while that square is 2 km or more out and the paddock has fewer than min(8, ha ÷ 2,500 rounded up) waters.
- Two of those rules never change the result (found in milestone 1.2b). The smallest paddock the fence lines can make is 36 squares, 3.5% of the farm, so the 2% rule never leaves a paddock dry. And a water can only be within 2 km of about 1,260 ha, so the count by area (one for each 2,500 ha or part of it) is always reached before the 2 km rule can stop it. Every paddock ends up with exactly min(8, ha ÷ 2,500 rounded up) waters. The limit of 8 only comes up on paddocks over 20,000 ha, which the four launch districts don't have.
- Starting from scratch: a trough on the bore and no pipe. Half the time there is also one old permanent fence line down the farm (8 or more squares in from the sides, at least 3 from the bore) with one shut gate.
- New in the rebuild: every farm also gets a homestead and stock yards (MODEL.md, section 5). Trees are not placed yet; they come with the map.
- Starting herd: 35–65% of carrying capacity. Cows = AE × 0.65 ÷ 1.05 (55% PTIC, 25% with calves, 20% dry), one bull per 40 cows, weaners = AE × 0.3 ÷ 0.55, split steers and heifers. Northern places (cq, nt) start on lick.
- Detail from the code (milestone 1.2c): at least 10 cows, 1 bull and 4 weaners, however small the farm. Bulls are the cows ÷ 40, rounded up. The dry cows are what is left after the PTIC cows and the cows with calves are rounded. The cows and bulls go in the biggest grazing area with water and the weaners in the next biggest, as two mobs. With water in only one area they run as one mob. In the rebuild the herd is drawn from its own random stream (`gen:herd`), and every new mob in Central Queensland starts on a lick unless it takes another supplement from the mob it came from.

## Sown pastures, forages and crops (`SPECIES`)

`g` = growth kg DM/ha/day Jan→Dec once established. `cost` = $/ha to establish. Days are from sowing. Sow months are 1-based here.

The rebuild carries the 15 species the four launch districts can plant in `packages/engine/src/data/species.ts`, and the district tables in `data/crops.ts`, checked figure for figure against the MVP by a test. Jarra digit grass is left out of the code because only the Top End could plant it. Its figures stay here.

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

Establishing pasture grows at 20% rising to 100% over the establishment days. Past its life it loses 15% a year (floor 55%). Its quality falls with it: DMD by 0.1 and CP by 8 points for each whole unit of strength lost, so at the 55% floor the most it loses is 0.045 DMD and 3.6 CP points. *(Corrected in milestone 1.2b. This used to read "DMD down to 0.1 and CP down to 8 points".)* Stylo's dead feed is CP 7% (5 + 2). A species with no dead-feed figure would use 6.

### Grain crops

| Key | Name | Veg DMD / CP | Estab | Lock-up | Heading | Mature | Yield t/ha | $/t | Harvest $/ha | Sow $/ha | Sow months | Graze while growing? |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| oats | Oats (graze & grain) | .78 / 22 | 50 | 110 | 150 | 200 | 2.5 | 300 | 60 | 220 | Feb–May | yes, until lock-up |
| wheat | Dual-purpose wheat | .78 / 24 | 60 | 100 | 150 | 200 | 3.0 | 330 | 65 | 320 | Mar–May | yes, until lock-up |
| barley | Barley (grain) | .76 / 20 | 50 | 70 | 130 | 180 | 3.2 | 280 | 60 | 300 | May–Jun | no |
| grsorg | Grain sorghum | .70 / 14 | 35 | 45 | 80 | 120 | 3.5 | 300 | 60 | 300 | Oct–Jan | no |

Grain crop ceilings (`bmax`, kg DM/ha), missing from the table above: oats 9,000, wheat 10,000, barley 9,000, grain sorghum 12,000. A crop with none would use 9,000.

### Annual forages

| Key | Name | DMD / CP | Estab | Life days | bmax | $/ha | Sow | Notes |
|---|---|---|---|---|---|---|---|---|
| forsorg | Forage sorghum | .72 / 16 | 45 | 200 | 14000 | 200 | Oct–Jan | prussic acid risk before 6–8 weeks |
| millet | Japanese millet | .72 / 16 | 40 | 130 | 9000 | 150 | Oct–Dec | summer curve × 0.8 |
| annrye | Annual ryegrass | .80 / 24 | 50 | 250 | 7000 | 180 | Mar–May | about 10–12% comes back from seed for one year |
| brass | Summer brassica (rape/turnip) | .84 / 18 | 50 | 140 | 8000 | 260 | Oct–Nov | |

Crop curves: WINTER 5,5,15,30,35,30,30,45,75,85,55,15; SUMMER 90,95,70,30,8,2,0,0,10,40,70,85; BRASS 60,55,40,20,5,0,0,0,15,45,65,65.

Crop stage quality: leafy until lock-up, then DMD falls by 0.1 and CP to 60% by heading, then to DMD 0.58 and CP 7% at maturity. A finished crop is DMD 0.52, CP 5%. Growth is 25% → 100% while establishing, then 30% while heading, and nothing once done. On top of the usual haying off, a crop loses 1.5% of its green a day while heading and 4% a day once done. An annual forage has no lock-up and starts heading at 75% of its life. Dead feed on any forage or crop is CP 5%.

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

How the arable land is laid out: it grows outwards from one square (or from the rotation blocks) as one natural patch. When there are more than 16 arable squares, 45% of farms get a second, smaller patch elsewhere holding 18% of the arable land. On a mixed farm the rotation is one square block for each crop plus one for fallow, side by side, inside the main patch. Converting applies to squares that are not already fallow or stubble.

## Stubble and fallow

- Stubble after harvest: dead = clamp(old dead × 0.5 + yield t/ha × 600, 1,500–3,500) kg DM/ha. Quality DMD 0.45, CP 4%. No regrowth. It breaks down 0.4% a day and becomes fallow under 400 kg DM/ha.
- Fallow: bare worked soil. DMD 0.42, CP 3%. No growth until sown. Any dead material lying on it breaks down 3% a day.
- An unharvested crop becomes stubble 60 days after maturity, with the grain lost. Ripe grain sheds 0.2% a day from the day after maturity, then 3% a day from 31 days after maturity. *(Corrected in milestone 1.2b: the 0.2% a day was missing.)*
- Stubble from an unharvested crop or a finished annual forage: dead = max(800, dead + green) kg DM/ha. A finished annual becomes stubble 30 days after its life is up. Off arable land a finished planting goes back to native pasture instead.
- Self-sown annual ryegrass comes back at 12% of a full stand (the species' `regen` figure), on the 15th of the first month of its sowing window.
