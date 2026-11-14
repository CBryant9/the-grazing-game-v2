# Build plan (for PRD v1.1)

Status: **ready for Claudia's go-ahead.** Nothing is built yet. Rewritten 13 November 2026 after Claudia widened the build and answered the question list. It follows `docs/PRD.md` v1.1 and `docs/REQUIREMENTS.md`.

What this covers: the stages and milestones (1), how the engine is built and proven (2), real years and data (3), the map (4), the server, scale, cost and security (5), search and the sales page (6), working method (7), accounts and keys (8), risks (9) and what is still to decide (10).

---

## 1. Stages and milestones

Each milestone is a few days of work, one branch and one pull request. Nothing goes to `main` without Claudia's go-ahead. Before every pull request: type check, lint, unit and engine tests, Lighthouse CI on mobile settings, the `realism-guardian` agent, a security check of the change, and a real check at phone size in both orientations and both themes. Each stage ends with a stage report in the pull request and in `docs/DEVELOPMENT_LOG.md`, with screenshots, the defaults used, what is not done, and an honest scorecard (realism, match to the mockups, speed, accessibility, security, tests).

### Stage 1: Engine and the cattle game on all screens

No outside accounts are needed. The engine runs locally during this stage so it can be tested. Nothing containing the engine is published.

| # | Milestone | What is built | Done when |
|---|---|---|---|
| 1.0 | Scaffold | pnpm monorepo (`apps/web`, `packages/engine`, `packages/render`, `packages/shared`), strict TypeScript, ESLint, Vitest, Playwright, Lighthouse CI, GitHub Actions, `.env.example`. One constants file for mode names, slot IDs, switch keys and job times. Design tokens, fonts and the button, chip and badge styles from the mockups, light and dark | CI is green. The empty `/` and `/play` shells score Lighthouse 100 on mobile |
| 1.1 | Grass | Data tables for the four districts, seeded random numbers, pasture growth, senescence, rankness, quality, phase labels, paddock summaries | Each formula gives the same numbers as the MVP for the same inputs (section 2) |
| 1.2 | Cattle and the farm | Intake, energy, weight and condition, grazing allocation, breeding, deaths, water, paddocks and fences, crops, farm generation with stock yards (no homestead: REQUIREMENTS, 14 Nov 2026), money, versioned saves. The MVP bugs in 2.4 fixed | Cattle formulas match the MVP. No water kills everything on day 4. Every paddock on 40 random farms has a gate. Same seed and actions give the same farm every time |
| 1.3 | Calibration | Every benchmark in `docs/CALIBRATION.md` for the four districts as an automated test. High-density tests (500 head on 4 ha moved daily). Speed test. Central West steers tuned into range | Every benchmark passes in average or better seasons on a fixed set of seeds. Under 5 ms per simulated day with 4,000+ head. Before and after logged in `CALIBRATION.md` |
| 1.4 | Real years | SILO weather history and MLA price history pulled once by a script and stored as tables. The soil-water growth factor. The mapping from MLA indicators to the game's classes. Real sale calendars for each yard. Years in order or at random | Averaged over 1997 to now, growth matches each district curve, so 1.3 still passes. Known dry and wet years look right to Claudia. Sources recorded in `DATA.md` |
| 1.5 | The working day | *(Made simpler by Claudia on 14 Nov 2026: see REQUIREMENTS.md, "14 Nov 2026: the working day made simpler". Struck items are out for now.)* Daylight by district and date. The job times in PRD 5.4. ~~Driving from the homestead.~~ ~~Three gate types and moves along a route through gates.~~ ~~A long walk costs the day's gain.~~ The part of a fence line that fits in the day is built, and the rest is drawn again another day. ~~Yard work at the yards.~~ Feed as stock, lick that runs down, feed runs (Daily Farm only), ~~sheds and silos~~. Booking stock onto the next sale, next-day delivery into the yards. Plans as templates. Next day and skips | A winter day in Western Vic is shorter than a summer day in Central Qld. Looking never moves the clock. Calibration still passes. A test plays ordinary, careless and absent players for 180 days and reports who goes under and why |
| 1.6 | The map | PixiJS map in the S3 + S5 style, art drawn in code and swappable sprite by sprite. Model-driven grass at every zoom. Mob markers zoomed out, cattle zoomed in (Brahman style in Central Qld). Fences, gates, tape, pipe, troughs, bore, trees, ~~homestead~~ (no homestead: REQUIREMENTS, 14 Nov 2026), yards, buildings. Time-of-day lighting, weather, layers, time-lapse. Side-view sward pictures | Every item in `docs/VISUALS.md` reads clearly at every zoom. 60 fps with 4,000+ head in the speed test. No saleyard on the map |
| 1.7 | Game screens | Phone portrait, phone landscape and PC layouts as in the mockups. Setup flow (mode, district, size, stock, enterprise, years, start, difficulty, name). Daylight bar. Things to check. Build tools and job card. Paddock sheet. Move cattle. Market with days to the next sale. Herd and stock book. Paddocks. Plans, the plan card and "Run today's plan". Feed. Scores. Diary. Inbox. Summaries. Guided first day | A phone player can set up a farm, build, move, buy, sell and skip a year in portrait and landscape with no sideways scroll. Both themes meet WCAG AA |
| 1.8 | Stage 1 wrap | Install to the home screen, offline viewing, error screens, speed budgets in CI, cost measurement, Stage 1 report | `/play` meets the PRD 14.10 targets. Claudia has played it on a real phone |

