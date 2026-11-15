# Runbook: running The Grazing Game

Written for milestone 5.5 (launch check). Plain steps for whoever looks after the live site. Where a step depends on Claudia's Vercel or Supabase plan, it says **check in the dashboard**: this file does not state plan features, limits or prices, because they change and were not looked up.

The live site is one Next.js app on Vercel (`apps/web`) and one Supabase project (Postgres, Auth, Storage). Every outside key is an environment variable in Vercel. Nothing secret is in the repo.

---

## 1. Deploying

### A normal deploy

1. Work is merged to `main` only with Claudia's go-ahead (CLAUDE.md).
2. Before merging, on the branch: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build`, `pnpm check:browser-bundle`, `pnpm check:js-budget`. All must pass.
3. If the change adds a database migration (a new file in `supabase/migrations`), apply it **before** the deploy that needs it (section 1.3).
4. Merge. Vercel builds `main` and switches the site over when the build passes.
5. Check straight after (section 1.2).

### Checks after every deploy (5 minutes)

1. Open the home page. It loads, and the light and dark button works.
2. Open `/play`. Start a guest farm (or open yours), do one job, press Next day. The day moves on.
3. If accounts are on: sign in, open `/account`, open `/admin` as an admin.
4. In Vercel, open the deployment's logs. Look for lines starting `failed route=`. A few `failed route=client:` lines are browser errors and are expected now and then; a stream of the same line is not.
5. If Sentry is set up (`SENTRY_DSN`), open the Sentry project. New issues that appeared in the minutes after the deploy point at the deploy.

### Applying a migration

Migrations are applied from a developer machine with the Supabase CLI (docs/DATABASE.md, "Applying the migrations to a real project"):

1. Take a backup first (section 3.2).
2. `supabase db push` (or `supabase db push --db-url "$SUPABASE_DB_URL"`). It applies each new file in `supabase/migrations` in name order.
3. Never run `supabase db reset` or `supabase/seed.sql` against production. The seed is test data.
4. Deploy the code that uses the migration.

New migrations only ever add. An old migration file is never edited.

---

## 2. Environment variables

Every variable is listed, with its comment, in `.env.example`. Set them in Vercel (Project, Settings, Environment Variables), for Production and, where you want it, Preview. After changing one, redeploy: Vercel reads them at build and start.

Every variable may be empty. With none set, the site runs guest play with farm files and every other part says plainly it is not set up. The table says what stops working when each is missing.

| Variable | What breaks without it |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Canonical links, the sitemap, robots.txt and share images point at `localhost`. Set before launch. Read at build |
| `GG_SITE_URL` | **Accounts stay off in production** (the server says why at start-up). Sign-in links, email links and Stripe return pages are built from it |
| `GG_FARMS_DIR` | Only used with no database. Farm files go to `apps/web/.farms`. On Vercel the file system is not kept between requests, so the live site must have the database set |
| `GG_SWITCHES_ON` | Nothing. Only for a machine with no database. Leave unset on the live site |
| `GG_DEV_PAGES` | Nothing. Builder pages under `/dev` answer 404. Leave unset on the live site |
| `GG_TRUSTED_IP_HEADER` | Every caller with no session shares one limit (farm creation: 5 farms in 10 minutes for everyone together; sign-in limits). **Set to `x-real-ip` on Vercel.** The server logs a warning at start-up when it is unset |
| `SITE_CONTACT_EMAIL` | The website has no "contact us" links. Read at build |
| `SITE_OWNER_NAME` | The privacy page and terms say "the owner of The Grazing Game". Read at build |
| `SITE_SWITCHES_ON` | The public pages talk about nothing that is switched off (all off while unset). Read at build |
| `NEXT_PUBLIC_SUPABASE_URL` | Accounts and the database are off. Community photos can not be shown |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Accounts are off |
| `SUPABASE_SECRET_KEY` | Accounts are off. No account can be deleted (Auth admin), no Storage file removed, no ad media read |
| `SUPABASE_DB_URL` | Nothing on the site. Only for applying migrations from a machine |
| `SUPABASE_DB_POOLER_URL` | **The database is off.** No accounts, no saved farms in the database, no Daily Farm, ads, purchases, notifications or community |
| `BAN_HASH_PEPPER` | Accounts are off. Changing it makes every ban record stop matching and every ad impression token invalid |
| `CRON_SECRET` | The rollover (`/api/daily/rollover`) and the notification sender (`/api/notify/send`) answer 404. Daily Farms only move on when opened; no notification is sent |
| `GG_DAILY_FEED` | No real weather or prices are fetched. Daily Farm runs only as far as the days already kept (then uses averages, section 6.5) |
| `SILO_CONTACT_EMAIL` | The weather fetch from SILO can not run |
| `RESEND_API_KEY` | No notification email is sent (push and the inbox still work). Sign-in emails go through Supabase's own SMTP settings, not this |
| `NOTIFY_FROM_ADDRESS` | No notification email is sent |
| `NOTIFY_TOKEN_SECRET` | No notification email is sent (the unsubscribe link can not be made). Changing it breaks every unsubscribe link already sent |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | No push is sent and nothing asks for permission. Changing the pair stops every saved device |
| `VAPID_SUBJECT` | Nothing: `GG_SITE_URL` is used |
| `STRIPE_SECRET_KEY` | Nothing is for sale |
| `STRIPE_WEBHOOK_SECRET` | Nothing is for sale. A payment made could not be confirmed, so the store stays shut without it |
| `IMAGE_CHECK_API_KEY` | Nothing yet: every community photo waits for an admin in `/admin/photos` |
| `SENTRY_DSN` | No errors go to Sentry. They are still in the Vercel logs as `failed route=` lines |
| `GG_RELEASE` | Nothing: on Vercel the commit is used as the release |

Vercel sets `VERCEL_ENV` and `VERCEL_GIT_COMMIT_SHA` itself; Sentry uses them for the environment and release.

---

## 3. Backups and restore

### How backups work for this project

What the code and migrations show:

- **Everything that matters is in the Supabase database:** accounts (`auth.users` and the `public` account tables), farms and their saves, past days, the action log, scores and boards, community posts, reports and moderation history, purchases and entitlements, ads and their counts, settings and switches, notifications. The migrations make one helper schema, `app` (functions only), and put every table in `public`.
- **Files are in Supabase Storage**, in five buckets (migration `20261114001200_storage.sql`, and `20261116000100_ad_media_private.sql`): `avatars` (profile photos, 2 MB each), `group-photos` (4 MB), `post-photos` (post and showcase photos, 8 MB), `snapshots` (past-day maps, server only, 1 MB) and `ad-media` (sponsor images and videos, 50 MB, private since milestone 5.5). A database backup holds the rows that name these files (`storage.objects`), **not the files themselves**.
- Nothing in the repo sets up backups, point-in-time recovery or how long backups are kept. Those come with the Supabase plan. **Check in the dashboard** (Database, Backups): whether daily backups are on, how many days are kept, whether point-in-time recovery is available, and whether Storage files are included. Write the answers here once checked.
- The guest farm files used when there is no database (`GG_FARMS_DIR`) are not part of the live site. For a machine that runs on files, `pnpm farms:export` and `pnpm farms:import` move them (section 3.4).

### Take a backup by hand (before a migration or a risky change)

1. In the Supabase dashboard, Database, Backups: if a "back up now" or restore point option is offered on the plan, use it. **Check in the dashboard.**
2. As well, from a developer machine with the Postgres tools installed: `pg_dump "$SUPABASE_DB_URL" --format=custom --no-owner --file=gg-YYYY-MM-DD.dump`. Keep the file somewhere private. It holds personal data.
3. For Storage files, download the buckets you need from the dashboard (Storage) or with the Supabase CLI. **Check in the dashboard** what the plan offers.

### The restore drill (exact steps)

Do this once before launch, and again after any big change to the database. It restores into a **new** project, never over the live one.

1. In Supabase, make a new project (a spare or the staging one), same region. Note its database connection string as `RESTORE_DB_URL`.
2. Apply the migrations to it: `supabase db push --db-url "$RESTORE_DB_URL"`. Do not run the seed.
3. Restore the data only, with triggers held off so rows go in as they were:
   `pg_restore --data-only --disable-triggers --no-owner --dbname="$RESTORE_DB_URL" gg-YYYY-MM-DD.dump`
   (or, from a dashboard backup, follow the dashboard's own restore steps into the new project. **Check in the dashboard.**)
4. Compare row counts table by table between the live database and the restored one: in the SQL editor of each, run
   `select schemaname, relname, n_live_tup from pg_stat_user_tables order by 1, 2;`
   (an estimate; for an exact count on a table that matters, `select count(*) from public.farms;` on both).
5. Point a preview deployment at the restored project (its four Supabase variables and `SUPABASE_DB_POOLER_URL`). Sign in with a test account, open a farm, play a day, open `/admin`.
6. Write the date, how long the restore took and any table that differed in `docs/DEVELOPMENT_LOG.md`.

**What is proven in the repo, on this machine:** `pnpm test:restore` (and the test `packages/db/src/restore.test.ts`, part of `pnpm test`) builds a database from every migration and the seed, copies it two ways (a table-by-table data dump loaded into a fresh database built from the migrations, with triggers held off; and the whole data folder), and compares the row count and a checksum of every table. On 15 Nov 2026: 67 tables, 192 rows, every table the same both ways. It runs on PGlite (Postgres in the test process), not on Supabase, so it proves that the migrations and the data restore cleanly, not that Supabase's own backup works or that Storage files come back.

### File-store farms (a machine with no database)

- `pnpm farms:export -- --dir <farm folder> --out farms.json`: every farm and its past days in one file, with a checksum.
- Stop the server, then `pnpm farms:import -- --dir <empty folder> --in farms.json`. It refuses a changed file, a newer format, a bad farm id, and any farm already in the folder unless `--overwrite` is given. A guest's farm keeps its id, so the same browser finds it again.
- Tested in `apps/web/server/game/farmexport.test.ts`.

---

## 4. The first admin

1. Sign up in the game as yourself (that makes your profile).
2. In the Supabase dashboard, SQL editor, run (with your own username):

   ```sql
   update public.account_status
      set role = 'admin'
    where user_id = (select user_id from public.profiles where username = 'YOUR_USERNAME');
   ```

3. It should say `UPDATE 1`. Open `/play` once (it refreshes your sign-in), then `/admin`.
4. Later admins and moderators are made from `/admin/users` by an admin. There is no route and no variable that makes an admin. The last admin can not lose the role.

---

## 5. Feature switches

All switches are in `/admin/switches`. Each change is in the audit log (`/admin/audit`). A change shows within 30 seconds on every server. Switches marked "read at build" on that page also need `SITE_SWITCHES_ON` changed and a redeploy before the public pages mention them.

| Switch | Default | Before turning it on | What to check first after |
|---|---|---|---|
| `fast_farm` | on | Nothing | A guest can start a farm and play a day |
| `signups_open` | on | Accounts keys set (section 2) and email and Google sign-in turned on in Supabase | Sign up with a test address, finish the profile, see `/account` |
| `leaderboards` | on | Nothing | `/leaderboards` lists rows |
| `push_notifications` | on | The VAPID pair set | On a phone, turn notifications on in `/account/notifications`, get the test reminder |
| `daily_farm` | off | `CRON_SECRET`, `GG_DAILY_FEED=live`, `SILO_CONTACT_EMAIL`; one of the two schedulers running (section 6) | Start a Daily Farm. Next morning it is on the next day. `daily_counts` shows `rollover_runs` counting |
| `community` | off | Moderators in place; the word list checked in `/admin/words` | A test account can post; an under-16 test account sees no community |
| `feed_posts`, `groups`, `farm_viewing`, `activity_ticker` | off | `community` on | Each page opens; the ticker shows only on website pages |
| `ads`, `banner_ads`, `video_ads` | off | A house ad or campaign made in `/admin/ads` | The slot shows the ad; `/admin/ads/stats` counts a view |
| `adsense` | off | Not planned for launch (PRD 10.1) | Leave off |
| `purchases` | off | Both Stripe keys set, the webhook made (section 6.3), each product switched on in `/admin/purchases`. Start in Stripe test mode | A test purchase lifts the farm limit and removes ads; a refund takes it back |
| `sheep` | off | Claudia's ruling on the sheep benchmarks | A sheep farm starts outside Central Queensland |
| `maintenance_mode` | off | Choose the wording (section 7.8) | A player sees the wording and can not change their farm; you (admin) still can |

---

## 6. Scheduled jobs and how to tell they ran

Two schedulers exist. Run **either** Vercel's crons **or** Supabase's pg_cron for the two web routes. Running both is harmless: a farm is claimed by one run only.

| Job | Where | When | What it does | How to tell it ran |
|---|---|---|---|---|
| Daily Farm rollover | Vercel cron (`apps/web/vercel.json`) or pg_cron `gg-daily-rollover` | Every 15 minutes | Calls `/api/daily/rollover`: fetches missing weather and prices, runs the night for every Daily Farm past its midnight | The `daily_counts` table: `rollover_runs` goes up every 15 minutes and `rollover_failed` stays 0 (`select * from public.daily_counts order by day desc limit 20;`). Vercel logs show the route's calls |
| Notification sender | Vercel cron or pg_cron `gg-notify-send` | Every 5 minutes | Calls `/api/notify/send`: sends due push and email | `/admin/notifications` shows sent counts moving. In the database, `notifications` rows leave `queued` |
| Ad roll-up | pg_cron `gg-rollup-ad-events` | 14:15 UTC daily (just after Sydney midnight) | Rolls yesterday's ad events into `ad_daily` | `select max(day) from public.ad_daily;` is yesterday |
| Housekeeping | pg_cron `gg-housekeeping` | 14:45 UTC daily | Removes rate-limit windows over 2 days old, guests not seen for 30 days, farm saves set aside over 30 days | `select count(*) from public.rate_limit_hits where created_at < now() - interval '2 days';` is 0 |

For pg_cron to call the two web routes, the Vault secrets `gg_site_url` and `gg_cron_secret` must be stored and the pg_net and Vault extensions on (docs/DATABASE.md). Without them those two jobs run and do nothing. To list the jobs and their last runs, in the SQL editor: `select jobname, schedule from cron.job;` and `select jobid, status, start_time from cron.job_run_details order by start_time desc limit 20;`. To stop one: `select cron.unschedule('gg-daily-rollover');`.

---

## 7. When something goes wrong

### 7.1 A bad deploy

1. In Vercel, Deployments, find the last deployment that worked, open its menu and choose to promote it to production (Vercel calls this an instant rollback). **Check in the dashboard** for the exact button on the plan.
2. Do the checks in section 1.2 on the old deployment.
3. If the bad deploy came with a migration: rolling the code back does not undo the migration. Migrations only add, so the old code normally runs on the newer database. If it does not, turn on maintenance mode (7.8) and fix forward with a new migration. Never edit or delete a migration that has run.
4. Write what happened in `docs/LESSONS.md`.

### 7.2 A migration that fails halfway

1. Turn on maintenance mode (7.8) so no player writes while you look.
2. `supabase db push` runs each file in its own transaction where it can, so a file that failed has normally left nothing of itself. Check which files ran: `select version from supabase_migrations.schema_migrations order by version desc limit 5;`
3. Fix the cause in a **new** file only if the failed file never ran. If a file partly ran (some statements cannot run in a transaction), write a new migration that finishes or reverses what it did.
4. If the database is damaged, restore from the backup taken before (section 3.2) into a new project, check it (3.3), then point the site at it.
5. Turn maintenance mode off and do the checks in 1.2.

### 7.3 Stripe webhook failures

Signs: a player paid but has nothing; Stripe's dashboard (Developers, Webhooks, the endpoint) shows failed deliveries.

1. Check `STRIPE_WEBHOOK_SECRET` is the signing secret of **this** endpoint and of the same mode (test or live) as `STRIPE_SECRET_KEY`. A mismatch fails every event.
2. Check the endpoint address is `https://<GG_SITE_URL>/api/billing/webhook` and it sends the seven events listed in `docs/DEVELOPMENT_LOG.md` ("m5.2 Purchases").
3. Stripe retries failed deliveries by itself for some days. Once fixed, use "Resend" on the failed events in Stripe's dashboard. The game records each event id once (`stripe_events`), so resending is safe.
4. A refund that arrived before its payment waits as an unfinished event and settles when the payment event comes.
5. `/admin/purchases` shows each purchase's state.

