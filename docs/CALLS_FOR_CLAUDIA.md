# Calls for Claudia: everything decided for you during the build

This is the one list of every call made on your behalf, so you can rule on them in one sitting. It was written from `docs/DEVELOPMENT_LOG.md`, `docs/BUILD_PLAN.md`, `docs/PRD.md` section 21, `docs/GRASS_QUALITY_REVIEW.md`, `docs/SHEEP_BENCHMARKS.md`, `docs/CALIBRATION.md`, `docs/DATA.md`, `docs/LESSONS.md` and `.env.example`. Where the log and another document differ, the log entry is the later record and is the one used.

How to read it:

- Each item says what the call was, why it was made and what the other choice is, and where it is easy to change.
- "Recommended:" appears only where the builder gave a recommendation in the log. Where it is missing, the log recorded the default that was built and asked for your ruling, with no recommendation.
- Ids in square brackets trace an item back to the log. For example `[m2.3 call 18]` is call 18 in the "m2.3 Sheep model" entry, and `[C18]` is the sheep benchmark question number used in `docs/SHEEP_BENCHMARKS.md`.
- Nothing was stopped for a question. Every open question was built at the default in `docs/PRD.md` section 21, or at the builder's default where the PRD had none.

## Summary

### What is built

- The grass and cattle model, proven against the MVP for the same inputs, with every benchmark in `docs/CALIBRATION.md` as an automated test. Four districts: Central Queensland, Northern Tablelands, Central West NSW and Western Victoria.
- Real years (SILO weather and MLA prices from 1997) or random seasons. Sale days, the working day, grazing plans, farm hands and contractor fencing, crops, the market, scores and the diary.
- Sheep (Merino and crossbred) in the three southern districts, with a wool and sheep market, netting fence, shearing and crutching.
- The PixiJS map and all the play screens for phone upright, phone on its side and PC. Help, a guided first day, install to the home screen and offline viewing of the last farm.
- Accounts, sign-in, database saves, the admin area, Daily Farm, notifications, leaderboards, groups, challenges, profiles, posts, the ticker, farm viewing and moderation.
- Ad slots, house ads and sponsor reports. One-off purchases through Stripe Checkout and paying to keep going.
- The public website: home, pricing, advertise, about, privacy, terms, community rules.
- The admin dashboard with CSV export, game health, Web Vitals, and analytics with consent sent on to PostHog from the server only (milestone 5.3).
- The launch check (milestone 5.5): error reporting to Sentry from the server, a Content-Security-Policy on every page, a load test, end-to-end flow tests, a restore drill, farm export and the security review fixes.
- How to run the live site, every variable, backups and what to do when something breaks: `docs/RUNBOOK.md`. Every launch requirement with its proof or what is still needed: `docs/LAUNCH_CHECK.md`.

### What is switched off, and why

Every feature switch and its real default is in the table below. The defaults come from the shared switch list in `packages/shared/src/index.ts` and the seed migrations in `supabase/migrations` (the reference data, then the Daily Farm and sheep migrations). A test checks the two agree key for key. With no keys set, the game plays as a guest on farm files whatever the switches say.

Switched off: sheep, the whole community (posts, groups, ticker, farm viewing), every kind of ad and AdSense, purchases, and maintenance mode. Sheep are off until the open sheep gaps are ruled on. The rest are off as in the PRD, and each needs a key, an outside account or your ruling.

Switched on: sign-ups, Daily Farm, Fast Farm, leaderboards and push notifications. Daily Farm is on at your request of 15 November 2026 ("I want to be able to get on and try both rounds of gameplay"), as the PRD table says. Sign-ups, Daily Farm and leaderboards do nothing visible until the database keys exist: with no database, setup says Daily Farm needs the game database. Push sends nothing until the push keys and a schedule exist.

