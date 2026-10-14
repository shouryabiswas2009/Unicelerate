# Feature notes

Short "how it works and why" notes for smaller features.

## Display currency (profile)

**Why.** Budgets and costs are in US dollars so every school can be
compared on one scale, but most students think in their own currency.

**How.** The profile has "Also show amounts in" (`profiles.display_currency`,
migration_016; US dollars by default). Amounts are still stored and
compared in dollars; next to them the app adds "≈ amount" in that
currency (`lib/display-currency.ts`, tested), on the profile's budget, in
"Your fit" on a university's page, in compare and on the offers page. The
conversion uses the same dated European Central Bank reference rates as
curated tuition (`lib/exchange-rates.ts`, `npm run data:fx`), is rounded to
three significant figures, and always says "approximate, at the European
Central Bank rate of <date>". Only currencies with an official rate are
offered (the UAE dirham uses its official peg); nothing is guessed.

## Grade systems (profile)

**Why.** Students come with CBSE CGPAs, IB grades, A Levels or US GPAs,
but every comparison (admission figures, the model, What if?) works on one
percentage.

**How.** The profile asks for the grading system, then the grades
(`components/profile/grades-field.tsx`), and `lib/grades.ts` (tested for
every conversion) turns them into the percentage, only with the board's
own published rule:
- CBSE Class X CGPA: 9.5 × CGPA (CBSE Circular 24/2010).
- IB subject grades: the middle of each grade's range in the IB's
  suggested conversion for Indian universities (the IB says to use the
  midpoint), averaged.
- Cambridge International A Levels: the middle of each grade's percentage
  uniform mark range, averaged, exactly as Cambridge's own worked example
  (A*, A, B → 85%). If the statement of results shows PUMs, the student
  enters those instead, as Cambridge asks.
- US GPA and anything else: there's no published table to a single
  percentage (College Board says its per-class table isn't a formula for a
  GPA), so the student gives their nearest percentage and it's stored and
  shown as approximate.

How the percentage was obtained is saved with it (`grade_system`,
`grade_input`, `grade_basis`, migration_017) and shown in "Your fit" and
compare. Sources are linked in the form and listed on /credits.

## Report a wrong figure, and "data last checked"

**Why.** Figures go out of date, and students often spot it first. Every
figure should also say how fresh it is.

**How.** A university's page lists each source behind it with the date it
was last checked (`lib/source-dates.ts`, tested): College Scorecard's fetch
date and data year, the date a curated row was checked by hand, the ECB
rate date for converted money, and the Leiden Ranking's download date. No
date is shown where none was recorded.

Under that list, signed-in students can "Report a wrong figure"
(`components/universities/report-figure.tsx`, validated in
`lib/figure-report.ts`, saved by `lib/actions/reports.ts`). Reports go into
`figure_reports` (migration_018) with row level security: a student can
only add reports as themselves, only about shared universities, only as
"open", and can only read their own (listed on their profile with their
status). Students can't change or delete them. The policies are tested
under a non-superuser role in `scripts/migrations.test.mjs`.

