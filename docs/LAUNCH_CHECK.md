# Launch check

Milestone 5.5, 15 Nov 2026, branch `m5.5-launch-check`. Every launch requirement in the PRD and BUILD_PLAN, each with one status:

- **Passes:** a test or script in this repo proves it, named in the row. Nothing is marked passes on reading the code alone.
- **Needs keys or a device:** it can not be proven without an outside account, a real deployment or a real phone. The row says exactly what Claudia needs to do.
- **Not done:** not built, or built and not proven. The row says what is missing.

"The suite" means `pnpm test`. Script checks run after `pnpm build`.

## Game and realism

| # | Requirement (source) | Status | Proof, or what is needed |
|---|---|---|---|
| 1 | Grass and cattle formulas match the MVP (BUILD_PLAN 1.1, 1.2) | Passes | The engine comparison suites in `packages/engine/src` (part of the suite) |
| 2 | Every calibration benchmark for the four districts is an automated test (CLAUDE.md, BUILD_PLAN 1.3) | Passes, with the readings still waiting on Claudia | `packages/engine/src/calibration/*.test.ts`. Some bands are held on averages over fixed blocks; those readings are marked "proposed, waiting on Claudia" (LESSONS K2, K5) |
| 3 | Sheep benchmarks pass (BUILD_PLAN 2.3) | Not done | Known gaps listed in `docs/DEVELOPMENT_LOG.md` ("m2.8 Sheep screens"). Sheep stay behind the `sheep` switch, off, until Claudia rules |
| 4 | A guest can set up a farm, do a job, end the day and skip a year (PRD 20, Stage 1) | Passes (HTTP level) | `apps/web/server/e2e/guestYear.e2e.test.ts` through the real routes. On screen in portrait and landscape: needs a device (row 33) |
| 5 | Same seed and actions give the same farm (BUILD_PLAN 1.2) | Passes | Engine determinism tests in `packages/engine/src` |
| 6 | The browser holds no formulas or data tables (PRD 5.16, CLAUDE.md rule 14) | Passes | `pnpm check:browser-bundle` (searches every script, the rendered `/play` page and page data, and the service worker's files) |

## Accounts, Daily Farm and the server

| # | Requirement | Status | Proof, or what is needed |
|---|---|---|---|
| 7 | Row level security on every table; a player changes only their own rows; private fields stay private (PRD 17, BUILD_PLAN 3.1) | Passes on Postgres | `packages/db/src/matrix.test.ts`, `rules.test.ts`, `coverage.test.ts`, `functions.test.ts` on PGlite. Against real Supabase: needs keys (row 30) |
| 8 | A guest farm moves into an account; the old guest cookie no longer reaches it (PRD 8.1) | Passes | `apps/web/server/e2e/accountLife.e2e.test.ts` (fake sign-in provider), `server/auth/flows.test.ts` |
| 9 | Under 14 refused; under 16 sees no community (PRD 8.3) | Passes | `server/auth/flows.test.ts`, `server/community/*.test.ts`, `packages/db/src/stage4.test.ts` |
| 10 | Daily Farm: start, midnight rollover, next morning; a wound-forward clock gives no extra days; a missed run is caught up (BUILD_PLAN 3.3) | Passes | `apps/web/server/e2e/daily.e2e.test.ts`, `server/daily/rollover.test.ts`, `nights.test.ts`, `week.test.ts`, `clock.test.ts`, `twoservers.test.ts` |
| 11 | A Daily Farm runs 7 real days including 2 missed days and looks right to Claudia (PRD 20 Stage 2) | Needs keys and Claudia | `server/daily/week.test.ts` runs the 7 days. "Looks right to Claudia" needs her to play one on a deployed copy with the database, `CRON_SECRET` and `GG_DAILY_FEED=live` |
| 12 | Failed saves retry and never lose a job silently (PRD 21a) | Passes | `server/game/saves.test.ts`, `lib/game/savingagain.test.ts` |
| 13 | Download my data and delete my account (PRD 18, 21a) | Passes | `apps/web/server/e2e/accountLife.e2e.test.ts` (flow 7), `server/auth/flows.test.ts`. Storage file removal on real Supabase: needs keys (row 30) |
| 14 | Rate limits on jobs, posts, comments, follows, reports (PRD 17) | Passes | `server/game/routes.test.ts`, `server/community/community.test.ts`, `packages/db/src/review.test.ts`, `server/auth/ratekey.test.ts` |
| 15 | Admin routes check the role on the server (PRD 17) | Passes | `server/admin/admin.test.ts`, `pages.test.ts`, `second.test.ts` |
| 16 | Every route answers without a 5xx with no keys | Passes | `apps/web/server/routes.walked.test.ts` (walks every route file, including `/api/client-error`), `server/auth/accountsoff.test.ts` |

## Community and moderation

| # | Requirement | Status | Proof, or what is needed |
|---|---|---|---|
| 17 | Two accounts follow each other and see each other's day cards and farms (PRD 20 Stage 3) | Passes | `server/community/community.test.ts`, `farmview.test.ts`, `notices.test.ts` |
| 18 | A post, a report and a moderation action that removes it (BUILD_PLAN 4.5) | Passes | `apps/web/server/e2e/moderation.e2e.test.ts`, `server/admin/moderation.test.ts` |
| 19 | A photo never shows before it has been checked (BUILD_PLAN 4.3) | Passes for the manual queue | `packages/db/src/third.test.ts`, `server/community/review.test.ts`. An outside image-check service is not chosen: needs Claudia to choose one (`IMAGE_CHECK_API_KEY`) |
| 20 | Day cards follow the owner's privacy (m5.5 review) | Passes | `server/community/community.test.ts` ("follows who may see the farm") |

## Money and ads

| # | Requirement | Status | Proof, or what is needed |
|---|---|---|---|
| 21 | A test purchase lifts the farm limit and removes ads; a refund takes it back (PRD 20 Stage 4, BUILD_PLAN 5.2) | Passes against the fake Stripe | `apps/web/server/e2e/purchase.e2e.test.ts` (flow 4), `server/billing/billing.test.ts`. In real Stripe test mode: needs keys. Claudia sets `STRIPE_SECRET_KEY` (test) and `STRIPE_WEBHOOK_SECRET` on a preview deployment, makes the webhook (RUNBOOK 7.3), buys a pack with Stripe's test card, refunds it in Stripe |
| 22 | A rescue does exactly what the card said (BUILD_PLAN 5.2) | Passes against the fake Stripe | `apps/web/server/e2e/purchase.e2e.test.ts` (flow 5), `billing.test.ts` |
| 23 | Claudia can switch on a slot, upload a house ad and see views (BUILD_PLAN 5.1) | Passes on PGlite | `server/ads/ads.test.ts`, `adminads.test.ts`. On the live site: needs keys and Claudia to try it |
| 24 | No-ads and ad clicks hold under fault and forgery (m5.5 review) | Passes | `server/ads/ads.test.ts` |

## Speed and quality (PRD 14.10)

| # | Requirement | Status | Proof, or what is needed |
|---|---|---|---|
| 25 | Website page JavaScript under 100 KB; public pages send no script | Passes | `pnpm check:js-budget`: `/` 0 KB, `/leaderboards` 0 KB |
| 26 | Game page under 250 KB before the art | Passes | `pnpm check:js-budget`: `/play` 207.6 KB |
| 27 | Lighthouse 100 on website pages, 95+ Performance on `/play`, mobile | Passes for `/play` at the median on this PC, not yet on CI; passes for `/` on this PC | m8, the repo settings, mobile, five runs back to back, local production build, this PC busy with other work: `/play` before 0.86, 0.86, 0.82, 0.86, 0.85 (median 0.86, largest paint 3.49 s); after 0.96, 0.94, 0.98, 0.87, 0.95 (median 0.95, largest paint 0.92 s, total blocking time 250 ms), 100 in accessibility, best practices and SEO every run. Layout shift 0. On `m7-final`: `/` 100 in all four categories every run. The other public pages were not rerun. Not run on CI (CALLS A25, V14) |
| 28 | Under 5 ms a simulated day with 4,000+ head | Passes on its own run | `pnpm test:speed` (kept out of the suite, LESSONS W6) |
| 29 | 60 fps with 4,000+ head on a mid-range Android phone | Needs a device | Claudia plays a 4,000-head farm on a 3-year-old Android phone and says whether it stutters |
| 30 | Real Supabase: pooler, Auth cookies, Storage, two servers racing | Needs keys | Claudia makes the Supabase project and sets the keys on a preview deployment; then the list in docs/DATABASE.md ("Still owed") is walked once |
| 31 | Many players at once (BUILD_PLAN 5.5 load test) | Passes on one machine, file store | `pnpm test:load` (results in `docs/DEVELOPMENT_LOG.md`, m5.5). It proves no errors and no lasting memory growth under 60 guests at once on one process. It does not prove a real database, several servers or a real network |

## Reliability, security and operations

| # | Requirement | Status | Proof, or what is needed |
|---|---|---|---|
| 32 | Every error reported to Sentry; zero unhandled errors in a normal session (PRD 14.10, 21a) | Passes for the sender; needs keys for Sentry | `server/errors/sentry.test.ts`, `clientError.test.ts`. The sender and the browser hook were checked in a production build (a browser error reached `/api/client-error`, 204). That events arrive in Sentry needs Claudia to make a Sentry project and set `SENTRY_DSN` |
| 33 | Real flows on a phone in both orientations and both themes (CLAUDE.md, PRD 14.7) | Needs a device | Claudia plays on a real iPhone and Android phone, portrait and landscape, light and dark: set up, a fence, a move, buy and sell, Next day, a skip |
| 34 | A Content-Security-Policy on every page with no inline or eval script (m5.5 review) | Passes | `apps/web/lib/csp.test.ts`; checked in a production build: `/`, `/play` (farm started, a job, Next day, the map zoomed in), `/account`, `/admin`, `/community` with no violation reported |
| 35 | Backups and a tested restore (BUILD_PLAN 5.5) | Passes locally; needs keys for Supabase | `pnpm test:restore` and `packages/db/src/restore.test.ts` (every table, count and checksum, two ways). On Supabase: Claudia checks the backup settings in the dashboard and runs the drill in RUNBOOK 3.3 once |
| 36 | Runbook (BUILD_PLAN 5.5) | Passes as a document | `docs/RUNBOOK.md`. Not tested by a script |
| 37 | Full security review (BUILD_PLAN 5.5) | Passes for the 14 findings | Each fix has a test that fails without it (`docs/DEVELOPMENT_LOG.md`, m5.5) |
| 38 | Secrets only in environment variables; `.env.example` lists every variable (PRD 17, 21a) | Not done as a test | Checked by reading for 5.5: every variable the app reads is in `.env.example` (the two new ones are `SENTRY_DSN` and `GG_RELEASE`), apart from those the platform sets (`NODE_ENV`, `NEXT_RUNTIME`, `VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA`). No test checks the list, and no secret scanner runs on the repo |

## Legal (PRD 18): needs Claudia

| # | Requirement | Status | What is needed |
|---|---|---|---|
| 39 | Privacy policy, terms, community rules | Needs Claudia | Draft pages exist. Claudia sets `SITE_OWNER_NAME` and `SITE_CONTACT_EMAIL`, and has them checked by a lawyer |
| 40 | Social media minimum age and the Children's Online Privacy Code | Needs Claudia | Legal advice on whether the community counts and whether date of birth alone is "reasonable steps" |
| 41 | Australian Consumer Law and GST for purchases | Needs Claudia | Advice before `purchases` is switched on in live mode |
| 42 | Who owns the game (Claudia or AgriProve) | Needs Claudia | A decision before launch |