### 7.4 Push or email sending failing

1. `/admin/notifications` shows failed counts. Vercel logs show `failed route=notify-...` lines with a reason code.
2. Push: check the VAPID pair has not changed. A push service host that is not on the allow-list is refused by design.
3. Email: check `RESEND_API_KEY`, `NOTIFY_FROM_ADDRESS` and that the domain still shows "Verified" in Resend.
4. The sender retries at 1, 5 and 30 minutes and 2 hours, at most 5 tries, and drops anything 12 hours old. Nothing builds up for ever. The inbox in the game always has the message.
5. If the sender is not running at all, check the scheduler (section 6) and `CRON_SECRET`.

### 7.5 The weather or price feed goes stale

1. Signs: the `daily_counts` table counts `night_weather_fallback` or `night_price_fallback` going up; the farm diary says "Weather data was not available for ...".
2. **Nothing stops.** A night never waits: it uses the district's long-term average weather and carries the last price forward, and says so in the diary. A night already run is never run again with the late data.
3. Check `GG_DAILY_FEED=live` and `SILO_CONTACT_EMAIL` are set. Check SILO and MLA are up (their own sites). MLA often has no prices over the Christmas break; that is expected.
4. When the feed is back, the next rollover fetches what is missing.

### 7.6 A leaked secret

