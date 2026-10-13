# Course relevance: sources and judgement

**These are our weights, based on published preparation guidance, and you
can edit them** (`lib/course-config.ts`). They are not official and not
empirical. Checked 2026-10-13.

## How it works and why

Admissions offices read the courses that matter for the program: a
Computer Science applicant on Maths and Computer Science, an Engineering
applicant on Maths, Physics and Chemistry. One overall average hides that.
So a student can list their courses (subject, level, grade %, year), and
each course counts by how relevant it is to their intended major:

- **Tiers** (three only, instead of invented decimals): core 1.0,
  supporting 0.6, general 0.3.
- **Level**: Standard 1.0, Honors 1.05, IB SL 1.05, AP / IB HL / A Level
  1.1. A modelling choice, not an official equivalence. It only changes
  how much a course *counts*, never its grade, and is capped at 1.1, so a
  few hard courses can't hide weak marks.
- **Relevant-coursework average**: the weighted mean of all the student's
  grades (weight = tier × level). With fewer than 2 core or supporting
  courses it's "not enough courses to say" (null), never a number from one
  course.
- **Where it counts**: only inside academic fit, as
  `effectiveGrade = 0.7 × overall + 0.3 × relevantAverage`, and only when a
  relevant average exists; with no courses everything is exactly as before
  (regression test).
