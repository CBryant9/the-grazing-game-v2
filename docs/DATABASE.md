# The database

Supabase (Postgres) for accounts, farms, the community, ads and purchases. Built in milestone 3.1 (the database half). Everything is in `supabase/`:

| Path | What it is |
|---|---|
| `supabase/migrations/` | The tables, access rules, guards, server functions, views, storage buckets, reference data and scheduled jobs, applied in name order |
| `supabase/seed.sql` | Test accounts and sample rows for local work, previews and the tests. Never run on production |
| `packages/db/` | The tests, run by `pnpm test` on PGlite (Postgres in WASM). Never imported by the app |

## The rules in one page

1. **Row level security is on for every table**, from the moment it is made. A table with no policy gives nothing to anyone but the server.
2. **Nothing is granted to the browser roles by default.** `anon` (a visitor) and `authenticated` (a signed-in player) get a table only where a migration grants it, often column by column. The server uses `service_role`, which Supabase lets past row level security.
3. **A player reads and changes only their own rows.** Other people's rows come only through the community rules or the three column-safe views.
4. **Private fields live where no one else can reach them.** Date of birth is in `account_private` (only the player, not even an admin). Email is only in `auth.users` (no browser role can read it). Role and bans are in `account_status` (the player and admins read; only the server writes). Hidden columns (challenge seeds, group invite codes, moderator notes, Stripe ids, switch notes) are left out of the column grants.
5. **The engine's save is server only.** `farm_saves` and `farm_actions` have no grant to any browser role, so not even the farm's owner can read them (PRD 5.16). Weather and price data are server only too. The browser gets the view the server builds.
6. **No community under 16, enforced in the rules** (PRD 8.3). Every community rule asks `app.can_use_community()`, which is true only for an account with a profile, aged 16 or more today (Sydney date), not banned or suspended, with the community switch (and the part's own switch) on. It opens on the 16th birthday by itself: nothing has to run.
7. **Blocks hide both ways**, in every community rule and in the views.
8. **Leaderboards and scores are written by the server only.** Players read them through `leaderboard_rows`.
9. **Admin-only data is read by role; every admin change goes through the server**, which checks the role on each request and writes the audit log. The audit log is append only, for the server too.
10. **Security definer functions** sit in the `app` schema (not exposed by the Data API) or, for the few the browser or server calls, in `public` with an exact grant. Every one sets `search_path = ''`. The browser roles may run only the `app` helpers a policy, view or storage rule calls (`20261114001500_app_grants.sql`). Policies run their helpers with the caller's rights, so these need execute; each one that takes another person's id answers only what the caller may know (`blocked_between` answers only when the caller is one of the two, `is_member` says nothing to a visitor or an under-16 account, `is_group_member` and `is_group_owner` answer only about the caller, `post_author` names the author only to someone who may see the post). The raw forms that answer about anyone, the rate limiter and the farm limit are server only. Keep `app` out of the Data API's exposed schemas.
11. **A photo is approved by its file, not its name.** Only `approve_photo()` (server only) can approve, given the id, change time and version of the file the image check actually read; if the file at the path is not that file now, nothing is approved. A bare change of status to approved is refused for every role. The row records the exact file. Others read a photo only when the row they may see still points at that file. Changing the path, or adding, changing or removing the file, sends the row back to pending. Avatars and group photos follow the same rule and must sit in their owner's (or group's) folder.
12. **An anonymous sign-in counts as not signed in.** Every rule asks `app.uid()`, which is null for a token with `is_anonymous` set. Anonymous sign-ins must also stay off in the project settings.

## Tables and who can do what

S = select, I = insert, U = update, D = delete. "Server" is `service_role`. The full matrix, every table against every kind of caller, is `packages/db/src/matrix.ts`, and each cell is a test.

### Accounts

