# Stage reports

One report for each of the five stages in `docs/BUILD_PLAN.md`, in the shape `CLAUDE.md` asks for: what was built, how it was tested, which PRD section 21 defaults were used, anything not done, and questions for Claudia. Questions are not repeated here. They point to ids in `docs/CALLS_FOR_CLAUDIA.md`, where each one is written out with where to change it.

The figures come from `docs/DEVELOPMENT_LOG.md`. Test counts are as the log gave them at the end of each milestone. Counts from different branches are not a running total, because some branches were built side by side and joined later.

Ids used below, from `docs/CALLS_FOR_CLAUDIA.md`. A1 to A25 are the calls that need you (Part A). B1 and up are decided calls (Part B), found under the same headings.

- Part A, by theme: grass and cattle A1 to A3, sheep A4 to A6, hands and contractors A7 and A8, Daily Farm A9, scores A10, real years A11 and A12, sale days and plans A13 and A14, accounts and privacy A15 to A18, purchases A19 and A20, website A21, community A22, ads A23, notifications A24, speed A25.
- Known gaps in realism G1 to G9. Not built N1 to N10. Not checked V1 to V12.

## Stage 1: engine and the cattle game on all screens

### What was built

- **1.0 Scaffold.** A pnpm monorepo (`apps/web`, `packages/engine`, `packages/render`, `packages/shared`), strict TypeScript, lint rules that keep the browser out of the engine, design tokens, the three fonts, light and dark themes, seeded random numbers with named streams, and the landing and `/play` shells.
- **1.1 Grass.** District figures, pasture on 1,040 squares, growth, senescence, feed quality, phase labels and paddock summaries, matched to the MVP for the same inputs.
- **1.2 Cattle and farm.** Intake, energy, weight and condition, grazing, breeding, deaths, water, paddocks, fences, gates, crops, whole-farm generation with stock yards (no homestead), money, actions and versioned saves. MVP faults listed in BUILD_PLAN 2.4 were fixed.
- **1.3 Calibration.** Every benchmark for the four districts as an automated test, high-density tests, a speed test, and the Central West peak digestibility tune from 0.70 to 0.68.
- **1.4 Real years.** SILO weather and MLA prices pulled once into tables, the soil-water growth factor, the mapping from indicators to the game's classes, real yard sale calendars, prices lifted to today's dollars by the CPI, and years in order or at random. Farms with random seasons are unchanged.
- **1.5 The working day.** The farm clock from first to last light, job times in one data file, buying and selling only on sale days with next-day delivery into the yards, grazing plans as templates, Next day and skips, and the 180-day play test with three kinds of player. After review you cut driving, the homestead, bookings for contractors and jobs that carry over.
- **1.6 The map.** A PixiJS map with a clear zoomed-out view and detail on zoom, 54 sprites drawn in code and replaceable one by one, layers, time-of-day light, weather, both themes and side-view pasture pictures.
- **1.7 Game screens.** The game server inside the web app, the setup flow, the play screen in three layouts, the paddock sheet, mob card and husbandry, build tools, Market, Plans, crops, the inbox, Scores, Diary, Help, a guided first day and empty states. Fence materials are kept and reused at half price. Pregnancy is on the record by itself from 50 days in calf, with no preg test.
- **1.8 Stage 1 wrap.** Install to the home screen, offline viewing of the last farm, error screens, script-size and speed budgets in CI, and a cost measurement.

### How it was tested