### Stage 2: Farm hands and sheep

| # | Milestone | What is built | Done when |
|---|---|---|---|
| 2.1 | Farm hands | The labour pool, hiring, pay day, standing duties, helping on the player's jobs, leaving, reputation, injury, inbox messages, the worker report with its speech bubble | A hand's share of a fence uses none of the player's daylight. Missed wages lower the farm's standing. Wording states facts only |
| 2.2 | Contractor fencing | Yourself, 1-man team or 2-man team on permanent fence. Multi-day runs. Hands helping. The player's own fence alongside, in a different colour | A 1-man team builds 500 m a day and a 2-man team 1,000 m without using the player's day |
| 2.3 | Sheep benchmarks and model | A sheep benchmark table drafted from published sources and agreed with Claudia. Then intake, growth, wool, breeding and deaths built to hit it | Every sheep benchmark passes as an automated test. Cattle benchmarks unchanged |
| 2.4 | Sheep in the game | Sheep classes in the Market, sheep-proof fence, shearing and crutching, wool income (stand-in price), sheep on the map, the cattle, sheep or mix choice at setup. Stage 2 report | A player can run a sheep farm for a year on phone and PC. Sheep are not offered in Central Qld |

### Stage 3: Accounts, the server and Daily Farm

The first stage that needs accounts and keys (section 8).

| # | Milestone | What is built | Done when |
|---|---|---|---|
| 3.1 | Database and sign-in | Supabase tables, access rules on every table with tests, emailed link and Google sign-in, date of birth (14+), username, the under-16 flag, seed data | Tests prove a player can only change their own rows and private fields can't be read by anyone else |
| 3.2 | The simulation on the server | Both modes run on the server. Guest sessions. 2 Fast Farm slots. The browser build no longer contains the engine. Farm history. Download my data, delete my account | The game page contains no formulas or data tables. A failed save retries and never loses a job silently |
| 3.3 | Daily Farm | 2 Daily Farm slots, today's real date, midnight rollover in batches, catch-up, time zone lock, daily weather and price fetch, hands' standing duties on missed days, the plan card, diary with the map on past days | A wound-forward clock gives no extra days. The rollover copes with a missed run |
| 3.4 | Notifications | Web push, email fallback, inbox, per-type settings, quiet hours, the morning reminder and one later nudge, the iPhone Add to Home Screen guide | Each type can be turned off. Wording never nags |
| 3.5 | Admin shell | `/admin` with the role checked on the server. Feature switches. Users. Audit log. Maintenance mode. Stage 3 report | A Daily Farm runs 7 real days including 2 missed days and the catch-up looks right to Claudia |

### Stage 4: Competition and community

| # | Milestone | What is built | Done when |
|---|---|---|---|
| 4.1 | Scores and leaderboards | Grazier Score set from calibration farms. Boards with every filter, including a board for each real year. Public leaderboard pages | Your row pins at the bottom. A real-year board ranks on the change over that year |
| 4.2 | Profiles and following | Profiles, links, experience, education, privacy, follows, blocks, search, under-16 rules | An under-16 test account sees no community anywhere |
| 4.3 | Posts and the feed | Posts with photos, image check, comments, likes, reports, Share my farm, day cards, the three feed tabs, share images | A photo never shows before it has been checked |
| 4.4 | Groups and challenges | Groups, invites, group boards, challenges and leagues | Two accounts in one group see the same board |
| 4.5 | Ticker, farm viewing, moderation | Ticker on website pages only, read-only farm view, moderation queue, word filter, rate limits. Stage 4 report | Two test accounts follow each other and see each other's day cards and farms |

