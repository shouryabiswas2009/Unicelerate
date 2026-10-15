# Yearly data refresh checklist

Once a year (July works well: College Scorecard and most university fee
pages for the next intake are out by then), and whenever a source publishes
something new. Every step regenerates files in the repo; the database only
changes when you run the seed files in the Supabase SQL Editor, in the
order of [PENDING-DB-STEPS.md](PENDING-DB-STEPS.md). The footer shows
"University data last refreshed …" from the newest `fetched_at`.

## 1. US schools (College Scorecard)

- [ ] Run the **Refresh College Scorecard data** workflow (Actions tab; it
      also runs itself on 1 July). It opens a pull request; read the diff.
- [ ] Merge, then run `supabase/seed_scorecard/00_link_existing.sql` …
      `06_universities.sql` one at a time.
- [ ] IPEDS (setting, athletics, housing) for campus life: download the new
      year with `npm run data:campus-life:download`, then step 4.

## 2. Non-US schools (curated, by hand)

- [ ] For every row in `data/curated/international_universities.csv`, open
      `tuition_source_url` and check the fee for the new intake. Update
      `tuition_local`, `tuition_basis`, `tuition_year` and `checked_on`.
      Never guess: if the page is gone or unclear, empty the fee and add a
      "Needs hand-checking" note.
- [ ] Australia: download the latest CRICOS export from data.gov.au into
      `ml/data/raw/cricos/` and re-run the Australian batches
      (`scripts/curated/cricos-fees.mjs`).
- [ ] Co-op: re-check each page in `data/curated/coop_programs.csv` and its
      `checked_on`.
- [ ] Work through [HAND-CHECK.md](HAND-CHECK.md) (re-generate it with
      `node scripts/curated/hand-check-report.mjs`).
- [ ] Visa and work rules: re-check each page in
      `data/curated/country_info.csv` (rules change often), then
      `npm run data:build-country-info` and run `seed_country_info.sql`.
- [ ] `npm run data:validate-international`, then
      `npm run data:build-international` and run
      `supabase/seed_international/*.sql` in order.

## 3. Exchange rates

- [ ] `npm run data:fx` (ECB reference rates), then rebuild the
      international seed (step 2's last line), since converted amounts use
      the rates.

## 4. Research impact, strength index, campus life

- [ ] When CWTS publishes a new Leiden Ranking Open Edition:
      `npm run data:research-impact:download`, then
      `npm run data:research-impact:build`; run `seed_research_impact.sql`.
- [ ] `npm run data:strength:openalex` (needs `OPENALEX_EMAIL` in
      `.env.local`), then `npm run data:strength:build`; run
      `supabase/seed_strength/*.sql` in order.
- [ ] `npm run data:campus-life:build`; run `supabase/seed_campus_life/*.sql`.
- [ ] `npm run data:featured`; run `supabase/featured/featured.sql`.

## 5. Check and publish

- [ ] `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run db:check`,
      `npm run build`.
- [ ] `npm run data:report` for the coverage table; update the numbers in
      the README and [INTERVIEW-NOTES.md](INTERVIEW-NOTES.md).
- [ ] Update the dates in [CREDITS.md](CREDITS.md) and on `/credits`.
- [ ] After the seeds are run: call `POST /api/revalidate` (or wait a day)
      so the cached list picks up the new data, then
      `npm run data:export-fixture` so the browser tests use it too.
- [ ] Look at the inbox ([OWNER-QUERIES.md](OWNER-QUERIES.md)) for wrong
      figures reported during the year.
