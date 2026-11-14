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

### Real prices: indicators to classes (milestone 1.4, PROPOSED, FOR CLAUDIA)

A real-year farm prices its cattle from MLA's indicators for the real date, at the district's yard. Code: `packages/engine/src/market/realPrices.ts` (the mapping and the fill-in rules), `realMarket.ts` (the price source) and `priceTable.ts`. The formulas are in MODEL.md, section 8. "Sourced" means the figure comes from a source named here. "Tuning" means it was chosen for this game and has no outside source.

**What each indicator measures.** From MLA's "National Cattle Indicators" sheet, December 2024 (`https://mla.com.au/contentassets/2b3a2fcab8bf4b868bfcd0bdbdce3c21/mla_nlrs-national-cattle-indicators-spec-sheet.pdf`, read 14 Nov 2026). Every indicator is a seven-day rolling average over all NLRS saleyards, any muscle and fat score, in c/kg live weight.

| Indicator | Cattle | Live weight | Bought by |
|---|---|---|---|
| Restocker Yearling Steer | Yearling steers | 200 to 400 kg | Restockers (back to a paddock) |
| Restocker Yearling Heifer | Yearling heifers | 200 to 400 kg | Restockers |
| Feeder Steer | Yearling steers 200 kg and over, grown steers up to 600 kg | | Feedlots |
| Feeder Heifer | Not on the sheet. Taken to be the heifer match of the Feeder Steer. **Not confirmed** | | Feedlots |
| Heavy Steer | Grown steers | 400 to 750 kg | Processors |
| Processor Cow | Cows | 400 kg and over | Processors |

The sheet describes the indicators as they are now. Whether the same weights applied back to 1997 was not checked.

**The mapping** (`CLASS_INDICATORS`). Each game class is one indicator times a multiple.

| Game class | Who is in it | Indicator | × | Why |
|---|---|---|---|---|
| `wean` Weaner steers | Steers under 280 kg | Restocker Yearling Steer | 1.08 | The indicator covers 200 to 400 kg and weaners are at the light end, which makes more a kg. The multiple is the MVP's (weaners at 1.08 times its indicator). **Tuning** |
| `feed` Yearling steers | Steers 280 to under 450 kg | Feeder Steer | 1 | The weight range feedlots buy. **Sourced** (the indicator as it is) |
| `heavy` Heavy steers | Steers 450 kg and over | Heavy Steer | 1 | Grown steers to processors. **Sourced** |
| `wheif` Weaner heifers | Heifers under 280 kg | Restocker Yearling Heifer | 1.08 | As for weaner steers. The MVP's weaner heifers over its heifers is 0.92 ÷ 0.85 = 1.08. **Tuning** |
| `heifer` Heifers | Heifers 280 kg and over | Feeder Heifer | 1 | The match of yearling steers. **Proposed reading:** what the Feeder Heifer indicator covers was not found on MLA's sheet, so this rests on its name |
| `cow` Cows | Cows | Processor Cow | 1 | **Sourced.** The game's cows include breeders. Their extra worth is the pregnancy premium and the condition adjustments, which are unchanged (Market, above) |
| `bull` Bulls (when sold) | Bulls | Processor Cow | 0.906 | No indicator for bulls. A bull sold at the yards goes to a processor, as a cow does. The multiple is the MVP's bulls over its cows, 0.58 ÷ 0.64. **Tuning** |
| `calf` Calves | Calves | Restocker Yearling Steer | 1.10 | No indicator for calves. The MVP's multiple. **Tuning** |
| The game's "indicator" | | Restocker Yearling Steer | 1 | It scales the pregnancy premium ($320 at 400 c/kg) and the price of a bull bought ($5,500 at 400 c/kg) |

For comparison, the national indicators as a share of the Restocker Yearling Steer, averaged over every day both have a row from 1997 to 2025, beside the MVP's multiples: feeder steers 0.97 (MVP 1.00), heavy steers 0.94 (0.90), feeder heifers 0.88 (0.85), restocker heifers 0.86, cows 0.71 (0.64). So cows and heavy steers are dearer against young cattle on real prices than they were in the MVP.

**Fill-in rules** (`REAL_PRICE_RULES`), for one indicator at one yard on one real date:

