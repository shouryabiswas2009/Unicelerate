# Scaling notes: what breaks first, and the cheapest fix

Unicelerate runs on free plans: Supabase Free and Vercel Hobby. Limits below
were read from the providers' own pages on 2026-10-14
([Supabase pricing](https://supabase.com/pricing),
[Vercel fair use guidelines](https://vercel.com/docs/limits/fair-use-guidelines),
[Vercel limits](https://vercel.com/docs/limits)); check them again before
relying on a number.

| What | Free limit | What happens when it's hit | Cheapest fix |
| --- | --- | --- | --- |
| **Supabase pausing** | "Free projects are paused after 1 week of inactivity." | Logins and saved data stop working until the project is restored in the dashboard. | Already handled: the **Keep Supabase awake** workflow reads one row every 3 days. It needs the repository secrets `SUPABASE_URL` (`https://<ref>.supabase.co`) and `SUPABASE_ANON_KEY` (the anon / publishable key, never `service_role`). Last checked: the manual run on 2026-10-14 succeeded. If it ever fails, the job log says which secret is wrong without printing it. |
| **Supabase database size** | 500 MB per project | Writes fail once the database is full. | The shared list is ~2,000 rows; students' data is small. Watch it under Database → Usage. Fix: delete old feedback, or move to Pro. |
| **Supabase egress** | 5 GB, plus 5 GB of cached egress | Over the limit Supabase may restrict the project. | The big read (the whole university list) is cached on Vercel for a day (`lib/data/universities.ts`), so Supabase serves it about once a day, not per visitor. Keep it that way: don't add uncached reads of the full list. |
| **Supabase Auth** | 50,000 monthly active users | New sign-ins over the limit fail. | Far above current use. Fix: Pro. Confirmation emails go through Resend, which has its own sending limits. |
| **API request bursts** | No fixed free-tier request cap listed; Supabase protects auth with per-IP rate limits | Sign-up / log-in storms get refused. | The app also limits sign-ups, log-ins, reports and feedback per visitor (`lib/rate-limit.ts`), and the database caps reports and feedback (migrations 024 and 026). |
| **Vercel bandwidth** (Fast Data Transfer) | First 100 GB a month | Hobby projects over the guideline may be paused. | Pages are server-rendered with cached data and are small (~300 KB, docs/PERFORMANCE.md). Fix: Pro. |
| **Vercel function invocations** | First 1,000,000 a month | As above. | Public university pages are cached; most requests don't run code. |
| **Vercel Active CPU** | 4 hours a month | As above. | The recommendations page scores ~1,900 schools per request (tens of milliseconds). If this becomes the limit, cache each student's scores for a few minutes. |
| **Next.js data cache entry** | 2 MB per entry (Next.js skips caching anything larger, silently) | The university list would be fetched from Supabase on every request: slower, and more egress. | Already guarded: the cached list leaves out what list pages don't show, and a test (`lib/data/universities.test.ts`) fails if the estimate passes 1.8 MB (about 1,555 KB for 1,877 schools today). Next fix if it grows: cache the list in two halves. |
| **Vercel Hobby is non-commercial** | "Hobby teams are restricted to non-commercial personal use only." | Ads, paid features or affiliate links would break the terms. | Keep it free and ad-free, or move to Pro first. Donations are allowed. |

## Data APIs (only used when refreshing data, never by visitors)

| Source | Limit we work within | Where |
| --- | --- | --- |
| College Scorecard API | 1,000 requests an hour per key (the fetch pauses 400 ms between requests) | `scripts/scorecard/fetch.mjs` |
| OpenAlex | The polite pool, with a contact email (`OPENALEX_EMAIL`) | `scripts/strength/fetch-openalex.mjs` |
| ROR | One request a second, cached on disk | `scripts/curated/candidates.mjs` |
| University websites | One request a second, cached on disk; a blocked page is left for hand-checking, never worked around | `scripts/curated/fetch-page.mjs` |

## Where to look first when something is slow or down

1. The **Uptime** workflow (Actions tab) checks the live site every 30 minutes.
2. Supabase dashboard → the project's status (paused?) and Usage.
3. Vercel dashboard → Usage, and the runtime logs (kept 1 hour on Hobby,
   so look soon). Server errors are also logged by `instrumentation.ts`.
