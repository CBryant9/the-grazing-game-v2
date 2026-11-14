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
10. **Security definer functions** sit in the `app` schema (not exposed by the Data API) or, for the few the browser or server calls, in `public` with an exact grant. Every one sets `search_path = ''`.

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
| `farm_limits` | Farms at once by tier and mode (PRD 5.5) | S | S (visitors too) | S |

### Game

| Table | Holds | Player | Admin |
|---|---|---|---|
| `farms` | Each farm: mode, setup summary, status, day, engine version, the Daily Farm clock | S own | S |
| `farm_saves` | The engine's save, the setup, the stored format, save format, engine and data versions, the farm version, recent act requests, inbox read mark | **Server only** | Server only |
| `farm_days` | One row per day: the diary lines, daylight, time used, rain, a summary | S own | |
| `farm_snapshots` | Where the map of a past day is kept in Storage | S own | |
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
| `groups` | Make one (they become owner), change or delete their own | Public group: any member. Private: its members |
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
| `admin_audit_log` | | | S. Nobody changes or removes a row |
| `rate_limit_rules`, `rate_limit_hits` | Server only | | |
| `notifications` | S own, mark read, D own | | |
| `notification_settings`, `notification_prefs` | Everything on own rows | | |
| `push_subscriptions` | S, I, D own | | |
| `weather_daily`, `price_daily` | Server only (engine data) | | |
| `daily_counts` | | | S |
| `ad_slots` | S (id, on or off, settings) | S | S |
| `sponsors`, `campaigns`, `ad_creatives`, `campaign_slots`, `ad_events`, `ad_daily` | | | S. The server picks the ad and logs views |
| `products` | S active ones | S active ones | S all |
| `purchases` | S own (not the Stripe ids) | | S |
| `account_entitlements` | S own | | S |
| `stripe_customers`, `stripe_events` | Server only | | |

### Views

They run with their owner's rights on purpose, pick safe columns only and filter every row with the same helpers as the rules. `security_barrier` is on.

| View | Who | Shows |
|---|---|---|
| `public_profiles` | Signed in | A member's card (username, display name, photo, district) to other members with no block between them. The details only when privacy allows. Never an under-16 account |
| `leaderboard_rows` | Anyone, while the leaderboards switch is on | Board rows. Under 16: username and district only (no photo, no profile link, no farm name). Rows across a block left out. A deleted account shows as "Former player" |
| `public_farms` | Signed in | Daily Farms the viewer may look at, by the owner's farm view setting, with farm viewing on |

The Supabase database linter flags owner-rights views (lint 0010). That is expected for these three and only these three.

## Server functions

| Function | Who calls it | What it does |
|---|---|---|
| `complete_sign_up(username, date_of_birth, display_name)` | A signed-in player with no profile | Checks sign-ups are open, the date of birth, 14 or over, a rate limit and the word filter. Makes the profile, private row, status row and notification settings. Refuses an anonymous session |
| `my_farm_limits()` | Player | Limit and farms going, by mode |
| `join_group`, `group_invite_code`, `hand_over_group` | Player | Groups (9.6) |
| `export_my_data()` | Player | Everything kept about them, as JSON, except the engine save and the action log (they hold the hidden rules) |
| `farm_limit`, `convert_guest` | Server | Farm limits; a guest's farms moving into an account |
| `daily_days_owed`, `daily_claim_due`, `daily_finish`, `change_farm_timezone` | Server (the rollover) | The Daily Farm clock, below |
| `can_view_farm(viewer, farm)` | Server | Before it builds a farm view for someone else |
| `take_rate_limit(action, subject)` | Server | Rate limits for jobs, farm starts and the ticker |
| `account_storage_paths(user)` | Server | Files to remove before deleting an account |
| `rollup_ad_events(day)`, `prune_housekeeping()` | pg_cron, nightly | Ad roll-up; old rate-limit windows and stale guests |

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

## Deleting an account and downloading data

- **Download:** the player calls `export_my_data()`.
- **Delete:** the server lists the files with `account_storage_paths`, removes them from Storage, then deletes the Auth user (`auth.admin.deleteUser`). The cascades remove the profile, private rows, farms and saves, posts, comments, likes, follows, groups they own, notifications and push devices. Leaderboard rows stay with no account and no farm ("Former player"). Audit log rows stay with no admin. Purchases stay with no account (records for the accounts).

## Storage

| Bucket | Public | Rules |
|---|---|---|
| `avatars` | No | The owner writes their own folder (named for their account id). Others read when they may find the profile, so never an under-16 photo |
| `post-photos` | No | The author uploads to their own folder while in the community. Others read a file only through a `post_photos` or showcase row they may see, which is only once it is approved |
| `snapshots` | No | Server only |
| `ad-media` | Yes | Server writes. Read by its public address so ads load fast |

## The tests

`pnpm test` runs `packages/db/src/*.test.ts` (about 390 tests, about 20 seconds):

- `matrix.test.ts`: every table, as a visitor, player A, player B, the under-16 player, an admin and the server, for select, insert, update and delete. Each must pass or be refused exactly as `matrix.ts` says. Plus B trying to write each row as A.
- `coverage.test.ts`: fails if a table has row level security off or is missing from the matrix; checks what a visitor can read, that server-only tables have no browser grant, which functions each role can call, that every security definer function pins its search path, and that the switches, ad slots and farm limits match `packages/shared`.
- `rules.test.ts`: each private field, the save, leaderboards, the under-16 rule on every community table and view, blocks, follows, photos, the switches, farm viewing and storage.
- `functions.test.ts`: sign-up and the age rules, farm limits, guests, the Daily Farm clock, groups, deleting an account.

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
4. In the dashboard: Data API exposes `public` only (not `app`); anonymous sign-ins stay off; turn on email link and Google sign-in.
5. Turn on the switches in admin (or `update public.feature_switches set enabled = true where key = '...'`) when each part is ready.

## Still owed against a real Supabase project

1. Apply the migrations to a preview project and confirm each one runs: the `storage.buckets` insert, the policies on `storage.objects`, and `create extension pg_cron`.
2. Run the database linter (Advisors). Expected: lint 0010 on the three views and nothing else.
3. Repeat the access matrix through the real Data API with real tokens for test users (a small script in 3.2), including column grants (`select=*` fails on a table with column grants; the app must name its columns).
4. Confirm sign-in by emailed link and Google, the publishable and secret keys, and that anonymous sign-ins are off.
5. Confirm Storage enforces the bucket sizes and file types, and serve post photos and avatars through signed links.
6. Measure the rules at real volumes. The community rules call helper functions per row; leaderboard reads may want a materialised view (PRD 15) in 4.1.
7. Supabase runs Postgres 15 or 17; the tests run on 18. Nothing newer than 15 is used (`unique nulls not distinct` is 15).
