# Putting Unicelerate online with your own domain

Everything here is free: **Vercel** (Hobby plan) hosts the Next.js app,
**Supabase** (free plan) is the database you already use, and your domain
points at Vercel. The Vercel Hobby plan is for personal, non-commercial
projects, which fits a student project like this one.

You do the steps that need your accounts (signing in, DNS, dashboards).
The code is already prepared: no secrets are in the repository, CI checks
every push, and auth links use your domain automatically once step 3 is done.

Replace `example.com` below with your domain. This guide uses
`www.example.com` as the main address and sends `example.com` to it
(the usual setup; the other way round works too).

## Before you start

- Run every pending Supabase step in [`PENDING-DB-STEPS.md`](PENDING-DB-STEPS.md)
  first, so the live site doesn't show "not set up yet" notes.
- Push the latest commits to GitHub (`git push`) and check the **CI**
  workflow is green in the repository's **Actions** tab.

## 1. Create the Vercel project

1. Go to <https://vercel.com/signup> and sign up **with GitHub** (free
   Hobby plan).
2. **Add New… → Project**, pick `shouryabiswas2009/StudyCompass` and click
   **Import**. Vercel detects Next.js; leave the build settings as they are.
3. Before clicking **Deploy**, open **Environment Variables** and add:

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | same as in your `.env.local` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same as in your `.env.local` (the anon / publishable key, **never** the service-role key) |
   | `SITE_URL` | `https://www.example.com` (no `NEXT_PUBLIC_` prefix: only the server reads it) |

   Don't add `SCORECARD_API_KEY`: the running site never uses it.
4. Click **Deploy**. After a minute or two you get a
   `something.vercel.app` address. Open it: the landing page should load.

From now on, every push to `main` redeploys the site automatically, and
every other branch gets its own preview address.

## 2. Connect your domain

1. Vercel → your project → **Settings → Domains** → add `www.example.com`.
   Vercel offers to add `example.com` too and redirect it to `www`; accept.
2. Vercel then shows the DNS records to create. Typically:

   | Type | Name (host) | Value |
   | --- | --- | --- |
   | `A` | `@` (the bare domain) | the IP address Vercel shows |
   | `CNAME` | `www` | the target Vercel shows (ends in `vercel-dns.com`) |

   **Copy the exact values from Vercel's screen**, not from this table.
3. At the company you bought the domain from, open its **DNS** settings and
   add those records. Delete any old `A` record on `@` or `CNAME` on
   `www` that points elsewhere (often a "parking" page).
4. Wait until Vercel shows **Valid Configuration** next to both domains.
   Usually minutes, sometimes a few hours. Vercel issues the HTTPS
   certificate by itself.

## 3. Tell Supabase about the new address

Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL:** `https://www.example.com`
- **Redirect URLs:** add `https://www.example.com/**`. Keep
  `http://localhost:3000/**` so local development still works.

The "Confirm signup" email template uses `{{ .SiteURL }}` (see the README's
"Email confirmation" section), so confirmation links now go to your domain.

## 4. Send emails from your domain (optional but recommended)

If you use Gmail SMTP (README → "Email confirmation") it keeps working.
To send from `noreply@example.com` instead, use a free email-sending service
such as Resend or Brevo: add your domain there, create the DNS records it
shows (they prove you own the domain and stop emails landing in spam), then
put its SMTP details into Supabase → **Authentication → Emails → SMTP
Settings**.

## 5. Check the live site

1. Open `https://www.example.com`: it should load with the padlock (HTTPS).
2. `https://example.com` should jump to `https://www.example.com`.
3. Sign up with a new email address, click the confirmation email's link:
   it must open **your domain** (not `localhost`) and land on the profile page.
4. Fill in a profile and open recommendations, a university's details
   page and the offers page.

## If something goes wrong

- **"Import multi-service project / needs a vercel.json":** Vercel saw
  `ml/requirements.txt` (the offline Python training code) and thought the
  repo had a second app. [`vercel.json`](../vercel.json) now says the
  project is one Next.js app, and [`.vercelignore`](../.vercelignore) skips
  `ml/`. Start the import again; the Framework Preset should say Next.js.

- **Build fails on Vercel:** open the deployment's **Build Logs**. Most
  often an environment variable is missing or misspelled; fix it under
  **Settings → Environment Variables**, then **Redeploy**.
- **Confirmation link opens localhost:** the Supabase **Site URL** (step 3)
  is still `http://localhost:3000`, or `SITE_URL` isn't set on
  Vercel. Fix it and redeploy.
- **"Invalid redirect URL" after login:** add the address you're using to
  Supabase's **Redirect URLs** (step 3).
- **Login fails after a quiet week:** the free Supabase project was paused;
  restore it in the dashboard. The keep-alive workflow (README) prevents this.
- **Domain still "Invalid Configuration":** DNS changes can take up to 48
  hours; double-check the records against what Vercel shows.

## Keeping it running: errors, uptime, rate limits and backups

**Errors.** Server errors are logged as one JSON line each
(`instrumentation.ts`, `onRequestError`) and show in Vercel → Project →
Logs (free; filter on `onRequestError`). They include the message, the
digest shown on the error page, and the route, never cookies, headers or
the query string. Nothing is sent to an outside service. (A free Sentry
account could be added later; it needs signing up and a DSN.)

**Uptime.** `.github/workflows/uptime.yml` checks `/`, `/universities` and
`/credits` every 30 minutes; a failure is a failed run in GitHub Actions,
and GitHub emails the repository owner. `keep-alive.yml` stops a free
Supabase project from pausing after a week without traffic. It needs the
`SUPABASE_URL` and `SUPABASE_ANON_KEY` repository secrets (Settings →
Secrets and variables → Actions); its recent runs failed, so check those
secrets are set.

**Rate limits.**
- Sign-up, log-in and "report a wrong figure" have an in-memory limit per
  server instance (`lib/rate-limit.ts`: 5 sign-ups an hour and 10 log-ins
  per 5 minutes per IP, 10 reports an hour per student). It stops bursts,
  but each Vercel instance counts on its own.
- Reports also have a database cap that holds everywhere: 20 per student
  per day (`supabase/migration_024_report_rate_limit.sql`).
- Supabase Auth limits sign-ups and sign-ins per IP itself: Supabase →
  Authentication → Rate Limits (check the current value there; the CLI
  reference gives 30 per 5 minutes as the default).
- Passwords: set the minimum length to **8** under Authentication →
  Providers → Email (or Authentication → Settings, depending on the
  dashboard version), matching `MIN_PASSWORD_LENGTH` in
  `lib/signup-validation.ts`.

**Backups.** Supabase's plan decides what it keeps: check Supabase →
Database → Backups for your project. Third-party plan summaries say the
free plan has no downloadable daily backups (paid plans keep daily backups
for 7 days or more), but they disagree, so trust the dashboard. Either
way, take your own:

1. Install PostgreSQL's client tools (for `pg_dump`, version 15 or newer).
2. Add `SUPABASE_DB_URL` to `.env.local` (Project Settings → Database →
   Connection string, URI form, with the database password).
3. Run `npm run db:backup`. It writes `backups/unicelerate-<date>.dump`
   (git-ignored), with schema and data for `public` and `auth`.
4. Restore into a project with `pg_restore --no-owner -d "<connection
   string>" backups/<file>.dump`.

The backup holds students' data: keep it private, and delete old ones you
don't need. A monthly backup, plus one before every migration, is plenty
for a project this size.

