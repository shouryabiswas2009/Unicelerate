# Pending database steps

SQL files that are written and tested locally (`npm run db:check` runs them
all, twice, on a scratch Postgres) and then run by hand on the live
Supabase database. Nothing here counts as verified against the real
database until it's ticked off below.

**Status:** steps 1–4 were run in the SQL Editor on 2026-10-06 and
verified with read-only queries against the live database (the new
columns exist, 14 sample schools are linked, and the counts match
`npm run db:check` exactly: College Scorecard 1,577, illustrative 47;
research levels 146 / 126 / 154 / 1,093 with 58 unknown). Step 5 was run
the same day and verified: `focuses`, `coop_program` and
`internship_support_url` exist, `primary_focus` and `has_coop` are gone,
all 1,624 schools start at co-op `unknown`, and a signed-in profile's old
single focus shows up in the new list. Steps 6 and 7 were run the same
day and verified: `is_featured` exists, 371 of 1,577 College Scorecard
schools and all 47 illustrative schools are featured (matching
`npm run db:check`), and recommendations show "Featured schools only
(418). Include all 1,624 schools". Steps 8–10 were run the same day and
verified: the migration_011 columns exist (search_text included); all
1,577 Scorecard schools link to their Scorecard page and 1,572 have degree
levels; sources are College Scorecard 1,577, curated 42, illustrative 29
(442 featured); Oxford was upgraded in place (£39,620 stored with its
currency, illustrative ranking removed) and a search for "lse" finds the
London School of Economics by its alias. Steps 11–14 were run the same
day and verified: sources are College Scorecard 1,577 and curated 111 (no
illustrative rows left); `country_info` has row level security on and 27
countries (16 post-study, 7 proof of funds, 16 work-hour figures); and
`applications.accept_by` exists. Step 15 was run on 2026-10-07 (reported
done; check: `delete_my_account` exists as a security-definer function).
Steps 16–20 were run on 2026-10-07 and verified read-only: 350 universities have research impact (Oxford 99), the four profile columns exist, `figure_reports` exists and refuses inserts without a login. Steps 21–23 were run on 2026-10-08 and verified read-only: the strength columns exist, 1,688 shared universities have an index (14 estimates, MIT 99.2 / A / #1), no College Scorecard row keeps an illustrative ranking, and `visa_mode`, `visa_weight`, `stay_after` exist. Step 24 was run on 2026-10-08 (reported done; the constraint can't be read with the public key, so check it by saving a profile with an Ontario average). Steps 25–27 were run on 2026-10-13 and verified read-only: `profile_courses` exists, the `campus_life` column exists and all 1,688 shared universities have campus-life data (Waterloo and UBC carry their hand-checked rows).

New migrations will be added to this table when they're written.

Run them in the Supabase dashboard → **SQL Editor** → **New query**: paste
the whole file, click **Run**, then run the check underneath it. Do them in
this order: the seed files need both migrations first.

| # | File | Status |
| --- | --- | --- |
| 1 | `supabase/migration_007_data_sources.sql` | Done, verified 2026-10-06 |
| 2 | `supabase/migration_008_primary_focus.sql` | Done, verified 2026-10-06 |
| 3 | `supabase/seed_scorecard/00_link_existing.sql` | Done, verified 2026-10-06 (14 linked) |
| 4 | `supabase/seed_scorecard/01_universities.sql` … `06_universities.sql` (one at a time, in order) | Done, verified 2026-10-06 (1,577 rows) |
| 5 | `supabase/migration_009_multi_focus_and_coop.sql` | Done, verified 2026-10-06 |
| 6 | `supabase/migration_010_featured.sql` | Done, verified 2026-10-06 |
| 7 | `supabase/featured/featured.sql` (right after step 6) | Done, verified 2026-10-06 (371 + 47 featured) |
| 8 | `supabase/migration_011_international.sql` | Done, verified 2026-10-06 |
| 9 | `supabase/seed_scorecard/00_link_existing.sql` … `06_universities.sql` again (regenerated) | Done, verified 2026-10-06 (1,577 linked, 1,572 levels) |
| 10 | `supabase/seed_international/00_link_existing.sql`, `01_universities.sql`, `90_coop.sql`, `91_rankings.sql` | Done, verified 2026-10-06 (42 curated) |
| 11 | `supabase/seed_international/00_link_existing.sql`, `01_universities.sql`, `02_universities.sql`, `90_coop.sql`, `91_rankings.sql` (regenerated, 111 universities) | Done, verified 2026-10-06 (curated 111) |
| 12 | `supabase/migration_012_country_info.sql` | Done, verified 2026-10-06 (RLS on) |
| 13 | `supabase/seed_country_info.sql` (right after step 12) | Done, verified 2026-10-06 (27 countries) |
| 14 | `supabase/migration_013_offer_accept_by.sql` | Done, verified 2026-10-06 |
| 15 | `supabase/migration_014_delete_my_account.sql` | Done 2026-10-07 |
| 16 | `supabase/migration_015_research_impact.sql` | Done, verified 2026-10-07 |
| 17 | `supabase/seed_research_impact.sql` (right after step 16; check: `select count(*) from universities where research_impact is not null` → 350) | Done, verified 2026-10-07 |
| 18 | `supabase/migration_016_display_currency.sql` | Done, verified 2026-10-07 |
| 19 | `supabase/migration_017_grade_systems.sql` | Done, verified 2026-10-07 |
| 20 | `supabase/migration_018_figure_reports.sql` (check: row level security is on, two policies) | Done, verified 2026-10-07 |
| 21 | `supabase/migration_019_strength_index.sql` | Done, verified 2026-10-08 |
| 22 | `supabase/seed_strength/01_strength.sql` … `06_strength.sql`, one at a time in order (check: `select count(*) filter (where strength_index is not null), count(*) filter (where strength_is_estimate) from universities where created_by is null` → 1688 and the estimate count in data/strength/report.md) | Done, verified 2026-10-08 |
| 23 | `supabase/migration_020_visa_preferences.sql` (check: `select column_name from information_schema.columns where table_name = 'profiles' and column_name in ('visa_mode','visa_weight','stay_after')` → 3 rows) | Done, verified 2026-10-08 |
| 24 | `supabase/migration_021_more_grade_systems.sql` (check: `select conname from pg_constraint where conname = 'profiles_grade_system_check'` → 1 row) | Done 2026-10-08 (reported) |
| 25 | `supabase/migration_022_profile_courses.sql` (check: `select relrowsecurity from pg_class where oid = 'public.profile_courses'::regclass` → true) | Done, verified 2026-10-13 |
| 26 | `supabase/migration_023_campus_life.sql` (check: `select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name in ('campus_academic_prefs','campus_social_prefs')` → 2) | Done, verified 2026-10-13 |
| 27 | `supabase/seed_campus_life/01_campus_life.sql` … `06_campus_life.sql`, one at a time in order, after step 26 (check: `select count(*) from universities where created_by is null and campus_life is not null` → 1688) | Done, verified 2026-10-13 |

All of them are safe to run again if you're not sure whether one went
through.

---

## 1. `migration_007_data_sources.sql`

**What it does:** adds a `source` label to every university (`College
Scorecard`, `illustrative` or `user-entered`) plus provenance columns
(`data_year`, `fetched_at`, `source_url`, `scorecard_id`) and the official
Scorecard figures (city, state, ownership, net price, completion rate,
earnings…), with database checks so a student's own row can't be labeled
official.

**What's affected until it runs:**
- Every page still loads (they read with `select("*")`, so the missing
  columns just come back empty), but every school shows the amber
  "Illustrative data" badge and no admission estimate is shown.
- "Add / edit a university" still saves, but the source link isn't stored;
  the form says so after saving.
- The `seed_scorecard` files fail (their columns don't exist yet).

**Check:**
```sql
select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'universities' and column_name in ('source', 'scorecard_id', 'median_earnings_10yr');
```
Expect `3`.

## 2. `migration_008_primary_focus.sql`

**What it does:** adds `profiles.primary_focus` ("what matters most to
me": balanced, academic, work experience, research, affordability; default
balanced) and three university columns the focuses use:
`research_intensity` (Carnegie classification), `retention_rate` and
`has_coop`, with check constraints on the allowed values.

**What's affected until it runs:**
- Profile page: saving still works, but the focus isn't stored; the form
  shows an amber note saying so instead of going to recommendations. All
  scoring treats the student as "Balanced".
- "Add / edit a university": research activity and co-op answers aren't
  stored (the form says so).
- Research / careers figures show "Not available" everywhere.
- The `seed_scorecard` files fail (they fill in `research_intensity` and
  `retention_rate`).

**Check:**
```sql
select count(*) from information_schema.columns where table_schema = 'public' and ((table_name = 'profiles' and column_name = 'primary_focus') or (table_name = 'universities' and column_name in ('research_intensity', 'retention_rate', 'has_coop')));
```
Expect `4`.

## 3. `seed_scorecard/00_link_existing.sql`

**What it does:** gives the 14 original sample US schools (MIT, Harvard,
Stanford, …) their College Scorecard id, so the next files update them in
place instead of adding duplicates. Saved schools and applications stay
attached.

**What's affected until it runs:** if you skip it, files 01–06 would add a
second copy of those 14 schools.

**Check:**
```sql
select count(*) from public.universities where scorecard_id is not null;
```
Expect `14` right after this file (before 01–06).

## 4. `seed_scorecard/01_universities.sql` … `06_universities.sql`

**What it does:** inserts or updates 1,577 US universities with official
College Scorecard figures (data year 2024). Rows students added are never
touched.

**What's affected until it runs:** browse and recommendations only show the
61 sample schools; no school has official data, so the admission estimate
never appears.

**Check:**
```sql
select source, count(*) from public.universities group by source order by source;
```
Expect `College Scorecard 1577` and `illustrative 47` (plus `user-entered`
if you've added schools yourself). And:
```sql
select research_intensity, count(*) from public.universities where source = 'College Scorecard' group by 1 order by 2 desc;
```
Expect `non_doctoral 1093`, `doctoral_professional 154`, `very_high 146`,
`high 126`, and `58` with no value (null).


## 5. `migration_009_multi_focus_and_coop.sql`

**What it does:** replaces the single "what matters most" choice with a
multi-select. Adds `profiles.focuses` (a list; empty = Balanced; only
academic / work_experience / research / affordability allowed), copies
each student's old `primary_focus` into it, then drops `primary_focus`.
Adds `universities.coop_program` (mandatory / optional / none / unknown,
default unknown) and `internship_support_url`, carries over any yes/no
`has_coop` answers students gave (yes → optional, no → none), then drops
`has_coop`. Re-running it does nothing (it checks the old columns still
exist first). Tested locally in `scripts/migrations.test.mjs`.

**What's affected until it runs:**
- Profile page: the checkboxes show your old single choice, but saving
  can't store the new list. The profile saves everything else and shows
  an amber note naming this file.
- Scoring and offers use your old single choice (read as a one-item list).
- Co-op shows "Not available" everywhere, and "Add / edit a university"
  can't store the co-op answer or page link (the form says so).
- Nothing errors.

**Check:**
```sql
select count(*) from information_schema.columns where table_schema = 'public' and ((table_name = 'profiles' and column_name = 'focuses') or (table_name = 'universities' and column_name in ('coop_program', 'internship_support_url')));
```
Expect `3`. And the old columns should be gone:
```sql
select count(*) from information_schema.columns where table_schema = 'public' and column_name in ('primary_focus', 'has_coop');
```
Expect `0`.


## 6. `migration_010_featured.sql`

**What it does:** adds `universities.is_featured` (true/false, default
false). Featured schools are the ones shown by default on
recommendations, browse and the compare picker; nothing is deleted.

**What's affected until it runs:** nothing breaks. Every school is shown
(as before), and the app can't cache the university list, so browse and
recommendations re-read it on every visit (slower; see
docs/PERFORMANCE.md).

**Check:**
```sql
select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'universities' and column_name = 'is_featured';
```
Expect `1`.

## 7. `supabase/featured/featured.sql`

**What it does:** applies the relevance rule from
`scripts/relevance-rule.mjs` (R1/R2 research, SAT 75th percentile ≥ 1400,
a known ranking, or hand-curated in `data/curated/featured_us.csv`; every
non-Scorecard shared school is always featured). Generated by
`npm run data:featured`; re-run it whenever the rule, the curated list or
the Scorecard import changes. Safe to re-run.

**What's affected until it runs:** after step 6 every `is_featured` is
false, so the app notices nothing is featured yet and shows every school,
with "the featured list hasn't been set up yet" next to the count.

**Check:**
```sql
select source, count(*) filter (where is_featured) as featured, count(*) as total from public.universities where created_by is null group by source order by source;
```
Expect `College Scorecard 371 of 1577` and `illustrative 47 of 47`.


## 8. `migration_011_international.sql`

**What it does:** adds the `curated` source label (figures checked by hand
on a university's own website), lets `tuition` and `acceptance_rate` be
empty (null = not available), adds the local-currency columns
(`tuition_local`, `tuition_currency`, `tuition_basis`, `tuition_year`,
`fx_rate_date`, living cost and per-figure source URLs), `curated_id`,
`aliases`, and an accent-insensitive `search_text` column with a trigram
index (turns on the `unaccent` and `pg_trgm` extensions). Supabase may
warn it's "destructive": it only drops and re-creates two check
constraints; no data is removed.

**What's affected until it runs:** nothing breaks. The app can't cache the
university list (it notices the missing columns and reads without them),
so browse and recommendations are slower again; search falls back to
in-memory matching; no curated schools exist yet.

**Check:**
```sql
select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'universities' and column_name in ('curated_id', 'aliases', 'tuition_currency', 'search_text');
```
Expect `4`.

## 9. `seed_scorecard/00_link_existing.sql` … `06_universities.sql` (again)

**What it does:** the same upsert as step 4, regenerated with two
improvements: degree levels now come from the programs each school reports
to Scorecard (1,572 of 1,577 known instead of ~240), and every US school
links to its own College Scorecard page. Safe to re-run.

**What's affected until it runs:** Masters and PhD students only see the
~240 US schools whose levels were known before.

**Check:**
```sql
select count(*) filter (where cardinality(degree_levels) > 0) as levels_known, count(*) filter (where source_url like 'https://collegescorecard.ed.gov/%') as linked from public.universities where source = 'College Scorecard';
```
Expect `1572` and `1577`.

## 10. `seed_international/` (4 files, in order)

**What it does:** `00` gives 18 of the sample (illustrative) schools a
`curated_id` so they're upgraded **in place** (same id: saved schools and
applications keep working); `01` inserts or updates the 42 curated
universities (UK, Canada, Australia, Germany), replacing every
illustrative figure with a verified one or "not available"; `90` sets
co-op programs from `data/curated/coop_programs.csv`; `91` applies
rankings you entered (none yet). Safe to re-run.

**What's affected until it runs:** the 18 schools stay illustrative and the
24 new ones don't exist.

**Check:**
```sql
select source, count(*) from public.universities where created_by is null group by source order by source;
```
Expect `College Scorecard 1577`, `curated 42`, `illustrative 29`.

## 11. `seed_international/` again (5 files, in order)

**What it does:** the same upsert as step 10, regenerated with the second
and third batches: 111 curated universities in 26 countries (the
Netherlands, Switzerland, France, the Nordics, East and South Asia,
Italy, Ireland, Austria, Belgium, Spain, New Zealand and the UAE added).
`00` now links all 47 sample schools so they're upgraded **in place**,
which leaves no illustrative schools. `02_universities.sql` is new (the
file is split to stay small enough for the SQL Editor). Program lists
were added for Cambridge, UCL, Edinburgh, Warwick, Bristol and
Southampton. Safe to re-run.

**What's affected until it runs:** the 29 remaining sample schools stay
illustrative, the 40 new universities don't exist, and the six UK program
lists are missing (their major factor stays unknown).

**Check:**
```sql
select source, count(*) from public.universities where created_by is null group by source order by source;
```
Expect `College Scorecard 1577` and `curated 111` (no `illustrative` row).

## 12. `migration_012_country_info.sql`

**What it does:** creates the `country_info` table: per destination
country, how long graduates may stay after studying, the proof-of-funds
amount and the student work-hour limit, each with its government source
page and the date it was checked. Row level security is on; everyone can
read it, nobody can write to it through the app (only the SQL Editor).
Database checks refuse a figure without its source and date.

**What's affected until it runs:** nothing breaks. The details and offers
pages show "Visa guidance isn't set up yet" instead of the figures.

**Check:**
```sql
select relrowsecurity from pg_class where oid = 'public.country_info'::regclass;
```
Expect `true`.

## 13. `seed_country_info.sql`

**What it does:** fills in `country_info` for the 27 countries that have
schools (generated from `data/curated/country_info.csv`). Figures nobody
could verify on an official page are left empty. Safe to re-run.

**What's affected until it runs:** after step 12, every country shows
"Not available" for all three figures.

**Check:**
```sql
select count(*) as countries, count(post_study_text) as post_study, count(funds_text) as funds, count(work_text) as work from public.country_info;
```
Expect `27`, `16`, `7`, `16`.

## 14. `migration_013_offer_accept_by.sql`

**What it does:** adds `applications.accept_by` (a date, optional): the
date an offer must be accepted by. The offers page shows it as an
upcoming / due soon / overdue badge. The existing owner-only RLS policies
on `applications` already cover the new column.

**What's affected until it runs:** the Applications page still saves
everything else, but the accept-by date isn't stored; the form says so in
an amber note naming this file. The offers page shows no date badges.

**Check:**
```sql
select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'applications' and column_name = 'accept_by';
```
Expect `1`.

## 15. `migration_014_delete_my_account.sql`

**What it does:** adds a database function, `delete_my_account()`, that
deletes the account of whoever calls it, and nothing else. Deleting the
login removes the student's profile, saved schools, applications and the
universities they added (every table cascades from it). It runs with the
database owner's rights but only ever uses the caller's own id, so the app
never needs the secret service-role key. Only signed-in users may call it.
Supabase may warn it's "destructive" because the function contains a
`delete`; running the file itself deletes nothing.

**What's affected until it runs:** "Delete my account and data" on the
profile page says deletion isn't set up yet, and nothing is deleted.
Everything else works.

**Check:**
```sql
select proname, prosecdef from pg_proc where proname = 'delete_my_account';
```
Expect one row: `delete_my_account`, `true`.

---

When everything is run and checked, tell Claude "the Supabase steps are
done" so this file can be marked verified.