- **The demo admission model is not changed**: it was trained on synthetic
  applicants without course data, so it keeps the overall percentage. The
  Reach/Match/Safety label uses the blended grade only through the
  rule-based path (when the model doesn't apply).
- **Honest limit, today**: academic fit compares the grade with a school's
  published average for admitted students, and **no school in our shared
  list publishes one** (0 of 1,688; 924 have an SAT range). So for shared
  schools the blend changes nothing yet; it applies to schools a student
  adds with an admitted average, and the required-course checks below work
  everywhere they're listed. The profile page says so.

## Major families

From the student's intended majors, by keyword (`lib/courses.ts`); the
first major that matches decides. Every major in the quiz list maps:

| Family | Matches, for example |
| --- | --- |
| Computer Science | Computer Science, Data Science, Software (but "Software Engineering" is Engineering), AI, Informatics |
| Engineering | any "… Engineering", Mechatronics, Aerospace |
| Mathematics & Statistics | Mathematics, Statistics, Actuarial Science |
| Life Sciences & Health | Biological Sciences, Medicine, Nursing, Pharmacy, Health, Neuroscience, Kinesiology |
| Physical Sciences | Physics, Chemistry, Astronomy, Earth Science, Natural Sciences |
| Business & Economics | Business, Economics, Finance, Accounting, Commerce, Management, Marketing |
| Social Sciences | Psychology, Sociology, Political Science, Law, Geography, Education |
| Humanities & Arts | English, History, Philosophy, Arts, Music, Design, Architecture, Languages |

## The table, and what backs each cell

Subjects not listed for a family are "general" (0.3). **S** = supported by a
published requirement or recommendation below; **J** = our judgement.

| Family | Core (1.0) | Supporting (0.6) |
| --- | --- | --- |
| Computer Science | Mathematics **S1 S2 S3**, Calculus **S1 S2**, Computer Science **J** (Waterloo *recommends* Grade 11 CS, S1) | Physics **J** (S3: some Cambridge colleges ask for it if taken; S9), Statistics **J**, English **S1 S2** |
| Engineering | Mathematics **S4 S5 S6**, Calculus **S4**, Physics **S4 S5 S6**, Chemistry **S4 S5** | Computer Science **J**, English **S4**, Statistics **J** |
| Mathematics & Statistics | Mathematics **S7**, Calculus **S7**, Statistics **J** | Computer Science **J**, Physics **J**, English **S7** |
| Physical Sciences | Mathematics **S8**, Calculus **J**, Physics **S8**, Chemistry **S8** | Biology **S8**, Computer Science **J**, Statistics **J** |
| Life Sciences & Health | Biology **S8 S10**, Chemistry **S8 S10** | Mathematics **S10**, Calculus **J**, Physics **S10**, Statistics **J**, English **J** |
| Business & Economics | Mathematics **S11 S12 S13**, Calculus **S13** | Economics **J** (S11, S12 say it is *not* required), Business **J**, Statistics **J**, English **S13 S14** |
| Social Sciences | Social Studies **J**, English **J** | Economics **J**, Statistics **J**, Languages **J**, Mathematics **J** |
| Humanities & Arts | English **J**, Languages **J**, Arts **J**, Social Studies / History **J** | none |

Notes on judgement calls:
- **Economics for Economics majors** is supporting, not core: LSE and
  Cambridge require Mathematics and say Economics isn't required. So a
  student strong in Economics but weak in Maths isn't lifted for an
  Economics major; the "English-heavy beats Maths-heavy" reversal shows up
  for Humanities and Social Science majors instead (tested).
- Social Sciences and Humanities tiers are judgement only: the program pages
  checked here were all quantitative.

## Sources (checked 2026-10-13)

| # | Program | What the page says | URL |
| --- | --- | --- | --- |
| S1 | Waterloo Computer Science | Requires Advanced Functions, Calculus and Vectors, Grade 12 U English; Grade 11 Computer Science recommended | https://uwaterloo.ca/future-students/programs/computer-science |
| S2 | Toronto Computer Science | Requires English and Calculus & Vectors (Advanced Functions at two campuses) | https://future.utoronto.ca/undergraduate-programs/computer-science/ |
| S3 | Cambridge Computer Science | Mathematics required; Further Maths if offered; Physics not required | https://www.undergraduate.study.cam.ac.uk/courses/computer-science |
| S4 | Waterloo Engineering (Software, Mechanical, Electrical, Biomedical) | Advanced Functions, Calculus and Vectors, Chemistry, Physics, English (ENG4U), each 70%+ | https://uwaterloo.ca/future-students/programs/software-engineering (and the other three programs' pages) |
| S5 | Toronto Engineering | "Competitive results in math, chemistry and physics" | https://discover.engineering.utoronto.ca/applying/admission-requirements/ |
| S6 | Cambridge Engineering | Mathematics and Physics required | https://www.undergraduate.study.cam.ac.uk/courses/engineering |
| S7 | Waterloo Mathematics | Advanced Functions, Calculus and Vectors, any 4U English | https://uwaterloo.ca/future-students/programs/mathematics |
| S8 | Cambridge Natural Sciences | Mathematics plus two of Biology, Chemistry, Physics | https://www.undergraduate.study.cam.ac.uk/courses/natural-sciences |
| S9 | MIT (general) | Math through some calculus; physics, chemistry and/or biology; challenging humanities | https://mitadmissions.org/apply/prepare/highschool/ |
| S10 | Cambridge Medicine | Chemistry plus one or two of Mathematics, Biology, Physics | https://www.undergraduate.study.cam.ac.uk/courses/medicine |
| S11 | Cambridge Economics | Mathematics required; Economics not required | https://www.undergraduate.study.cam.ac.uk/courses/economics |
| S12 | LSE Economics | A-level Mathematics required; Economics not required | https://www.lse.ac.uk/study-at-lse/undergraduate/bsc-economics |
| S13 | Waterloo Accounting and Financial Management | English, Advanced Functions, Calculus and Vectors (75%+) | https://uwaterloo.ca/future-students/programs/accounting-and-financial-management |
| S14 | Waterloo Economics | Grade 12 U English required; Calculus and Advanced Functions strongly recommended | https://uwaterloo.ca/future-students/programs/economics |

## Required-course checks

`lib/program-prerequisites.ts` lists the 16 programs above whose *required*
courses were confirmed on their own page (S1–S8, S10–S14), with the URL and
check date. A concern line appears only when a student has entered courses,
their major matches the program, and none of a required group is in their
list ("University of Waterloo Computer Science expects Calculus; none in your
course list (check the school's page)").

Left out (couldn't verify): Oxford Computer Science and UCL Economics
(pages refuse automated access), Imperial Computing (the current page
doesn't state a subject requirement), Toronto Commerce and Life Sciences,
McMaster Engineering (pages moved or didn't list courses).
