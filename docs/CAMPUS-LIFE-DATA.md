# Campus life: what data exists, and what we use

Checked 2026-10-13. Numbers: `lib/campus-life-config.ts` (all our
judgement unless a source is named). Code: `lib/campus-life-score.ts`
(scoring, also run by the import), `lib/campus-life.ts` (what students see).
Coverage per proxy: [data/campus-life/coverage.md](../data/campus-life/coverage.md).

## How it works and why

There is no free, official "social life" rating, and a school can be strong
at one kind of campus life and quiet at another (lots of design teams and
co-op events, few big spectator events, or the reverse). So there are **two
separate focuses**, never blended:

- **Academic & career community**: design / project teams, academic and
  professional clubs, hackathons, co-op, research activity and impact.
- **Campus social life & fun**: setting (city / suburb / town / rural),
  undergraduate enrolment, campus housing, varsity sport membership, social
  and cultural clubs.

Each proxy is a published, cited figure turned into 0..1 (below). A
proxy we don't have is left out and the rest are re-weighted; nothing is
ever counted as zero because it's missing.

Each kind shows its **data coverage**: what was actually measured, not
how many numbers there are. Setting, enrolment, housing and sport
membership (social), and co-op, Carnegie level and research impact
(academic) are *indirect*: none of them counts a club, a team or an
event. So:

- **Good**: at least one *direct* figure (a published club, team or event
  count) and at least 3 figures in all.