| Switch | Default | What it needs before it can go on |
| --- | --- | --- |
| `signups_open` | On | Supabase keys, or sign-in is not offered |
| `fast_farm` | On | Nothing |
| `daily_farm` | On (your request, 15 Nov 2026) | To run: database and account keys. For the nights to run on time: `CRON_SECRET` and a 15-minute schedule (without it each night runs when the farm is opened). For real data after 12 Nov 2026: `GG_DAILY_FEED=live` and `SILO_CONTACT_EMAIL` (without it, long-term average weather and last prices, said in the diary). `docs/RUNBOOK.md` section 5.1 |
| `community` | Off | Database keys, your rulings A22, A15 and A17, a lawyer's read of the community rules |
| `feed_posts` | Off | `community` on, and the photo approach in A22 |
| `groups` | Off | `community` on |
| `activity_ticker` | Off | `community` on. The landing page also needs `activity_ticker` in `SITE_SWITCHES_ON` at build |
| `farm_viewing` | Off | `community` on. It shows Daily Farms only, so it needs `daily_farm` on to show anyone |
| `leaderboards` | On | Database keys (rows are written by the server) and `NEXT_PUBLIC_SITE_URL` for the public page. Your ruling A10 for the score |
| `ads` | Off | Database keys, an admin, a slot switched on and a house campaign. Your ruling A23 |
| `video_ads` | Off | `ads` on, plus a slot that shows video |
| `banner_ads` | Off | `ads` on, plus a banner slot |
| `adsense` | Off | Nothing is wired. It needs your own AdSense account, a consent banner and new code |
| `purchases` | Off | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, accounts on, a product switched on, and your rulings A19 and A20 |
| `push_notifications` | On | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET` and a 5-minute schedule. Email also needs `RESEND_API_KEY`, `NOTIFY_FROM_ADDRESS` and `NOTIFY_TOKEN_SECRET`. Your ruling A24 |
| `sheep` | Off | Your rulings A4, A5 and A6 (and A1 for the Tablelands winter) |
| `maintenance_mode` | Off | Nothing. Turn it on from the admin switches screen |
| `analytics` | Off | Database keys. Your ruling A21 on consent. `POSTHOG_KEY` and `POSTHOG_HOST` only if events should leave our own database. The privacy page reads it at build, so also add `analytics` to `SITE_SWITCHES_ON` and redeploy |

Each ad slot also has its own switch on the Ads screen (all off). The public website reads its own list, `SITE_SWITCHES_ON`, when it is built. Every entry in it is off until you set it, except Daily Farm, which the site shows by default so the site and the game agree (`-daily_farm` takes it off).

### The rulings that matter most

1. **The grass, calves and cows (A1, A2).** These change how the game plays more than anything else: winter feed, steer gains, calf weights and cow condition.
2. **When a cow shows as in calf (A3).** 50 days against 42 changes sale values.
3. **Sheep (A4, A5, A6).** Needed before sheep can be switched on.
4. **Daily Farm data lag (A9).** Daily Farm is on at your request. Its game day runs 5 days behind the real date.
5. **Legal and privacy risk (A15, A16, A17, A21, A22, A23).** No lawyer has read the legal pages. The under-14 retry, the ban record that outlives a deleted account, retention and photo moderation all carry risk.
6. **Money (A19, A20).** Buying age, refunds and what the rescue pays.

## 1. Needs your ruling

### Part A: the calls that need you

These are the calls that change how the game plays in a way you would notice, that carry legal, privacy or money risk, or that must be settled before a switched-off feature can be turned on. Each one settles a group of related calls. The smaller calls inside each group are listed in Part B.

**A1. The grass, the steer bands and carrying capacity.** Built: the grass model as calibrated from the MVP. A review against published figures found the Tablelands winter feed very poor (35 to 55 kg DM/ha of green, a dry cow eating about 1.0 to 1.1% of live weight and well short of energy). Stock eat less of poor feed than measured cows (1.0 to 1.2% against 1.4 to 1.5%). Dead feed is 50% digestible against 47% in the grazing advice tool PROGRAZE. Carrying capacity is 3.5 DSE/ha on Tablelands native pasture against 5 published, and 5.5 to 7.7 on sown pasture against 12 to 23. None of the steer gain bands (Tablelands 90 to 105 kg, Central West 115 to 130 kg) has an outside source. Other choice: leave the grass as it is, or make only some of the changes. The review asks six things: keep or replace the steer bands; whether Tablelands native pasture means red grass with winter-active natives; whether to accept 1.4 to 1.5% intake on poor feed everywhere; whether to accept the published carrying capacities; whether Central West peak digestibility goes back toward 0.70; and whether to look at the milk rule next. What it changes: winter condition, steer gains and calf growth in every district, and whether sheep can run on native pasture. Recommended: three changes made one at a time with the benchmarks rerun after each (more intake on poor feed, dead feed at 47% with slower summer breakdown, and winter-active natives on the Tablelands), then carrying capacity as a separate decision. [grass review rulings 1 to 6; sheep C18; m1.3. Change: intake, dead feed and growth curves in `packages/engine/src/data` and the steer bands in `calibration/steers.test.ts`]

**A2. Calves, cows and calving time.** Built: calves weigh 142 to 163 kg at 200 days in the average year and gain 0.53 to 0.63 kg a day, under the published 0.7 to 1.1 (Central Queensland passes its band). Cows now keep milking on poor feed, lose condition, and fewer get back in calf (about 55 calves per 100 cows by year 3 in Central Queensland and on the Tablelands, against 72 to 77 weaned in northern breeder herds). Every herd calves from late November to March on a 1 September start. Other choice: change the milk rule, the calf cost of gain, or give each district its own calving window. What it changes: calf weights, cow condition, conception and what a new player sees on 1 September. A May start leaves 79 to 82% of Tablelands cows thin in spring. The milk and calf figures are stand-ins with no published source. [m2.5 calls 1 to 6; grass review ruling 6. Change: `MILK` and `YOUNG_GAIN_COST` in `packages/engine/src/data/cattle.ts`, and `startHerd`]

**A3. When a cow shows as in calf, and what the premium pays.** Built: a cow goes on the record as in calf by herself at 50 days, the day the sale price pays the in-calf premium. Cows more than 190 days in calf add 10% to feed need. A cow booked for sale who reaches 50 days by sale day is paid the premium. Other choice: use 42 days, from Agriculture Victoria's figure for reliable palpation. What it changes: sale values against the MVP and when the record shows pregnancy. Moving to 42 changes both. [m1.7f second pass Q1 and Q2; third pass coordinator call 3. Change: `PTIC_DAYS` and the premium's `fromDays`]

**A4. Sheep: the Tablelands winter, ewe deaths and carrying capacity.** Built: sheep, off by default. Unfed Tablelands ewes reach lambing at condition score 1.4 and 31.7% die, with 48.8% of lambs marked (Central West 71.1%). First-cross ewes die 4.95, 5.36 and 5.35% a year against 2 to 4%, and Merino ewe deaths run over in some blocks. Carrying capacity benchmarks are skipped. Other choice: change the grass winter (see A1), add a sheep supplement, or hold the benchmark on sown pasture. What it changes: whether a sheep farm can survive a Tablelands winter, and so whether sheep can be switched on. Recommended: the review's grass package lifts Tablelands ewes to condition score about 1.95 and cuts deaths from 15 to 18% to about 8%. [m2.3 calls 1, 2, 14, 18, 28 to 30, 33; m2.7 review calls 2 and 5. Change: the grass model, `data/sheep.ts` and the sheep switch]

**A5. Sheep money: wool price, margins and the ewe count.** Built: wool sells at a dated September 2026 stand-in price on every farm (no AWEX series). A managed flock's margin matches DPIRD's $50.46 a DSE in the Central West ($38.69) and is over the band in the Tablelands ($71.88) and Western Victoria ($90.33). The unmanaged start flock earns $5.37 (Tablelands) and $135.74 (Western Victoria) a DSE. The model counts 1.6 to 2.0 DSE a ewe against the budget's 2.32. Ewe wool is 17.8 micron (the coarsest that keeps two benchmarks true). Wool selling costs are stand-ins. Other choice: set a wool price series, move a micron benchmark, or widen the plus or minus 25% margin band. What it changes: how profitable sheep look and what "per DSE" screens say. [m2.3 calls 24, 35, 40, 43; m2.7 review calls 4 to 6, 9, 10; PRD 21 row 27. Change: `data/sheepMarket.ts`, `data/sheep.ts`]

**A6. Sheep figures to confirm before sheep go on.** Built: Merinos are unmulesed (17% of ewes struck a year, same fly season everywhere). Netting fence is $10 a metre (permanent is $7). Joining is 5 January (Central West), 7 April (Tablelands) and 1 April (Western Victoria). No-water death stays at day 4 as for cattle. Sheep count 8.4 DSE per AE, which moves the cattle DSE figures on screen by 5%. Two lamb survival tables in the source disagree and need a check against the printed page. Other choice: a different fly rate, fence price, joining dates, or DSE of 8. What it changes: sheep deaths, fencing cost, lambing times and every DSE shown. [m2.3 calls 3 to 7, 10, 19, 22 (C3, C21, C26, C27, C30, C32). Change: `FLYSTRIKE`, `JOIN_START`, `SURVIVAL_PER_CS`, `DSE_PER_AE`]

**A7. A hand's share of fencing.** Built: with a hand on, a day of permanent fence is 800 m (the hand's share is about 300 m). Other choice: the hand's share is 500 m and the two of you build 1,000 m. What it changes: how much fence a farm with a hand builds in a day. You said both things on 13 November, so the record conflicts. [m2.1 call 1. Change: `handDayShare` in `packages/engine/src/data/labour.ts`]

**A8. Contractor price and wages.** Built: a contractor charges materials plus $5 a metre labour, the same for either team. Wages use 2026 Pastoral Award rates (paid every 14 days) on every farm, whichever year is played. Other choice: a contractor's real quote, weekly pay, and wages of the year played. What it changes: the cost of fencing and a farm's running costs. The $5 is a stand-in because no labour-only rate was found. [m2.1 calls 4, 8, 9, 18. Change: `labourPerMetre`, `payCycleDays`]

**A9. Daily Farm: data 5 days behind.** On or off is settled: you asked on 15 November 2026 for Daily Farm to be turned on, so it is on by default (the switch, migration `20261120000100_daily_farm_on` and the public pages). Still built for your ruling: its game day runs on the real weather and prices of 5 days earlier, so the midnight run never waits for late data. A new farm starts on today's date as Day 1. The live data feed has never been run. Other choice: use a different lag, or run each day on the day's own data and correct later. What it changes: how far behind the real season the farm's weather runs. [m3.3 call 1, second pass calls 3 and 6, call 14; m8. Change: `DAILY_DATA_LAG_DAYS`]

**A10. The score and the leaderboards.** Built: the score shown is the game's own year score from five parts (profit, weight gain, pasture use, ground cover, deaths), with each part's points shown. The Grazier Score has no agreed weights. The headline board averages the year score over finished years. The real-year board ranks on the change in net worth per hectare over that year. Other choice: set the Grazier Score weights, show fewer points, or rank on something else. What it changes: what players chase, and a player could work the weights back from the points shown. Weights are to be set once calibration farms are run. [m1.7g calls 1, 11, 14; m4 calls 1 to 4. Change: `headline` in `server/boards/score.ts` and `YearBlocks.tsx`]

**A11. Real years: prices and dollars.** Built: real MLA prices from 1997, lifted to today's dollars by the CPI (September quarter 2026). Each class sits on an MLA indicator (weaners 1.08 times the restocker yearling figure, bulls 0.906 of cows). Where a yard's own figure is thin the national figure times the yard's usual premium is used. Sale days with no records are Mondays at two yards. Other choice: prices of the day, different class mappings, extra fill-in yards (Emerald, Inverell, Ballarat), real sale days. What it changes: what stock sell for in each real year and whether a 1997 start can pay its way. [m1.4 Q1 to Q6, realism check CHECK 8 to 10; m1.4a Q1. Change: `REAL_PRICE_DOLLARS` and `market/realPrices.ts`]

**A12. Real years: weather and seasons.** Built: one 100 mm soil for every district. Out-of-season rain lifts growth to at most 1.9 times the curve. A farm that starts after a dry time starts on pasture lifted to at least 85% of average. The season label (six words from the MVP, "Drought" under 60% of average) reads the last 12 months. Years change on the farm's anniversary and, after the newest, go back to 1997. Other choice: a soil for each district, a higher ceiling for native pasture, the real pasture left by the year before, labels that lean on recent months. What it changes: how dry and wet years play out, which you should check against the years you remember. [m1.4b Q1 to Q7; m1.4 Q7 to Q10. Change: the growth factor in `season/weatherGrowth.ts`]

**A13. Buying and selling on sale days.** Built: buying only on a sale day (next one named), with stock arriving in the yards next morning. On a day with no sale, stock is booked onto the next one and sold that day at that day's price, and can be cancelled. Stock in the yards has water and grazing but no hay. Other choice: buy any day, sell only on the sale day, or hay after one day. What it changes: how often a player can trade, and how cattle left in the yards fare. [m1.5b Q1 to Q4. Change: the sale rules in `day/` and `market/saleCalendar.ts`]

**A14. Grazing plans.** Built: a plan that reaches a paddock holding another mob joins the two. Plan moves take none of the day's light. Setting a plan costs the ordinary move time if the mob has to move. A move by hand pauses the plan. Other choice: keep mobs apart so a plan waits, make plan moves use daylight (the PRD proposed this), or end a plan on any hand move. What it changes: whether rotations work with few paddocks, and how much a plan costs the player's day. [m1.5c Q1 to Q6. Change: `sim/plans.ts`]

**A15. Age checks and the under-14 refusal.** Built: accounts need 14 or over, worked out from the date of birth on the Sydney date. A refused under-14 can still play as a guest. The refusal holds for that sign-in only, so a different email gets a fresh try and the database cannot tell it is the same person. Under 16 means no community. Other choice: stronger checks than a date of birth. What it changes: the legal risk. Date of birth alone may not count as "reasonable steps" under the PRD's legal note, so it is a question for your lawyer. [m3.1 calls 5, 27, 31; m3.2 calls 7, 18. Change: `complete_sign_up` and `app.today_sydney`]

**A16. Bans that outlive a deleted account.** Built: a banned or suspended player who deletes their account leaves only a one-way hash of their sign-in email and the ban's end date, used to refuse a new sign-up with that email. Moderation history is deleted. A different email gets past it. Only Gmail dots and Fastmail tags are cleaned up, because no provider page was found for other aliases. Other choice: keep nothing, or keep more. What it changes: privacy risk and whether bans hold. A privacy call for you and your lawyer. [m3.1 calls 28, 33; m3.5 call 5. Change: `BAN_HASH_PEPPER` and `server/auth/email.ts`]

**A17. Data download, deletion and how long data is kept.** Built: guests are removed after 30 days (database) or 90 days (files). The download leaves out the engine save and action log because they hold the hidden rules. Deleting an account hands each owned group on or leaves it ownerless. Reports others wrote about a deleted player stay. Account data retention is not decided. Profiles are Public and farm view Followers only by default. Day cards now follow the farm view setting as well as the profile: none while the farm view is off, and public only when the profile and the farm view are both public, so a public profile on default settings posts its day cards to followers only. Other choice: different periods or defaults, or day cards that follow the profile alone. What it changes: privacy duties under the Privacy Act. Worth a word with your lawyer. [m3.1 calls 4, 9, 15, 16, 32, 35; m3.2 call 2; m5.4 call 6; m5.5 call 1. Change: `prune_housekeeping`, `profiles` column defaults and `makeDayCard` in `server/community/share.ts`]

**A18. Banned and suspended accounts can still play their own farm.** Built: a ban or suspension ends sessions and blocks the community, sign-up with the hash, and admin. The game routes do not check status, so the player can sign in again and play. Other choice: refuse play to banned accounts. What it changes: what a ban does. [m3.5 call 3. Change: one check in `route()` in `server/game/http.ts`]

**A19. Buying age, card payments and refunds.** Built: buying needs 18 or over (the PRD only says to check under 18s with a lawyer). Checkout takes cards only. A full refund removes what was bought. A dispute removes it until won. A part refund changes nothing. Packs are one each, with the upgrade for the second. Other choice: a lower age with parental consent, other payment types, different refund rules. What it changes: money and legal risk. Recommended: 18 until a lawyer advises. [m5.2 calls 1, 3, 4, 7, 8; m3.1 call 18. Change: `MIN_PURCHASE_AGE` in `products.ts`]

**A20. Paying to keep going (the rescue).** Built: a rescue sells all stock at what a normal sale would pay that day (sheep with nothing for the wool on their backs, B137), on any day, to clear the debt, and sets cash to the hard-difficulty starting cash, or what the sale leaves if more. Stock on the way is not sold or counted: it still arrives. The cash added on top of the sale is the year's "Paid to keep going" line and is not in the year's profit or score (B138). The diary line and the offer card say what the stock fetched, with "to pay the debt" only when there was a debt. A refund after a rescue does not undo it. The offer needs a free farm slot. Tiers are by days run: under 183 days (price open, cannot be switched on), 183 to 364, 365 to 729, 730 and over. The price under 6 months is A$15 until set. Other choice: different terms, tiers or prices. What it changes: money, and what a player gets when a farm fails. The PRD is silent on the cash. [m6 For Claudia; m5.2 calls 5, 6; PRD 21 row 30. Change: `rescueFarm` in the engine and `products.ts`]

**A21. The legal pages and who is behind the game.** Built: privacy, terms and community rules are plain-English drafts with no lawyer's review, marked "Draft. Not yet reviewed." The owner name, ABN, contact address and domain are not set. The privacy page names no providers and says data may be kept outside Australia. Analytics run only with consent, which is stricter than the PRD, with one exception: public website page views are counted without consent, by page and day only, with no cookie and no id, so nothing about a person is stored. The privacy page says so. A few lines are worded for you to check (the SILO credit, guest farm removal). Other choice: name the providers once accounts exist, relax the consent rule, or ask consent for website views too (the public pages send no script, so that would need one). What it changes: legal exposure, and the pages stay in draft until done. [m5.4 calls 1 to 6, 10, 11; m5.3 call 5. Change: `SITE_OWNER_NAME`, `SITE_CONTACT_EMAIL`, `NEXT_PUBLIC_SITE_URL`, `countWebsiteView` in `server/analytics/collect.ts`]

**A22. Photos, the word list and moderation before the community goes on.** Built: the community is off. Photos are stripped of metadata, wait for manual approval (no image-check service is wired), and are never shown before checking. The word filter has two placeholder words. Staff see the community like any member. Other choice: choose an image-check service, add real words, let admins in while the switch is off. What it changes: moderation workload and harm risk. These must be settled before the community can be switched on. [m4.2 calls 1 to 4; m3.1 call 14; m4.2 review fix 1. Change: `IMAGE_CHECK_API_KEY`, `/admin/words`]

**A23. Ads: no-ads owners, under-16s and AdSense.** Built: all ads are off. Someone who owns no-ads sees no sponsor cards either. Under-16s and guests see only campaigns for everyone, never aimed. AdSense has no code, no account and no consent banner behind it. Other choice: let no-ads owners see sponsor cards (the PRD proposed this), ban ads for under-16s, wire AdSense. What it changes: money and the legal handling of children's data. Needed before ads can go on. [m5.1 calls 1, 2, 15. Change: `adSlotsFor` and `viewerFor` in `server/ads/serve.ts`, `adsense.ts`]

**A24. Notifications: defaults, quiet hours and under-16s.** Built: nothing is sent until a device is added. The morning reminder is off until turned on, email is off for every type, and email is only a fallback. Quiet hours drop reminders and hold other notices for up to 12 hours. Under-16s get no community notifications but still get challenge notices. At most 6 a day. Chrome and Edge push hosts are allowed from their own documents but have never been tested. Other choice: reminders on by default, held reminders, challenges hidden for under-16s. What it changes: how often players are contacted. Push needs one real-device test per browser. [m3.4 calls 1, 2, 5, 6, 9; m3.1 call 29. Change: `lib/notify/kinds.ts`, `DAILY_CAP`]

**A25. Speed targets that are missed.** Built: since m8, `/play` draws the setup screen in the server's HTML for a visitor with no cookies, so its largest paint no longer waits for the scripts and two requests. Five mobile runs back to back on this PC (busy with other work), the repo settings: before 0.82 to 0.86 (median 0.86, largest paint 3.49 s); after 0.87 to 0.98 (median 0.95, largest paint 0.92 s, the same as the first paint). What is left is total blocking time (median about 250 ms here), mostly React's own first hydration task, so a busy machine can still read under 0.95. Not yet run on CI. (On the final branch three runs had read 0.89 to 0.90.) App pages carry about 140 KB of framework script against the PRD's 100 KB for website pages (public pages send none). Several pages sit within 1 KB of their limit. Other choice: lighten the play page, or move the targets. What it changes: first load speed on a phone. [m1.8 calls; m3.2; m6; m5.5 call 3. Change: `PlayApp` and `SetupFlow`, `lighthouserc.json`]

### Part B: decided, no action needed unless you disagree

Each line says what was built. The bracket gives the log reference and where to change it. Items that are part of a Part A group are not repeated here.

#### Cattle and grass

**B1.** Herd figures moved with the calf fix: gain a head up 5 to 15 kg, Central West worst herd lost 3.85%, Tablelands preg tests 7.17 points over expected (band up to 9). [m2.5 call 6]

**B2.** Benchmarks are judged on the average of twelve blocks, with Central Queensland lick up to 2 kg over, oats held to a fortnight and deaths counted over all herds. Marked proposed. [m1.3. Change: judging rule in `docs/CALIBRATION.md` and tests]

**B3.** Ten more calibration questions and real-year CHECK items sit in `docs/CALIBRATION.md`. [m1.3, m1.4]

**B4.** Real data: the four SILO grid points were not checked on a map, and the rest of the MLA pull (6 to 9 hours) has not run. [m1.4a Q2, Q3]

**B5.** A 366-day real year costs one more day of overheads. [m1.4 Q11]

**B6.** A new data pull stops every running real-year farm, and the 1 July "new season" message on a real-year farm is not settled. [m1.4 realism check]

**B7.** "500 m a working day" means that day's light, so a full day on fence is 500 m in June and December. [m1.5a Q1. Change: `data/jobTimes.ts`]

**B8.** Fence lines are built one square side at a time, a job longer than the light is done at first light and takes the whole day, the bank must cover the whole line, electric fence is 1 km an hour (the mockup shows 150 m an hour), and fence does not scale with farm size. [m1.5a Q2 to Q5]

**B9.** Taking things out takes as long as putting in. Gates and buying take none of the day. [m1.5a Q6, Q7, Q11]

**B10.** Marking 2 min a calf, weaning 30 min plus 0.5 min a head, selling 60 min plus 1 min per 10 head, no mustering time, a supplement switch takes none of the day. [m1.5a Q8 to Q10]

**B11.** A skip stops at the year's end, a month is 30 days, and the farm goes dark when under 15 minutes of light remain. [m1.5a Q12 to Q14]

**B12.** Things to do lists five kinds of fact only. Crop lock-up, grain shedding, no bull and low condition were left off. [m1.5a Q15]

**B13.** Plans are limited to 8 legs, 30 stops, 20 plans, 0.25 to 60 days and 300 to 5,000 kg DM/ha. A low figure is refused, not clamped. [m1.5c Q7. Change: `DATA.md` limits]

**B14.** The map draws a big mob as a sample, a mob stands round the square it was put on, grass is drawn about twice a cow's height, cattle colours are set by district, a pale rim keeps cattle readable, and no trees are drawn. [m1.6a Q1 to Q7]

**B15.** Red on the map picture means only "does not fit today". A knocked-down fence is amber, no water purple, a team fence hot pink. The site's panels keep red. The profit marker must not be red when built. [m1.7f call 6 and second pass Q4, Q5]

**B16.** Every farm starts on 1 September. The player cannot pick a start month. [m1.7a Q1]

**B17.** The Mark calves job marks every bull calf and young bull, though the banner counts those 60 days or older. [m1.7a Q2]

**B18.** The phone paddock sheet covers 58% of the map. [m1.7a Q4]

**B19.** The mob card "why" note shows for any mob gaining under 0.05 kg a day. The sell picker offers Steers, Heifers and Cows. Exact figures are shown (no water kills on day 4). [m1.7b Q1 to Q3]

**B20.** The fence tool starts on permanent. No tool zooms by itself. Removing a fence gives nothing back. The gate sentence says mobs will join. [m1.7c Q1 to Q4]

**B21.** $ a head uses the middle of each class's weight range. Births fill the inbox in calving season. The sow card does not mark squares that cannot take a crop. [m1.7d Q1 to Q4]

**B22.** Taken-down fence is kept as materials and reused at half price (your ruling). Materials count nothing in net worth. Fence built over by another kind is lost. Taking out a square hub leaves its gates. Moving a hub costs $300. [m1.7x Q1 to Q4]

**B23.** A farm file not used for 90 days is removed. [m1.7f Q4. Change: `FARM_STALE_DAYS`]

**B24.** The guided first day strip sits above the map. A step done early counts. Help opens in the bottom sheet on a phone. An existing farm a day old gets no tour until replayed. [m1.7e calls; m1.8 calls]

**B25.** The service worker starts 8 seconds after `/play` loads and keeps only `/` and `/play`. The offline last-farm copy is per player once accounts are on. [m1.8 calls; m3.2 item 7]

**B26.** The stored farm is 191 KB at the start and 339 KB after 1.5 years against "a few tens of KB" in the plan. [m1.8 calls]

#### Sheep

**B27.** Dressing percentage is sourced (lambs 45 to 50%, mutton table dated 2001). Fat score is condition score rounded (stand-in). [m2.3 call 8 (C31)]

**B28.** Worms are left out, so Western Victoria weaners lose 1.65% against 2 to 6%. [m2.3 call 9 (C22)]

**B29.** Dead feed in a sheep's reach counts in full, as for cattle. [m2.3 call 11]

**B30.** The life cycle runs by itself: rams work 5 weeks, scanning on day 80, ram lambs become wethers at marking, lambs wean at 14 weeks. [m2.3 call 12]

**B31.** Cattle and sheep never break into each other's paddocks. Sheep get through permanent, electric and tape fences, and only netting, gates and the boundary hold them. [m2.3 calls 15, 20, 21]

**B32.** Sheep deaths score by size (a lamb about 0.03 of a beast, a ewe 0.2). Cattle count one each. A dead newborn calf costs 60 points, a ewe about 11.6, a lamb 1.9. [m2.3 calls 13, 25, 32; m2.7 review call 1]

**B33.** Shearing is 80 days after lambing and crutching 60 days before. Shearing is $9.81 a head all in and crutching $1.92. [m2.3 call 23; review items 13, 14]

**B34.** Wool sells by itself at shearing and has its own money line. [m2.3 call 24]

**B35.** Sheep feeding fills the energy gap. Grain is charged at the pellet price and hay at the hay price. Tablelands winter feeding costs about $19.76 a ewe. [m2.3 calls 26, 34]

**B36.** Wool on backs counts in net worth net of levy and shearing cost. Lambs at foot are priced on their own. Sheep on their way count at what was paid. [m2.3 calls 36, 37]

**B37.** Past the overdraft a day's sheep costs come off cash, the bank limit ends the game, and buying sheep is refused. [m2.3 call 38]

**B38.** Several plan moves a day move sheep once a day. [m2.3 call 41]

**B39.** Thirsty sheep get out by the cattle rule. [m2.7 review call 8]

**B40.** The calf fix does not apply to lambs. Sheep keep their own cost of gain and milk. [m2.7 call 1]

**B41.** Weaners on a mixed farm go where the other species is not. [m2.7 call 4]

**B42.** A mixed Western Victoria farm left alone lost 579 sheep in two years. Not a benchmark. [m2.7 call 3]

**B43.** Sheep screens: a farm that has sheep keeps showing them if the switch goes off, part moves are one class at a time, sheep sell on sale days only, only the shearing day can be moved on screen, summary head rows stay cattle, paddock days of feed counts cattle only, gain shows in grams. [m2.8 calls 1 to 9]

**B44.** No overhead costs a year, marking cost, freight beyond $3 a head, or pasture cost for sheep. Animal health is $3.57 a head. [m2.3 call 17; review call 7]

#### Farm hands and contractors

**B45.** Hands help on every kind of job by skill. A hand helps a team whenever the farm has one, with no switch. [m2.1 call 2; m2.2 call 2. Change: `skillFor` in `labour/help.ts`]

**B46.** There is no overwork limit. Hands leave only when let go, when a contract ends or when unpaid. [m2.1 call 3]

**B47.** Contractors start the next working day and work Monday to Friday. The bank must cover the whole run when ordered. "Done on" is at the team's pace. [m2.1 calls 5 to 7. Change: `contractorDays`]

**B48.** Wages owed are kept and never forgiven, and are paid in full once the bank covers them. [m2.1 call 15]

**B49.** Injury is 1.5 times likelier on a fencing day and the farm pays one week of wages as its share. [m2.1 call 11]

**B50.** Standing starts at 80, loses 20 per missed wage and gains 5 per full pay day. The pool adds 1 to 3 people a week and offers at most 6 hands. The PRD says no limit on hands. Standing shows as a level. [m2.1 call 12; m2.2 call 4; PRD 21 row 23]

**B51.** A skip does not stop for workforce events. A hand hired today starts tomorrow. [m2.1 calls 13, 14; m2.2 call 9. Change: `stopsIn` in `day/days.ts`]

**B52.** Dogs only enlarge a hand's share of stock jobs. [m2.1 call 16]

**B53.** The lick-run duty and the "feeding and machinery" skill are not built. [m2.1 call 17]

**B54.** Plan moves are credited to the hand who worked that day. [m2.1 call 19]

**B55.** The workforce screens are built in the existing style. The worker report is a modal capped at 24 bubbles. There is no "started" message. [m2.2 calls 1, 5 to 8]

**B56.** A team is offered on permanent fence only, in hot pink with cross ticks. The contract's spend shows in the cash change only. [m2.2 calls 10 to 12]

#### Scores and leaderboards

**B57.** The game over card counts the year under way as a last year. [m1.7g calls 10, 13]

**B58.** The diary keeps 400 days, counts from Day 1, titles real-year years "Year 3 · 1997", and leaves births and deaths to the inbox. [m1.7g calls 4, 6 to 9, 12. Change: `DIARY_DAYS`]

**B59.** Period boards list farms that closed a year in the period, by Sydney time. [m4 call 4]

**B60.** The action log check is: at least one server-run day or skip, no step after the farm's day, no gap in numbering. [m4 call 5]

**B61.** Private and under-16 rows show username and district only, banned or deleted accounts show as "Former player", blocks hide both ways, and group and friends boards leave private rows out. [m4 call 6; m3.1 calls 11, 12]

**B62.** Leaderboards are not in the header or sitemap, and the boards page cannot carry a banner ad. [m4 call 15; m6]

#### Daily Farm

**B63.** With no hand working, a plan is held for the night and the plan card offers the move. "Yes" takes the ordinary move time. Since m7.1 the plan stays live on that night (not paused), its report counts the night, and sheep plans follow the same rule (B140). [m3.3 call 5; second pass item 2; m7.1]

**B64.** A missed day is a night after a date the player never opened the farm on. [m3.3 call 6]

**B65.** "Done for today" is only a fact. [m3.3 call 7]

**B66.** Sale days past the baked tables follow real yard rows, then the usual weekly sale. SILO's provisional days are used as served. [m3.3 calls 8, 9]

**B67.** The time zone comes from the device once and is locked. Eight zones are supported and no screen changes it. [m3.3 call 10; m3.1 call 20. Change: `SUPPORTED_ZONES`]

**B68.** 2 Daily Farms per account, counted apart from 2 Fast Farms. The plan setup screen does not yet warn that you have no staff. The data version is `daily-lag5`. [m3.3 calls 11, 13, 15]

**B69.** The evening warning has words and a queue rule but no job sends it. [m6; m3.4 call 8]

#### Accounts and privacy

**B70.** Guests are server sessions, not anonymous sign-ins. A guest whose account has no room is refused. [m3.1 calls 2, 3]

**B71.** Admins see "under 16" as Yes or No and cannot read a date of birth. [m3.1 call 7]

**B72.** Admins can use the community in the database with switches off, but not on the site. [m3.1 call 6; m4.2 call 1]

**B73.** Moderators read reports, history and all posts in the database and cannot open `/admin`. [m3.1 call 8; m4 call 7]

**B74.** Rate limits per account are stand-ins: posts 20 an hour, comments 60, likes 300, follows 100 a day, reports 20 a day, groups 5 a day, jobs 1,200 an hour. [m3.1 call 13. Change: `rate_limit_rules` rows]

**B75.** The audit log takes ids and action names only. Tables not made from PRD 15: `farm_jobs`, `farm_messages`, `subscriptions`, `plan_features`. Avatars are in private buckets and show initials until checked. [m3.1 calls 17, 22, 23, 30]

**B76.** Sign-up checks its switch, the username check says only free or not available, sign-in lands only on a short list of pages, sign-in links are limited per server instance, and an unfinished sign-up plays as a guest. [m3.1 call 24; m3.2 calls 6, 8 to 10]

**B77.** Saves use a pooled database connection. Past days keep every day for 14 days then weekly to 182 days. A refused job keeps its version. [m3.2 calls 1, 3 to 5, 16. Change: `PAST_DAILY_DAYS`, `PAST_MAX_DAYS`]

**B78.** `GG_SITE_URL` and `GG_TRUSTED_IP_HEADER` are required for accounts in production. [m3.2 calls 12, 17]

**B79.** Apple sign-in is not built. [m3.2 call 15]

**B80.** Game routes accept a token until it expires after "sign out everywhere". Set the Supabase token lifetime to 900 seconds. [m3.2 second pass call 19]

**B81.** Three views run with their owner's rights (the Supabase linter flags this). [m3.1 call 25]

#### Community and moderation

**B82.** A post needs words. Everyone is newest first and popular is not built. Search is by username start. [m4.2 calls 5, 6, 11]

**B83.** A private profile's posts are its author's alone. Share my farm from a private profile is refused. [m4.2 call 8; review fix 2]

**B84.** Share my farm shows farm, district, date, season, head, pasture, ground cover and net worth. Day cards are made at the rollover. [m4.2 calls 7, 9; m6]

**B85.** The Community link is in the More tab. [m4.2 call 13]

**B86.** Hidden characters are removed and tag-character emoji flags show as a black flag. [m4.2 review fix 6]

**B87.** A like count counts every like, including from a blocked player. [m4.2; m4 call 8]

**B88.** Photo and ticker limits: photos 24 an hour and 80 a day, ticker 30 calls a minute, group routes 30 and 6 a minute. Stand-ins. [m4.2 review fix 4; m4 call 12]

**B89.** Ownerless groups can read and post until an admin assigns an owner. Challenges start when set. Daily leagues cannot be entered until Daily Farms exist. A group cannot be removed by moderation. [m3.1 call 32; m4 calls 9, 13, 16]

**B90.** The ticker shows on website pages only, never the farm screen, and visitors see it on the landing page. Lines have no farm names and are limited to 6 an hour. [m4 calls 10, 11]

**B91.** Farm viewing is Daily Farm only, shown as a list of paddocks. Fast Farms viewable too is one migration. [m4 call 14; m6. Change: `app.can_view_farm_for`]

**B92.** Moderation remove on a profile clears its bio and display name. [m4 call 16]

#### Purchases

**B93.** No Stripe library is used. The server calls Stripe with `fetch` and checks signatures by hand. [m5.2 call 2]

**B94.** Products are seeded inactive at PRD 10.3 prices with the perks as proposed. [m3.1 call 18]

**B95.** Checkout makes a Stripe customer and only its id is kept. No price ids or publishable key are needed. [m5.2 call 9]

#### Ads

**B96.** The phone banner is upright only, 30 to 60 seconds, 300-second gap. The PC banner appears and goes, so the map height shifts. The rail shows from 1280 px wide. [m5.1 calls 6 to 8]

**B97.** Videos are MP4 only, up to 3 MB and 30 seconds. Pictures up to 1 MB. [m5.1 call 9]

**B98.** The video break starts muted, skips after 5 seconds, holds "Start year" for at most 40 seconds. [m5.1 call 12]

**B99.** A view counts after 1 second with half on screen. Dates are Sydney days. Sponsor reports show counts only. View and click limits are database rows. [m5.1 calls 10, 11, 13, 16]

**B100.** `landing_sponsors`, `pc_leaderboard_banner` and `video_between_days` are not placed. "Spots left" is a setting (20) and is not counted. Ads need accounts on. [m5.1 calls 3 to 5, 14, 17; m6]

#### Notifications

**B101.** Email goes only when there is no working device or push failed for good. One-click unsubscribe is on every email. [m3.4 calls 3, 10]

**B102.** The later reminder is 6 hours after the morning time within a 3-hour window, never after 5 pm. [m3.4 calls 4, 7]

**B103.** The daily cap is 6 a day. [m3.4 call 6. Change: `DAILY_CAP`]

**B104.** A device is per browser, up to 10 per account. One sender route runs every 5 minutes. No `web-push` package. [m3.4 calls 11 to 14]

**B105.** The account inbox is separate from the farm's game inbox, and there is no bell in the top bar. [m3.4]

#### Website

**B106.** `SITE_SWITCHES_ON` is empty, so the pages mention only what is live. The Daily Farm price under 6 months reads "To be set". Advertise has no audience totals or rates. [m5.4 calls 7 to 9]

**B107.** The privacy page links to the OAIC's complaints page (looked up 14 Nov 2026). [m5.4 call 12]

**B108.** Public pages are static with no script. Share images use the default font. [m5.4]

#### Admin

**B109.** Switch defaults are in the table in the summary. The seed matches the shared list key for key. [m3.1 call 1; m6]

**B110.** Switches are cached 30 seconds on each server. The website's static pages read them at build time. [m3.5 item 4]

**B111.** Maintenance mode is read only and uses one of three fixed wordings. [m3.5 calls 1, 2. Change: `MAINTENANCE_WORDINGS`]

**B112.** The first admin is made by a SQL statement you run (section 7). [m3.5 call 4]

**B113.** Sign out everywhere for another user deletes their auth sessions through a function. Whether Supabase allows it is to be confirmed. [m3.5 call 6]

**B114.** An admin page never refreshes the sign-in, so a stale admin opens `/play` first. [m3.5 call 7]

**B115.** A suspended admin counts as no admin. The last admin cannot lose the role. Ad slot switches are on the Ads screen, not the switch list. [m3.5 calls 8, 9]

**B116.** Site settings are saved and audited but nothing reads them yet. [m3.5 call 10]

**B117.** Dashboard counts: "saves failing" is saves kept aside, "farms played" is farms with a save today and in 7 days. Suspensions are 1, 3, 7, 14 or 30 days. [m3.5 calls 11, 12, 14]

**B118.** The `/admin` script line is held at its 150 KB limit. [m3.5 call 13; m6]

#### Speed targets

**B119.** Public pages: `/pricing` has a median of 99, not 100. CI asks for 1.0. [m5.4 call 13]

**B120.** The cattle speed test reads 3.4 to 4.5 ms alone and up to 15 ms under load. CI allows 15 ms. [m1.8; m2.7 checks]

**B121.** Map frame rate was not measured on a phone. [m1.6a]

#### Dashboard and analytics (5.3)

**B122.** Players active today, in 7 and in 30 days come from each farm's last opened time, so they are "as of now", not a history. Minutes a day, return rates and streaks are not kept. [m5.3 call 1]

**B123.** Income counts paid purchases by the day they were paid. A refunded purchase is left out of income and counted under refunds. [m5.3 call 2]

**B124.** The advertiser snapshot shows shares only and leaves out groups under 5 players and "Not said". Enterprise is left out (free text). [m5.3 call 3]

**B125.** Game health is always on: it holds no person's data. The `analytics` switch covers events, Web Vitals and website views. [m5.3 call 4]

**B126.** The id sent to PostHog is the account id hashed with `BAN_HASH_PEPPER` under its own label. Changing the pepper starts new ids. [m5.3 call 6]

**B127.** Health timings are written every 30 seconds per server, so a server that stops loses up to that much. [m5.3 call 7]

**B128.** INP is the longest interaction, so it reads a little high on long sessions. The p75 shown is the top of its bucket. [m5.3 call 8. Change: `components/analytics/Vitals.tsx`]

**B129.** The consent control is on the account page only, for guests too. The game page has no control of its own, to keep its script small. [m5.3 call 9]

**B130.** A new account's `signup` event follows the choice the player made as a guest (the consent cookie), and is counted in our own tables only, never sent to PostHog. `farm_ended` is counted for Fast Farms when Next day or a skip ends the game; its days go to PostHog only. A Daily Farm that ends at the midnight run is not counted yet. [m7 join. Change: `app/api/auth/finish/route.ts`, `endedDays` in `server/analytics/collect.ts`]

#### Launch check (5.5)

**B131.** No Sentry package anywhere. The server sends errors itself, with the route, a reason code, the error's class, the release and a trimmed stack only. Browser errors come through the site's own `/api/client-error`. [m5.5 call 2. Change: `server/errors/sentry.ts`]

**B132.** The Content-Security-Policy allows inline styles (React writes `style` attributes), never inline or eval scripts. [m5.5 call 4. Change: `lib/csp.ts`]

**B133.** The map uses PixiJS's no-eval build, which is a little slower. The 60 fps phone check is still owed (V1). [m5.5 call 5. Change: `packages/render/src/map.ts`]

**B134.** The load test keeps to the server's cap of 30 new farms a minute rather than lifting it. [m5.5 call 6. Change: `scripts/load-test.mjs`]

**B135.** The restore drill is proven on PGlite. The real drill on Supabase is a written procedure for you to run once (`docs/RUNBOOK.md`, section 3). [m5.5 call 7]

**B136.** Offline, the game page is the copy the service worker kept at install, with the policy and nonce it was served with, so the nonce of that one cached copy repeats until the next install. Checked: header and page agree, and the farm opens offline with no policy error. [m7 join]

#### Realism fixes after the final review (m7.1)

**B137.** In a rescue, sheep are valued exactly as a normal sale that day would pay: the sale action's own figure, with nothing for the wool on their backs. Cattle were already valued that way. Other choice: count the wool on the back, as net worth does. [m7.1. Change: `flockSaleValue` in `sheep/market.ts`, used by `money/rescue.ts`]

**B138.** The cash a rescue adds on top of its stock sale is its own line in the year's money, "Paid to keep going", and the year's profit and score leave it out. The stock sale goes in the year's sales. Other choice: count the rescue as profit, as before. [m7.1. Change: `YearTotals.keepGoing`, `scoreYear`]

**B139.** A day card carries short job and farm facts only (PRD 9.3): moves, sales and purchases, births, deaths, weaning, marking, fencing and water work, and the day's rain. It leaves out the day's cash and running cost lines, wages and super, data notes and the "paid to keep going" line. The lines are picked by kind when the day is filed, not by their words. [m7.1. Change: `cardEvent` in `server/game/diary.ts`, and `farm_days.card_lines`]

**B140.** On a Daily Farm night with no hand at work, a plan that moves several times a day grazes the day across the paddocks the player really moved the mob through, split as the engine splits its own stops, or where the mob is if it was not moved. The card offers at most the plan's own moves a day. Other choice: graze the plan's own stops whether or not the mob was moved. [m7.1. Change: `PlanRun.handStops`, `stopsToday`]

## 2. Stand-in figures

These numbers have no sourced real figure behind them. Each is one constant or setting. "Replaced by" says what would replace it.

| Figure | Value | Stands in for | Replaced by |
| --- | --- | --- | --- |
| Milk against condition | Full at CS 2.25, none at CS 1.5 | Published milk and condition curve | A source for milk output by body condition |
| Calf cost of gain | 0.52 MJ to 100 kg, MVP figure by 200 kg | Australian standard for young cattle | CSIRO 2007, Nutrient Requirements of Domesticated Ruminants |
| Central Queensland calf floors | A quarter under Fordyce et al. 1993 | District calf gain bands | A Central Queensland weaner source |
| Market series for random seasons | The MVP's approximate series and random walk | Real prices | Not needed on real years |
| Feeder prices before June 2003 | Multiple of the geometric mean of two indicators (1.0169 and 0.9990) | MLA feeder indicators (start June 2003) | Older feeder series, if one exists |
| Class price multiples | Weaners 1.08, bulls 0.906 of cows, calves 1.10 | MLA class indicators | An MLA indicator per class |
| Yard fill-in rules | 20 head a row, 14 day hold, 730 usable days | Thin yard series | A fill-in yard (Emerald, Inverell, Ballarat) |
| Sale day stand-ins | Prime sale every Monday at Gracemere and Mortlake where records are missing, none 16 Dec to 7 Jan; weekdays for random farms (Wed, Thu, Thu, Mon) | The yards' real sale days | The yards' real calendars |
| Soil | One 100 mm soil for all districts | Per-district soil water capacity | District soil water figures |
| Season label edges | The MVP's six labels, under 60% of average is "Drought" | A sourced season index | Your ruling on the edges |
| Job times | One gate figure marked Builder; 17 rules; figures marked Proposed in `DATA.md` "Job times" | PRD 5.4 table | Your ruling on each |
| Contractor labour | $5 a metre, either team | A contractor's quote | A quote from a fencing contractor |
| Hand skill by 1 to 5 | 2/3, 5/6, 1, 7/6, 4/3 of average | Skill effect on work | A source or your ruling |
| Hands: most at once, pool, standing | 6 hands; 1 to 3 people a week listed 14 to 42 days; 80, 20, 5, 40%, 20% | Labour market | Your ruling |
| Fencing injury | 1.5 times likelier, one week's wages cost | Fencing injury rate and the farm's claim cost | A source by state |
| Wages | 2026 Pastoral Award rates on every farm | Wages of the year played | Dated award rates |
| Wool price | Dated September 2026 stand-in, 17 micron 2,569 to 30 micron 605 c/kg clean | A real-year wool series | An AWEX agreement and series |
| Wool selling costs | Shed staff $1.50, levy 1.5%, $40 a bale, cartage $16, pack $14, 180 kg bale, oddments 22% | Real selling costs | AWI and levy pages that refused automatic reading |
| Sheep frame and size | Crossbred SRW 60 kg; ram 1.8 times SRW and maintenance times 1.25; 540-day frame; ceiling 0.4 kg a day | Sourced breed figures | A breed SRW table |
| Triplets | Pregnancy times 2.4, third lamb's milk 2 MJ, birth weight 3.0 kg, 10% of litters above 1.25 | Triplet data | Triplet sources |
| Sheep feed rules | Lactation curve full to day 42; green pick 0.1; short green 100 kg; bare 200 kg; residual 150 kg; dead feed in reach in full | Sheep grazing studies | S12 and field trials |
| Lamb and weaner rules | Orphans weaned from 56 days; no lamb past 150 days; starved at half normal weight; ram working life 4 years; joining stage from 42 days before | Survival and husbandry data | Sources for each |
| Sheep wool and fat | Milk counts as wool feed at 1/11 kg a MJ; crossbred micron 28; fat score from CS rounded | Wool and fat tables | Sources for each |
| Sheep prices and costs | Netting $10 a metre; rams $1,200; Merino breeders 1.5 times mutton; freight $3 a head; health $3.57 a head; grain protein 11%; hay $0.28/kg; sheep lick cattle rule divided by 8.4 | Sheep price lists | AuctionsPlus, dated feed prices, freight quotes |
| Sheep start flock | 1.5 DSE a ewe; cast at 6 years; bought defaults by class | Real start flocks | Sources for flock structure |
| Flystrike | 17% a year of unmulesed Merinos; same fly season everywhere | District fly season | A district fly season page |
| Sheep margin band | Band plus or minus 25% of $50.46 a DSE | A tolerance | Your ruling |
| Carrying capacity targets | The model's safe-use share | 5 DSE/ha native Tablelands, 12 to 23 sown | Your ruling (grass review) |
| Rescue cash | Hard-difficulty starting cash, or what the sale leaves | Rescue terms | PRD 10.3 terms |
| Keep-going tiers | 183, 365 and 730 days | PRD's three points | Your ruling |
| Keep-going price under 6 months | A$15 until set | Open price | Your price |
| Daily Farm data lag | 5 days | SILO's delay (no figure on its pages) | A figure from SILO after a few weeks of running |
| Account and ad limits | Posts 20 an hour, photos 24 an hour and 80 a day, ticker 30 a minute, `ad_view` 300 and `ad_click` 60 an hour, daily push cap 6 | Rate limits | Your ruling after real use |
| Ban list normalising | Gmail dots, googlemail and Fastmail `+tags` only | All provider alias rules | Provider help pages for Gmail `+tags`, Outlook, Apple and Yahoo |
| Word filter | Two placeholder words | Your word list | Your list |
| Past-day storage window | 14 days daily then weekly to 182 days | A retention decision | Your ruling |
| Guest and farm life | Guest 30 days (database), farm file 90 days | Retention decisions | Your ruling and the lawyer |
| Advertise spots | 20, not counted | A real count | Community page count |

## 3. Known gaps in realism

These are the open calibration rows and review findings. In each case the model works and the tests hold today's figures, but the numbers sit away from published ones.

**G1. Calf weaning weights.** Home-bred calves weighed about 80 kg at weaning (9 months) before the fix. The sources say about 160 to 175 kg at 180 to 200 days. After the fix: birth to 200 days is 0.53 (Central Queensland, band 0.6 to 0.95), 0.54 (Tablelands), 0.57 (Central West) and 0.63 kg a day (Western Victoria), against 0.7 to 1.1. Weight at 200 days is 142, 143, 149 and 163 kg. Central Queensland passes (band 140 to 225). The southern three are under 171 to 256. From 100 to 200 days calves gain 0.33, 0.39, 0.29 and 0.36 kg a day against 0.6 to 1.1. Weight at 100 days passes everywhere. Each open row is an expected failure with a regression floor beside it. [m2.5, CALIBRATION]

**G2. Cows milking off their backs.** Calves born per 100 cows and heifers fall to about 55 by year 3 in Central Queensland and the Tablelands, against 72 to 77 weaned per 100 for northern breeder herds (CashCow). About 17% of Tablelands cows sit under CS 2.25 from August to October in years 2 and 3. With a May start 79 to 82% do. Deaths did not rise. The milk condition figures are stand-ins. [m2.5 calls 1, 2, 5]

**G3. Grass feed quality and the two steer bands.** On the Tablelands in July and August a paddock holds 35 to 55 kg DM/ha of green and about 900 to 1,000 kg of dead feed. The diet is ME 7.0 and CP 5.2%. A dry cow eats 1.0 to 1.1% of live weight and is 11 to 14 MJ a day short. On dry feed at 50% digestibility game cows eat 1.0 to 1.2% against 1.4 to 1.5% measured in Central Queensland. Carrying capacity is 3.5 DSE/ha on Tablelands native against 5, and 5.5 to 7.7 on sown pasture against 12 to 23. The Tablelands steer band is 90 to 105 kg and Central West 115 to 130 kg, with no outside source. The recommended package would put them at 126 and 143 kg. The Central West peak digestibility was tuned from 0.70 to 0.68. [grass review, m1.3]

**G4. Central Queensland with lick.** The average year runs up to 2 kg over the top of its 75 to 130 kg band (held as `averageYearOver`). Herd deaths are counted over all herds together. The real-year herd test holds 1.5 to 3.6% on six herds over fair weather years. [m1.3, m1.4]

**G5. Real years.** Central West with nothing done loses steers heavily in four of 29 years and 5 to 54% of set-stocked weaners in its worst four. The season label reads the whole 12 months, so it can say "Below average" in a year unsupplemented steers lost 41%. A farm starting in 1997 may not pay its way (CHECK 8 to 10). [m1.4]

**G6. Sheep: Tablelands winter.** Unfed ewes reach lambing at CS 1.4, 31.7% die and marking is 48.8%. Central West marking is 71.1%. With the grass changes tried in the review, ewes reach CS 1.95, deaths fall from 15 to 18% to about 8% and lambs marked rise from about 50 to 62 per 100 ewes. Skipped benchmarks: SB-59 to SB-62 (carrying capacity), and Tablelands and Central West winter rows run with winter feeding. [m2.3, grass review]

**G7. Sheep deaths.** SB-43 Merino ewe deaths are 3.33% (highest block 4.67, 5.08), 3.98% (5.26, 5.53) and 4.70% for the Tablelands, Central West and Western Victoria, against 2 to 4% with no block over 4.5%. First-cross ewes are 4.95, 5.36 and 5.35%. SB-47 Western Victoria weaners lose 1.66% against 2 to 6% (worms left out). [CALIBRATION, m2.7 review]

**G8. Sheep margins.** Start flock first year (no hands, no sales, no feeding) against DPIRD's $50.46 a DSE: Central West $44.28 passes, Tablelands $5.37 and Western Victoria $135.74 are open. SB-GM (a managed flock, band $37.85 to $63.08): Central West $38.69 passes, Tablelands $71.88 and Western Victoria $90.33 are open, mostly wool at 2026 prices. The model's DSE a ewe (1.6 to 2.0) is below the budget's 2.32. [CALIBRATION, m2.7 review]

**G9. Mixed farm left alone.** Western Victoria with 86 cattle and 659 sheep and no action lost 579 sheep in two years and profit fell from $192,435 to $25,757. Not a benchmark. [m2.7]

## 4. Not built

**N1. Map.** Trees, cattle walking and grazing animation, time-lapse, frost, dust, heat haze and storm clouds, the profit layer, the selected mob and picked animals on the map, half-built fence lines and pegs, the overview inset for a phone held upright, hover, and the farmer. Sheep sprites exist as code art only. [m1.6a, m1.7c]

**N2. Play screens.** Drawing a fence or pipe by keyboard, setup cards with pictures, a "cows getting thin" item and a line saying condition falls because of milking, things to do for crops to lock up and grain shedding, red marks on squares that cannot take a crop, moving the crutching and joining days on screen, booking sheep onto a later sale, a sheep figure for paddock days of feed, a bell with an unread count in the top bar, the drag timeline in the Diary, a leaderboard tab inside the game. [m1.7, m2.2, m2.5, m2.8, m3.4]

**N3. Engine.** Temperature in the growth factor. Moving a running farm to new data. The grass changes in the grass review. Overhead costs a year for sheep. Marking cost for sheep. A managed cattle margin beside SB-GM. A calving window per district. [m1.4b, m1.4, m2.3, m2.7, m2.5]

**N4. Data.** The rest of the MLA pull (National Young Cattle Indicator, six national sheep indicators, other yard indicators, sheep yardings and the fill-in yards). Real yardings for Daily Farm sale days. The AussieGRASS licence is unconfirmed, so those figures are used for checking only. A DPIRD budget read (the pages refuse automatic reading). [m1.4a, m3.3, m1.4b]

**N5. Accounts.** Apple sign-in. A redirect route or `proxy.ts` to refresh an admin's sign-in. Supabase-wide rate limits that survive across server instances. A screen for changing a Daily Farm time zone. [m3.2, m3.5, m3.3]

**N6. Daily Farm.** The evening warning job. A read-only view of someone else's Daily Farm for Fast Farms. Daily leagues cannot be entered until Daily Farms exist. [m3.3, m3.4, m4]

**N7. Community.** Popular ordering in Everyone, reports of groups from a group page, real farm showcase photos, pull to refresh, a Groups tab list of every group's board, badges and best ranks on profiles, the Grazier Score formula, and weaning %, condition and the "above 1,500 kg DM/ha" share on boards. [m4.2, m4]

**N8. Ads and notifications.** `landing_sponsors` on the home page, `pc_leaderboard_banner`, `video_between_days`, AdSense and its admin fields. A real push service and a real email run (see "Not checked"). [m5.1, m6, m3.4]

**N9. Website and analytics.** Share images in the display font, audience numbers and ad rates on Advertise, a cookie and consent banner on the public pages (the consent control is on the account page only). [m5.4, m5.3]

**N10. Tests and checks.** Playwright end-to-end tests (planned for the game screens in milestone 1.0, not recorded as built). The `realism-guardian` agent was not run on most milestones. [m1.0, various]

## 5. Not checked

Each item could not be verified without keys, real services or a real phone. "What you need to do" says how to check it.

**V1. Real phone play.** Not done: install to the home screen, the iPhone Add to Home Screen steps, offline viewing in airplane mode, the Android install bar, the iPhone status bar in an installed app, going offline mid-request, touch pan and pinch, and frame rate. Do: play on a real iPhone and an Android phone in portrait and landscape, install, go offline, reconnect. BUILD_PLAN 1.8 says Claudia plays it on a real phone. [m1.8, m1.6a]

**V2. Screens by eye.** Not looked at: phone on its side in the dark theme for several screens, the game over card, the mixed-farm setup step, keyboard-only runs, the bore's gold ring, a knocked-down fence on screen, the phone plan form and crop sheet, the admin screens on a phone and PC in both themes, the sheep sprites at the far zoom and phone landscape for sheep, the ad cards and video break, the community pages, the notifications page. Do: open each at phone and PC size in both themes. [m1.7 entries, m2.8, m3.5, m5.1, m4.2]

**V3. A real Supabase project.** Nothing has run against one. Do: make the project (section 7), apply the migrations, then check: the `pg` pooler and `set local role` inside its transactions, `@supabase/ssr` cookies and refresh, `getClaims()` on a real token, the emailed link end to end (and that it fails in another browser), the Google round trip, `signOut` scopes, `auth.admin.deleteUser`, Storage removal and uploads, two real connections racing on one save, per-instance rate limits, `delete from auth.sessions` by the admin function, `getUserById`, a stale token on an admin page, the first-admin SQL. See `docs/DATABASE.md` "Still owed". [m3.1, m3.2, m3.5, m4.2]

**V4. Daily Farm live data.** The live feed has never run against SILO or MLA. Do: set `GG_DAILY_FEED=live` and `SILO_CONTACT_EMAIL` on a preview, check a day arrives, and check the rollover cron fires. Look at the 5-day lag after a few weeks. The catch-up sheet, plan card and time on the top bar were not seen in a browser. [m3.3]

**V5. Stripe test purchase.** Not run against Stripe. Do: follow the Stripe steps in section 7, buy the pack with no ads with test card 4242 4242 4242 4242, check the farm limit goes to 5, then refund in admin and check it goes back to 2. If it fails, check: the `v1` signature scheme and 5-minute tolerance, `payment_intent` on dispute events, `customer_creation` with `customer` set, and the `expires_at` repeat. [m5.2]

**V6. Notifications.** Nothing was sent through a real push service or Resend. Do: make the VAPID keys and Resend domain (section 7), then test an installed iPhone, Android Chrome, desktop Edge and Firefox. Check the Edge and Chrome hosts. [m3.4]

**V7. Ads.** No ad has been seen on screen with real storage. Do: run the migration, make an admin, turn on the Ads switch and one slot, make a house campaign, upload a picture and a real MP4 and play the video break. Run Lighthouse on `/play` with a slot on. [m5.1]

**V8. Community photos.** Storage uploads with the secret key, `storage.objects` rows matching what `approve_photo` reads, and photo download. Do: upload as a test account and approve in `/admin/photos`. [m4.2]

**V9. Lawyer and links.** The privacy complaints link, the legal drafts and the provider wording. Do: ask a lawyer to read them. [m5.4]

**V10. `realism-guardian`.** Not run on several milestones (1.2c, 1.4b, 1.4, 1.5a, 1.6a, m6 join, others). The realism check was run on the engine changes of the final joins (m6 and m7), and its findings are fixed in m7.1 (Daily Farm plans with no hand, the rescue, day cards). Do: run it again on any later model change before merging.

**V11. Lighthouse.** Not run on `/play` with the latest changes, on the sign-in and account pages, or after m6. The public pages ran at 99 to 100. Do: run Lighthouse CI on the main pages (mobile) on the final branch. [m3.2, m6]

**V13. Signed-in pages under the new policy.** The community and admin pages were only loaded as their no-keys answers, and the dashboard and its date form were never opened, because there is no database here. Do: on a preview with keys, open `/community`, a profile, `/admin` and the dashboard with a date range, and check the browser console shows no "Content Security Policy" line. [m5.5, m7 join]

**V14. Lighthouse on `/play` since it is made per request.** Five local runs after m8 read a median 0.95 (0.87 to 0.98) on a busy PC (A25). Not run on CI or on Vercel. Do: run Lighthouse CI on the final branch on CI. [m7 join]

**V15. The 8 unanswered year skips.** The first load test run had 8 of 120 year skips with no answer at all while other work ran on the same PC; two reruns had none. The cause is not known. Do: nothing yet; watch for it in Vercel logs and Sentry once live. [m5.5, LESSONS LC15]

**V16. Events in real Sentry and PostHog.** Both were mocked only. Do: set `SENTRY_DSN` on a preview, open `/play`, run `throw new Error("test")` in the browser console, and see it arrive. Turn on `analytics`, tick consent on `/account`, play a day and see the events in PostHog. [m5.3, m5.5]

**V12. Calibration judgement.** The real-year tables, the dry and wet years, the 1997 start, and each sheep and calf open row need your eye. Do: read `docs/CALIBRATION.md` and rule on the questions above. [m1.4, m2.5, m2.7]

## 6. Keys and settings you need to provide

Every variable is optional. With none set, the game runs with guest play and farm files, and each part that needs a key says plainly it is not set up. Variable names only are listed. Never put a value in the repo.

| Variable | What it is for | Where to get it | What does not work without it |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Public address for canonical links, sitemap, robots, share images and the leaderboard page's board read | Your chosen domain | Canonical links and share images use localhost |
| `GG_SITE_URL` | Server's own public address for sign-in links, redirects, email links, Stripe return pages | Your public address, no path | Accounts stay off in production |
| `GG_TRUSTED_IP_HEADER` | Header a trusted proxy sets to the caller's address, for every per-address limit | `x-real-ip` on Vercel | Accounts stay off in production, and every caller shares one limit |
| `GG_FARMS_DIR` | Where farm files live with no database | A folder (default `apps/web/.farms`) | Uses the default folder |
| `GG_SWITCHES_ON` | Switches turned on with no database, for a local check | For example `sheep` | Nothing extra on; ignored whenever a database is set |
| `GG_DEV_PAGES` | Builders' pages under `/dev` in production | Leave unset on the live site | `/dev` pages return 404 in production |
| `SITE_CONTACT_EMAIL` | Enquiry address on the website, read at build time | An address you choose | No contact link; no privacy request or advertising enquiry route |
| `SITE_OWNER_NAME` | Who "we" is on the privacy page and terms | Your business name | Pages say "the owner of The Grazing Game" |
| `SITE_SWITCHES_ON` | Which parts of the game the public pages may talk about, read at build time | Comma list of switch keys | Pages talk only about what is live today |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project address (safe in the browser) | Supabase, Project Settings, API | No accounts or database saves |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable (anon) key, safe in the browser | Supabase, Project Settings, API Keys | No accounts or database saves |
| `SUPABASE_SECRET_KEY` | Server-only key for deleting users, Storage and sign-in admin | Supabase, Project Settings, API Keys | No accounts, ads media, photos |
| `SUPABASE_DB_URL` | Direct database string to apply migrations from a machine or CI | Supabase, Database, Connection string, URI | Cannot apply migrations from CI |
| `SUPABASE_DB_POOLER_URL` | Pooled connection string for farm saves (server only, has the database password) | Supabase, Database, Connection string, Transaction pooler, URI | No database saves, Daily Farm, ads, purchases, notifications or community |
| `BAN_HASH_PEPPER` | Secret that hashes sign-in emails for the ban list and signs ad impressions | You make it (a long random string) | No accounts; ban list useless if lost |
| `CRON_SECRET` | Secret both scheduled routes check (Daily Farm rollover every 15 minutes, notification sender every 5) | You make it | Both routes answer 404 and run nothing |
| `GG_DAILY_FEED` | `live` fetches each day's weather and prices | Set to `live` | Daily Farm runs only as far as the baked tables (to 12 Nov 2026) |
| `SILO_CONTACT_EMAIL` | The user name SILO asks for | The address you chose for SILO | No live SILO fetch |
| `RESEND_API_KEY` | Sends notification emails (and sign-in mail through Supabase SMTP) | Resend, an API key with sending access | No email |
| `NOTIFY_FROM_ADDRESS` | Sender of notification emails | `Name <address>` on your verified domain | No email |
| `NOTIFY_TOKEN_SECRET` | Locks the unsubscribe link (32 or more random characters) | You make it | No email unsubscribe links |
| `VAPID_PUBLIC_KEY` | Web push public key | Run the command in `.env.example` | No push |
| `VAPID_PRIVATE_KEY` | Web push private key | The same command | No push; changing the pair stops every saved device |
| `VAPID_SUBJECT` | Who push services can contact | `mailto:` an address you read, or the site address | Falls back to `GG_SITE_URL` |
| `STRIPE_SECRET_KEY` | Creates checkouts and refunds | Stripe, Developers, API keys (test mode first) | Nothing is for sale |
| `STRIPE_WEBHOOK_SECRET` | Checks Stripe's signed events | Stripe, Developers, Webhooks, signing secret (test and live differ) | Nothing is for sale |
| `IMAGE_CHECK_API_KEY` | An outside image-check service | You choose a service; an adapter is written then | Every community photo waits in the manual queue |
| `SENTRY_DSN` | Where server and browser errors are sent (server only; no Sentry script in the browser) | Sentry, a Node.js project, Settings, Client Keys | Errors are only in the Vercel logs |
| `GG_RELEASE` | The release name errors are filed under | Optional: Vercel's commit is used | Nothing; the commit is used |
| `POSTHOG_KEY` | PostHog project key, kept on the server | PostHog, Project settings | Events stay in our own database only |
| `POSTHOG_HOST` | PostHog address for your region, https, no trailing slash | PostHog, Project settings | Events stay in our own database only |

No source map upload token is needed: no source maps are published, and Sentry gets trimmed stacks from the server.

## 7. Settings you set by hand

### Supabase dashboard

- Make the project (Free plan, Sydney region). Apply the migrations in name order (`supabase db push`), including `20261115000400_daily_farm.sql`, `20261115000510_farm_rev.sql`, `20261115000610_sheep_switch.sql` and `20261115003000_notify_cron.sql`.
- Data API: exposed schemas `public` only. Never `app`.
- Authentication, Sign In / Providers: anonymous sign-ins off. Email provider on. Google provider on ("Confirm email" can stay on).
- Google sign-in: make a Google OAuth client (web) in Google Cloud Console. The authorised redirect is the Supabase callback address shown on its Google page. Paste the client id and secret into the Supabase Google page.
- URL Configuration: Site URL is your public address. Redirect URLs include `https://<your address>/auth/callback` and, for local work, `http://localhost:3000/auth/callback`.
- Email template "Magic Link": keep `{{ .ConfirmationURL }}`. Set the sender and SMTP to the Resend settings.
- JWT signing keys: use the default asymmetric keys. Set the access token lifetime ("JWT expiry limit") to 900 seconds. The dashboard page that holds it was not confirmed.
- Authentication, Rate Limits: leave Supabase's email limits on.
- Two-step sign-in on your own Supabase login.
- Daily rollover on the database scheduler instead of Vercel: turn on `pg_net` and Vault, then store `gg_site_url` and `gg_cron_secret` once in Vault (the two `vault.create_secret` lines in `docs/DATABASE.md`).