1. **The yard's own row** for the day is used when it has 20 head or more behind it.
2. **Held:** with no such row that day, the yard's newest row with 20 head or more is used if it is no more than 14 days old. MLA repeats a sale's figure for seven days and then the rows stop, so this carries a yard that sells fortnightly from one sale to the next.
3. **Otherwise the national figure times the yard's premium.** The premium is the average of yard ÷ national over every day from 1997 to 2025 on which the yard and the national indicator each have a row with 20 head or more.
4. **A yard series with under 730 such days is not used at all.** The national figure is used as it is, with no premium. This catches Mortlake's restocker steers and heifers.
5. **The national figure** is the newest national row on or before the day with 20 head or more behind it. A national figure usually rests on thousands of head, but around Christmas it can rest on one: restocker steers read 147 c/kg on 1 head from 29 December 2004, against 183.4 c/kg on 290 head four days before, and heavy steers read 230 c/kg on 5 head on 25 December 2024 against 324. Each national table has 13 to 80 rows under 20 head, nearly all in December and January. With those left out the longest break from 1997 is 15 days. A break of more than 21 days stops with an error. The limit is the same low one as for a yard because the national restocker heifer figure rested on 20 to 70 head through early 1997. Rows with 20 to 99 head are still used (124 to 247 a table for the restocker indicators, fewer for the rest).
6. **A price is never negative and never from a blank row.** A row with a blank, zero or negative figure is dropped when the table is read and counted. The cattle tables have none. If one ever appears the bundle stops with an error so it gets looked at.

| Figure | Value | Kind |
|---|---|---|
| Thin row, yard or national | under 20 head | **Tuning.** A yard row's distance from its yard's usual premium averages 7 to 10% under 20 head and 4 to 6% over 50 |
| Hold | 14 days | **Tuning** |
| Days needed to use a yard series | 730 | **Tuning** |
| Premium years | 1997 to 2025 | Fixed, so a later pull does not move a past price |
| Longest national break allowed | 21 days | **Tuning**, a safety limit |

**The yard premiums** as worked out from the tables (pinned in `realPrices.test.ts`), with the days behind each: (The day counts were taken before national rows under 20 head were left out. The premiums are unchanged to three places; the day counts are a few lower.)

| Indicator | Gracemere `GME` | Armidale `ARM` | Dubbo `DUB` | Mortlake `MTL` |
|---|---|---|---|---|
| Restocker yearling steer | 0.944 (3,469 days) | 1.017 (7,868) | 0.978 (8,343) | **not used** (182 days, which read 0.80) |
| Restocker yearling heifer | 0.933 (3,483) | 1.030 (5,656) | 0.989 (7,046) | **not used** (371 days, which read 0.81) |
| Feeder steer | 0.922 (3,488) | 0.976 (4,651) | 1.012 (7,639) | 0.923 (1,603) |
| Feeder heifer | 0.909 (3,483) | 0.980 (4,028) | 1.013 (7,244) | 0.986 (1,869) |
| Heavy steer | 0.945 (3,814) | 0.994 (4,480) | 1.008 (9,472) | 1.008 (2,016) |
| Processor cow | 0.997 (5,062) | 1.004 (8,207) | 1.024 (9,890) | 1.034 (2,464) |

**Where each district's prices come from**, as a share of the days from 1997 to 2025 (the yard's own row or its held row; the rest is the national figure times the premium):

| District | Restocker steers | Feeder steers | Heavy steers | Cows |
|---|---|---|---|---|
| Central Queensland (Gracemere, rows from Oct 2014; heavy steers and cows also Nov 1999 to Aug 2004) | 37% | 37% | 48% | 53% |
| Northern Tablelands (Armidale) | 95% | 67% | 62% | 97% |
| Central West NSW (Dubbo) | 93% | 77% | 98% | 99% |
| Western Victoria (Mortlake, rows from Jan 2018) | 0% | 21% | 25% | 26% |

So Central Queensland before October 2014 and Western Victoria before 2018 play on national prices shifted by the yard's later premium. The fill-in yards (Emerald, Inverell, Ballarat) are not used: they are not agreed and not pulled.