- **Partial**: anything less, including four indirect figures and no
  direct one (most US schools' social life, e.g. MIT).
- **Not available**: nothing published.

(The first release called this "confidence" and showed High for four
indirect figures, which overclaimed; changed 2026-10-13.)

They plug in like every other focus: a student ticks neither, one or both,
and the ticked focuses split the 20 focus points (weights still add to
100). **Balanced (nothing ticked) is unchanged**: it still spreads the 20
points over the original four focuses, so a student who picks neither sees
exactly the scores and order they had before (regression test).

The proxies are stored at import time (`npm run data:campus-life:build` →
`universities.campus_life`, with the "Not sure" score precomputed), like
the strength index. The student's optional follow-up choices only re-weight
those stored proxies.

Students see **the proxies themselves**, with sources ("Large city setting
· 45,638 undergraduates", "44 design / project teams listed"), never a
number, and the copy rule is: *a proxy based on published figures, not a
rating of how fun the place is.* Nothing says "party school", "not fun" or
"good social scene".

## Proxies

### Academic & career community

| Proxy | Source | Year | Turned into 0..1 | Coverage (of 1,688) |
| --- | --- | --- | --- | --- |
| Design / project teams | The school's own page (curated, with URL and date) | checked 2026-10-13 | count ÷ 40, capped at 1 (J) | 2 |
| Academic & professional clubs | School or student-union page (curated) | checked 2026-10-13 | count ÷ 150 (J) | 1 (Warwick) |
| Hackathons | School page or an official organiser's page (curated) | none yet | count ÷ 2 (J) | 0 |
| Co-op / internships | Existing co-op data (school's own page) | as checked | mandatory 1, optional 0.5, none 0 (existing) | 8 |
| Research activity | Carnegie Classification via College Scorecard (existing) | Scorecard 2024 | R1 1, R2 0.7, doctoral/professional 0.4, other 0 (existing) | 1,519 |
| Research impact | Leiden Ranking Open Edition 2025 (existing) | 2020–2023 | percentile ÷ 100 | 350 |

### Campus social life & fun

| Proxy | Source | Year | Turned into 0..1 | Coverage (of 1,688) |
| --- | --- | --- | --- | --- |
| Setting | IPEDS HD `LOCALE` (NCES locale codes, the same code Scorecard publishes) | 2024-25 | large city 1 … rural (remote) 0; order is NCES's, spacing ours (J) | 1,577 |
| Size | College Scorecard undergraduate enrolment | 2024 | log scale, 1,000 → 0, 40,000 → 1 (J) | 1,577 |
| Campus housing | IPEDS IC `ROOMCAP` (housing capacity) ÷ Scorecard enrolment | 2023-24 (last year collected) | share, capped at 1 | 1,573 |
| Varsity sport events | IPEDS IC `ASSOC1`–`ASSOC6`, `SPORT1`, `CONFNO1`; conference pages for Canada | 2024-25 / checked 2026-10-13 | NCAA with FBS football 1, NCAA football 0.75, NCAA 0.5, U SPORTS 0.5, other national body 0.35, none 0 (J) | 1,581 |
| Social & cultural clubs | School or student-union page (curated) | checked 2026-10-13 | count ÷ 300 (J) | 1 (Warwick) |

**J** = our judgement (a modelling choice you can change in
`lib/campus-life-config.ts`). "FBS" conferences are the ones NCAA.com lists
on its [FBS standings](https://www.ncaa.com/standings/football/fbs) page
(checked 2026-10-13), matched to IPEDS's conference names. Housing capacity
can exceed undergraduate enrolment where graduate students live on campus
too, so the share is capped.

Varsity sport is labelled "has varsity sport events", never "atmosphere".

### Optional follow-up choices

Under "Academic & career community": Hackathons & tech / Competitions &
project teams / Clubs & societies / Career & networking events / Research
/ Not sure. Under "Campus social life & fun": Big events & sports / Greek
life / City life & nightlife / Festivals & concerts / Quiet & close-knit /
Not sure. Weights (relative; all J):

| Choice | Proxies and weights |
| --- | --- |
| Hackathons & tech | hackathons 3, project teams 1, academic clubs 1 |
| Competitions & project teams | project teams 3, hackathons 1 |
| Clubs & societies | academic clubs 3, project teams 1 |
| Career & networking events | co-op 3, academic clubs 1 |
| Research | research activity 2, research impact 2 |
| Big events & sports | varsity sport 3, size 2, housing 1 |
| Greek life | none: no official source (see below), so it can't change a score and the explanation says so |
| City life & nightlife | setting 3, size 1 |
| Festivals & concerts | size 2, social clubs 2, setting 1 |
| Quiet & close-knit | size 2 and setting 1 and varsity sport 1, each **flipped** (1 − value), plus housing 2 |
| Not sure, or nothing ticked | every proxy of that kind, weight 1 |

Several choices are each scored on their own and averaged, so opposite
choices (Big events and Quiet) balance out instead of one silently
winning. Tested: a "Quiet & close-knit" student prefers a small-town school
over a big-city one with the same other data, and "City life & nightlife"
the reverse.

## Licences and terms

| Source | Licence / terms |
| --- | --- |
| [IPEDS data files](https://nces.ed.gov/ipeds/use-the-data) (HD2024, IC2024, IC2023 revised), with the documented layout in each file's dictionary (`*_Dict.xlsx`) | U.S. government work (NCES), public domain |
| [College Scorecard](https://collegescorecard.ed.gov/data/) | Already used; listed as CC BY on data.gov, credited |
| [NCAA.com FBS standings](https://www.ncaa.com/standings/football/fbs) | Only the list of conference names is referenced (facts), nothing copied |
| [Canada West member directory](https://canadawest.org/insidecw/memberdirectory) | Membership facts, linked |
| [SFU News, 2026](https://www.sfu.ca/sfunews/media/media-releases/2026/06/simon-fraser-university-becomes-u-sports--59th-member-university.html) | Membership fact, linked |
| [Waterloo Sedra Student Design Centre](https://uwaterloo.ca/sedra-student-design-centre/catalogs/directory-teams/category), [UBC Engineering design teams](https://engineering.ubc.ca/engineering-design-teams-list) | Counts (facts) from the schools' own pages, linked |

Hand-checked rows live in `data/curated/campus_life.csv`; the build refuses
a row without an https `source_url` and a `checked_on` date (and a test
checks it too).

## What was looked at and rejected

- **Niche, Unigo, Princeton Review, Reddit, RateMyProfessor and every
  ranking site**: not used, by rule. They're opinions or proprietary
  ratings, not published figures.
- **Greek life**: no official, free source lists which schools have
  fraternities and sororities (IPEDS doesn't collect it), so it isn't
  scored. Students who pick it are told so.
- **Hackathons (Major League Hacking's season list)**: not used in this
  pass, because we haven't confirmed its terms allow reuse. A hackathon
  count is only added from a school's or an official organiser's own page;
  none yet.
- **Statistics Canada city populations** (for setting outside the US): the
  download sits behind a bot check ("Security Check") that we don't get
  around, so non-US setting is left out. It could be added by hand later
  from the census pages.
- **U SPORTS member list**: the national body's member page returned "not
  found"; membership comes from the Canada West directory and SFU's own
  release instead. OUA's member page doesn't name the schools in its page
  text, so the Ontario schools' membership is left out until a citable
  list is found.
- **Club directories tried on 2026-10-13**: Warwick SU lists every society
  with a category in its page, so it's counted (70 Academic; 161 in
  Cultural, Performance, Activities and Games, Film and Media, Religious
  and Belief, Food and Beverage or Music Appreciation, each society once).
  Cambridge SU lists 507 societies but without categories, so academic and
  social can't be told apart from the page. Imperial, UCL, Manchester,
  St Andrews, Southampton, Edinburgh, Glasgow, Toronto (SOP), UBC (AMS),
  McMaster and McGill build their lists in the browser, so nothing countable
  is in the page; KCL and Leeds refused automated access (403); LSE,
  Oxford, Durham, Bristol and Queen's returned "not found" at the URLs
  tried. Their coverage stays Partial until a count can be cited.
- **McGill and U of T design teams**: McGill's page refuses automated
  access and the U of T Engineering Society's list is built in the
  browser, so neither count is included.
- **IPEDS student services** (career counselling, placement services): almost
  every school answers "yes", so it doesn't tell schools apart; not used.
- **IPEDS housing capacity for 2024-25**: no longer collected in IC2024, so
  the 2023-24 revised figure is used and labelled with its year.

## Honest limits

- Data coverage is **Good** for academic community at 3 schools (Waterloo,
  UBC, Warwick) and for social life at none: no US school has a published
  club or event count here, so every US school's social life is
  **Partial**, and the page says so ("no club or event counts published")
  instead of letting a school look dull.
- Social life outside the US is mostly **Not available**.
- These are proxies for what's on offer, not for how any student will
  experience a place.
