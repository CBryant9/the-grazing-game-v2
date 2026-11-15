# Setup guide: get The Grazing Game online and connect its services

This guide is for the owner. You will follow it on a second computer. You make every outside account and paste every key yourself. Nothing in this file is a real key. Anything in angle brackets, like `<your-site>`, is a placeholder you replace.

You can stop after any part and already have something that works. Each part says what you can do once it is done.

Where a step inside an outside dashboard (Vercel, Supabase, Stripe and so on) is not spelled out in this repo, the guide links that service's own page. Dashboards change their layout often. Where this guide says **check this in the dashboard**, it could not confirm the exact step from the service's documentation, so look at the linked page and the screen in front of you. Plans, limits and prices are never stated here. Check them on each service's own pricing page.

Other documents: `docs/RUNBOOK.md` (running the live site, backups, what to do when something breaks) and `docs/LAUNCH_CHECK.md` (what has been proven and what still needs you).

---

## 0. Before you start

### What to install on the second computer

1. **Git.** Download from <https://git-scm.com/downloads>. It copies the code to your computer.
2. **Node.js**, version 22.12 or newer. Download from <https://nodejs.org/en/download>. The repo's own checks run on version 24, so 24 is a safe pick. Node runs the game's code.
3. **pnpm**, the tool that installs the game's parts. Instructions: <https://pnpm.io/installation>. The repo asks for a particular pnpm version in its `package.json`, and pnpm picks that up by itself when you run it inside the repo.
4. A **password manager** (any one you already trust). Every key in this guide goes in there first.

You should see: in a terminal window, `git --version`, `node --version` and `pnpm --version` each print a version number.

If not: close the terminal, open a new one and try again. A freshly installed tool is not seen by a window that was already open.

### Where keys live

1. Paste each key into your password manager first, with a note saying what it is.
2. Then paste it in two places only: the **Vercel** project settings (for the live site) and a local file (for running on this computer).
3. The local file is `apps/web/.env.local`. Git ignores it. The repo's `.gitignore` ignores `.env` and every `.env.*` file, and keeps only `.env.example`, which holds no values. A file named `.env.example` is safe to share. Any other `.env` file is not.
4. Never paste a key into a chat, an email, a document or a file that is not ignored.
5. Variable names that start with `NEXT_PUBLIC_` are safe to show in a browser. Every other key in this guide is server only. It must never be given a `NEXT_PUBLIC_` name.

### The map of this guide

| Part | What you do | What works when it is done |
|---|---|---|
| 1 | Run the game on this computer, no keys | Play as a guest on this computer. **You can stop and play.** |
| 2 | Put the website on Vercel, no keys | The public website is online. Guest play online is limited (see part 2) |
| 3 | Supabase | Accounts, farms saved in the database, guest play online, the admin area, Daily Farm (it still needs part 4 to move on each day). **You can stop and play.** |
| 4 | Schedules | Daily Farm moves on by itself each day. Notifications can be sent. Live weather and prices if you add them |
| 5 | Stripe (test mode) | A test purchase, a refund |
| 6 | Push notifications and email | Phone notifications, notification emails, sign-in emails from your own domain |
| 7 | Sentry | Errors are reported to you |
| 8 | PostHog | Player counts and events (only for people who agree) |
| 9 | Turning features on | The switches screen, in a safe order |
| 10 | Every variable in one table | A look-up list |
| 11 | If something goes wrong | The common first-time problems |

Add one service at a time. After each, do the "You should see" check before moving on.

---

## 1. Get the code and play as a guest on this computer

No keys are needed. With no keys, the game runs as a guest game and keeps farms in files on this computer.