### Vercel

- Make the project (Hobby), link the repo, lock previews, and paste the variables above as server variables (Production and Preview).
- Crons: `apps/web/vercel.json` holds both (rollover every 15 minutes, notification sender every 5). A 15- and 5-minute cron needs a plan that allows it, since the free plan runs a cron once a day. Or use pg_cron.
- `GG_TRUSTED_IP_HEADER` set to `x-real-ip`. A variable named `CRON_SECRET` is sent by Vercel Cron as the bearer header.

### How the first admin is made

Sign up in the game first, which makes the profile. In the Supabase SQL editor run, with your own username in place of `YOUR_USERNAME`:

```sql
update public.account_status
   set role = 'admin'
 where user_id = (select user_id from public.profiles where username = 'YOUR_USERNAME');
```

It should say `UPDATE 1`. There is no route or variable that makes an admin. If the sign-in has gone stale, open `/play` once, then `/admin`. Later admins are made from the Users page.

### Stripe (test mode first)

1. Make the Stripe account and stay in test mode. Set the business name under Settings, Public details. Switch on "Successful payments" under Customer emails if Stripe should email receipts. Leave the Customer Portal off.
2. Developers, Webhooks, add an endpoint at `https://<GG_SITE_URL>/api/billing/webhook`. Send exactly these events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`. Copy the signing secret.
3. Put `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in Vercel and redeploy.
4. In `/admin/switches` turn on Purchases. In `/admin/purchases` switch on the products to sell. The page should say "Stripe is connected (test mode)".