**Feeder indicators before 16 June 2003** (`FEEDER_STAND_INS`). The two feeder indicators start on 16 June 2003. Before that:

```
feeder steer  = a × √(restocker yearling steer × heavy steer)       a = 1.0169
feeder heifer = b × √(restocker yearling heifer × heavy steer)      b = 0.9990
```

All national figures for the day. `a` and `b` are the average of the real feeder figure over that mean, across every day all three have a row with 20 head or more from 16 June 2003 to the end of 2025. They are worked out from the tables, not typed in, and pinned in a test. The yard premium is then applied as usual. **Tuning**: the form was picked because it tracks the real feeder steer indicator more closely than a multiple of restocker steers alone or of heavy steers alone. From June 2003 to 2025 the real figure over the stand-in has a standard deviation of 2.7%, against 6.0% and 6.6%. For heifers it is 3.4%, against 3.9% for a multiple of feeder steers and 7.1% for restocker heifers alone. It can't be checked against 1997 to 2003, because there is nothing to check it against.

**Things a grazier may question (for Claudia):**

- **Yard rows jump.** A yard's figure is whoever turned up that week. Dubbo restocker steers read 132, 114, 58 and 92 c/kg on 8, 15, 17 and 24 October 2002 (66, 136, 81 and 154 head) while the national figure moved from 117 to 111. The game uses the yard's row as it is. The other choice is the national figure times the premium every day, which is smoother and less local.
- **Mortlake's restocker steers and heifers** have too few rows to use, and the rows there are read about 20% under the national figure. Western Victoria's weaner and calf prices are the national figures as they are.
- **Prices change from one real year to the next at random.** With years at random, or in order after 2025, the market on the first day of a game year is another year's market. In today's dollars the restocker steer indicator runs from about 110 c/kg (Dubbo, October 2002) to about 900 (Gracemere, January 2022).
- **Sheep are not mapped.** The sheep and lamb tables are pulled and listed but not read. The Hamilton rows that are negative or near zero are dropped by rule 6 when they are.

### Inflation: the Consumer Price Index (milestone 1.4)

Real prices from 1997 are in the dollars of their day, and the game's costs are in today's dollars. PRD section 21 gives no default, so the builder's default is used: **prices are shown and used in today's dollars**, lifted by the Consumer Price Index. **For Claudia to confirm.**

- **Source:** Australian Bureau of Statistics, Consumer Price Index, Australia, from the ABS data service: `https://data.api.abs.gov.au/rest/data/ABS,CPI/1.10001.10.50.Q?startPeriod=1990-Q1&format=csvfilewithlabels`. No key. No contact detail was sent (a plain client name).
- **The series,** as the service labels it: Measure "Index numbers", Index "All groups CPI", Adjustment Type "Original", Region "Australia" (region code 50), Frequency "Quarterly", reference base "Sep 2025 = 100.0". The brief asked for the weighted average of eight capital cities. The service's label for this series is "Australia", and the page was not found that says in words that it is the eight capital cities figure. **Not confirmed in words.**
- **Read:** 14 Nov 2026, one request. 147 quarters, March quarter 1990 to September quarter 2026.
- **Checked:** all 147 figures match the Reserve Bank's table G1 ("Consumer price index; All groups", series `GCPIAG`, source "ABS / RBA", published 29 Oct 2026) to two decimal places. Read the same day at `https://www.rba.gov.au/statistics/tables/csv/g1-data.csv`.
- **Licence:** Creative Commons Attribution 4.0 International. The ABS copyright page says "All material presented on this website is provided under a Creative Commons Attribution 4.0 International licence" (`https://www.abs.gov.au/website-privacy-copyright-and-disclaimer`, read 14 Nov 2026). Credit line: "Source: Australian Bureau of Statistics, Consumer Price Index, Australia." The table was changed in form only (one series, two columns).
- **Table:** `packages/engine/data/raw/abs/cpi-all-groups.csv` (`quarter,index`), listed in `manifest.json`. Pulled by `pnpm data:cpi` (`scripts/data/pull-cpi.mjs`).