### Stage 5: Money and launch

| # | Milestone | What is built | Done when |
|---|---|---|---|
| 5.1 | Ad slots | Every slot in PRD 10.1, campaigns, house ads, caps, video player, view and click logs, sponsor reports, AdSense (off) | Claudia can switch on a slot, upload a house ad and see views |
| 5.2 | Purchases | The two one-off packs, farm slots and no-ads from what the account owns, paying to keep going with the offer card | A test purchase in Stripe test mode lifts the farm limit and removes ads. A rescue does exactly what the card said |
| 5.3 | Dashboard and analytics | Admin dashboard, PostHog with consent, exact counts, audience snapshot, CSV export, game health, Web Vitals | Dashboard numbers match the database |
| 5.4 | Website | Landing and sales page, pricing, advertise, about, privacy, terms, community rules, search and sharing | Lighthouse 100 in all four categories on every public page, mobile test |
| 5.5 | Launch check | Full security review, load test, end-to-end flows on phone sizes, Sentry, backups and a tested restore, runbook. Final report | Nothing is left on the not-done list that Claudia hasn't agreed to |

---

## 2. The engine: what is matched, what is rebuilt, and how it is proven

### 2.1 What is matched

The MVP's grass and cattle formulas were calibrated, so they are matched number for number: growth, senescence, dead decay, leaf age, rankness, quality, grazing preference and allocation, intake, energy and gain, condition, breeding, deaths, AE, and the crop stages. Each is tested against the MVP's own function with the same inputs. The test loads the MVP script from `reference/mvp/grazing-game.html` in memory. The MVP file is never edited.

### 2.2 What is rebuilt

Everything around those formulas is built for this game: farm generation (now with stock yards (no homestead: REQUIREMENTS, 14 Nov 2026)), seasons (now real weather), markets (now real prices), costs, jobs and time, mobs and strays, plans, saves, and every screen. The MVP is not copied line for line here.

### 2.3 Repeatable from a seed

- One seeded random source, with a separate stream for each part (generation, breeding, deaths, workforce, weather display), so a change in one never shifts another.
- Nothing in the engine reads the clock, the screen or the drawn cattle. The MVP decided strays from where cattle were drawn; the engine uses a seeded rule.
- The engine reports events (no water, harvest ready, year end, game over). The screens decide what to stop and show.
- Every farm records its engine version. A model change bumps it, re-runs calibration, and is logged in `MODEL.md` and `CALIBRATION.md`.

### 2.4 What the check of the docs against the MVP found

A line-by-line pass over `MODEL.md`, `DATA.md` and the whole MVP script found the figures match, with these exceptions. Each is confirmed as its module is built, and the docs are corrected in the same change.

**Where the docs and the code disagree.** The code is the calibrated thing, so the formulas follow the code:

| Topic | The doc says | The code does |
|---|---|---|
| Fallow and stubble | Fallow adds 0.006 to dead decay | Fallow dead breaks down 3% a day and stubble 0.4% a day |
| Protein penalty | Applies with no lick when diet CP is under 7% | Uses the CP of pasture plus hay or pellets, and applies on hay and pellets too |
| Hay and pellets | 3 kg and 2 kg a head | Calves get 40% of that |
| Quality of dead feed | One rule | Native only. Sown pasture and crops have their own values |
| Old sown pasture | Loses up to 0.1 DMD and 8 CP points | At most 0.045 DMD and 3.6 CP points |
| Weaning | The whole drop at about 280 days | Only calves 90 days or older |
| Utilisation score | Over 60% loses 40 points a point | Never below 0 |
| Grain shedding | 3% a day from day 30 | Also 0.2% a day before that |

**MVP faults fixed from the start:**

| The MVP | The rebuild |
|---|---|
| A mob sent to the feedlot while out of water keeps losing weight | The no-water count clears |
| A cow whose calf dies is still treated as milking | She is dried off |
| Weaning doesn't dry off a dam in another mob | The dam is dried off wherever she is |
| A plan stuck at a stop with no water keeps counting rounds | Rounds count only when the mob moves |
| The energiser is charged on temporary tape, and the $10 tape fee on all-new tape | Energiser on electric fence only. Tape costs as REQUIREMENTS says |
| Net worth counts things that were never paid for and never drops | Net worth is cash, plus stock at sale value after costs, plus 80% of what has been spent on what is still there |
| Game rules sit inside screen code (sowing, removing troughs, changing lick) | All rules are engine actions the server checks |