| Table | Holds | Player | Others | Admin |
|---|---|---|---|---|
| `profiles` | Username, names, bio, town, district, farming answers, privacy settings | S, U own (not via insert: `complete_sign_up`) | Through `public_profiles` only | S |
| `account_private` | Date of birth, hide ticker, marketing, terms accepted | S own, U own settings (never the date of birth) | Never | Never |
| `account_status` | Role (player, moderator, admin), suspension, ban | S own | Never | S all |
| `profile_links`, `profile_experience`, `profile_education`, `farm_showcase_photos` | Profile extras (9.1) | S, I, U, D own while in the community | S when the profile's details are visible; showcase photos only once approved | S |
| `guest_sessions` | Guest cookie hashes | Server only | | |
| `signup_refusals` | Sign-ins refused as under 14, so they can't retry with an older date | Server only | | |
| `ban_records` | A running ban that outlived its account: a peppered hash of the sign-in email and an end date, nothing else | Server only | | |
| `signup_email_checks` | The peppered hash of each sign-in's email, recorded by the server before sign-up | Server only | | |
| `deletion_tokens` | The server has done what deleting an account needs (a running ban's hash) | Server only | | |
| `farm_limits` | Farms at once by tier and mode (PRD 5.5) | S | S (visitors too) | S |

### Game

| Table | Holds | Player | Admin |
|---|---|---|---|
| `farms` | Each farm: mode, setup summary, status, day, engine version, the Daily Farm clock | S own | S |
| `farm_saves` | The engine's save, the setup, the stored format, save format, engine and data versions, the farm version, recent act requests, inbox read mark, the pay days missed (`missed_wages`, m3.2) | **Server only** | Server only |
| `farm_days` | One row per day: the diary lines, daylight, time used, rain, a summary | S own | |
| `farm_snapshots` | The index of the days that have a picture kept (day, date). The picture is in `farm_snapshot_views` | S own |
| `farm_snapshot_views` (m3.2) | The map and paddock figures of each past day, as the server built them, gzipped (`view_gz`). **Server only**, because it is game data the browser must only get through the server | Server only |
| `farm_saves_aside` (m3.2) | A save that could not be opened, kept when "Start a new farm" removes the farm. Goes with its owner, and after 30 days. **Server only** | Server only | |
| `farm_actions` | Every job and skip, in order (PRD 14.5) | **Server only** | Server only |
| `farm_scores` | A farm's scores | S own | S |
| `challenges` | Fast Farm challenges and Daily leagues | S public ones (visitors too) and your groups' ones, never the seed | S |
| `challenge_entries` | Which farm is in which challenge | S own | S |
| `leaderboard_entries` | Board rows by board, mode, district, size, start, enterprise, period and real year | Through `leaderboard_rows` only | Server writes |

### Community (all behind the community switch, none under 16)

| Table | Player may | Others see it when |
|---|---|---|
| `follows` | Follow a member (status set for them: accepted for a public profile, pending for followers-only, refused for private); accept a request made to them; unfollow or remove a follower | Either side is them, or both profiles are visible to them |
| `blocks` | Block and unblock | Never: only the blocker sees a block. A block removes follows both ways |
| `groups` | Make one (they become owner), change or delete their own. A group whose owner was deleted with no member able to take over has no owner: members can read, post and leave; nobody can change it, invite or remove members until an admin gives it an owner (`assign_group_owner`) | Public group: any member. Private: its members |
| `group_members` | Join through `join_group()` (code for private, member limit); leave; an owner removes members; hand over with `hand_over_group()` | They can see the group |
| `posts` | Write plain posts (share cards and day cards come from the server), edit and delete their own | Public, or followers only and they follow, or in a group they are in; not removed; no block |
| `post_photos` | Add to their own posts (status always starts pending); delete | The post is visible and the photo has passed the image check |
| `comments` | Comment on a visible post (one level of replies), edit and delete their own | The post is visible, no block |
| `likes` | Like a visible post or comment; unlike | The thing liked is visible, no block |
| `activity_events` | Nothing (the server writes the ticker) | The actor is 16+, has ticker activity on, the ticker switch is on, no block |
| `reports` | Report anything; see the state of their own reports (never the moderator's notes) | Staff only |
| `moderation_actions`, `word_filter` | Nothing | Staff read; the server writes |

### System, notifications, data and money

| Table | Player | Visitor | Admin |
|---|---|---|---|
| `feature_switches` | S key and state | S key and state | S; the server writes |
| `site_settings` | S public rows | S public rows | S all |
| `admin_audit_log` | | | S. Nobody changes or removes a row. It outlives deleted accounts, so every column takes a fixed shape with no free text: an action name (lower case and underscores), a target kind and id (letters, digits, dashes), and details whose only keys are `switch_key`, `slot_id`, `enabled`, `count`, `value`, `role`, `until` and `ids` (a list of account or row ids), each with a fixed type. Anything else is refused. It can still name an account by its id, which is how an admin action is traced |
| `push_service_hosts` | Server only: the web push services a subscription may point at, each with the vendor page it was read from | | |
| `rate_limit_rules`, `rate_limit_hits` | Server only | | |
| `notifications` | S own, mark read (only `read_at`), D own. The server writes. `dedupe_key` (one row for each account and key) and `show_in_inbox` (false for a record that a reminder was dropped, so it is not tried again) are the server's | | |
| `notification_sends` | Server only: one row for each notification and channel (push or email) with its state, attempts, when to try next and a fixed reason code (milestone 3.4) | | |
| `notification_settings`, `notification_prefs` | Everything on own rows | | |
| `push_subscriptions` | S, I, D own; the endpoint must be on a host in `push_service_hosts`. Any other host is refused with an error whose message starts `push_host_not_allowed:` (hint `push_host_not_allowed`), for the screens to word ("Notifications aren't available in this browser yet"). Chrome (`fcm.googleapis.com`) and Edge (`notify.windows.com` and its subdomains) were added in milestone 3.4, each with its vendor page | | |
| `weather_daily`, `price_daily` | Server only (engine data) | | |
| `daily_counts` | | | S |
| `ad_slots` | S (id, on or off, settings) | S | S |
| `sponsors`, `campaigns`, `ad_creatives`, `campaign_slots`, `ad_events`, `ad_daily` | | | S. The server picks the ad and logs views |
| `products` | S active ones | S active ones | S all |
| `purchases` | S own (not the Stripe ids) | | S |
| `account_entitlements` | S own | | S |
| `stripe_customers`, `stripe_events` | Server only. A Stripe event keeps its id, type and the Stripe ids the server needs, never the raw payload (a Checkout event carries the buyer's email and name) | | |

### Views

They run with their owner's rights on purpose, pick safe columns only and filter every row with the same helpers as the rules. `security_barrier` is on.

| View | Who | Shows |
|---|---|---|
| `public_profiles` | Signed in | A member's card (username, display name, district, and the photo once it is checked) to other members with no block between them. The details only when privacy allows. Never an under-16 account |
| `leaderboard_rows` | Anyone, while the leaderboards switch is on | Board rows. Under 16, or a private profile: username and district only (no photo, no account id, no farm name). A deleted, banned or suspended account shows as "Former player". Rows across a block left out |
| `public_farms` | Signed in | Daily Farms the viewer may look at, by the owner's farm view setting, with farm viewing on |

The Supabase database linter flags owner-rights views (lint 0010). That is expected for these three and only these three.

## Server functions

| Function | Who calls it | What it does |
|---|---|---|
| `complete_sign_up(username, date_of_birth, display_name)` | A signed-in player with no profile | Needs the server to have recorded the sign-in's email hash first (`record_signup_email`), then checks running bans, sign-ups are open, the date of birth, 14 or over, a rate limit and the word filter. Makes the profile, private row, status row and notification settings, and returns `signed_up`. Under 14 it returns `too_young` and records the refusal, so the same sign-in can't try again with an older date. A fresh email address is a fresh sign-in and does get a fresh try: the database can't tell it is the same person. Refuses an anonymous session |
| `my_farm_limits()` | Player | Limit and farms going, by mode |
| `join_group`, `group_invite_code`, `hand_over_group` | Player | Groups (9.6) |
| `export_my_data()` | Player | Everything kept about them, as JSON, except the engine save and the action log (they hold the hidden rules) |
| `farm_limit`, `convert_guest` | Server | Farm limits; a guest's farms moving into an account |
| `daily_days_owed`, `daily_claim_due`, `daily_finish`, `change_farm_timezone` | Server (the rollover) | The Daily Farm clock, below |
| `can_view_farm(viewer, farm)` | Server | Before it builds a farm view for someone else |
| `take_rate_limit(action, subject)` | Server | Rate limits for jobs, farm starts and the ticker |
| `account_storage_paths(user)` | Server | Every file to remove before deleting an account: each bucket's `<account id>/` folder (linked to a row or not), the farms' snapshots, and the photos of groups that go with the account |
| `rollup_ad_events(day)`, `prune_housekeeping()` | pg_cron, nightly | Ad roll-up; old rate-limit windows and stale guests |
| `record_signup_email(user, hash)` | Server, before sign-up | Records the peppered hash of the sign-in email |
| `prepare_account_deletion(user, hash)` | Server, before deleting an account | Keeps a running ban's record (hash and end only); the delete is refused for a banned or suspended account until this has run |
| `approve_photo(kind, row, object id, updated at, version)` | Server (the image check) | Approves a post photo, showcase photo, avatar or group photo, only if the file at its path is the exact file the check read |
| `assign_group_owner(admin, group, user)` | Server, for an admin | Gives an ownerless group an owner (16 or over, in good standing). Logged |
| `clear_signup_refusal(admin, user)` | Server, for an admin | The way back for an adult who mistyped their date of birth: clears that sign-in's under-14 refusal. Logged |
| `admin_sign_out_everywhere(admin, user)` (m3.5) | Server, for an admin | Ends every session of an account (`delete from auth.sessions`), and writes its audit row (`user_sign_out_all`) first in the same step. A security definer function because the sessions are in Supabase's `auth` schema |

Guards that hold for every writer, the server included: the farm limit (`farms_guard`, with a lock so two requests can't both squeeze in), a real time zone for a Daily Farm, the word filter on usernames, names, posts, comments and groups, follow approval, one level of replies, a block removing follows, photo status set only by the image check, rate limits on posts, comments, likes, follows, reports and new groups (tighter for an account under 7 days old).

### The Daily Farm clock

A farm's day D is simulated once its local date has passed D. `sim_through` is the last date simulated, so the days owed are `(local today - 1) - sim_through`, from the database's clock only.

- The rollover runs every 15 minutes (milestone 3.3), calls `daily_claim_due` for a batch, simulates, saves, then `daily_finish(farm, date)`.
- A claim older than 10 minutes counts as a run that died, so a missed or failed run is picked up next time with more days owed.
- `daily_finish` refuses a date that is not over yet in the farm's time zone, and never goes back. A wound-forward device clock can't give an extra day: no player-callable function takes a time.
- `change_farm_timezone`: once every 30 days. Moving to a zone already on a later date moves `sim_through` on by the same, so the farm waits instead of gaining a day.
- The functions that take a time (`p_now`) are server only. The server never passes one; the tests do.

## Guests

A guest plays one Fast Farm through a session the server makes (PRD 8.1, 5.16):

1. The server makes a random secret, puts it in an HTTP-only cookie, and keeps only its SHA-256 in `guest_sessions`.
2. The guest's farm is a `farms` row with `guest_session_id` set and `owner_id` empty. A guest gets 1 Fast Farm and no Daily Farm (`farm_limits`, and a check that a Daily Farm needs an account).
3. Guests never talk to the database. They have no Supabase session; the server reads and writes for them with the secret key.
4. When the guest makes an account, the server calls `convert_guest(session, user)`. The farm moves into the account (owner set, guest cleared) and the session is marked converted. If the account has no room in that mode, nothing moves and the server offers the choice.
5. A guest not seen for 30 days is removed with their farm (`prune_housekeeping`).

## The ban list

A ban or suspension still running when an account is deleted leaves a row in `ban_records`: an email hash and an end date, nothing else. Sign-up checks it.

- **The hash is made on the server, never in the database.** It is HMAC-SHA-256 of the normalised sign-in email, keyed with `BAN_HASH_PEPPER`, a secret kept only in the server's environment (never in the database, a backup or the repo). The database stores and compares the finished hash only. Without the pepper the list can't be tested against known emails, so a copy of the database or a backup gives nothing away.
- **Normalising** before hashing (the server's job, built in milestone 3.2 as `apps/web/server/auth/email.ts`, with tests): lower case and trim every address. For `gmail.com` and `googlemail.com`, treat the two domains as one and take the dots out of the name: Google's own help says both hold for personal Gmail (support.google.com/mail/answer/7436150 for dots, which does not apply to Google Workspace addresses; answer/10313 for googlemail.com). For Fastmail, drop a `+tag` from the name: Fastmail's help says mail to `alias+anything` reaches the same account (fastmail.help/hc/en-us/articles/360060591053). No other provider rule is applied yet. Google's page on plus addresses, and Microsoft's, Apple's and Yahoo's consumer pages, could not be found stating their rules, so a Gmail `+tag` or an Outlook alias still gets past the list until a provider page is found and the rule added.
- **Rotating the pepper** makes every existing ban record stop matching (the old hashes can't be recomputed without the emails). Rotate only if the pepper leaks, and accept that running bans on deleted accounts are lost; bans on accounts that still exist are unaffected.
- A different email address is a different sign-in and is not caught. The same holds for the under-14 refusal (`signup_refusals`, against the sign-in only); an admin can clear a refusal for an adult who mistyped (`clear_signup_refusal`).

## Deleting an account and downloading data

- **Download:** the player calls `export_my_data()`.
- **Delete:** the server lists the files with `account_storage_paths`, removes them from Storage, then deletes the Auth user (`auth.admin.deleteUser`). For a banned or suspended account the server first calls `prepare_account_deletion` with the peppered email hash (the delete is refused until it has). A trigger on `auth.users` then runs: each group the player owns goes to its longest-standing other member who is a community member in good standing (16 or over, not banned or suspended); if there are other members but none qualifies, the group stays with no owner (an admin can assign one); a group goes only when the player was its only member, so other members' posts are never deleted; what they wrote in reports is cleared; their Stripe customer id is cleared from Stripe events and their farm names from leaderboard rows. Reports other people wrote about the deleted player stay: they are the reporter's data and part of the moderation history. Then the cascades remove the profile, private rows, farms and saves (the action log goes with its farm), posts, comments, likes, follows, notifications, push devices and the moderation history. Leaderboard rows stay with no account, farm or farm name ("Former player"). Audit log rows stay with no admin (fixed shape, no free text). Purchases stay with no account (records for the accounts). Stripe events hold ids only.

## Storage

| Bucket | Public | Rules |
|---|---|---|
| `avatars` | No | The owner writes their own folder (named for their account id). Others read only the checked file, and only when they may find the profile, so never an under-16 photo |
| `group-photos` | No | The group's owner writes the group's folder (named for the group id). Others read only the checked file, when they may see the group |
| `post-photos` | No | The author uploads to their own folder while in the community. Others read a file only when a `post_photos` or showcase row they may see was approved on that exact file (its storage id and change time) |
| `snapshots` | No | Server only |
| `ad-media` | Yes | Server writes. Read by its public address so ads load fast. No SVG (a public SVG can carry script) |

A player can not change an avatar file in place (no update rule): a new photo is delete then upload, so it has a new id. A trigger on `storage.objects` sends a photo row back to pending whenever a file at its path is added, changed or removed. If a project will not let the migration role add that trigger, the migration warns and goes on; the id and change-time match still keeps a swapped file hidden. Re-running the bucket setup brings an existing bucket's limits and file types up to date.

## The tests

`pnpm test` runs `packages/db/src/*.test.ts` (480 tests, about a minute on this PC):

- `matrix.test.ts`: every table, as a visitor, player A, player B, the under-16 player, an admin and the server, for select, insert, update and delete. Each must pass or be refused exactly as `matrix.ts` says. Plus B trying to write each row as A.
- `coverage.test.ts`: fails if a table has row level security off or is missing from the matrix; checks what a visitor can read, that server-only tables have no browser grant, which functions each role can call, that every security definer function pins its search path, and that the switches, ad slots and farm limits match `packages/shared`.
- `rules.test.ts`: each private field, the save, leaderboards, the under-16 rule on every community table and view, blocks, follows, photos, the switches, farm viewing and storage.
- `functions.test.ts`: sign-up and the age rules, farm limits, guests, the Daily Farm clock, groups, deleting an account.
- `third.test.ts`: the second security review: the approval race, group handover, the peppered ban hash, notification links, the audit log shape, caller-bound helpers, data left after deletion, avatar files, push refusals. Each was written first and seen to fail before its fix.
- `review.test.ts`: each hole the first security review found, tried as the role that would attack it: photo swaps, avatar and group photo ownership, groups on deletion, pending follows, under-14 retries, banned accounts, removed posts, the data download, personal data after deletion, the moderator, ages on leap days and the Sydney date, push hosts, notification links, private profiles on the boards, anonymous sign-ins, bucket limits.

### What the tests stand on

PGlite runs real Postgres (version 18 in PGlite 0.5.13), so grants, row level security, triggers and functions behave as they will on Supabase. What Supabase supplies is stood in for, in the test folder only (`packages/db/src/stand-ins/supabase.sql`):

- the `anon`, `authenticated` and `service_role` roles (`service_role` skips row level security, as on Supabase);
- `auth.users`, and `auth.uid()`, `auth.role()` and `auth.jwt()` reading the request settings the way Supabase's own functions do;
- Supabase's default grants on `public` to all three roles, so the tests prove the migrations take them away;
- `storage.buckets`, `storage.objects` (row level security on) and `storage.foldername()`;
- a `cron` schema with `cron.schedule(name, schedule, command)`.

**The tests prove the rules on Postgres semantics. They do not prove Supabase's own services** (Auth, the Data API, Storage's HTTP layer). One run against a real Supabase project is still owed before launch (below).

## Applying the migrations to a real project

Claudia makes the project (BUILD_PLAN section 8). Then, from a machine with the Supabase CLI:

1. `supabase init` (once, makes `supabase/config.toml`), then `supabase link --project-ref <the project ref>`.
2. `supabase db push` applies every migration in `supabase/migrations` in order. Or `supabase db push --db-url "$SUPABASE_DB_URL"`.
3. For a local or preview database only: `supabase db reset` applies the migrations and then `supabase/seed.sql`. Never seed production.
4. In the dashboard: Data API exposes `public` only (the exposed schemas setting must never include `app`); **anonymous sign-ins must stay off** (Authentication, Sign In / Providers); turn on email link and Google sign-in.
5. Turn on the switches in admin (or `update public.feature_switches set enabled = true where key = '...'`) when each part is ready.

## What the server does itself (milestone 3.2)

Everything above that said "the server" is built in `apps/web/server`. The database store is `server/db/dbstore.ts`, written against a small SQL interface (`server/db/sql.ts`). The site runs it on a `pg` connection pool opened from `SUPABASE_DB_POOLER_URL`; the tests run the same store on PGlite with every statement as `service_role`. The Supabase JS client can not run SQL (it speaks to the Data API), so the server's own connection is how it reads and writes saves. The secret key is used only for Auth's admin calls (deleting a user) and Storage (removing files).

| Step | Where |
|---|---|
| Ban hash and email normalising | `server/auth/email.ts`: lower case and trim; gmail.com and googlemail.com one domain, dots dropped; `+tag` dropped at fastmail.com only. Sources as in "The ban list" |
| Sign-up | `server/auth/accounts.ts` `finishSignUp`: checks `signup_refusals` and `ban_records` first, then `record_signup_email(user, hash)`, then `complete_sign_up(username, date_of_birth, display_name)` as the player (`set local role authenticated` and the token's claims in one transaction). `too_young` is final for that sign-in |
| A guest's farm moves in | `convertGuest` calls `convert_guest(session, user)` with the guest session's id found by the cookie's SHA-256. With no room the farm limit guard refuses and nothing moves |
| Download my data | `myData` calls `export_my_data()` as the player |
| Delete my account | `deleteAccount`: `prepare_account_deletion(user, hash)` (always, the hash only matters for a running ban), `account_storage_paths(user)`, remove those files from Storage, then `auth.admin.deleteUser`. A failed step stops the rest, and the account is still there |
| Feature switches | `featureSwitches` reads `feature_switches` (cached 30 seconds) and falls back to the shared defaults if the database can not be read |
| Farm saves | `DbFarmStore`: a save is written in one transaction with the diary days it changed, the action log row and the picture of the new day. The write names the version it expects (`where farm_version = $expected`), so a second tab or server that loaded the same version changes nothing and is told the farm changed |
| Guests | A guest cookie lasts 30 days with the database (90 with files), renewed each time the farm is played, because `prune_housekeeping` removes a guest not seen for 30 days. Playing marks the session seen |
| Daily history | Every day for the last 14 days, then one a week back to 182 days (`pastKept`), written with the save, each picture gzipped (3.5 to 4.7 KB; 45 to 48 KB as JSON, measured on every district, size and enterprise). At most 38 pictures a farm: about 180 KB a farm, about 180 MB for 1,000 farms. The first design (90 days daily, weekly to 400) was 134 pictures, 630 MB gzipped for 1,000 farms, 6 GB raw. The file store keeps the last 14 days |
| Which guest reaches which farm | `guestAccess`: a guest key reads, writes and deletes only a farm whose `guest_session_id` is that session, which has not been converted. Once the farm moves into an account (or the session is converted) the old cookie gets "no farm" for everything. This is the store's own owner check; clearing the cookie is only tidiness. A guest session that moved is removed 30 days later by `prune_housekeeping` (migration `20261115000200`) |
| Role | Every statement runs inside a transaction that begins `set local role service_role` (`clientOnPool`), so the server has the service role's rights and not the pooler owner's. The tests run the same way |
| Saves name their version | `put` requires the version it expects (the interface and a runtime check). Making a farm is `create` |
| Token lifetime | Game routes identify a player with `getClaims()` (the token's signature, no round trip), so after "sign out everywhere" an access token still works on the game routes until it expires. Account routes (download, delete, finish sign-up) ask the auth server (`getUser()`) and refuse it at once. Keep the access token lifetime short: see the hand-set settings in the log |
| What is logged | Never an email address, token or link. A failure logs a fixed reason code (`send_link_failed`, `code_exchange_failed`, `sign_up_failed` with the SQLSTATE and so on) |
| Deleting a sign-in with no account | A sign-in that never finished sign-up (abandoned, or refused as under 14) deletes with the word `delete`. The under-14 refusal belongs to the sign-in and goes with it (cascade), as above. Signing up again with the same address is a fresh sign-in with a fresh try, which is what this document says the database can not tell apart

Daily Farm slots exist in the tables and the limits. No Daily Farm can be started from the game in this milestone: the setup flow makes Fast Farms only, whatever the switch says. It comes with the rollover (3.3).

## Still owed against a real Supabase project

1. Apply the migrations to a preview project and confirm each one runs: the `storage.buckets` insert, the policies on `storage.objects`, and `create extension pg_cron`.
2. Run the database linter (Advisors). Expected: lint 0010 on the three views and nothing else.
0. (m3.2) The server's own work, proven so far only against PGlite and a fake sign-in provider (`server/test-support/fakeAuth.ts`): the `pg` pooler connection and its `set local role` calls on Supabase's pooler (transaction mode allows `set local` inside a transaction), `@supabase/ssr` cookies (names, chunking, refresh), `getClaims()` on a real token, the emailed link (PKCE: it works only in the browser that asked), the Google round trip, `signOut` scopes, `auth.admin.deleteUser` with the trigger on `auth.users`, Storage removal, and two real connections racing on one save (PGlite has one connection, so the version check is proven but not parallel commits).
3. Repeat the access matrix through the real Data API with real tokens for test users (a small script in 3.2), including column grants (`select=*` fails on a table with column grants; the app must name its columns).
4. Confirm sign-in by emailed link and Google, the publishable and secret keys, and that anonymous sign-ins are off.
5. Confirm Storage enforces the bucket sizes and file types, and serve post photos and avatars through signed links.
6. Measure the rules at real volumes. The community rules call helper functions per row; leaderboard reads may want a materialised view (PRD 15) in 4.1.
7. Supabase runs Postgres 15 or 17; the tests run on 18. Nothing newer than 15 is used (`unique nulls not distinct` is 15).
8. Confirm the migration role may add the trigger on `storage.objects` and the trigger on `auth.users` (the migration warns if the Storage one is refused).
9. The Chrome and Edge push hosts are in `push_service_hosts` from migration `20261115000800` (3.4), each with its vendor page. Once keys are set, check that a real Chrome (`fcm.googleapis.com`) and a real Edge (`wns2-*.notify.windows.com`) subscription is accepted: the vendor pages name the domains, not every address a browser can be given.

## What the server does for the admin screens (milestone 3.5)

Code: `apps/web/server/admin/`. The pages are in `apps/web/app/admin`, the write routes in `apps/web/app/api/admin`. Migration `20261115000300_admin_tools.sql`.

| Step | Where |
|---|---|
| The role check | `gate.ts`. A route: the provider's `user()` (asks the auth server, and may refresh an expired session, so the route sends every cookie the provider set back on its answer). A page: `verify()`, which checks the access token alone and never refreshes (an expired token is "not an admin"). Then one query on `account_status`: role `admin`, not banned, not suspended, finished profile. Nothing the browser sends is read. A database that can not be read means "not an admin" |
| First admin | A one-off statement in the Supabase SQL editor (see the "m3.5 Admin shell" log entry). There is no public route or environment variable that makes an admin |
| Every write | One transaction (the server's `service_role` client): the change, then one `admin_audit_log` row in its fixed shape. A failed audit write rolls the change back. Two actions use the database's own functions, which write their own row first: `clear_signup_refusal` and `admin_sign_out_everywhere` (`user_sign_out_all`) |
| Audit actions | `switch_set` (details `switch_key`, `enabled`), `setting_set` (target `site_setting`; details `count` for a text length or district count, or `value` for the place of a wording in the list; never the words), `user_suspend` (`until`), `user_ban`, `user_lift`, `user_set_role` (`role`), `user_sign_out_all`, `clear_signup_refusal`. Target kind `account`, `feature_switch` or `site_setting`, with the id or key |
| Feature switches | Read by `featureSwitches` (30 second cache per server). An admin's change clears the cache on the server that made it and shows on the others within 30 seconds. A switch with no row uses the shared default. The screen lists exactly the keys in `FEATURE_SWITCHES`, and `feature_switches.updated_by` is who changed it last. Ad slots are not in `feature_switches` (they have their own table and come with the Ads milestone) |
| Site settings | `announcement`, `districts_available`, `community_rules` (public) and `maintenance_wording` (not public), each parsed on the server (`settings.ts`) |
| Maintenance mode | The `maintenance_mode` switch. While on, the game is read only: a game route that changes the farm is refused for everyone but an admin in good standing (503, code `maintenance`, one of three fixed wordings chosen by id); reading routes answer as usual with the header `x-game-maintenance: <id>`, which the play screen turns into the message and held-off buttons. A row holding anything but a listed id gives the default wording |
| Users | `searchUsers` by id (exact) or username (exact or prefix, two characters or more, wildcards escaped), never by email. `userDetail` works out "under 16" inside the query and returns only yes or no. An admin can not read a date of birth or an email address. `last seen` is the latest `farms.last_opened_at` |
| Bans | `user_ban` sets `banned_at`, ends the target's sessions (`app.end_sessions`, inside a savepoint so a refusal does not undo the ban; the audit row's `count` is how many ended) and, when the provider can give the sign-in email, writes the same peppered hash `prepare_account_deletion` writes into `ban_records` (no end date). The audit row's `value` says whether that record was written. With no hash the ban still applies and the screen says it will not survive a delete and fresh sign-up. `user_lift` of a ban is refused (409) when the hash can not be made, so no record is left behind; lifting a suspension never needs it. `user_suspend` also ends sessions |
| The last admin | The server refuses (with the admin rows locked) to suspend, ban or demote the last admin in good standing, and an admin can not suspend, ban or change the role of their own account. The trigger `account_status_keep_one_admin` refuses any update of `role` that would leave no admin, whoever writes (making an admin is never refused). Deleting an account is not covered by the trigger |
| Dashboard | Counts read from the database with the database's clock: profiles, guest sessions not yet moved into an account, farms by mode and status, farms with a save since midnight Sydney time and in the last seven days (`farm_saves.updated_at`), and `farm_saves_aside` as "saves failing" |

Second pass (migration `20261115000500_admin_fixes.sql`): `app.is_admin_user` and `app.is_staff` now mean *in good standing* (role, not banned, not suspended), so a banned or suspended admin or moderator reads nothing admin-only through their own token (`account_status` beyond their own row, the audit log, private site settings, moderation actions; `packages/db/src/adminfixes.test.ts`). The last-admin trigger counts only admins in good standing and also fires on `banned_at` and `suspended_until`. `app.end_sessions(user)` (server only) deletes `auth.sessions`. `profiles_username_prefix` is a `text_pattern_ops` index on `lower(username)` for the admin search. The table access matrix is unchanged (no new table). What a banned or suspended account can and can not do today: it can not use the community, sign up again (a ban, by hash), or open admin, and its sessions end when it is banned or suspended (an access token already issued still works on the game routes until it runs out). It *can* sign in again and play its own farm, because the game routes do not check status: that is a call for Claudia.

Still owed against a real project (added to the list above): `app.end_sessions` and `admin_sign_out_everywhere` deleting from `auth.sessions` as the function owner (a refusal gives the admin a plain message to do it in the Supabase dashboard), the `verify()` cookie reading against a real `@supabase/ssr` cookie (one cookie and chunked),

## What the server does for notifications (milestone 3.4)

Code: `apps/web/server/notify/`. Migration `20261115000800_notify_queue.sql` (the only one). The tests: `apps/web/server/notify/*.test.ts` and `packages/db/src/notify.test.ts`.

| Part | What it does |
|---|---|
| `queueNotification` (queue.ts) | The one way a notification is made. Writes the inbox row (`notifications`) and the sends it needs (`notification_sends`) in one transaction. The contract is in the file's comment: user, kind, title, body, link, farm, dedupe key. It answers `queued`, `duplicate` or `skipped` with a reason, and never throws for something expected |
| Rules it applies | The wording net (no exclamation marks, guilt, streaks, countdowns, praise or money), the database's link rule, community types never for under 16 or restricted accounts or while the community switch is off, the player's push and email switches, quiet hours in the farm's time zone, the evening warning once a day and never after the farm was opened |
| Quiet hours | A reminder or evening warning inside them is **dropped** (`dropped`, `quiet_hours`). Anything else is **held** until they end (`held`, `not_before`). The inbox row is always made, except for a dropped reminder, which is recorded with `show_in_inbox = false` so it is not tried again |
| Email | Only a fallback: sent when the player has no working device, or when push failed for good. The email row waits (`held`, reason `push_first`, `not_before = infinity`) until push settles |
| Sender (sender.ts) | Claims due rows in one statement (`for update skip locked`; a stale `sending` row is taken again after 5 minutes), within a time budget. One failing row never stops the rest. Retries at 1 minute, 5, 30 and 2 hours (or the service's Retry-After), at most 5 attempts. A cap of 6 notifications a day for an account. Anything stale for 12 hours is dropped. The player's switches and quiet hours are checked again at the moment of sending, and the allow-list again before each push |
| Devices | Saved through the database's rules (`push_host_not_allowed`), up to 10 for an account. The same browser signing in as someone else moves the device. A device the push service calls gone (404, 410) is deleted. Signing out here removes this browser's device (the page does it before signing out), signing out everywhere removes all of them, and deleting the account cascades |
| Reasons recorded | Only fixed codes, such as `quiet_hours`, `daily_cap`, `expired`, `type_off`, `account_restricted`, `push_gone`, `push_rejected`, `push_auth_rejected`, `push_too_large`, `push_host_not_allowed`, `no_device`, `no_email`, `mail_rejected`, `mail_auth_rejected`, `retries_exhausted`, `send_error`, `push_not_set_up`, `email_not_set_up`, `push_sent`, `push_first` |
| Pause | `site_settings` key `notify_paused` (`{"paused": true}`), set from `/admin/notifications` and audited (`notify_pause_set`) in the same transaction |
| Housekeeping | The sender route removes finished send rows older than 30 days |

Routes (every file is walked by `routes.test.ts`): `/api/notify/state`, `inbox`, `prefs`, `settings`, `off`, `subscribe`, `unsubscribe` and `read` (signed in, the CSRF rule on writes, a limit for each session); `/api/notify/send` (the scheduler, `Authorization: Bearer <CRON_SECRET>`, a constant-time compare, 404 to anyone else); `/api/notify/u` (the email unsubscribe link: no sign-in, an encrypted expiring token); `/api/admin/notifications` (admin gate, audited).

The unsubscribe token is AES-256-GCM with a key made from `NOTIFY_TOKEN_SECRET`. It reveals nothing, a change anywhere fails it, it expires after 60 days, and it can only turn off one type's email for one account. It changes the setting only if the player has not touched that setting since the email was made, so an old link can never undo a later choice. Opening the link (GET) changes nothing, because mail scanners open links. The button, or the one-click POST that mail providers send, does the change.

Not proved by the tests, and owed against real services: Resend's own behaviour (delivery, DKIM, its limits), each real push service (Apple, Mozilla, Chrome and Edge) answering a real VAPID request, and a real phone showing the notification.