**Reviewing reports** (SQL Editor, which isn't subject to row level security):

```sql
-- Open reports, newest first
select r.created_at, u.name, r.field, r.current_value, r.suggested_value,
       r.source_url, r.note, r.id
from public.figure_reports r
join public.universities u on u.id = r.university_id
where r.status = 'open'
order by r.created_at desc;

-- After checking one against its source
update public.figure_reports set status = 'fixed' where id = '<id>';   -- or 'rejected'
```

Correct the figure itself in its source file (for example
`data/curated/international_universities.csv`) and re-run that import, so
the fix survives the next import.

## Visa and work rights (optional factor)

**Why.** For many students the post-study work window, proof of funds and
work rights decide where to apply, but not for everyone, so the student
chooses: **Ignore it** (the default: no effect anywhere), **Show it, don't
score it** (a visa line on cards, compare and offers), or **Factor it in**
(Low / Medium / High), plus "Do you plan to work or stay after
graduating?". Saved on the profile (migration_020), also in the quiz and as
a quick switch on the recommendations page.

**How.** `lib/visa.ts` `visaFit()` (pure, tested) uses only the cited
figures in `country_info`:
- post-study work window, scaled up to 36 months (left out if the student
  is returning home; counted half if they're not sure);
- proof of funds, per month in US dollars at the dated ECB rate, against
  what the student's yearly budget leaves after tuition (tuition has to be
  paid either way, so this holds whether the rule adds it on top or not);
- work hours allowed during study, up to 24 a week (0 is a real figure).
Missing figures drop out and the rest are re-weighted; with nothing known
the visa adds nothing and the card says "Visa information not available".
Weights and caps are named constants in `lib/scoring-config.ts`.

**Where it counts (Factor it in only).** The match score gets a "Visa and
work rights" factor; its 5 / 10 / 15 points come proportionally from every
other factor, so the total stays 100 (`fitWeights` in lib/matching.ts, the
same weight machinery as the focuses). "Best you can get into" multiplies
quality × chance by up to 10 / 20 / 30% less for a weak visa score; quality
itself never changes. Offers get a "Visa and work rights" slider (starting
at the chosen weight; hidden when ignored) that the robustness check
includes; compare marks the best visa figure only in this mode. Neutral
wording only ("longer post-study window", "less time to work during
study"); "guidance only, not legal advice" and the age of each check
(`checkAge`) wherever visa data appears. Nationality isn't known, so it's
always general guidance. Tests: `lib/visa.test.ts`,
`lib/visa-scoring.test.ts` (ignore = identical scores and order;
long window up, funds above budget down; missing data left out; going home
removes the post-study part; weights add up to 100).

## More grade systems (Canada first)

**Why.** Canadian students (and many others) landed in "Another system"
and were marked approximate even when their marks are plain percentages.

**How.** 12 more systems in `lib/grades.ts`, grouped in the picker
(Percentage-based, Canada, International programmes, India, Other
countries, Other), with the student's own country's group first and a
filter box ("Ontario", "IB"). Ontario, BC, Alberta and Manitoba are
**exact**: their ministries say marks are percentages, so nothing is
converted and the source shows it. Quebec's R-score, the ATAR and AP
scores are ranks or 1–5 scores, so they're never converted; the student
enters their nearest percentage, marked approximate. Saskatchewan and the
Atlantic provinces stay approximate until an official page confirms their
scale. Each option says exactly what to enter ("average of your best six
Grade 12 U/M courses"). Old saved values keep working; migration_021 widens
the database's list. What was checked and left out:
`docs/GRADE-SYSTEMS-CONSIDERED.md`.

## A guided profile page

**Why.** The profile was one long form of about 15 unrelated controls, with
nothing saying what matters, what's optional or how complete it was.

**How.** `app/(dashboard)/profile/page.tsx`:
- **Profile strength**: "6 of 9 filled in" (a plain count of real fields,
  `lib/profile-completeness.ts`), each missing item linked to its section
  with what adding it changes ("Adding SAT lets us estimate admission
  chances for US schools").
- **Quick start presets** (`lib/profile-presets.ts`, plain config): links
  that pre-fill grades, currency and countries; nothing is saved until Save.
- **Six numbered sections** (01 About you, 02 Your academics, 03 What you
  want to study, 04 Money, 05 Your priorities, 06 Account) with a sticky
  list of them on large screens and a stacked layout on phones; hairlines
  between sections, no boxes.
- **Each section saves on its own** (`saveProfileSection`): the saved
  profile with only that section's fields replaced, validated as a whole by
  the existing rules (`lib/profile-sections.ts`, tested), so a section can
  never wipe another. Status next to each Save: "Saving…", "Saved ✓",
  "Couldn't save: …"; field errors beside the fields; announced with
  `aria-live`. A new profile (or an applied preset) is one form with one
  Save, because its required fields span several sections.
- **Money** as a range with sliders and number boxes, shown in US dollars
  and the display currency, with the note that US net price isn't used.
- **Your priorities** groups the focuses and the visa choice.
- **Your top 3 right now**: the same "Best you can get into" ranking,
  computed on the server and cached per saved profile, so it changes after
  a save, not per keystroke.
- Native inputs and selects (no dropdown library), 44px targets, labels
  tied to inputs. The page's browser JavaScript went from 9 chunks / 238 KB
  to 7 chunks / 161 KB (uncompressed, from the build's client manifest).

## Course weighting by major (optional)

**Why.** One overall average hides that a Computer Science applicant is read
on Maths and Computer Science, an Engineering applicant on Maths, Physics
and Chemistry.

**How.** In "Your academics" a student can list courses (subject, level,
grade %, year; up to 20; table `profile_courses`, migration_022, owner-only,
removed with the account). `lib/courses.ts` (tested) maps their major to a
family, weights each course by relevance (core 1.0 / supporting 0.6 /
general 0.3) × a capped level multiplier, and computes a relevant-coursework
average (null with fewer than 2 relevant courses). Academic fit uses
`0.7 × overall + 0.3 × relevant average`; with no courses nothing changes.
The demo admission model is untouched (trained without courses). Honest
limit: no shared school publishes an admitted-student average, so today the
blend only affects schools a student adds with one; the profile says so.
Required-course checks for 16 programs, each from the program's own page,
add a concern line when a listed requirement is missing. Weights and their
sources: `docs/COURSE-RELEVANCE-SOURCES.md`; all numbers in
`lib/course-config.ts`.

## Campus life: two separate focuses (optional)

**Why.** A school can be full of design teams, hackathons and co-op events
but quiet socially, or the reverse. One blended "social" score would hide
that, and there is no free, official rating of either.

**How.** Two new focuses in "What matters most": *Academic & career
community* and *Campus social life & fun*, each with optional follow-ups
(e.g. Hackathons & tech, Quiet & close-knit). They split the 20 focus
points like the others; Balanced is unchanged, so picking neither changes
nothing (regression test). Each is built only from cited proxies (IPEDS
setting, housing and athletics; Scorecard enrolment; existing co-op and
research data; a few hand-checked team counts and conference memberships),
stored at import time (`npm run data:campus-life:download` then
`data:campus-life:build`, migration_023 + `seed_campus_life/`). Unknown
proxies are left out and re-weighted; each kind shows its data coverage
(Good only with a published club, team or event count; otherwise Partial). Cards and the detail page list the
proxies with sources, side by side and never as a number; compare shows a
row per proxy; the offers page has a slider for each; What-if can switch
them on; the landing quiz has an optional question. Data, weights, licences
and what was rejected: `docs/CAMPUS-LIFE-DATA.md`.