### 2.5 Calibration

- The three suites in `reference/mvp/calibrate.js` (steers, herds, speed) become engine tests, on a fixed set of seeds, for the four districts.
- A run is judged against its season: an average or better year outside the target fails the build; a drought year below target is recorded.
- The other benchmarks are tested directly: intake on green and dry feed, conception by CS, 9-week joining, anoestrus, carrying capacity, Central West barley and wheat yields, steers on oats, speed.
- **Central West steers** ran 130 to 154 kg against a target of 115 to 130 in the MVP. The cause is found and the smallest tune applied, with before and after for every benchmark.
- The Top End benchmarks are parked with the district.
- New tests: high density with several moves a day; a mob walked a long way; real dry and wet years; the 180-day "who goes under" run.

---

## 3. Real years, prices and weather

Findings are from research on 13 Nov 2026. The MLA yard list and Charters Towers prices were checked with live calls; the rest was read from each source's own pages.

**Weather: SILO (Queensland Government).** Free, open licence (CC BY 4.0) with a credit line. Daily rain, temperature and evaporation for any point in Australia from 1889 to yesterday. Needs only an email address as a user name.
- Stage 1: one request per district town, 1990 to now, saved in the repo.
- Stage 3: one server job a day fetches yesterday for each district. Players' devices never call it.
- The Bureau of Meteorology's own feeds are not for commercial use, so they are not used.

**Growth from weather.** The district curves stay as the average year. Rain and evaporation feed a simple soil-water tally that gives a daily growth factor in place of the MVP's random season and monthly wobble. It is scaled so the long-run average equals the district curve. Checked against AussieGRASS regional growth and against years Claudia remembers. This is the biggest change to the model in the build and gets its own milestone (1.4).

**Rain shown on screen** ("12 mm last night") is the real figure for that day.

**Prices: Meat & Livestock Australia's public data service.** Free, no key. Daily indicators from mid-1996, nationally and by yard: restocker yearling steers and heifers, feeder steers (from 2003), heavy steers, processor cows, young cattle, five lamb indicators and mutton.
- No price is served for bulls, PTIC cows, or cow and calf units. Those are worked out from the nearest real indicator. The mapping is recorded in `DATA.md`.
- Credit line: "Reproduced courtesy of Meat & Livestock Australia Limited – www.mla.com.au".
- MLA has two terms documents that disagree on commercial use. Claudia's decision: build on it now and email MLA before launch.

**Yards and sale days** (the game shows "Saleyards"):

| District | Yard | Sale days found |
|---|---|---|
| Central Queensland | CQLX Gracemere | Cattle Wednesday |
| Northern Tablelands | Armidale | Cattle Thursday, about fortnightly |
| Central West NSW | Dubbo | Cattle Thursday, sheep Monday |
| Western Victoria | Mortlake (cattle), Hamilton (sheep) | Cattle Monday, sheep Wednesday |

Sale days follow the real yard. Past years use the days that yard really sold, taken from MLA's yardings data. Where a yard's own history is short (Gracemere restocker steers, Mortlake before 2018), the national indicator or a nearby yard fills in, and `DATA.md` says so.

**Wool.** A stand-in price for now. Real wool prices need a paid AWEX agreement and written permission, to sort out before sheep go public.

---

## 4. The map: speed and level of detail

Targets (PRD 14.10): 60 frames a second on a mid-range Android phone about 3 years old with 4,000+ head, no main-thread task over 50 ms, and skips that don't freeze the screen.

- **The simulation is never on the screen's thread.** It is on the server (locally in a Web Worker during Stage 1). The map gets a compact snapshot after each game day.
- **The map only redraws what changed.** Grass and paddock colours change once per game day. Between days only stock, weather and the windmill move.
- **Zoomed out (about 26 screen pixels per square or less):** each paddock is a clean colour field with a texture from its pasture state, built from the model for each square so a patchy paddock looks patchy. Paddocks are drawn slightly raised by grass height. Each mob is one marker: an icon, the head count, and a soft footprint.
- **Zoomed in:** grass clumps and individual stock. Only squares on screen get clumps (a few thousand at most on a phone). Each clump is one sprite picked by height, green share, green-at-the-base, seed heads and dead share, tinted by leaf age.
- **Stock zoomed in:** one sprite each with outline and shadow, by class, breed style and condition. Big mobs draw a sample plus a head-count badge, so 4,000 head is never 4,000 sprites.
- **The hand-over** between the two is a cross-fade, never a pop.
- **Other measures:** one texture atlas; screen resolution capped at 2× and lowered on a struggling phone; lighting by tint, not a full-screen filter; pooled sprites; the ticker stops when the map is hidden; PixiJS and art load only on `/play` after the shell is usable.
- **The picture matches the model.** The map and the numbers use the same thresholds. Stock stay inside their paddock and stand back from fences. Taps are tested against what is drawn, and a tap opens the paddock, never an animal.
- **Checking it:** a CI speed test with a 4,000-head farm and the processor slowed 4×, plus Claudia on a real mid-range Android and an iPhone at the end of 1.6 and 1.8.