1. Open a terminal and go to the folder where you keep projects.
2. Copy the code: `git clone https://github.com/CBryant9/the-grazing-game-v2.git`. The repo is private, so GitHub will ask you to sign in. Do that in the window it opens (check <https://docs.github.com/en/get-started/git-basics/set-up-git> if Git asks for something you do not know).
3. Go into the folder: `cd the-grazing-game-v2`.
4. Install the parts: `pnpm install`.
5. **Development run** (quick, for trying things): `pnpm dev`.
6. Open <http://localhost:3000> in a browser, then open <http://localhost:3000/play>.

You should see: the home page, then the game page. Start a guest farm, do one job and press Next day. The day moves on.

If not: read the last lines in the terminal. If it says the port is in use, close the other program that is using it, or stop the earlier `pnpm dev` first. If `pnpm install` fails, check the Node version (`node --version` must be 22.12 or newer).

7. **Stop it:** click in the terminal and press `Ctrl` and `C` together.
8. **Production run** (how the live site behaves, a little slower to start): `pnpm build`, wait for it to finish, then `pnpm start`. Open <http://localhost:3000> again. Stop it the same way.

You should see: the same game. The production build takes a few minutes the first time.

If not: scroll up in the terminal to the first line that says "error". Copy that line when you ask for help.

Your guest farms are kept in the folder `apps/web/.farms` on this computer. Git ignores that folder.

**You can stop here and play.**

---

## 2. Put it online (Vercel, no keys yet)

Vercel is the company that hosts the website. Docs: <https://vercel.com/docs/monorepos>.

1. Put the code on GitHub if it is not there already. This repo's remote is `https://github.com/CBryant9/the-grazing-game-v2.git`. Make sure the branch you want online (normally `main`) is pushed. The repo rule is that nothing goes to `main` without your go-ahead.
2. Make a Vercel account at <https://vercel.com> and choose the plan you want (check the plan page in the dashboard).
3. In the Vercel dashboard choose **Create New**, then **Project**, then **Import** next to this repository. If it is not listed, give Vercel access to the repository when it asks.
4. Before you press Deploy, click **Edit** next to **Root Directory** and choose `apps/web`. This is a monorepo (several parts in one repo), and the website lives in that folder. That folder also holds `vercel.json`, which sets up the two scheduled jobs used in part 4.
5. Check that Vercel offers to include source files from outside the root directory. The website uses the shared packages in `packages/`. **Check this in the dashboard** (Settings, Build and Deployment, Root Directory). Docs: <https://vercel.com/docs/builds/configure-a-build#root-directory>.
6. Leave the framework as Next.js and the build and install commands as they are. Vercel reads the package manager from the repo.
7. Press **Deploy**.

You should see: after a few minutes, a green "Ready" and an address like `https://<project>.vercel.app`. Open it. The home page, the leaderboards page, the privacy page and the other website pages load.

If not: open the deployment in Vercel and read the build log from the top. The first error line is the cause. A message about a missing package in `packages/` means step 5 was not set.

8. Add these variables now. In Vercel open your project, then **Settings**, then **Environment Variables** (docs: <https://vercel.com/docs/environment-variables>). Add each for **Production** and **Preview**:
   - `NEXT_PUBLIC_SITE_URL` = your site address, with `https://` and no slash at the end.
   - `GG_TRUSTED_IP_HEADER` = `x-real-ip`.
9. Redeploy (Deployments, the three dots on the latest, Redeploy). Vercel reads variables when it builds and starts, so a change only shows after a redeploy.

You should see: the page source and the sitemap (`/sitemap.xml`) now use your address, not `localhost`.

If not: check the variable name for a typo and that it is set for Production.

**What works now:** the public website. **What does not:** accounts, and saving farms. The live site's file system is not kept between requests, so `docs/RUNBOOK.md` says the live site must have the database. Treat `/play` online as a preview that may lose farms until part 3 is done. Play on this computer (part 1) in the meantime.

Optional now: `SITE_CONTACT_EMAIL` (the enquiry address shown on the website), `SITE_OWNER_NAME` (who "we" is on the privacy page and terms) and `SITE_SWITCHES_ON` (see part 9). Each is read when the site is built, so redeploy after setting. The pages say plainly when they are unset.

---

## 3. Supabase (accounts, saved farms, the admin area)

Supabase holds the database, sign-in and photo storage.

### 3.1 Make the project and collect the keys

1. Make an account and a project at <https://supabase.com/dashboard>. The repo's plan is the Free plan and the **Sydney** region. Check the current plan options in the dashboard. Choose a database password and save it in your password manager now. You cannot read it back later.
2. Open **Settings**, then **API Keys** (docs: <https://supabase.com/docs/guides/api/api-keys>). Copy:
   - the **publishable key** (older projects call it the anon key)
   - the **secret key** (older projects call it the service role key)
3. Find the **project URL**, which looks like `https://<ref>.supabase.co`. The Connect dialog and the project settings show it. **Check this in the dashboard.**
4. Find the two database connection strings (docs: <https://supabase.com/docs/guides/database/connecting-to-postgres>). **Check this in the dashboard** for where the Connect dialog shows them:
   - the **direct connection** string (URI form)
   - the **Transaction pooler** string (URI form)
   Each has a `[YOUR-PASSWORD]` marker. Replace it with the database password from step 1.
5. Make two random secrets. In a terminal run this once for each:
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   The first is `BAN_HASH_PEPPER`. The second is `CRON_SECRET` (used in part 4). Save both in your password manager. Keep `BAN_HASH_PEPPER` somewhere safe for good. Losing or changing it makes every ban record stop matching.
6. In Vercel (Production and Preview) and in `apps/web/.env.local`, set:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | the project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the publishable key |
| `SUPABASE_SECRET_KEY` | the secret key (server only) |
| `SUPABASE_DB_POOLER_URL` | the Transaction pooler string with the password in it (server only) |
| `SUPABASE_DB_URL` | the direct string with the password in it (used only to apply the migrations) |
| `BAN_HASH_PEPPER` | the first random secret |
| `GG_SITE_URL` | your site address, no slash and no path (the same address you list as a redirect URL below) |
| `GG_TRUSTED_IP_HEADER` | `x-real-ip` (already set in part 2) |

For the local file, `GG_SITE_URL` can stay empty. On a developer's computer the request's own address is used.

You should see: all of these in Vercel's Environment Variables list.

If not: accounts will stay off. The server writes the reason in the Vercel logs at start-up.

### 3.2 Apply the migrations (build the database)

The migrations are the files in `supabase/migrations`. They build every table and rule. They only ever add. Docs: <https://supabase.com/docs/guides/local-development/cli/getting-started> and <https://supabase.com/docs/guides/local-development/cli-workflows#pushing-to-a-remote-project>.

1. Install the Supabase CLI. On Windows the documented way is Scoop (<https://scoop.sh>): `scoop bucket add supabase https://github.com/supabase/scoop-bucket.git`, then `scoop install supabase`. For other systems use the install page above.
2. In the repo folder run `supabase login` and follow the browser steps.
3. Run `supabase init` once. It adds a `supabase/config.toml` file. Answer no to anything about editor settings. You can leave this new file uncommitted.
4. Run `supabase link --project-ref <ref>`. The ref is the part of the project URL before `.supabase.co`. It asks for the database password.
5. Preview: `supabase db push --dry-run --remote`. It lists the files it would apply, in name order.
6. Apply: `supabase db push --remote`.
7. **Never** run `supabase db reset` and never use `supabase/seed.sql` on this project. The seed is test data.

You should see: every file in `supabase/migrations` applied, with no error. In the Supabase dashboard, **Table Editor** lists many tables (`profiles`, `farms`, `feature_switches` and more).

If not: read the first error. If it mentions `pg_cron`, open **Database**, then **Extensions** in the dashboard and turn on `pg_cron` (**check this in the dashboard**), then run step 6 again. A file that already ran is skipped. Never edit a migration file.

### 3.3 Hand-set settings in the Supabase dashboard

These are not in the repo and must be set by hand.

1. **Data API, exposed schemas: `public` only.** Never `app`. The `app` schema holds helper functions that must not be reachable from outside. **Check this in the dashboard** (Settings, Data API). Docs: <https://supabase.com/docs/guides/api/using-custom-schemas>.
2. **Anonymous sign-ins: off.** Authentication, Sign In / Providers. Docs: <https://supabase.com/docs/guides/auth/auth-anonymous>. The game's rules treat an anonymous token as not signed in, and this keeps it that way.
3. **Email sign-in on.** On the same page, keep the Email provider on. "Confirm email" can stay on, because the emailed link is the sign-in.
4. **Redirect URLs.** Authentication, **URL Configuration** (docs: <https://supabase.com/docs/guides/auth/redirect-urls>). Set **Site URL** to your public address. Under **Redirect URLs** add `https://<your-site>/auth/callback`. For local work also add `http://localhost:3000/auth/callback`.
5. **The emailed link.** Authentication, Email Templates, **Magic Link** (docs: <https://supabase.com/docs/guides/auth/auth-email-templates>). Keep `{{ .ConfirmationURL }}` as the link. The link only works in the same browser that asked for it, and the sign-in page tells players so.
6. **Access token lifetime: 900 seconds.** This is "JWT expiry". It makes a signed-out-everywhere token stop working within 15 minutes. The repo could not confirm which dashboard page holds it. **Check this in the dashboard** (look under Authentication or Project Settings for the JWT or session settings). Docs: <https://supabase.com/docs/guides/auth/sessions>. Keep the default asymmetric JWT signing keys.
7. **Rate limits.** Authentication, Rate Limits: leave Supabase's email limits on.
8. **Google sign-in, if you want it.** Make a web OAuth client in Google Cloud Console. Supabase shows the callback address on its Google provider page, and you give that to Google as the authorised redirect. Paste Google's client id and secret into Supabase's Google page (not into any environment variable). Docs: <https://supabase.com/docs/guides/auth/social-login/auth-google>. Skip this step to offer email sign-in only.
9. **Two-step sign-in on your own Supabase login.** Turn it on in your Supabase account settings. **Check this in the dashboard.**

Sign-in emails sent by Supabase's own sender may be limited or may land in spam. If sign-in emails do not arrive, set up your own sender in part 6 (the Supabase SMTP step). Docs: <https://supabase.com/docs/guides/auth/auth-smtp>.

### 3.4 Extensions and Vault (only if you will use the database scheduler in part 4)

If you use Vercel's crons in part 4, skip this step.

1. In the dashboard open **Database**, then **Extensions**, and turn on `pg_net` and the Vault extension (**check this in the dashboard** for their exact names). Docs: <https://supabase.com/docs/guides/database/extensions>, <https://supabase.com/docs/guides/database/vault>, <https://supabase.com/docs/guides/cron>.
2. In the **SQL Editor**, run these two lines once, with your own address and the same `CRON_SECRET` value as in Vercel:

   ```sql
   select vault.create_secret('https://<your-site>', 'gg_site_url');
   select vault.create_secret('<the CRON_SECRET value>', 'gg_cron_secret');
   ```

   Do not save this query in the editor's history or snippets.

You should see: each statement returns one row with an id.

If not: if `vault` is "not found", the extension is not on yet.

### 3.5 Redeploy, then make the first admin

1. Redeploy in Vercel so it picks up the new variables.
2. Open your site, go to the sign-in page and sign in with an emailed link. Finish the profile (username and date of birth). Remember the username.
3. In Supabase open **SQL Editor** and run this, with your own username:

   ```sql
   update public.account_status
      set role = 'admin'
    where user_id = (select user_id from public.profiles where username = 'YOUR_USERNAME');
   ```

4. Open `/play` once (this refreshes your sign-in), then open `/admin`.

You should see: the SQL editor says `UPDATE 1`, and `/admin` opens with the dashboard. Starting a farm online now keeps it between visits, and `/account` works.

If not: `UPDATE 0` means the username has a typo or the profile was not finished. If `/admin` still refuses you, sign out and in again. There is no variable or route that makes an admin, by design.

**You can stop here and play online with an account.**

---

## 4. Schedules (Daily Farm and notifications)

Two web routes need to be called on a timer: `/api/daily/rollover` (every 15 minutes, moves each Daily Farm on a day at its midnight) and `/api/notify/send` (every 5 minutes, sends due notifications). Both check a shared secret, `CRON_SECRET`, and answer 404 to anyone without it.

Daily Farm is on by default. It needs the database from part 3, `CRON_SECRET` and one scheduler. If the switches screen (`/admin/switches`) shows it off, turn it on there.

Pick **one** scheduler. Running both is harmless but pointless.

### Option A: Vercel crons (already in the repo)

`apps/web/vercel.json` already holds both jobs. Vercel sends `CRON_SECRET` to the routes by itself. Docs: <https://vercel.com/docs/cron-jobs>.

1. In Vercel (Production and Preview) add `CRON_SECRET` with the second random secret from part 3.
2. Redeploy.
3. Check that your Vercel plan allows crons that run this often. **Check this in the dashboard** (Settings, Cron Jobs, and the plan page). If it does not, use option B.

You should see: in Vercel, Settings, Cron Jobs lists both paths with their schedules.

If not: confirm the Root Directory is `apps/web` (part 2), since that is where `vercel.json` is.

### Option B: the database scheduler

The migrations already made the jobs `gg-daily-rollover` and `gg-notify-send`. They need part 3.4 done (extensions and the two Vault secrets) and `CRON_SECRET` set in Vercel with the same value as the Vault one. Redeploy after setting it.

### How to tell each one ran

In the Supabase SQL Editor:

1. Daily rollover: `select * from public.daily_counts order by day desc limit 20;`. After 15 to 30 minutes `rollover_runs` should be going up and `rollover_failed` should stay at 0.
2. Notification sender: `/admin/notifications` shows sent counts. Rows in `notifications` leave `queued`.
3. With option B, also: `select jobname, schedule from cron.job;` lists the jobs, and `select jobid, status, start_time from cron.job_run_details order by start_time desc limit 20;` shows recent runs.

You should see: the counts moving. With option A you can also see the calls in the Vercel logs.

If not: the route answers 404 when `CRON_SECRET` is unset or does not match. With option B a job with no Vault secrets runs and does nothing, and says nothing.

### Weather and prices

1. **Without the live feed** (the default): Daily Farm never waits. A night uses the district's long-term average weather and carries the last known price forward, and the farm diary says so. Nothing breaks.
2. **With the live feed:** each day's real weather (SILO) and prices (MLA) are fetched at the rollover. Set, in Vercel and the local file:
   - `GG_DAILY_FEED` = `live`
   - `SILO_CONTACT_EMAIL` = the address SILO asks for as a user name. You choose it. It is kept only in these settings, never in the repo. MLA needs no key.
3. Redeploy.

You should see: in `daily_counts`, `night_weather_fallback` and `night_price_fallback` stop going up. If they keep rising, the feed is not being reached.

If not: check both variables are spelled right and SILO's and MLA's own sites are up. MLA often has no prices over the Christmas break, which is expected.

---

## 5. Stripe (test mode first)

Stripe takes the payments. Start in **test mode**, where no real money moves. Stripe may now call test mode a "sandbox". Docs: <https://docs.stripe.com/testing>.

Before you start you need the database (part 3), `GG_SITE_URL` set, and a signed-in account that is 18 or over.

1. Make a Stripe account at <https://dashboard.stripe.com> and stay in test mode.
2. Settings, Public details: set the business name. Settings, Customer emails: switch on "Successful payments" only if you want Stripe to email receipts. Leave the Customer Portal off, because the game does not use it. **Check this in the dashboard** for where each setting is now.
3. Copy the **secret key** (starts `sk_test_`) from Developers, API keys. Put it in `STRIPE_SECRET_KEY`.
4. Add the webhook. Open the **Webhooks** tab (<https://dashboard.stripe.com/webhooks>) and choose **Create an event destination**. Docs: <https://docs.stripe.com/webhooks>.
   - Choose **Your account**.
   - Choose the **Snapshot** payload format. The events below are the classic whole-object type. **Check this in the dashboard** if the wizard looks different.
   - Choose exactly these seven events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`.
   - Choose **Webhook endpoint** as the destination, and set the address to `https://<your-site>/api/billing/webhook`.
   - Open the new endpoint, click **Reveal secret** and copy the signing secret (starts `whsec_`). Put it in `STRIPE_WEBHOOK_SECRET`.
5. Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in Vercel (and the local file if you want to test locally, though Stripe can only reach the live address). Redeploy.
6. In `/admin/switches` turn on **Purchases**. In `/admin/purchases` switch on the products to sell. The two "keep going" products stay off (their engine function is not built yet).

You should see: `/admin/purchases` says "Stripe is connected (test mode)" and shows the webhook address.

If not: it says Stripe is not connected when one key is empty or the site has not been redeployed since you set them.

7. **Test purchase.** Signed in, open More, then Store (or `/store`). Press Buy on the farm pack with no ads and confirm. On Stripe's page use Stripe's published test card `4242 4242 4242 4242`, any future expiry date, any three digit CVC and any postcode.

You should see: "Thanks. Your purchase is being confirmed.", then a few seconds later "Your purchase is confirmed". The farm picker now allows 5 farms. `/admin/purchases` shows the purchase as Paid. In Stripe, the webhook endpoint shows seven kinds of event delivered with status 200 (Event deliveries tab).

If not: in Stripe open the endpoint's Event deliveries tab. A failed delivery shows its status code. The most common cause is a signing secret from a different endpoint or a different mode. See `docs/RUNBOOK.md` section 7.3. Once fixed, use **Resend** on the failed event in Stripe. The game records each event once, so resending is safe.

8. **Refund.** In `/admin/purchases` use **Refund** on that purchase and confirm. Or refund the payment in the Stripe dashboard (docs: <https://docs.stripe.com/refunds>).

You should see: the purchase changes to a refunded state, the farm limit drops back, and ads return.

If not: press **Check with Stripe** on that page, then look at the endpoint's deliveries for `charge.refunded`.

### What changes for live mode

1. Do not go live until `purchases` has been checked by someone who knows Australian Consumer Law and GST (`docs/LAUNCH_CHECK.md`, rows 41 and 42), and you have decided who owns the game.
2. Activate your Stripe account for live payments. Stripe asks for business and bank details in its own screens. **Check this in the dashboard.** You enter those yourself.
3. Switch the dashboard to live mode. Test and live each have their own keys, their own webhook endpoints and their own signing secrets.
4. Copy the **live** secret key and make a **new** webhook endpoint in live mode with the same address and the same seven events. Copy its own signing secret.
5. Replace both values in Vercel and redeploy. The two must be from the same mode.
6. Make one small real purchase yourself and refund it.

---

## 6. Push notifications and email

Push sends a message to a phone. Email uses Resend. Players always see the message in the in-game inbox, even with neither set up.

### 6.1 Push keys (VAPID)

The repo has no script for this. It gives one command, written in `.env.example`. Run it once, on this computer:

```
node -e "const c=require('crypto');const k=c.generateKeyPairSync('ec',{namedCurve:'prime256v1'});const j=k.privateKey.export({format:'jwk'});const pub=Buffer.concat([Buffer.from([4]),Buffer.from(j.x,'base64url'),Buffer.from(j.y,'base64url')]).toString('base64url');console.log('VAPID_PUBLIC_KEY='+pub);console.log('VAPID_PRIVATE_KEY='+j.d)"
```

1. It prints two lines. Save both in your password manager.
2. In Vercel set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` from them (server only).
3. Set `VAPID_SUBJECT` to `mailto:` followed by an address you read, or leave it empty. Empty means `GG_SITE_URL` is used.
4. Redeploy.

Do this once only. A new pair stops every saved device, and players would have to turn notifications on again.

You should see: `/account/notifications` no longer says phone notifications are not set up.

If not: check that both lines were pasted whole, with no spaces at the ends.

### 6.2 Resend (email)

Docs: <https://resend.com/docs/dashboard/domains/introduction>.

1. Make an account at <https://resend.com>.
2. Add a sending domain you own. A sub-domain such as `mail.<yourdomain>` is best. Each sub-domain is added separately.
3. Resend lists DNS records for that domain. Add them at the company that hosts your domain's DNS, then wait until Resend shows **Verified**. This can take a while.
4. Make an API key with sending access (check Resend's API Keys page). Put it in `RESEND_API_KEY`.
5. Set `NOTIFY_FROM_ADDRESS` to the form `The Grazing Game <a sender address on your verified domain>`.
6. Make a third random secret with the same node command as part 3 and set it as `NOTIFY_TOKEN_SECRET`. It locks the unsubscribe link in each email. Changing it later breaks unsubscribe links already sent.
7. Email also needs `GG_SITE_URL` (part 3). Redeploy.
8. Sign-in links: in Supabase, Authentication, SMTP settings (docs: <https://supabase.com/docs/guides/auth/auth-smtp>), turn on custom SMTP and enter Resend's SMTP details. **Check this in the dashboard** and in Resend's own SMTP page for the host, port and user name. The password is a Resend API key.

You should see: a sign-in email arrives from your own address, and `/admin/notifications` shows email sent counts moving once there is something to send.

If not: if Resend shows the domain as not verified, recheck the DNS records. See `docs/RUNBOOK.md` section 7.4.

### 6.3 Test on real phones

You need a sender running (part 4) and the `push_notifications` switch on (it is on by default).

1. **iPhone:** web push works only on iOS 16.4 or newer, and only when the game is added to the Home Screen (Share, then Add to Home Screen). Open it from that icon, not from Safari. The notifications page shows these steps on an iPhone that has not done it. Source: <https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers>.
2. **Android:** open the site in Chrome. Adding it to the Home Screen is optional.
3. On each phone sign in, open More, then Notifications (`/account/notifications`) and press **Turn on notifications on this device**. Accept the phone's question.
4. Send the test reminder from that page.

You should see: a notification on the phone within a few minutes (the sender runs every 5 minutes).

If not: check that the device is listed on the page, that the sender ran (part 4) and that the VAPID pair has not changed since the device was added. Edge's push host and Firefox have not been tried with real keys yet (`docs/DEVELOPMENT_LOG.md`, m3.4), so report what you see.

---

## 7. Sentry (error reports)

Sentry collects errors. Only the route, a reason code, the error's class, the release and a trimmed stack are sent. Docs: <https://docs.sentry.io/concepts/key-terms/dsn-explainer/>.

1. Make an account at <https://sentry.io> and a project. Choose the platform **Node.js**.
2. Copy the project's DSN (Project settings, **Client Keys (DSN)**).
3. In Vercel set `SENTRY_DSN` to it (server only). Optional: `GG_RELEASE` (letters, digits, dots, dashes and underscores only). Without it, Vercel's commit is used.
4. Redeploy.
5. **The check (V16 in `docs/CALLS_FOR_CLAUDIA.md`):** on the deployed site open `/play`, open the browser's developer console (press F12, then Console), type `throw new Error("test")` and press Enter.

You should see: a new issue in the Sentry project within a minute or so.

If not: try once more, since a page sends at most five. Check `SENTRY_DSN` is set for the environment you are testing and the site was redeployed. Errors are also in the Vercel logs as `failed route=` lines.

---

## 8. PostHog (counts and events)

PostHog counts what people do, only for people who agree on the consent control, and never for an account under 16. The browser never loads a PostHog script. Our own server sends the events on. Without these two variables events are counted in our own database only.

1. Make an account at <https://posthog.com> and a project. Choose a region.
2. Copy the project API key (starts `phc_`) from the project settings. **Check this in the dashboard** and in PostHog's docs for the exact page.
3. In Vercel set `POSTHOG_KEY` to it and `POSTHOG_HOST` to your region's address, with `https` and no slash at the end (the repo's examples are `https://us.i.posthog.com` and `https://eu.i.posthog.com`).
4. In `/admin/switches` turn on **analytics**. The privacy page reads it at build, so also add `analytics` to `SITE_SWITCHES_ON` and redeploy.
5. **The check (V16):** on `/account` tick the consent box, play a day, then look in PostHog's activity or events view.

You should see: events from your play arriving in PostHog.

If not: events only count when the switch is on, the consent box is ticked and you are 16 or over. Confirm both variables are set for the environment and the site was redeployed.

---

## 9. Turning features on

All switches are in `/admin/switches`. A change shows on every server within 30 seconds, and each change is in the audit log (`/admin/audit`). Switches marked "read at build" also need an entry in `SITE_SWITCHES_ON` and a redeploy before the public pages mention them. `SITE_SWITCHES_ON` is a comma list of switch keys, for example `daily_farm,purchases`.

| Switch | Default | What it needs first | Check after turning on |
|---|---|---|---|
| `fast_farm` | on | Nothing | A guest can start a farm and play a day |
| `signups_open` | on | Part 3 (email sign-in, and Google if wanted) | Sign up with a test address |
| `leaderboards` | on | Part 3, and `NEXT_PUBLIC_SITE_URL` | `/leaderboards` lists rows |
| `push_notifications` | on | VAPID keys and a 5 minute schedule (parts 4 and 6). Email also needs `RESEND_API_KEY`, `NOTIFY_FROM_ADDRESS`, `NOTIFY_TOKEN_SECRET` | The test reminder on a phone |
| `daily_farm` | on | Part 3, `CRON_SECRET` and a scheduler (part 4). The live feed is optional | Start a Daily Farm. Next morning it is on the next day |
| `purchases` | off | Part 5 and a product switched on in `/admin/purchases` | A test purchase and a refund |
| `analytics` | off | Part 3. `POSTHOG_KEY` and `POSTHOG_HOST` only if events should leave our own database | Events in PostHog |
| `community` | off | Moderators in place and the word list checked in `/admin/words` | A test account can post. An under-16 test account sees no community |
| `feed_posts`, `groups`, `farm_viewing`, `activity_ticker` | off | `community` on. `farm_viewing` shows Daily Farms only | Each page opens |
| `ads`, `banner_ads`, `video_ads` | off | A house ad or campaign made in `/admin/ads` | The slot shows the ad. `/admin/ads/stats` counts a view |
| `adsense` | off | Not wired. Leave off | Nothing |
| `sheep` | off | Your ruling on the sheep benchmarks (`docs/CALLS_FOR_CLAUDIA.md`) | A sheep farm starts outside Central Queensland |
| `maintenance_mode` | off | Choose one of the three fixed wordings first | Players see the wording and cannot change their farm. You still can |

A good order to try things:

1. Play as a guest online, then with an account (part 3).
2. Daily Farm for yourself (part 4). Watch it move on one morning.
3. Notifications on your own phone (part 6).
4. A Stripe test purchase and refund (part 5).
5. Analytics (part 8), then `community`, then ads, each with a test account first.

Before real players: the legal items in `docs/LAUNCH_CHECK.md` (rows 39 to 42) need you, and `IMAGE_CHECK_API_KEY` stays empty for now. Every community photo then waits for an admin in `/admin/photos`.

---

## 10. Every variable in one table

Every name in `.env.example` is here, once. "Vercel" means project Settings, Environment Variables (Production and Preview). "Local" means `apps/web/.env.local`. Any variable may be left empty, and the game then runs as a guest game. After changing one in Vercel, redeploy.

| Variable | What it is for | Where to get it | Where to paste it | What does not work without it |
|---|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | The site's public address for canonical links, sitemap, robots and share images | Your Vercel address or your own domain, no slash at the end | Vercel, Local | Links and share images point at `localhost`. Read at build |
| `GG_SITE_URL` | The server's own address for sign-in links, redirects, email links and Stripe return pages | Same address, a plain origin with no path | Vercel (Local not needed) | Accounts stay off in production |
| `GG_FARMS_DIR` | Where farm files go when there is no database | A folder name you choose | Local only. Leave unset on Vercel | Nothing. It defaults to `apps/web/.farms` |
| `GG_SWITCHES_ON` | Switches on when there is no database, for a local check only | A comma list such as `sheep` | Local only. Leave unset on Vercel | Nothing. It is ignored whenever a database is set |
| `GG_DEV_PAGES` | Builders' pages under `/dev` in a production build | Set to `1` only if you need them | Leave unset on Vercel | Nothing. Those pages answer 404 |
| `GG_TRUSTED_IP_HEADER` | The header a trusted proxy sets to the caller's address, for per-address limits | `x-real-ip` on Vercel | Vercel | Every caller with no session shares one limit. A start-up warning is logged |
| `SITE_CONTACT_EMAIL` | The enquiries address shown on the website | An address you choose | Vercel | No "contact us" links. Read at build |
| `SITE_OWNER_NAME` | Who "we" is on the privacy page and terms | Your business name | Vercel | Pages say "the owner of The Grazing Game". Read at build |
| `SITE_SWITCHES_ON` | Which parts the public pages may talk about | A comma list of switch keys | Vercel | Pages talk about nothing switched off. Read at build |
| `NEXT_PUBLIC_SUPABASE_URL` | The Supabase project address (safe in the browser) | Supabase project URL | Vercel, Local | Accounts and the database are off |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The publishable key (safe in the browser) | Supabase, Settings, API Keys | Vercel, Local | Accounts are off |
| `SUPABASE_SECRET_KEY` | Server only. Account deletion, Storage files, sign-in administration | Supabase, Settings, API Keys | Vercel, Local | Accounts are off. No account or photo can be deleted |
| `SUPABASE_DB_URL` | The direct database string, used only to apply migrations | Supabase, Connect, direct connection | Local, and Vercel if you wish | Nothing on the site. Only migrations from a machine |
| `SUPABASE_DB_POOLER_URL` | Server only. The pooled database string the site uses | Supabase, Connect, Transaction pooler | Vercel, Local | The database is off: no accounts, saved farms, Daily Farm, ads, purchases, notifications or community |
| `BAN_HASH_PEPPER` | A long random secret for the ban list and signing ad views, also hashes ids sent to PostHog | You make it (part 3, step 5) | Vercel, Local | Accounts are off. Changing it voids existing bans |
| `CRON_SECRET` | The secret both scheduled routes check | You make it (part 3, step 5) | Vercel. Also Supabase Vault as `gg_cron_secret` if you use the database scheduler | Both routes answer 404. Daily Farms only move on when opened and nothing is sent |
| `GG_DAILY_FEED` | `live` fetches each day's real weather and prices | Type `live` | Vercel | No live data. Daily Farm uses averages and the last prices |
| `SILO_CONTACT_EMAIL` | The user name SILO asks for | An address you choose | Vercel, Local | The SILO weather fetch cannot run |
| `RESEND_API_KEY` | Sends notification emails | Resend, API Keys | Vercel (also Supabase SMTP for sign-in mail) | No notification email. Push and the inbox still work |
| `NOTIFY_FROM_ADDRESS` | The sender of notification emails, `Name <address>` on a verified domain | You choose, on your Resend domain | Vercel | No notification email |
| `NOTIFY_TOKEN_SECRET` | Locks the unsubscribe link (32 or more random characters) | You make it (part 6) | Vercel | No notification email. Changing it breaks old unsubscribe links |
| `VAPID_PUBLIC_KEY` | Web push public key | The command in part 6.1 | Vercel | No push, and nothing asks for permission |
| `VAPID_PRIVATE_KEY` | Web push private key | The same command | Vercel | No push. A new pair stops every saved device |
| `VAPID_SUBJECT` | Who push services can contact about this sender | `mailto:` an address you read, or leave empty | Vercel | Nothing. `GG_SITE_URL` is used |
| `STRIPE_SECRET_KEY` | Creates checkouts and refunds | Stripe, Developers, API keys (test first) | Vercel | Nothing is for sale |
| `STRIPE_WEBHOOK_SECRET` | Checks Stripe's signed events | Stripe, Webhooks, the endpoint's signing secret | Vercel | Nothing is for sale. Payments could not be confirmed |
| `IMAGE_CHECK_API_KEY` | A future outside image-check service | Not chosen yet. Leave empty | Nowhere yet | Nothing. Every community photo waits for an admin |
| `SENTRY_DSN` | Server only. Where errors are sent | Sentry, project settings, Client Keys (DSN) | Vercel | No errors go to Sentry. They stay in the Vercel logs |
| `GG_RELEASE` | The release name errors are filed under | You choose, or leave empty | Vercel | Nothing. Vercel's commit is used |
| `POSTHOG_KEY` | Server only. The PostHog project key (starts `phc_`) | PostHog, project settings | Vercel | Events stay in our own database |
| `POSTHOG_HOST` | The PostHog address for your region, https, no trailing slash | PostHog region address | Vercel | Events stay in our own database |

Vercel sets `VERCEL_ENV` and `VERCEL_GIT_COMMIT_SHA` itself. Do not set them.

---

## 11. If something goes wrong

1. **The Vercel build fails.** Open the deployment and read the build log from the top. The first error is the cause. A missing shared package usually means the Root Directory or the "include files outside the root" setting from part 2 is wrong.
2. **Sign-in is not offered, or says it is not set up.** One of the Supabase variables, `BAN_HASH_PEPPER`, `GG_SITE_URL` or `GG_TRUSTED_IP_HEADER` is missing for Production, or the site was not redeployed after setting it. The Vercel logs say which at start-up.
3. **The sign-in email never arrives, or the link fails.** Check the redirect URL list in Supabase (part 3.3, step 4) includes the exact address. Open the link in the same browser that asked for it. Set up your own sender (part 6.2, step 8) if the default sender is not delivering.
4. **`/admin` refuses you.** Run the admin statement again (part 3.5). Open `/play` once, then `/admin`.
5. **Daily Farm does not move on.** Check `CRON_SECRET` is set and matches (and in Vault for option B), the scheduler is on (part 4) and the `daily_counts` numbers are moving.
6. **A payment went through but nothing arrived.** In Stripe, open the webhook endpoint's Event deliveries. Check the signing secret and that test or live mode matches the secret key. Resend failed events.
7. **Notifications do not arrive.** `/admin/notifications` shows failed counts. Check the VAPID pair has not changed, the sender is running and, for email, that the domain is still Verified.

The rest, including backups, bad deploys, failed migrations, leaked secrets and privacy requests, is in `docs/RUNBOOK.md`.