| Figure | Value | Kind | In code |
|---|---|---|---|
| Today's dollars | The September quarter 2026 (index 103.64), the newest quarter in the table | Fixed, so a newer table does not move a past price. Changing it is a model change | `TODAYS_DOLLARS` |
| The lift for a date | index of the September quarter 2026 ÷ index of the date's own quarter. A date in or after that quarter gets 1 | **Sourced** figures, **tuning** method: every day of a quarter uses that quarter's figure, so the lift steps on the first day of a quarter (by under 1% as a rule, 3.7% on 1 July 2000) | `todaysDollarsFactor` |
| The switch | `today` or `of-the-day`. A new real-year farm takes `today` and keeps what it started with | The one place to change it | `REAL_PRICE_DOLLARS` |

Examples: the March quarter 1997 is 46.58, so a 1997 price is multiplied by 103.64 ÷ 46.58 = 2.225. The December quarter 2025 is 100.32, so a late 2025 price is multiplied by 1.033.

The restocker steer indicator at Dubbo, yearly average, c/kg, as reported and in today's dollars: 1997 84 and 188. 2002 135 and 262. 2010 191 and 297. 2016 349 and 478. 2019 252 and 327. 2022 574 and 674. 2025 437 and 457.

**What the CPI does not do.** It measures what households pay, not what farms pay. Fence, fuel and feed may have risen faster or slower. It was chosen because it is the plain public measure. The game's costs are not changed by it: they stay as they are in every year played.

### Sale calendars (milestone 1.4)

For each district's cattle yard the engine answers "is there a cattle sale on this real date, and of what type" (`packages/engine/src/market/saleCalendar.ts`). Booking stock onto a sale and delivery of bought cattle to the yards are built (milestone 1.5b: docs/MODEL.md, section 9).

- **Source:** `mla/yardings/<yard>-cattle.csv`, the yardings report as served: one row for each sale type on a day, `Prime` or `Store`, with the head yarded. `mla/sales/<yard>-cattle.csv` is the same days with the types added together. A test checks that every day in the sales table is a sale day in the calendar with the same head, and that no other day is unless it is a stand-in.
- **A sale day** has its date, its types (prime first), the head yarded and whether it is a stand-in.
- **The calendar runs** from 1 January 1997 to the yard's last record (5 to 12 Nov 2026). A date outside it is an error.
- **Next sale day:** `nextSaleDay(farm, env)` gives the first sale on or after a farm day, of a type if asked. It follows the farm's own days, so at a year's end it carries on into the next game year whatever real year that is. `saleDayOn(farm, env, day)` answers for one day.

**Stand-ins for the stretches the service has nothing for** (`CATTLE_SALE_STAND_INS`). **Tuning, for Claudia.**

| Yard | Stretch | Stand-in | Why that day |
|---|---|---|---|
| Gracemere | 1 Jan 1997 to 7 Nov 1999 | A prime sale every Monday | The yard sold on Mondays once its records start (45 of its 47 prime sales in 2000) |
| Gracemere | 17 Aug 2004 to 9 Oct 2014 | A prime sale every Monday | The yard sold on Mondays in the year before. **The real day is not known.** When the records start again in October 2014 it sells on Fridays, so it changed somewhere in the gap |
| Mortlake | 1 Jan 1997 to 28 Jan 2018 | A prime sale every Monday | The yard sold on Mondays in the year after |

- **No stand-in sale from 16 December to 7 January** (`STAND_IN_BREAK`). The four yards' own last prime sale of a year falls between 4 and 21 December, and their first of the next between 3 and 21 January. **Tuning.**
- A stand-in day has no head count, and no store sales.
- Public holidays are not allowed for.
- A real record inside a stand-in stretch stops the build, so a stand-in can never cover up a real sale day.
- Armidale and Dubbo have records for every year from 1997 and nothing there is a stand-in.

**A farm with random seasons has no real years to read, so it has a weekly sale of its own** (milestone 1.5b: `RANDOM_SEASON_SALE_WEEKDAY` in `market/saleCalendar.ts`). A prime sale every week at its district's yard on the weekday below, with no sale from 16 December to 7 January (the same `STAND_IN_BREAK`). **Builder's choice, for Claudia.** Each weekday is the one that yard sold on in its most recent records, from "Sale days pulled" above.