---

## 5. The server, scale, cost and security

### 5.1 What "the server" is

Two rented services, both set to their Sydney locations:
- **Vercel** runs our code for a moment each time a player does something, then stops. It adds capacity by itself and nothing runs when nobody is playing.
- **Supabase** is the managed database for accounts, farms and the community.

The phone or PC holds the screens and the map drawing. Each job or skip goes to the server, which checks it, runs the simulation, saves the farm, and sends back what to show. Skips run a month at a time so the map keeps moving.

### 5.2 Scale and cost

- Each request stands on its own, so 10 players and 10,000 run the same way.
- A farm at rest is a few tens of KB. A Daily Farm needs about 5 ms of computing a day. Farm slots are cheap; active play and photos are the real costs.
- Website pages are built ahead and cached. Switches, ad campaigns and the ticker are small cached files. Ad events are batched and rolled up nightly.
- The rollover works in small batches that can stop and pick up.
- Weather and prices are one small fetch per district per day, whatever the number of players.
- Daily map history is stored small in file storage, kept daily for 90 days, then weekly.
- Real cost per 1,000 active players is measured at the end of Stage 1 and again in Stage 3, so limits and prices are set from real figures.
- Free tiers through the build. Nothing that needs a paid plan is added before launch without asking.

### 5.3 Security

| What needs protecting | How |
|---|---|
| The rules of the game | The simulation runs only on the server. The repos, the MVP and the model docs stay private. Preview sites are locked |
| Passwords | We hold none. Sign-in is by emailed link or Google, handled by Supabase |
| Card details | We never see them. Stripe's own page takes the payment |
| Private details (date of birth, email, roles, bans) | Kept in tables only that player and the server can read, not on the public profile. Every access rule has a test that tries to break it |
| Children | No account under 14. Under 16s have no community, no photo and no profile link |
| Cheating and fake scores | Only the server can change a farm, a score or a purchase |
| The admin area | The role is checked on the server on every request. Every action is logged |
| Secret keys | Only in the hosting services' settings |
| Uploaded photos | Checked for type and size, and held until they pass the image check |
| Floods of requests | Limits on jobs, posts, comments, follows and sign-ups |
| Losing data | Backups and a tested restore before launch |

What only Claudia can do: turn on two-step sign-in for GitHub, Vercel, Supabase and Stripe; keep the repos and the MVP artifact private; have a lawyer look at the privacy policy, terms, purchases and the under-16 rules.

The honest limit: what a player sees on screen can always be written down. The build itself never exposes the rules, the data or the money.

---

## 6. Search and the sales page