### Other accounts

- Resend: make an account, add a sending domain (a sub-domain is best), add the DNS records Resend lists and wait for "Verified".
- VAPID keys: run the command in `.env.example` once on your PC and paste the two lines into the host's variables.
- A random secret for each of `BAN_HASH_PEPPER`, `NOTIFY_TOKEN_SECRET` and `CRON_SECRET`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Keep a copy of `BAN_HASH_PEPPER` somewhere safe. Losing it loses every ban on a deleted account.
- An image-check service, if you want one, and AdSense with a consent banner, if you want it.

## 8. How to review and merge

Open one pull request from `m7-final` into `main`. Merge it only when you are ready. Nothing goes to `main` without your go-ahead. Before merging, run type check, lint, tests, Lighthouse CI on the main pages (mobile) and the `realism-guardian` agent on the final branch.

`m7-final` is expected to contain every milestone branch below. The milestone branches are listed in build order, so you can read the history one piece at a time. Branches named `worktree-agent-...` are builder work areas and can be ignored.

### Planning

- `docs/prd-v1.1-build-plan`: the spec (PRD v1.1), build plan, mockups and the MVP reference.

### Stage 1: engine and the cattle game

- `m1.0-scaffold`: the monorepo, design tokens, shells, seeded random numbers, lint rules.
- `m1.1-grass`: district figures, pasture growth, quality and summaries, matched to the MVP.
- `m1.2a-cattle`: cattle intake, growth, breeding, deaths and the daily cattle step.
- `m1.2b-farm`: paddocks, fences, water, crops and whole-farm generation.
- `m1.2c-whole-farm`: the whole farm as one object, the daily tick, money, actions and saves.
- `m1.2-cattle-and-farm`: joins 1.2a and 1.2b.
- `m1.3-calibration`: every benchmark as an automated test and the Central West tune.
- `m1.4a-real-data`: SILO weather and MLA price tables pulled.
- `m1.4b-weather-growth`: the soil-water growth factor from real weather.
- `m1.4-real-years`: joins the real data and weather lines.
- `m1.4c-real-years-wiring`: real years, real prices, CPI, sale calendars wired into a farm.
- `m1.5a-daylight`: first and last light checked against a published table.
- `m1.5a-the-clock`: the farm clock, job times and the working day.
- `m1.5b-sale-days`: buying and selling on sale days, delivery into the yards.
- `m1.5c-plans`: grazing plans and the 180-day play test.
- `m1.6a-map-core`: the farm view and the PixiJS map.
- `m1.6b-map-on-clock`: the map joined to the clock.
- `m1.7a-play-shell`: the game server, setup flow and first play screen.
- `m1.7b-paddock-and-mob`: paddock sheet, mob card and husbandry.
- `m1.7c-build-tools`: fence, gate, pipe, trough, hub and remove tools.
- `m1.7d-market-and-plans`: Market, Plans, crops and the inbox.
- `m1.7x-engine-rules`: fence materials, hub moves, reads for the web server.
- `m1.7f-review-fixes`: screens review fixes and the engine's pregnancy-on-record change.
- `m1.7f-verified`: bundle check that survives minifying, zoom tests and docs.
- `m1.7g-scores-diary`: Scores and Diary.
- `claude/m1-7e-help-and-tour-795ea8`: Help, the guided first day and empty states.
- `claude/m1-8-stage1-wrap-eafda9`: install, offline, error screens, speed budgets and cost measurement.
- `m1.8-stage1-joined`: Stage 1 joined and reviewed.