| District | Yard | Weekday | Where it comes from |
|---|---|---|---|
| Central Queensland (`cq`) | Gracemere | Wednesday | Prime sales on Wednesdays from 2020 |
| Northern Tablelands (`nsw`) | Armidale | Thursday | Prime sales on Thursdays |
| Central West (`cw`) | Dubbo | Thursday | Prime sales on Thursdays only, from 2005 |
| Western Victoria (`wv`) | Mortlake | Monday | Prime sales on Mondays |

The days are in the game's own calendar. Public holidays are not allowed for. No head count and no store sales, as for a stand-in.

### The data version (milestone 1.4)

Every table a district's farms read is fingerprinted together: the SILO weather, the six national and six yard cattle indicators, the yard's cattle yardings and the CPI (`districtTablePaths`). The fingerprint is 16 hex digits (`DistrictRealData.version`). As pulled: Central Queensland `81313cdc124d11e3`, Northern Tablelands `525d82ca4aa73029`, Central West `2efe5d572683f104`, Western Victoria `c45fa535fcacb5e2`. A real-year farm records its district's version and will not run on any other (MODEL.md, section 1A). **Any new pull changes the version**, even one that only adds days. See the README in `scripts/data/`.

**A question for Claudia and a known limit.** As built, any change to any table a district reads gives a new version, and a farm refuses to run on another version. That keeps a farm's past fixed. It also means one pull that adds a year stops every running real-year farm until a way to move a farm across is built, and it cannot serve Daily Farm as it stands, because Daily Farm fetches new weather and prices every day (PRD 5.14). The version will need to cover only the dates a farm has already played. That is Stage 3 work (the server), and it must be designed before real-year farms are kept for long.

**Today's dollars is fixed at the September quarter 2026.** That quarter was picked by the builder as the newest in the table. The game's costs are the MVP's, and no date is recorded for when they were set. If the costs are in the dollars of another time, the base quarter should move to match. For Claudia.

