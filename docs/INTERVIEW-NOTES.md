# Interview notes

The main decisions behind Unicelerate, each as *what, why, trade-off, what
I'd do next*. Every number comes from the project's own reports, tests or
measurements (sources in brackets). Resume bullets are at the end.

## 1. Honest data: null, never a guess

**What.** Every figure carries its source and a year or checked date.
Unknown values are stored as `null`, shown as "not available", and left out
of a score (the remaining weights are re-scaled), never counted as zero.

**Why.** Most data is missing for most schools. Of 1,877 schools, an
admitted-student grade average is published for 0, an SAT range for 924,
an admission rate for 1,577, and research impact for 539. Treating missing
as zero would bury every school outside the US. [PENDING-DB-STEPS,
COURSE-RELEVANCE-SOURCES, research-impact/coverage]

**Trade-off.** Scores rest on different numbers of signals for different
schools, so each card says how much is known (for example "data coverage:
Partial").

**Next.** More official sources per country (national statistics for city
size, and union club directories that publish counts).

## 2. Fit and strength kept apart ("Best you can get into")

**What.** *Fit* (budget, subject, country, grades) and *quality* (strength)
are separate. The default order is quality × plausibility (the chance of
admission, with a floor), behind a hard gate for degree level, budget and
countries.

**Why.** Sorting by fit alone put open-admission colleges first. Quality ×
plausibility puts a strong school the student can get into above a famous
long shot.

**Trade-off and a bug found by test.** Schools without admission data
originally took the median chance of the student's list: 100% for a
strong student, so Oxford counted as a sure admit. An eight-student test
harness on the real list found it (`lib/best-order.test.ts`). Unknown
schools now borrow the chances of known schools of similar strength.

**Next.** Published admission figures for non-US schools would replace the
borrowed estimate.

## 3. The admission model, on synthetic data

**What.** A logistic regression estimates admission chances for US
schools. It's trained on 78,850 **synthetic** applicants simulated around
each of 1,577 schools' real admission rate and SAT range. [ml/reports/admission_report.md]

**Why.** No free dataset of real applicants and outcomes exists. The
synthetic set shows the pipeline works on data with a known structure.

**Numbers.** Test ROC-AUC **0.895** vs a hand-written baseline rule's
0.627. Brier score 0.112 vs 0.190. Gradient boosting was no better (AUC 0.895).

**Trade-off.** The model only learns the rule used to simulate the data.
The site labels it "demo estimate, not a prediction" everywhere.

**Next.** Validate against real, consented admission outcomes if any
become available.

## 4. The strength index

**What.** Our own labelled 0–100 estimate for every one of the 1,877
schools: 1,863 measured, 14 estimated from similar schools and shown as a
range. It's computed at import time from Scorecard outcomes, Carnegie
level, Leiden and OpenAlex citation figures. [data/strength/report.md]

**Why.** Commercial rankings can't be copied, and the only signal that
exists worldwide is research output.

**Checks.** Rank correlation with Leiden is 0.87 overall, but Leiden is one
of the inputs. Without it, the index still correlates at 0.74 (US 0.68,
outside the US 0.62).

**Trade-off.** Outside the US it leans on research figures, which say
little about teaching.

**Next.** Add teaching signals for international schools (graduation rates
from national statistics).

## 5. Optional factors: visa and campus life

**What.** Visa and work rights (post-study work, proof of funds, work
hours, each from a government page) and two campus-life focuses can each
be switched on. When they're off, scores and order are identical
(regression tests).

**Why.** They matter to some students and not to others. Forcing them on
everyone would change everyone's list.

**Honesty fix.** Campus life first showed "High confidence" from four
indirect figures (setting, size, housing, sport membership), with no club
or event counts. It now shows "data coverage", which is "Good" only with
a published club, team or event count: 3 schools for academic community,
none for social life. [data/campus-life/coverage.md]

**Next.** Curate club counts from more student unions.

## 6. Row level security

**What.** Postgres row level security on every student-owned table
(profiles, courses, applications, saved schools, own universities,
reports). It's tested as a plain role: a student can't read, change, delete
or create another student's rows, and "delete my account" removes all six.
[scripts/rls.test.mjs]

**Why.** The browser talks to Supabase with a public key, so the database
itself must enforce ownership.

**Next.** Run the same tests against a Supabase branch database in CI.

## 7. Caching and speed

**What.** The shared list is cached server-side, packed by column, and
fetched in 1,000-row pages.

**Why and numbers.** Supabase returns at most 1,000 rows per request, so
browse silently showed only 1,000 of 1,624 schools; paging fixed it. With
the cache, `/recommendations` went from 2,220 ms to 327 ms and 10,360 KB to
298 KB. [docs/PERFORMANCE.md] The packed cache entry is about 1,511 KB,
under Next's 2 MB limit (tested).

**Live Lighthouse** (production build, 3 runs): landing performance 84–90,
`/universities` 85–86, accessibility 100 on both, no layout shift.

**Trade-off.** The cache is one day old at most, refreshed on demand after
an import.

**Next.** The packed list is close to its budget: trim columns before
adding more.

## 8. Testing

562 unit and integration tests (Vitest) include migration tests on an
in-memory Postgres, seeded fuzz tests over 8,000 random inputs and a
ranking harness on the real list. On top of that, 19 public-page browser
tests and axe accessibility checks run against a production build with a
fake database; a logged-in happy path (sign up to delete account) runs
against a local Supabase stand-in (real Postgres, migrations and row level
security, in memory); and Lighthouse runs in CI.

## Resume bullets (only numbers the project produced)

- Built and shipped Unicelerate, a university-matching web app (Next.js,
  TypeScript, Supabase), covering **1,877 universities in 27 countries**
  from official and cited sources; live at unicelerate.com.
- Designed a ranking that separates fit from school strength and found, with
  an 8-profile test harness on the real dataset, a bug that treated schools
  without admission data as certain admits; fixed it with peer-based
  estimates.
- Cut server time for the main list pages by **85%** (2,220 ms → 327 ms) and
  page size from 10.4 MB to 298 KB, and fixed a 1,000-row API limit that
  hid 624 schools.
- Trained a logistic-regression admission model on 78,850 synthetic
  applicants (test ROC-AUC **0.895** vs 0.627 for a rule baseline), clearly
  labelled as a demo.
- Built our own strength index for all 1,877 schools from open data (rank
  correlation 0.74 with the Leiden Ranking on signals independent of it).
- Wrote **562** automated tests plus 21 browser and accessibility tests
  (Lighthouse accessibility **100**), including row-level-security tests
  for every student-owned table. [X] users, [X] sign-ups: not measured.