Rotate in this order (most damage first). After each, update Vercel and redeploy.

1. `SUPABASE_SECRET_KEY` (passes every access rule): in Supabase, API keys, make a new secret key, set it in Vercel, redeploy, then revoke the old one.
2. `SUPABASE_DB_POOLER_URL` and `SUPABASE_DB_URL` (hold the database password): in Supabase, Database settings, reset the database password, update both, redeploy.
3. `STRIPE_SECRET_KEY`: in Stripe, roll the key, update, redeploy. Then `STRIPE_WEBHOOK_SECRET`: roll the endpoint's signing secret, update, redeploy.
4. `CRON_SECRET`: make a new one (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`), update Vercel, and update the Vault secret `gg_cron_secret` if pg_cron is used.
5. `RESEND_API_KEY`: delete the key in Resend, make a new one.
6. `NOTIFY_TOKEN_SECRET`: new value. Unsubscribe links already sent stop working (the settings page still works).
7. `VAPID_PRIVATE_KEY` (with its public key): a new pair stops every saved device; players turn notifications on again. Only rotate if the private key leaked.
8. `BAN_HASH_PEPPER`: a new value makes every ban record stop matching and every ad impression token invalid. Read docs/DATABASE.md ("The ban list") before rotating, and only if it leaked.
9. `SENTRY_DSN`: in Sentry, revoke the client key and make a new one. A DSN only lets someone send events, not read them.
10. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is public by design and does not need rotating for a leak.

Then look in `/admin/audit` and the Supabase logs for anything done with the old keys.

### 7.7 A moderation emergency

1. Remove the content from `/admin/moderation` (it is kept for the record, hidden from players).
2. Suspend or ban the account from `/admin/users`. A ban also ends their sessions.
3. If it is spreading: turn off `feed_posts` (no new posts) or `community` (the whole community is hidden) in `/admin/switches`.
4. If the whole game must stop: turn on `maintenance_mode` (7.8).

### 7.8 Maintenance mode

In `/admin/switches`, choose one of the three fixed wordings for `maintenance_mode`, then turn it on. Players see exactly one of these (no free text can reach them):

- **Short:** "The game is down for maintenance. Your farm is safe."
- **Updating:** "The game is down for maintenance. Your farm is safe. We are updating the game and it will be back soon."
- **Longer job:** "The game is down for maintenance. Your farm is safe. This one takes a while, so please try again later today."

While it is on, players can look at their farm but can not change it; an admin can. A save already under way finishes whole.

### 7.9 A privacy request

- **A copy of their data:** the player can download it themselves from `/account` ("Download my data", `/api/account/data`). If they can not sign in, an admin can find the account in `/admin/users` and the data in the Supabase tables named in docs/DATABASE.md ("Download my data"). Send it only to the account's own address.
- **Deletion:** the player deletes their account from `/account` (it asks them to type to confirm). It removes their profile, private details, farms, saves, posts, comments, likes, follows, notifications, push devices and photos; leaderboard rows stay as "Former player"; purchases stay with no account (business records). If they can not sign in, check who they are, then delete the Auth user in the Supabase dashboard (Authentication, Users): the same database trigger does the rest, but the Storage files are only removed by the in-game delete, so remove that user's folders from the photo buckets by hand.
- Record the date of each request and when it was done.