- The grass and cattle code gives exactly the same numbers as the MVP, with no tolerance, on whole farms day by day. Grass: 88 tests. Farm half: 267 in all. Whole farm: 706 in all. Break-it checks (change one figure, confirm a test fails) found and closed gaps in each milestone: 47 on grass (all caught), 265 on cattle (264 caught, one changes no result) and 330 on the whole farm.
- Real years: 1,417 tests in 63 files. 435 steer runs and 232 herd runs on every start year from 1997 to 2025. The month factor averages 1 in every calendar month of 1997 to 2025 in all four districts.
- Working day and later: 1,546 tests (1.5a), 1,886 (1.5c), 1,933 (1.7a), 1,987 (1.7b), 2,267 (1.7f), 2,283 in 120 files at 1.8. Plans were compared with the old game's own plan code in memory.
- Speed: 2.1 to 3.0 ms a simulated day with 4,300 to 4,900 head against a 5 ms target on the build PC. A year skip in the real routes ran at 4.7 ms a simulated day.
- Lighthouse (mobile, local): `/` 0.95 median and `/play` 0.89 (target 0.95) at 1.8, with Accessibility, Best Practices and SEO at 1.
- Map: processor time for a frame with 4,409 head and 22,664 grass pieces was 1.0 ms at the 95th percentile on the build PC. Frame rate was not measured on a phone.
- Screens were looked at in the browser pane at phone upright (375, 360 and 390 wide), phone on its side (812 by 375 and 844 by 390) and PC (1,024 and 1,280 wide), in both themes for most screens, with contrast and 44 px target checks by script.
- The checks listed in BUILD_PLAN section 1 before each pull request were not all run on every milestone. `realism-guardian` ran on some milestones and not others (see V10).
- No screenshots were captured for this report. The log records what was looked at in the browser pane, not images. In 1.6a screenshots were taken but cropped by the pane and not kept.

### PRD section 21 defaults used

