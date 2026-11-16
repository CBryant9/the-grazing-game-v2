# Go live: version 1, step by step

Written 16 Nov 2026 for Claudia. Your setup: a paid Vercel account (Pro), the free Supabase plan, and Infisical to hold the keys and push them into Vercel.

This is the short path. Each step points to the part of `docs/SETUP.md` that has more detail. Do the steps in order. After each one, do the "Check" before you move on.

Never paste a key into a chat, an email or a file in the repo. Keys go in Infisical (and your password manager). Infisical sends them to Vercel.

Where this guide says **check the screen**, the step could not be confirmed against the service's own help page. The service may have moved a button. Look at the linked page and the screen in front of you.

---

## Where the game is up to

- The game is built. All the work is on the branch `m7-final`. `main` still holds only the spec, so a deploy from `main` today would show nothing.
- This session's branch, `claude/blissful-ride-f85ugc`, is `m7-final` plus the fixes from 16 Nov (see the end of this file).
- Checks on 16 Nov, on this branch: type check, lint, all 4,351 tests (22 expected fails are marked as such), the speed test (2.96 ms a day with 4,890 head), the production build, the hidden-rules check and the script size budget all pass.
- With no keys the game already plays as a guest. The keys turn on accounts, saved farms online, Daily Farm and the admin area.

What you need before you start: a computer with Git, Node.js 24 and pnpm (`docs/SETUP.md` part 0), about two hours, and your password manager.

---

## Step 1. Put the finished game on `main`

Vercel builds the live site from `main`.

1. On GitHub, open the repo `CBryant9/the-grazing-game-v2` and open a pull request from `claude/blissful-ride-f85ugc` into `main`. Or ask Claude to open it.
2. Wait for the CI check to go green. CI runs the type check, lint, tests, build and Lighthouse. This is the first time CI has run on this work, so read it if anything is red.
3. Merge it.

Check: `main` on GitHub now has the folders `apps`, `packages` and `supabase`.

---

## Step 2. Make the Supabase project (free plan)

Detail: `docs/SETUP.md` part 3.1.

1. At <https://supabase.com/dashboard> make a new project. Region: **Sydney** (ap-southeast-2). Plan: Free.
2. Choose a database password. Save it in your password manager now. You cannot read it back later.
3. Collect these and save each in your password manager:
   - the **project URL** (`https://<ref>.supabase.co`)
   - the **publishable key** (older projects call it the anon key)
   - the **secret key** (older projects call it the service role key)
   - the **Transaction pooler** connection string (URI), with `[YOUR-PASSWORD]` replaced by your password
   - the **direct** connection string (URI), with the password in it
4. Make two random secrets. Run this in a terminal twice:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   The first is `BAN_HASH_PEPPER`. Keep it for good: changing it voids every ban. The second is `CRON_SECRET`.

Check: you have seven values in your password manager.

### Free plan facts that matter

- A free project is **paused after about a week with no activity**. The Daily Farm job calls the site every 15 minutes, and each call reads the database, so a live site should stay awake. If the dashboard ever says the project is paused, press Restore. **Check the screen** and Supabase's pricing page for the current rule.
- The free plan has a small database size limit and no backups you can restore yourself. Fine for you and testers. Move to Pro before real players.
- Sign-in emails from Supabase's own sender are limited to a few an hour and may go to spam. Fine for testing. For real players set up Resend (`docs/SETUP.md` part 6.2).

---

## Step 3. Build the database (migrations)

Detail: `docs/SETUP.md` part 3.2. Do this from your computer, in the repo folder, on `main` after step 1.