**Sale calendar look-ahead:** `nextSaleDay` looks 120 farm days ahead and then gives up. **Tuning**, longer than any break in a yard's records since 1997.

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
| Permanent fence | $7/m new; $3.50/m from materials on hand |
| Electric fence | $3.60/m new; $1.80/m from materials on hand; plus a $900 solar energiser once |
| Temporary tape | $0.90/m new; $10 to roll up or roll out reused tape (shown as $45 a square on the default farm) |
| Pipe | $4.80/m |
| Trough | $1,500; moving one $300 |
| Gate | $450 |
| Water hub on a square | trough + $450 per gate (4 gates, all open); moving one $300 + $450 for each new gate (builder's figure) |
| Water hub on a fence line or corner | trough + $500; moving one $300 (builder's figure) |
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

Fence materials kept and reused (14 Nov 2026):

- **A metre of permanent or electric fence built from materials on hand costs half the price of a new metre.** `REUSED_FENCE_SHARE = 0.5` in `money/costs.ts`. **Decided: Claudia's figure**, 14 Nov 2026. Her words: "if they remove a fence, they can have so many discounted fence fees because they would already have some of the materials, but they still don't get the full amount", then "half price is fine". It is a game rule, not a looked-up real-world figure, so it has no outside source.
- Taking down permanent or electric fence keeps its materials on hand, by the metre and by kind (knocked-down electric counts as electric). Gates are not kept. Tape is unchanged: it goes back on the roll.
- Building fence of a kind uses the materials on hand of that kind first, along the line in the order drawn. The rest is charged at the full price. The half is of the rounded segment price, so a segment on the 260 ha default farm is $175 permanent and $90 electric from materials on hand.
Water hubs removed and moved (14 Nov 2026, Claudia: "Water hub can be removed or moved"):

- **Moving a water hub costs what moving a trough costs, $300 (builder's figure, for Claudia).** It follows the fixed trough (`moveTrough`) and uses no new number. A hub on a square that moves also gets an open gate on each side of its new square that is not the boundary or a gate, at the gate price ($450 each), as when one is built. Its old square keeps its gates.
- Taking a hub out costs nothing and gives nothing back, as for a trough. What was spent on it comes off net worth. Taking out a hub on a square takes out its trough only: the gates stay, open or shut as they were (builder's rule, for Claudia).
- A hub on a square is a fixed trough with a gate on every side that is not the boundary. The engine reads that from the fences and troughs; nothing new is kept.

- **Builder's choices, for Claudia to check:** materials on hand count for nothing in net worth (the ledger records what was spent on what is standing, so a segment rebuilt at half price is in the ledger at half); fence built over by a new run of another kind, and fence a gate or a square hub takes the place of, is gone, not kept (as tape under a new fence already was); materials have no limit on how long they keep; the energiser rule is unchanged (it is bought with the first electric fence built, whether the wire is new or reused).

## Job times (milestone 1.5a, the working day)

How long each job takes, for one person with normal gear. The table is `packages/engine/src/data/jobTimes.ts` (`JOB_TIMES`), and each figure carries its mark in the code as well as here.

**A job's time is its work only.** On 14 Nov 2026 Claudia made the working day simpler (REQUIREMENTS.md, "14 Nov 2026: the working day made simpler"): no driving and no drive home, no trip to the saleyard, no contractor to wait for, no route through gates and no walking time, and one kind of gate. The figures that went with those are listed under "Taken out" below so nobody brings them back by mistake.

**These figures are the PRD's (section 5.4 and section 21, rows 5, 13, 14, 16 and 34), which is Claudia's document. None is a looked-up real-world figure and none has an outside source.** The marks are the PRD's own:

- **Decided:** Claudia has decided it.
- **Proposed:** in the PRD's table, for Claudia to check ("Claudia to check every figure").
- **Builder:** not in the PRD. Chosen in the build as the simplest reading, and on the question list for Claudia (DEVELOPMENT_LOG, milestone 1.5a).

"Used" says whether an action uses the figure yet.

| Job | Figure | Mark | In the engine | Used |
|---|---|---|---|---|
| Permanent fence, on your own | 500 m a working day | Decided | `permanentFenceMPerDay` | yes |
| Electric fence, single wire | 1,000 m an hour | Proposed | `electricFenceMPerHour` | yes |
| Temporary tape, put out or roll up | 3,000 m an hour | Proposed | `tapeMPerHour` | yes |
| Poly pipe with a pipe layer | 400 m an hour | Proposed | `pipeMPerHour` | yes |
| Proper swing gate | 60 min | Proposed | `gateMin` | yes |
| Open or shut a gate | 0 min | Builder | `gateOpenShutMin` | yes |
| Trough with fittings | 180 min | Proposed | `troughMin` | yes |
| Move or refill a portable trough | 30 min | Proposed | `portableTroughMin` | yes |
| Move a mob: settling | 15 min | Proposed | `moveMobSettleMin` | yes |
| Move a mob: for each 100 head | 1 min | Proposed | `moveMobMinPer100Head` | yes |
| Muster a whole paddock: to start | 30 min | Proposed | `musterBaseMin` | no (taken out 14 Nov 2026) |
| Muster a whole paddock: for each 200 ha | 60 min | Proposed | `musterMinPer200Ha` | no (taken out 14 Nov 2026) |
| Feed lick or hay to a mob | 30 min | Proposed | `feedOutMin` | no (kept for Daily Farm feeders, a later part) |
| Lick run or feed run, each mob | 5 min | Proposed | `feedRunMinPerMob` | not yet (feed on hand, Daily Farm) |
| Wean: to start | 30 min | Proposed | `weanBaseMin` | yes |
| Wean: for each head | 0.5 min | Proposed | `weanMinPerHead` | yes |
| Mark calves: for each calf | 2 min | Proposed | `markMinPerCalf` | yes |
| Preg test: for each cow | 1 min | Proposed | `pregTestMinPerCow` | not yet |
| Sell (draft and load): to start | 60 min | Proposed | `sellBaseMin` | yes |
| Sell: for each 10 head | 1 min | Proposed | `sellMinPer10Head` | yes |
| Buy online | 30 min | Proposed | `buyOnlineMin` | not yet |

### Taken out on 14 Nov 2026 (not in the table)

| PRD figure | Was | Why it went |
|---|---|---|
| Travel on the farm | 25 km/h (Decided) | No driving and no drive home: "the drive home is just adding too much of an element into the time" |
| Go to the saleyard to buy | 6 h including travel | No trip. Buying takes none of the day. Bought cattle will arrive in the stock yards (next part) |
| Sowing or harvest by contractor | "within a few days of booking" (the builder had taken 3 days) | They happen at once: "they can straight up just go and harvest" |
| Walking a mob along its route | 1.5 km/h (Decided) | "Pick the paddock, done": no route through gates and no walking time |
| Muster a whole paddock | 30 min and 60 min for each 200 ha (Proposed) | Husbandry is done where the mob is, with no muster, so marking, weaning and selling no longer include it. For Claudia to confirm |
| Wire gate, tape gate handle, and 5 min each time stock go through a wire gate | 30 min, 5 min, 5 min | The three gate types are dropped for now. One gate: the proper swing gate |

Not built yet: contractor fencing teams (500 m and 1,000 m a day, Decided, PRD 5.11) and a farm hand's share of a fence (about 500 m, Proposed).

### Rules the builder chose (all for Claudia to check)

The PRD gives the figures. Where it does not say how a figure is applied, the simplest reading was built.

1. **"500 m per working day".** A working day is that day's light, from first light to last light, whatever its length. So a whole day on the fence builds 500 m in June and in December, half a day builds 250 m, and time spent on other jobs comes off it in proportion. The other way to read it is a fixed pace by the hour (500 m over a 10 hour day would be 50 m an hour: about 535 m on a Western Victoria June day and 715 m on a Central Queensland December day). `metresPerMinute` in `jobTimes.ts`.
2. **Whole segments only.** A line is built one map square's side at a time. A segment is built if all of it fits in the light left. On a big farm a segment is long (340 m on 12,000 ha), so a day of permanent fence there is one segment, not 500 m.
3. **The bank must cover the whole line as drawn**, though only the part that fits is built and charged today.
4. **A job that needs more than a whole day's light** can be done at first light, before anything else that day, and it uses the whole day. This is so no job is impossible. With the muster gone it matters only for a very big mob: weaning 2,000 head is 17 h 10 m.
5. **Taking things out takes as long as putting them in:** pulling down fence (at the pace of its kind), taking out a gate (60 min), a trough or a water hub (180 min). `removalWork` and the removal cases in `day/spec.ts`. Fence built from materials on hand takes as long as new fence: only the price changes (14 Nov 2026).
6. **Moving a fixed trough** takes as long as fitting one (180 min).
7. **Water hubs.** On a fence line or corner: a trough (180 min). On a square: a trough if the square has none (180 min) and a swing gate for each side that gets one (60 min each). Moving a hub on a fence line or corner, or taking either kind out, takes as long as fitting a trough (180 min). Moving a hub on a square takes a trough (180 min) and a swing gate for each side of the new square that gets one (60 min each). (14 Nov 2026.)
8. **Putting a knocked-down segment back up:** its length at the pace of its kind (electric or tape).
9. **There is no muster.** Marking, weaning and selling are done where the mob is, and the size of the paddock does not change the time. (Taken out on 14 Nov 2026. For Claudia to confirm.)
10. **Weaning's "0.5 min per head"** counts every head in the mob, calves included.
11. **Marking's "2 min per calf"** counts every calf at foot in the mob, heifer calves too, though only bull calves are marked.
12. **Selling's "1 min per 10 head"** counts every animal loaded, calves at foot included. Cattle sold out of several mobs take the same single time.
13. **Moving stock:** 15 min for each mob cattle are taken from, and 1 min per 100 head moved, calves included.
14. **Switching a supplement on or off takes none of the day.** In Fast Farm it is switched on at a daily price that does not cut the daylight (Claudia, 14 Nov 2026). The 30 minute figure is kept for Daily Farm feeders, a later part.
15. **Opening or shutting a gate** takes none of the day, but it is still a job: it can't be done after last light.
16. **Buying, sowing and harvest take none of the day** and can be done after last light.
17. **Skips:** a week is 7 days, a month 30 (the MVP's) and a year 365.

## Grazing plans (milestone 1.5c)

The figures are in `packages/engine/src/data/plans.ts` (`PLAN_FIGURES`). Each is marked: **old game** is the old game's own figure or default (`reference/mvp/grazing-game.html`), **builder** is the builder's choice, for Claudia to check. None is a looked-up real-world figure. How they are used is MODEL.md, section 10.

| Figure | Value | Source | Where it comes from |
|---|---|---|---|
| Most moves a day | 4 (a rule of 0.25 days) | old game | The plan dialog went "down to 4 moves a day" (REQUIREMENTS, "Grazing plans"). `perDayOf` is `round(1 ÷ every)` for a rule under a day |
| Default days between moves for a new leg | 3 days | old game | `newPlanFor`: `every: 3` |
| Default "grazed down to" figure for a new leg | 1,500 kg DM/ha | old game | `newPlanFor`: `kg: 1500` |
| Default rounds for a new leg | 1 | old game | `newPlanFor`: `rounds: 1` |
| Lowest "grazed down to" figure | 300 kg DM/ha | old game | `commitPlan` clamps the figure up to 300. The engine refuses a lower one, with the reason, instead of changing it |
| "Still here" note | every 7 days on a stop (kg rule) | old game | `stay >= 7 && stay - noted >= 7` |
| A move says a class will lose weight | more than 0.05 kg a head a day | old game | `planStep`: `gain < -.05` |
| Highest "grazed down to" figure | 5,000 kg DM/ha | builder | The old game had no upper limit. This stops a figure that can mean nothing |
| Longest wait between moves | 60 days | builder | The same |
| Longest day limit | 365 days | builder | The same |
| Most rounds in a leg | 99 | builder | The same. 0 means keep going |
| Most legs in a plan | 8 | builder | The same |
| Most stops in a leg | 30 | builder | The same |
| Most plans kept on a farm | 20 | builder | The same |
| Light a plan's own moves take | None | old game | The old game's plan moves took no time. PRD 5.15 proposed they use the farmer's daylight. The first build took the move time off the day's light, and the review found it only lowered the reported light. **Question for Claudia** |
| Setting or resuming a plan, when the mob is not on the stop | The ordinary move time: 15 min and 1 min per 100 head | builder | Putting the mob on its stop is a move, the same figure as `moveMob`. Free when the mob is already there. Refused if the light left does not cover it |
| Making, pausing and clearing a plan | None of the day | builder | They are decisions, not work |
| Another mob in the next area | The mob moves in and the two join | old game | `moveMob` then `mergeStrays`. The bigger mob keeps its name and its own plan, or takes the mover's if it has none |
| Editing a template | Resets the round and the waiting state of every other mob on it | builder | For Claudia to check |
| A move by hand | Pauses the plan (a move to the feedlot ends it) | builder | The old game ended the plan on every move by hand |

`every` is also kept to 0.25 or more, and a rule under a day needs at least two stops. The old game quietly made a one-stop leg "every 1 day". The engine refuses it with the reason.

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

## When a cow shows as PTIC (14 Nov 2026)

| Figure | Value | Source |
|---|---|---|
| `PTIC_DAYS`, days in calf before a cow or heifer shows as PTIC on the record | **50** | The engine's own day: `PREG_PREMIUM.fromDays` in `market/prices.ts`, the day the sale price starts paying the in-calf premium (from the old game). Kept so the record and the price agree (Claudia: "You only get PTIC price if that cow is confirmed to be pregnant"). |
| When pregnancy can be reliably found by rectal palpation | about **6 weeks** (42 days) of pregnancy; testing is usually done 8 to 10 weeks after the end of mating | Agriculture Victoria, "Pregnancy testing of beef cattle", https://agriculture.vic.gov.au/livestock-and-animals/beef/breeding/pregnancy-testing-of-beef-cattle (read 14 Nov 2026 through a search result: "pregnancies can be reliably detected as early as 6 weeks"; the page refused a direct fetch). No NSW DPI or Qld DAF page on the timing was found. |

**For Claudia:** the sourced figure (about 42 days) is earlier than the engine's 50 days. The engine keeps 50 so that a cow shows as PTIC on the same day her price includes the in-calf premium, and no money changes against the old game. Moving both to 42 would change sale values against the old game.