### Stage 2: farm hands and sheep

- `m2.1-hands-and-contractors`: farm hands, wages and contractor fencing (engine).
- `m2.2-hands-screens`: workforce screens, worker report and the team fencing tool.
- `claude/m2-3a-sheep-benchmarks-99f42d`: the sheep benchmark table with sources.
- `m2.3-sheep-model`: the sheep model and the engine half of 2.4.
- `m2.5-calf-growth`: calf cost of gain and milk against condition.
- `m2.6-grass-quality-review`: the grass quality review (`docs/GRASS_QUALITY_REVIEW.md`). This branch changes no model or test.
- `m2.7-engine-joined`: sheep and calf lines joined, then a review of the sheep third pass.
- `m2.8-sheep-screens`: sheep screens and map.

### Stage 3: accounts, server and Daily Farm

- `m3.1-database`: Supabase tables, access rules and tests.
- `m3.2-accounts-and-saves`: sign-in, accounts, database saves and the farm picker.
- `m3.5-admin-shell`: the admin area, switches, users, audit log and maintenance mode.
- `m3.3-daily-farm`: Daily Farm and the midnight rollover.
- `m3.4-notifications`: web push, email, inbox and reminders.

### Stage 4: competition and community

- `m4.2-community`: profiles, following, posts, feed, photos, then Stage 4 (boards, groups, challenges, ticker, farm viewing, moderation).

### Stage 5: money and launch

- `m5.1-ad-slots`: ad slots, campaigns, house ads and reports.
- `m5.2-purchases`: one-off purchases through Stripe Checkout and paying to keep going.
- `claude/m5-4-website-363c83`: the public website.
- `m5.3-dashboard`: the admin dashboard, CSV export, game health, Web Vitals and analytics with consent.
- `m5.5-launch-check`: Sentry from the server, the Content-Security-Policy, the load test, end-to-end flows, the restore drill, farm export, the runbook, the launch checklist and the 14 security review fixes.

### The join

- `m6-joined`: joins Stage 1 to Stage 4 and ad slots and purchases (engine 0.18.0, save format 13), with the wiring between Daily Farm, notifications, ads, purchases and community.
- `m6-final-report`: this report.
- `m7-final`: everything above joined, with 5.3 and 5.5, `docs/GRASS_QUALITY_REVIEW.md`, and the small gaps closed at the join (the consent choice in Download my data, four server-side events).