- Row 5 (job times in one data file), row 13 (first light to last light), row 14 (electric about 1 km an hour, tape about 3 km an hour) and row 16 (the proper gate's hour).
- Row 32 (earliest real year 1997).
- Row 11 (render style S5 clear map with detail on zoom) was already decided.
- Rows 4 (travel) and 34 (fences longer than a day) were overtaken by your decisions of 14 Nov 2026, for the player's own fence.
- Builder's defaults where the PRD had none: prices in today's dollars by the CPI, the indicator-to-class mapping, the fill-in yard rules, and the stand-in sale days.

### Not done

- The Stage 1 "done when" for 1.8 asks that you have played it on a real phone, and that `/play` meets the PRD 14.10 targets. Neither is met: `/play` is at Lighthouse 0.89 against 0.95. See A25 and V1.
- The map items in N1 and the play-screen items in N2. Calibration rows that stay open are G1 to G9.
- The 1.3 "done when" is not met as the build plan words it: four benchmarks pass only on a reading that is yours to decide (Part B, cattle and grass, benchmarks judged on the average of twelve blocks).
- Playwright end-to-end tests are not recorded as built (N10).

### Questions for Claudia

- Real years, weather and prices: A11 and A12. The grass questions that came later in Stage 2: A1.
- When a cow shows as in calf and what the record pays: A3.
- Sale days and plans: A13 and A14. Working day times, map and play screens: Part B, cattle and grass.
- Scores and diary: A10 and Part B, scores and leaderboards.
- Speed targets: A25.

## Stage 2: farm hands and sheep

### What was built

- **2.1 Farm hands.** A labour pool, hiring and letting go, pay day every 14 days at Pastoral Award rates with 12% super, standing duties at first light, helping on the player's jobs, injuries, and the farm's standing with workers.
- **2.2 Contractor fencing.** Yourself, a 1-man team (500 m a day) or a 2-man team (1,000 m a day) on permanent fence, Monday to Friday, carrying on over days and skips, charged as built (materials plus $5 a metre labour). The screens for hands, the worker report and the team tool were built in the existing style, with the team's fence in hot pink.
- **2.3 Sheep model.** Sheep mobs beside cattle mobs with their own figures: intake, growth, wool, joining, lambing, marking, weaning, deaths and flystrike. Merino and crossbred. Start flocks, a sheep market on MLA indicators, feeding, shearing and crutching on dates with wool sold at shearing, netting fence, and sheep that get through cattle fences.
- **2.4 Sheep in the game.** The cattle, sheep or both choice at setup, the sheep mob card, the sheep market, shearing and feeding screens, flocks and netting on the map, and sheep help topics. All behind the `sheep` switch, off by default, and never in Central Queensland.
- **2.5 Calf growth.** Two MVP formulas that were wrong for calves were fixed: the cost of gain for young stock and milk falling with the cow's condition.
- **2.6 Grass quality review.** An evidence review of what the paddocks offer against published figures. It changes no model or test. It is in `docs/GRASS_QUALITY_REVIEW.md` on branch `m2.6-grass-quality-review`.
- **2.7 Engine join.** The sheep and calf lines joined (engine 0.16.0, then 0.17.0 after a review of the sheep third pass).

### How it was tested

- Farm hands: tests for both "done when" lines, pay day to the cent, missed wages, contracts across a skip, injury and old saves. A farm with no hands and no contractors matches a digest taken before any labour code existed. No calibration band or MVP comparison changed.
- Screens for hands: 2,430 tests in 130 files at 2.2 (2,428 passed on the full run; the two failures were fixed or were a load timing check that passed alone).
- Sheep: every row of `docs/SHEEP_BENCHMARKS.md` is a test named by its SB number. 82 tests named by SB row: 71 pass, 7 are known open gaps (expected failures with the figure in their names) and 4 are skipped (SB-59 to SB-62, carrying capacity). Start-flock and SB-GM margin rows are tested too. Sheep speed was 2.65 ms a day at first, then 1.66 ms with 6,865 sheep.
- Calf growth: new benchmark rows by district. Weight at 100 days passes everywhere. Daily gain is open in every district, and weight at 200 days in the three southern districts. Regression floors hold today's figures.
- Join: the whole engine suite was run on both lines. Every cattle figure equals the calf branch's and every sheep figure the sheep branch's to the last digit. At the join: cattle suites 124 pass and 11 known open gaps.
- Sheep screens: tests with the switch off (no sheep word anywhere sent) and on. In a browser (port 3305): a Western Victoria sheep farm through setup, the mob card, feeding, a move, buying and selling, a shearing, the map, and netting in both themes. At 360 px nothing overflowed.
- No screenshots were captured for this report. The log records what was looked at in the browser pane.

### PRD section 21 defaults used

- Row 15 (contractor price: materials plus a labour charge a metre, same rate for either team). The figure is a $5 stand-in.
- Row 17 (walking with dogs). With walking cut, dogs now only enlarge a hand's share of stock jobs.
- Row 23 (hands). The PRD says no limit on hands. The build lets the labour pool offer at most 6 hands at once (Part B, farm hands and contractors, standing and the pool).
- Row 24 (sheep districts: Northern Tablelands, Central West, Western Victoria) and row 27 (wool price: a stand-in).
- Row 34 (contractors carry on over days).
- Builder's defaults: 2026 award rates on every farm, a sheep DSE of 8.4 per AE, and netting at $10 a metre.

### Not done

- The sheep model's open gaps and the open calf rows (G1 to G9). They are why sheep stay switched off.
- Everything the log lists for Stage 2 as not built (N3): a calving window per district, overhead costs a year for sheep, booking sheep onto a later sale, moving the crutching and joining days on screen, the DPIRD budget read, a "cows getting thin" line in Things to do, and real-year wages (every farm pays 2026 rates).
- The 2.2 and 2.4 "done when" are met in tests and in the browser pane. A real phone check is owed (V1).

### Questions for Claudia

- Calves, cows, grass quality and the steer bands: A1 and A2.
- Sheep: A4 to A6, and Part B, sheep.
- Farm hands and contractors: A7 and A8, and Part B, farm hands and contractors.

## Stage 3: accounts, the server and Daily Farm

### What was built

- **3.1 Database.** 16 migrations at the end of the second pass (57 tables, access rules on every table, server functions, five storage buckets and two nightly jobs), plus seed data and the tests that prove the rules. Guest sessions the server makes, and the under-16 rule worked out live from the date of birth.
- **3.2 Accounts and saves.** Emailed link and Google sign-in (Supabase Auth, server side), username and date of birth with the under-14 refusal, two Fast Farm slots, a farm picker, saves in the database with retries that never lose a job silently, a picture of the farm for each past day (every day for 14 days, then weekly to 182 days), download my data and delete my account. The game page contains no formulas or data tables, checked in CI.
- **3.3 Daily Farm.** The real-time mode, behind the `daily_farm` switch (off). Midnight rollover in batches on a 15-minute cron, catch-up for missed days, a time zone lock, the plan card, and real weather and prices running 5 days behind.
- **3.4 Notifications.** Web push (written with Node's own crypto, checked against RFC 8291), email fallback through Resend, an inbox, per-type settings, quiet hours, the morning reminder and one later reminder, and the iPhone Add to Home Screen guide.
- **3.5 Admin shell.** `/admin` with the role checked on the server, feature switches, users (suspend, ban, lift, change role, sign out everywhere), site settings, the audit log, a dashboard of exact counts and maintenance mode.

### How it was tested

- Database: 391 tests at first, 445 after the security review, and 515 with the store tests. Every table is tested against a visitor, two players, an under-16 player, an admin and the server for select, insert, update and delete.
- Whole suite: 2,802 tests in 131 files after 3.1, 3,065 in 147 files after 3.2, 3,156 in 152 after 3.5, 3,162 in 161 after the Daily Farm second pass, and 3,319 in 163 after notifications.
- Security reviews: a second and a third pass by a review agent on 3.1, a second and third on 3.2, a second on 3.5 and on 3.3. Each fix has a test that was seen to fail first, except where the log says otherwise.
- Daily Farm: a farm run through 7 real days (13 to 19 Nov 2026) with 2 missed days. The farm run by the cron every night and the farm run only when opened have the same engine save, diary, totals and day. The rollover was tested for double runs, late runs, a run stopped halfway, daylight saving days in three cities and two tabs.
- Production build with no keys on several ports: every new page and route answered with no 5xx, and guest play worked as before.
- Script sizes: sign-in and account pages 143.5 to 144.4 KB of a 150 KB limit, `/admin` 147.4 to 148.0 KB, `/play` about 198 to 201 KB of 250, public pages 0 KB.
- Setup's first step (the Daily Farm card in its "coming" state) and the sign-in pages were looked at in the browser pane at 375 px. The admin screens, the catch-up sheet, the plan card and the notifications page were not looked at by eye because they need keys.
- No screenshots were captured for this report.

### PRD section 21 defaults used

- Row 1 (mode names Daily Farm and Fast Farm, in one constants file).
- Row 3 as settled in v1.1 (a hand's standing duties run on missed days, otherwise nothing happens without you).
- Row 7 as settled in v1.1 (2 Daily and 2 Fast Farms free) and row 9 as settled (minimum account age 14, under-16s get no community).
- PRD 11.7 switch defaults for sign-ups, both modes, leaderboards and push. Daily Farm was built off, against the table (A9).
- Row 31 (reminders): built opt-in, with the reminder time as a setting (A24).
- PRD 14.3 (the night runs at midnight).

### Not done

- Nothing has run against a real Supabase project, SILO or MLA (V3 and V4).
- Apple sign-in, a way to change a Daily Farm time zone, the evening warning job, real yardings for sale days, the proxy route that refreshes an admin's sign-in, and cross-instance rate limits (N5 and N6, and Part B, accounts and Daily Farm).
- A real push and email run (V6).
- Browser walks on a phone in both orientations and both themes for the Stage 3 screens (V2).

### Questions for Claudia

- Accounts, guests, privacy, ban records and saves: A15 to A18, and Part B, accounts and privacy.
- Daily Farm: A9, and Part B, Daily Farm.
- Notifications: A24.
- Admin and switches: the switch table in the summary, A18, and Part B, admin.
- Stage 3 keys and settings: sections 6 and 7 of `docs/CALLS_FOR_CLAUDIA.md`.

## Stage 4: competition and community

### What was built

All of it sits behind its own switch (`leaderboards`, `community`, `groups`, `activity_ticker`, `farm_viewing`, `feed_posts`), with the community off by default.

- **4.1 Scores and leaderboards.** Boards for the headline score, profit per ha, weight gain per ha, ground cover, days survived and a board for each real year ranked on the change in net worth over that year. Filters by mode, district, farm size, start, enterprise, period, people I follow, a group and a challenge. A public `/leaderboards` page that sends no script, with your own row pinned at the bottom.
- **4.2 and 4.3 Profiles, following, posts and the feed.** Profiles with privacy, follows, requests, blocks, search, posts, comments, likes, reports, Share my farm, day cards, share images, photos with metadata stripped and an admin approval queue, and the three feed tabs.
- **4.4 Groups and challenges.** Groups with invite codes, group boards, group feeds, Fast Farm challenges on a fixed seed and Daily leagues (set but not yet enterable), and the admin pages for them.
- **4.5 Ticker, farm viewing and moderation.** The activity ticker on website pages only, a read-only farm view (Daily Farm only), the moderation queue with remove, keep, warn, suspend and ban, and the word filter editor.
- A security review fixed 8 groups of problems before Phase 2 (staff see the community like members, private profile posts are their author's alone, image handling, photo limits, hidden characters, slow queries and more).

### How it was tested

- Whole suite at the end of Stage 4: 164 files and 3,368 tests, all passing. Earlier in the stage 3,252 tests in 157 files.
- Named tests from the build plan: "An under-16 test account sees no community anywhere", "A photo never shows before it has been checked", "Your row pins at the bottom", "A real-year board ranks on the change over that year", "Two accounts in one group see the same board" and "Two test accounts follow each other and see each other's day cards and farms".
- Every route file under the community and admin folders is walked by a test that makes it use the gate, CSRF check and limits, and fails when a new route is added without a case.
- Production build with no keys: every new page and route answered 404 (the admin pages show the "needs accounts" notice), no 5xx, `/` and `/play` 200, and a guest could start a farm and end a day.
- Script sizes: community pages 144.3 to 147.1 KB of 150, `/admin` 149.0 KB, `/leaderboards` and the public pages 0 KB, `/ticker.js` 1,345 bytes of a 2 KB limit.
- No screenshots were captured for this report. The pages were not looked at by eye because they need keys.

### PRD section 21 defaults used

- The log records these PRD sections rather than section 21 rows: 8.3 (under-16 rules), 9.1 (private profile), 9.4 (ticker on the landing page), 9.5 (farm view for a Daily Farm, with what it lists), 9.9 (reporting and moderation actions), 12 and the project rule on the Grazier Score (a stand-in headline until weights are set).

### Not done

- The Grazier Score formula (needs calibration farms and your ruling), boards for weaning %, condition and the "above 1,500 kg DM/ha" share, a leaderboard tab inside the game, badges and best ranks on profiles.
- Daily leagues cannot be entered and day cards were not made automatically until the m6 join wired them to the Daily Farm rollover.
- Popular ordering in Everyone, reports of groups from a group page, real farm showcase photos, pull to refresh and a Groups tab list of every group's board.
- No image-check service is wired, so every photo waits for manual review.
- No run against a real Supabase project and no check of the pages by eye (V2, V3 and V8).
- See N7 and V2, V3 and V8.

### Questions for Claudia

- Scores and leaderboards: A10, and Part B, scores and leaderboards.
- Community and moderation: A22, and Part B, community and moderation.
- Privacy and under-16 rules that affect what the community shows: A15 to A17.
- Keys: none new beyond Stage 3, except choosing an image-check service for `IMAGE_CHECK_API_KEY`.

## Stage 5: money and launch

### What was built

- **5.1 Ad slots.** Every slot in PRD 10.1 with its screen, size and switch, house ads and sponsor campaigns with caps, dates and budgets, a video break with no third-party player, view and click logs counted honestly, sponsor reports as a page and CSV, uploads checked by their bytes, and an empty AdSense adapter. With every ad switch off, nothing is drawn or downloaded.
- **5.2 Purchases.** One-off purchases through Stripe Checkout (inline prices, card only), the A$30 and A$50 packs and A$20 upgrade, farm slots and no-ads read from what the account owns, a webhook that checks signatures and records each event once, an admin page with refunds and "Check with Stripe", and the paying-to-keep-going offer card.
- **5.3 Dashboard and analytics.** The admin dashboard over a date range (players, farms, days played, money, sends, ads, website views, moderation, broken saves), CSV export of every table with an audit row, game health (route timings, failures by reason, save conflicts, rollover runs, queues), Web Vitals from a small hand-written collector, and analytics events through our own `/api/collect`, counted in our own tables and sent on to PostHog from the server only, all behind the `analytics` switch (off) and only with consent (never under 16). Public page views are counted on the server with no cookie and no id.
- **5.4 Website.** Home, pricing, advertise, about, privacy, terms and community rules as static pages that send no script, with titles, descriptions, canonical links, share images and structured data. They say only what is live.
- **5.5 Launch check.** Errors to Sentry from the server only, scrubbed to route, reason, class, release and a trimmed stack, with browser errors through `/api/client-error`. A Content-Security-Policy on every page (hashes on the static website pages, a fresh nonce on the app pages, which are now made per request). A load test (`pnpm test:load`), seven walked end-to-end flows, a restore drill (`pnpm test:restore`), farm export and import, `docs/RUNBOOK.md`, `docs/LAUNCH_CHECK.md`, and fixes for all 14 security review findings, each with a test that fails without it.
- **The m7 join.** 5.3 and 5.5 joined on `m7-final` with one proxy (the policy and the page-view count), one failure log that feeds both game health and Sentry, the analytics consent choice in Download my data, and the `signup`, `login`, `farm_ended` and `checkout_started` events wired.
- **The m6 join.** Stages 1 to 4 and ad slots and purchases joined on `m6-joined` (engine 0.18.0, save format 13). Wiring done: Daily Farm facts queue notifications, the Daily Farm reminder reader uses the farm's own "opened today", ads ask the purchases' no-ads answer and the new ad places were placed, the rescue is built in the engine (`rescueFarm`), day cards are made at the rollover, follows, comments and likes notify, and every API route was walked with no keys. Lessons in `docs/LESSONS.md` were renumbered by milestone.

### How it was tested

- Ad slots: 69 new tests in two files. Named test "Claudia can switch on a slot, upload a house ad and see views". A test tries every subset of the 14 places a slot can be mounted on both phone layouts and checks at most one ad draws. Full run 157 files and 3,269 tests.
- Purchases: 67 new tests in `billing.test.ts`. Named tests "A test purchase lifts the farm limit and removes ads" and "A rescue does exactly what the card said". Full run 3,270 tests. Nothing was sent to Stripe.
- Website: Lighthouse (mobile, local, 3 runs a page). Accessibility, Best Practices and SEO were 100 on every run. Performance medians were `/` 100, `/pricing` 99, `/advertise` 100, `/about` 100, `/privacy` 100, `/terms` 100 and `/community-rules` 100. The prices in `lib/pricing.ts` are tested against PRD 10.3.
- The join: the whole engine suite was run on the joined engine and on the pre-join engine. Same result on every shared test (1,980 tests before, 1,997 after), with 17 new tests and the same 4 skipped and the same expected failures. Full suite: 212 files and 4,100 tests: 4,074 passed, 22 expected failures (the open calibration rows), 4 skipped and 0 failed. Speed alone: cattle 3.41 ms and sheep 1.42 ms a day (limit 5).
- The production build with no keys: 48 pages and 79 route files walked from a list built from the app directory, with no 5xx. Guest play end to end and, with `GG_SWITCHES_ON=sheep`, a sheep farm and a year.
- Old saves from engine 0.13, 0.14, 0.16 (twice) and a format 12 save were loaded and played a day through both stores. This found one fault, which was fixed.
- Script sizes after the m6 join: `/` 0 KB, `/play` 207.2 of 250 KB, sign-in and account pages 141.4 to 146.9 of 150, `/admin` 149.1 and `/admin/ads` 147.4 of 150, community pages 145.3 to 149.4 of 150. After the m7 join: `/` 0 KB, `/play` 208.3, sign-in, account, store and purchase pages 143.2 to 148.6, `/admin` 149.5 and `/admin/ads` 147.8, community pages 145.6 to 149.8, no limit raised. The 0.3 to 0.4 KB every page gained is the proxy: with it, every module id the bundler writes is one digit longer (DEVELOPMENT_LOG, m7).
- Dashboard and analytics: `server/admin/dashboard.test.ts` checks every figure against seeded rows; `server/analytics/analytics.test.ts` covers the fixed event list, consent, under 16, the switch, PostHog (mocked), Web Vitals and website views. 214 files and 4,153 tests on its branch.
- Launch check: Sentry and client-error tests, `lib/csp.test.ts`, the load test (60 guest farms at once for two rounds: 0 errors, p95 from 157 ms to open a farm to 4,750 ms for a year skip, heap level after the first round), the seven flows in `apps/web/server/e2e/`, the restore drill (67 tables and 192 rows the same both ways) and the farm export test. 228 files and 4,164 tests on its branch.
- The m7 join: see the final checks in `docs/DEVELOPMENT_LOG.md` ("m7 Final join"): the full suite, the speed test alone, the build, both bundle checks, Lighthouse on `/` (100 in all four, three runs) and `/play` (89 to 90 Performance, 100 in the rest), a browser walk of the production build with no policy violation, and an offline check in headless Chrome (the cached game page carries the policy whose nonce matches its scripts, and the farm opens offline).
- No screenshots were captured for this report. The ad screens, the video break and the purchase flow could not be looked at without keys. The browser walk on a phone in both orientations and themes was not done after the join.

### PRD section 21 defaults used

- Row 29 (purchases: A$30 and A$50 packs, A$20 upgrade, perks as in PRD 10.3) and row 30 (keep going: prices and rescue terms as in PRD 10.3, with the under-6-months price A$15 and the Open price left unset).
- PRD 10.1 (slot places and formats) and PRD 6.3 (page list and layout for the website), PRD 8.3 and 9.9 in the community rules, and PRD 14.10 targets (Lighthouse 100 on website pages).
- Builder's defaults where the PRD is silent: buying age 18, card only, refund and dispute handling, rescue cash and the keep-going tiers by days run.

### Not done

- Not checked in a browser with keys: the dashboard and its date form, signed-in community and admin pages under the policy, real Sentry and PostHog events (V13, V16). Lighthouse on CI (V14). The 8 unanswered year skips in the first load run (V15).
- Not wired: `profile_completed`, `pwa_installed`, `notification_opened`, and `farm_ended` for a Daily Farm that ends at the midnight run. Admin, community, billing and notify routes are not timed.
- AdSense and its admin fields, `landing_sponsors` on the home page, `pc_leaderboard_banner` and `video_between_days` (A23, Part B ads, and N8).
- A consent banner (consent is a box on the account page, B129), audience totals and ad rates on Advertise, and share images in the display font (N9).
- The real Stripe calls and the real event shapes are unproven (V5). The legal pages have no lawyer's review (A21 and V9).
- The `realism-guardian` check and a Lighthouse run on the final branch (V10 and V11).

### Questions for Claudia

- Purchases, refunds and the rescue: A19 and A20.
- Ads: A23, and Part B, ads.
- Website, privacy and legal: A21, and Part B, website.
- Speed targets: A25.
- Privacy: A17 (day cards follow the farm view) and A21 (website views counted without consent).
- Dashboard, analytics and the launch check: Part B, B122 to B136.
- Keys and settings for ads, purchases and the website: sections 6 and 7 of `docs/CALLS_FOR_CLAUDIA.md`.

## After the stages: m7.1 realism fixes

A fix pass after a read-only realism review of the final branch (engine 0.19.0, save format 14). Full detail in `docs/DEVELOPMENT_LOG.md` (m7.1).

- **Built:** Daily Farm nights with no hand keep plans live and count the night in the plan report (the engine's `plansByHand`); sheep plans are held and moved from the card; plans of several moves a day graze where the mob was moved; "grazed down to" plans wait a day and can end; waiting plans give the real reason; bad start dates are refused. The rescue values sheep as a sale pays and keeps its cash out of the year's profit, as a "Paid to keep going" line, with words by case. Day cards and Share my farm show the diary's day number; day cards carry job and farm facts and the rain only.
- **Tested:** a test for each fix; `pnpm test` 4,227 passed, 22 expected failures, 4 skipped; no benchmark moved; speed, build, browser bundle and page budgets pass with no limit raised.
- **Not done:** see the log entry (the supplement price read on a hand-moved several-moves-a-day plan; a browser check of the plan card).
- **Questions for Claudia:** B137 to B140, and A20 as updated.
