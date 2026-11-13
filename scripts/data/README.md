# Data pull scripts

These scripts pull real price and weather history once. The tables they write are committed, so the game needs no live connection for past years (PRD 5.14, BUILD_PLAN section 3).

| Command | What it pulls | Writes to |
|---|---|---|
| `pnpm data:mla` | Meat & Livestock Australia price indicators, nationally and for each district yard, plus yardings and sale days | `packages/engine/data/raw/mla/` |
| `pnpm data:silo` | SILO daily weather for one grid point per district town | `packages/engine/data/raw/silo/` |

Both need Node 22.12 or newer and nothing else. Both update `packages/engine/data/raw/manifest.json`, which lists every table with its source, units, first and last date, row count and the date pulled. `docs/DATA.md` ("Real data sources") records what was pulled and the gaps.

The tables are server-side engine data. Browser code must never import them.

## Before you run them

- SILO asks for an email address as the user name. Put it in `.env.local` as `SILO_CONTACT_EMAIL`. That file is not tracked. The address must never go in a tracked file, a commit message or a log.
- MLA needs no key and no address.

## How they behave

- One request at a time. MLA gets one request every two seconds at most, SILO one every five. A failed request is tried again after a wait (20 seconds, then a minute, then three minutes for MLA). If it still fails the script stops and says where.
- The MLA service fails now and then on its own side. On 13 Nov 2026 about 7 requests in 100 came back as an HTTP 500 ("Throttling ... ListExports" or "loging request issue"). The same request worked after a wait. This is why the script goes slowly.
- Every answer is kept in `.data-cache/` (not tracked). A second run reads the cache and only fetches what is missing, so a stopped run carries on where it left off.
- MLA gives 100 rows a page and has no bulk download. Deep pages of a long date range time out, so the script asks for fixed 100-day windows instead. A window that has finished is never fetched again. A run on a later day only fetches the newest window of each series. If MLA later fills a hole in an old window (Armidale's restocker steers, June to November 2026, is one to watch), delete that window's file from `.data-cache/mla/` and run again.
- MLA is slow to pull. A national indicator is about 110 requests. A yard's indicator costs about the same, because the service gives a row for every day and repeats each sale for seven days. Everything on the list is about 7,000 requests, which is 6 to 10 hours at this pace. So pull in stages with `--only`, `--yards`, `--indicators` and `--until`, most useful first. `docs/DATA.md` says what has been pulled so far and what is left.
- SILO is four requests.

## Options

```
node scripts/data/pull-mla.mjs --plan                 count the requests still needed, fetch nothing else
node scripts/data/pull-mla.mjs --offline              rebuild the tables from the cache, no requests
node scripts/data/pull-mla.mjs --only=national        stages: national, yards, yardings, sales
node scripts/data/pull-mla.mjs --yards=GME,DUB        only these yards
node scripts/data/pull-mla.mjs --indicators=2,12      only these indicators (IDs from the service's /indicator list)
node scripts/data/pull-mla.mjs --species=Cattle       Cattle or Sheep only
node scripts/data/pull-mla.mjs --max-requests=500     stop after this many requests
node scripts/data/pull-mla.mjs --max-minutes=60       stop after this long
node scripts/data/pull-mla.mjs --until=20:05          stop at this time today
node scripts/data/pull-mla.mjs --to=2026-11-12        last date to ask for (default: yesterday in Sydney)
node scripts/data/pull-silo.mjs --offline             rebuild the tables from the cache
```

The default last date is yesterday. MLA returned an error when asked for today.

## Credit lines

- Prices: "Reproduced courtesy of Meat & Livestock Australia Limited – www.mla.com.au"
- Weather: "Climate data: SILO, Queensland Government (© State of Queensland), CC BY 4.0, built from Bureau of Meteorology observations. The data has been reformatted."

## After a pull

Run `pnpm test`. The test in `packages/engine/src/data/raw-data.test.ts` checks every table against the manifest. Then run `git grep -n "@" -- packages/engine/data` to be sure no address was kept, and update the dates and row counts in `docs/DATA.md`.