1. Install the Supabase CLI (<https://supabase.com/docs/guides/local-development/cli/getting-started>).
2. Run each of these in turn:

   ```bash
   supabase login
   ```

   ```bash
   supabase init
   ```

   (Answer no to the editor questions.)

   ```bash
   supabase link --project-ref <ref>
   ```

   (The ref is the part of the project URL before `.supabase.co`. It asks for the database password.)

   ```bash
   supabase db push --dry-run
   ```

   ```bash
   supabase db push
   ```

3. Never run `supabase db reset`, and never load `supabase/seed.sql` into this project. The seed is test data.

Check: in the Supabase dashboard, **Table Editor** lists `profiles`, `farms`, `feature_switches` and many more.

If it complains about `pg_cron`: Database, Extensions, turn on `pg_cron`, then run the push again.

---

## Step 4. Hand-set the Supabase settings

Detail: `docs/SETUP.md` part 3.3. All in the Supabase dashboard.

1. **Data API, exposed schemas:** `public` only. Never `app`.
2. **Authentication, Sign In / Providers:** Anonymous sign-ins **off**. Email **on**.
3. **Authentication, URL Configuration:** you fill this in at step 7, once you know the site address.
4. **JWT expiry (access token lifetime):** 900 seconds. **Check the screen** (Authentication or Project Settings, JWT or sessions).
5. Turn on two-step sign-in for your own Supabase login.

Skip `docs/SETUP.md` part 3.4 (Vault). You are using Vercel's crons, not the database scheduler.

---

## Step 5. Make the Vercel project

Detail: `docs/SETUP.md` part 2.

1. In Vercel: **Add New**, **Project**, **Import** next to `the-grazing-game-v2`.
2. **Root Directory:** `apps/web`. Make sure "Include files outside the root directory in the build step" is on (**check the screen**, Settings, Build and Deployment).
3. **Node.js version:** 24.x (Settings, Build and Deployment). The repo's CI tests on Node 24.
4. Leave the framework (Next.js) and the build and install commands as they are.
5. Press **Deploy**. With no keys it deploys as a guest-only site.
6. Note the address, for example `https://the-grazing-game-v2.vercel.app`. Use your own domain later if you like (Settings, Domains).

Check: the home page loads at that address.

### About your Vercel limits

- The repo asks Vercel to run its server code in **Sydney** (`"regions": ["syd1"]` in `apps/web/vercel.json`), next to the database. **Check the screen**: Settings, Functions should show Sydney.
- The two crons run every 15 minutes (Daily Farm) and every 5 minutes (notifications). That is about 384 calls a day, or about 11,500 a month. Each call is short when there is nothing to do. That is a very small part of what Pro includes. **Check the screen** on Vercel's Usage page after a day.
- To make sure nothing runs up a bill: Settings, **Spend Management** (on your team, not the project). Set a monthly amount and choose to pause projects when it is reached. **Check the screen.**
- Vercel shows cron jobs under the project's Settings, **Cron Jobs**. You can switch them off there at any time.

---

## Step 6. Put the keys in Infisical and sync them to Vercel

Infisical holds the keys in one place and copies them into Vercel's Environment Variables. I could not open Infisical's help pages from this session, so the button names below are from memory. **Check the screen** at each step and use Infisical's help: <https://infisical.com/docs/integrations/secret-syncs/vercel>.

### 6.1 Make the Infisical project

1. Sign in at <https://app.infisical.com> (or your own Infisical).
2. Make a new project of the **Secrets Management** kind. Call it `the-grazing-game`.
3. It comes with three environments: Development, Staging and Production. You will use **Production** for the live site. Development can hold the values for running on your own computer.

### 6.2 Add the keys to Production

Open the project, choose **Production**, and add each secret below with **Add Secret**. Names must match exactly, capital letters and underscores included.

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | your site address from step 5, with `https://` and no slash at the end |
| `GG_SITE_URL` | the same address |
| `GG_TRUSTED_IP_HEADER` | `x-real-ip` |
| `NEXT_PUBLIC_SUPABASE_URL` | the Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the publishable key |
| `SUPABASE_SECRET_KEY` | the secret key |
| `SUPABASE_DB_POOLER_URL` | the Transaction pooler string with the password in it |
| `BAN_HASH_PEPPER` | the first random secret |
| `CRON_SECRET` | the second random secret |

Leave `SUPABASE_DB_URL` (the direct string) out of Production. Only your computer needs it, for migrations. Put it in **Development** if you want it in Infisical.

Optional now: `SITE_OWNER_NAME` (your business name on the privacy page) and `SITE_CONTACT_EMAIL` (the enquiry address on the website).

Everything else (Stripe, push keys, Resend, Sentry, PostHog, the live weather feed) can wait. The game works without them. `docs/SETUP.md` parts 5 to 8 cover each one. Add them to Infisical the same way when you get to them.

### 6.3 Connect Infisical to Vercel

1. In Vercel make an access token: your avatar, **Account Settings**, **Tokens**, **Create**. Scope it to the team that owns the project. Give it an expiry you will remember. Copy it once.
2. In Infisical open **Integrations** (or **App Connections** in the organisation settings). **Add Connection**, choose **Vercel**, paste the token and save.

### 6.4 Make the sync

1. In the project, open **Integrations**, then **Secret Syncs**, then **Add Sync**, and choose **Vercel**.
2. **Source:** environment **Production**, secret path `/`.
3. **Destination:** the connection from 6.3, the project `the-grazing-game-v2`, Vercel environment **Production**.
4. **Initial sync behaviour:** choose the option that overwrites the destination with Infisical's values. Vercel has none of these keys yet, so nothing is lost.
5. Leave **Auto-sync** on, so a change in Infisical reaches Vercel by itself.
6. Save. Then make a second sync the same way with Vercel environment **Preview**, so preview deploys also have the database.

Check: in Vercel, project **Settings**, **Environment Variables** now lists the nine names for Production (and Preview).

### 6.5 Redeploy

Vercel reads variables when it builds. Infisical changing them does not rebuild the site. After every sync change: **Deployments**, the three dots on the latest, **Redeploy**.

---

## Step 7. Finish the Supabase sign-in settings

Now you know the site address.

1. Supabase, **Authentication**, **URL Configuration**:
   - **Site URL:** your site address.
   - **Redirect URLs:** add `https://<your-site>/auth/callback`. For running on your own computer, also add `http://localhost:3000/auth/callback`.
2. Leave the Magic Link email template's link as `{{ .ConfirmationURL }}`.

---

## Step 8. Make yourself admin and play

Detail: `docs/SETUP.md` part 3.5.

1. Open your site and sign in with the emailed link. Open it in the same browser that asked for it.
2. Finish the profile (username and date of birth).
3. In Supabase, **SQL Editor**, run this with your username:

   ```sql
   update public.account_status
      set role = 'admin'
    where user_id = (select user_id from public.profiles where username = 'YOUR_USERNAME');
   ```

   It should say `UPDATE 1`.
4. Open `/play` once, then `/admin`.

Check: `/admin` opens. `/admin/switches` shows Fast Farm, Daily Farm, sign-ups, leaderboards and push on, and the rest off.

**Now play.** Start a Fast Farm and a Daily Farm.

Check that Daily Farm moves on by itself: after 15 to 30 minutes, run this in the SQL Editor:

```sql
select * from public.daily_counts order by day desc limit 5;
```

`rollover_runs` should be going up and `rollover_failed` should stay at 0. If nothing moves, check `CRON_SECRET` is in Vercel's variables and that you redeployed after the sync.

---

## If something goes wrong

- **Build fails on Vercel:** read the build log from the top. A missing package in `packages/` means the Root Directory or "include files outside the root" setting is wrong (step 5).
- **Sign-in is not offered:** one of the nine Production variables is missing or misspelled, or the site was not redeployed after the sync. Vercel's runtime logs say which at start-up.
- **The sign-in email never comes:** check spam, check the redirect URL (step 7), and remember the free sender's hourly limit.
- **`/admin` refuses you:** run the SQL in step 8 again, open `/play`, then `/admin`.
- More: `docs/SETUP.md` part 11 and `docs/RUNBOOK.md`.

---

## What was fixed on 16 Nov 2026

1. **Two engine tests failed** (`packages/engine/src/labour/noHands.test.ts`). They compare a hash of a whole farm after a year. The hash took every number bit for bit, and the maths functions in Node 22 and Node 24 differ in the 16th decimal place. So the hash moved with the Node version, and it never matched on this machine, even on older commits. The farm itself was fine. The test now rounds every number to 10 significant figures before hashing. Node 22 and Node 24 now agree. The check that the 0.22.0 realism change moved only the inbox was rerun this way and holds. Nothing in the game replays a farm across servers, so live play was not affected. Logged in `docs/LESSONS.md`.
2. **The server now runs in Sydney.** `apps/web/vercel.json` sets `"regions": ["syd1"]`, next to the Sydney database. Before, Vercel would have used its default region in the United States, and every save would have crossed the Pacific.
3. **Crons:** kept as they were. Your Pro plan allows them.

## Still yours to decide (not blocking play)

These are in `docs/CALLS_FOR_CLAUDIA.md`. The ones you will notice first when you play:

- **A10: doing nothing out-scores sensible play.** The start herd is under carrying capacity and weight gain is counted twice in the score. Play first, then rule on it.
- **A1 and A2:** winter feed on the Tablelands, steer gains, calf weights.
- **Sheep** stay off until you rule on A4 to A6.
- **Before real players:** the legal pages (privacy, terms, community rules) are drafts with no lawyer's review, and purchases stay off until the Consumer Law and GST advice (`docs/LAUNCH_CHECK.md` rows 39 to 42).
- Not proven yet, because they need a real phone: 60 fps with 4,000 head on a mid-range Android, and every flow in portrait and landscape, light and dark.