- Every public page has a title, description, share image, and structured data that tells search engines it is a free browser game.
- Landing page as in mockup K: the big title over the farm scene, Play free, the announcement bar, feature cards, the sponsor strip. Below that: how a day works, the districts, what makes it realistic (real years, real prices, real weather, in Claudia's terms), questions and answers, and a second Play free.
- Play free starts a guest Fast Farm with no sign-up.
- Public leaderboards and a page per district give search engines real content. Private profiles are never indexed.
- Sitemap and robots file.

---

## 7. Working method

- The engine comes first. No screen work depends on it until the formula matches and the calibration tests are green.
- Open questions never stop the build. The PRD section 21 default is built as a setting or one line in a data file, and listed in the stage report.
- The project memory is updated in the same change: requests to REQUIREMENTS, figures to DATA with a source, model changes to MODEL and CALIBRATION, anything drawn to VISUALS, mistakes to LESSONS.
- No real-world figure is written from memory. It is looked up and the source recorded. Where none can be found, it is listed for Claudia.
- Player-facing text follows the wording rules and is checked by the `realism-guardian` agent.

---

## 8. Accounts and keys needed from Claudia

No accounts are created, terms accepted or passwords entered by the builder. Every variable goes in `.env.example` with a comment.

| When | What | What is needed |
|---|---|---|
| Before 1.4 | An email address for the SILO weather service | It is the user name on each request, and SILO contacts users through it |
| Stage 1 | Nothing else | The MLA data service needs no key |
| 3.1 | Supabase project (Free), in Sydney | Project URL, publishable key, service role key, database connection string |
| 3.1 | Google sign-in | A Google OAuth client, pasted into the Supabase dashboard |
| 3.1 | Resend (Free) and a domain with DNS access | API key for sign-in links and alerts |
| 3.1 | Vercel project (Hobby), linked to the repo, previews locked | Environment variables pasted in |
| 3.3 | Nothing new | A random secret for the rollover job (a command is supplied) |
| 3.4 | Nothing new | Web push keys (a command is supplied) |
| 3.5 | Sentry (Free) | DSN and a private upload token |
| 4.3 | An image-check service, to choose then | API key. Until then every photo waits in the moderation queue |
| 5.2 | Stripe (test mode) | Secret key, publishable key, webhook secret. Products and prices made in Stripe |
| 5.3 | PostHog (Free) | Project key and host |
| 5.4 | Domain name | The site address |
| Before launch | Vercel Pro and Supabase Pro | Vercel Hobby can't be used commercially |
| Before launch | An email to MLA's market information team (contact on their statistics page) | Written confirmation of commercial use. A draft will be supplied |
| Before sheep go public | An AWEX agreement | Real wool prices |
| Optional | Apple sign-in | Needs a paid Apple Developer account. Built, left off |

Pull requests: there is no GitHub connector or `gh` tool in the build session at present. Branches are pushed with git and a link is given for each pull request, unless a connector is added.

---

## 9. Risks

| Risk | What is done about it |
|---|---|
| **The build is now much bigger** (farm hands, sheep, real weather, buildings, purchases) | Five stages, each ending in something Claudia can play and judge. Cattle are proven before sheep are added |
| **Real weather changes the calibrated model** | Its own milestone. The long-run average is pinned to the district curves, and benchmarks are re-run |
| **MLA could withdraw permission** on 7 days' notice, and its terms disagree | Prices sit behind one interface with the stand-in series as a fallback. Claudia emails MLA before launch |
| **Some yards have short or patchy history** | National indicators or a nearby yard fill in, recorded in `DATA.md` |
| **A server round trip on every job** could feel slow | Sydney hosting, small replies, and the screen shows the job starting at once. Measured in 3.2 |
| **Server time limits** on the free plans | Skips and rollovers run in small pieces that can stop and pick up |
| **Many new figures need sources** (wages, contractor rates, gates, buildings, lick, sheep) | Each is looked up and recorded, or listed for Claudia. Placeholders are marked as placeholders |
| **The market series in the MVP was approximate** | Replaced by MLA data in 1.4 |
| **Legal:** under-16 rules, purchases by minors, consumer law | Lawyer before the community and purchases are switched on |
| **Real phones** | Claudia tests on real devices at the end of each stage |
| **Libraries change** (PixiJS, the service worker tool) | Current docs are checked at the scaffold, and a piece is swapped if it misses the speed targets |

---

## 10. Still to decide

**Needed before the milestone shown**

| # | Decision | Needed by |
|---|---|---|
| 1 | Which email address to use for the SILO weather service | **Answered 13 Nov 2026.** Claudia has given the address for outside services. It is kept in an environment variable, not in the repo |
| 2 | Is the MVP artifact on claude.ai private? | **Answered:** yes, and both GitHub repos are private |
| 3 | OK to update `CLAUDE.md` to match PRD v1.1? | **Done 13 Nov 2026** |

Nothing is waiting on Claudia before Stage 1. She will give the go-ahead to start when she is back at her PC.

**Defaults accepted for now, to perfect later.** All 22 are in PRD section 21 (rows 13 to 34). The ones that most need a real figure or Claudia's eye:
- Contractor fencing price per metre.
- Farm hand wages.
- Gate costs and times.
- Costs and build times for sheds, silos, yards and a feedlot.
- Lick block size, price and intake per head; hay and pellet prices.
- Electric and tape rates.
- The sheep benchmark table (drafted in 2.3 for Claudia to check).
- The stand-in wool price.
- The keep-going price under 6 months, and what a rescue leaves the player with.
- What the $30 and $50 packs include.
