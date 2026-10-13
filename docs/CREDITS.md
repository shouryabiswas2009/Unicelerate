# Credits and licences

Everything the site shows that wasn't written for this project, with its
licence, plus the things that were made for it. This file is also the
site's public /credits page, so keep it up to date when adding a font,
icon set, image, graphic or data source (and keep links absolute https).

## Logo

The Unicelerate logo (a graduation cap lifted by an upward swoosh) is
**original, made for this project**. It's hand-drawn as SVG paths in
`components/brand/mark.ts` and doesn't copy or
adapt any other brand's logo or a stock icon. The tab icon, app icons and
share image are generated from it (`npm run brand:icons`, and
`app/opengraph-image.tsx`).

## Images

| What | Where it's used | Source | Licence |
| --- | --- | --- | --- |
| Photo of a college building behind a striped lawn, by **Vadim Sherbakov** | Landing page hero | <https://unsplash.com/photos/brown-concrete-palace-under-blue-sky-at-daytime-d6ebY-faOO0> (served from `images.unsplash.com/20/cambridge.JPG`, resized by `next/image`) | [Unsplash License](https://unsplash.com/license): free to use, no permission needed; credit given here as a courtesy |

The screen previews on the landing page are drawn with the site's own
components and real computed data; they're not images.

## Fonts

| Font | Used for | Licence |
| --- | --- | --- |
| [Geist](https://vercel.com/font) and Geist Mono | Body text, code | SIL Open Font License 1.1 |
| [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans) | Headings | SIL Open Font License 1.1 |

Both are self-hosted at build time by `next/font`.

## Icons

| What | Licence |
| --- | --- |
| [Lucide](https://lucide.dev) icons (`lucide-react`) | ISC |
| [flag-icons](https://github.com/lipis/flag-icons) | MIT |

## Data

See the README's "Where the data comes from": U.S. Department of Education
College Scorecard (public domain, U.S. government work), each university's
own website (figures linked to their page), government immigration websites
for visa guidance, and European Central Bank reference exchange rates.

### Research impact (Leiden Ranking / OpenAlex)

| Source | What we use | Licence |
| --- | --- | --- |
| [CWTS Leiden Ranking Open Edition 2025](https://open.leidenranking.com) ([data on Zenodo](https://doi.org/10.5281/zenodo.17473224)) | PP(top 10%) per university and main field, 2020–2023, turned into percentiles | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| [OpenAlex](https://openalex.org) institutions | Citation figures for the strength index (works, citations, h-index, i10-index, 2-year mean citedness) and websites/other names to match universities; the Leiden Ranking is itself built from OpenAlex. Licence checked on OpenAlex's site: the data snapshot's `LICENSE.txt` is CC0 1.0 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| [Wikidata](https://www.wikidata.org) | Which ROR id belongs to which US (IPEDS) school id, to match US universities | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| [ROR](https://ror.org) (Research Organization Registry) ids, as listed in the sources above | The shared identifier that links them | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

No commercial ranking (QS, Times Higher Education, U.S. News,
ShanghaiRanking, Webometrics, uniRank) is copied into the site or its
database; why each was or wasn't used is in
[DATA-SOURCES-CONSIDERED.md](https://github.com/shouryabiswas2009/Unicelerate/blob/main/docs/DATA-SOURCES-CONSIDERED.md).

### Strength (Unicelerate index)

Our own estimate, computed from the College Scorecard, Leiden Ranking and
OpenAlex data above; not an official ranking. It inherits their licences:
College Scorecard is listed as [CC BY](https://catalog.data.gov/dataset/college-scorecard)
on data.gov (credited here), the others are CC0.

### Grade conversions (profile)

Only conversions the exam boards publish themselves; anything else is the
student's own nearest percentage, marked approximate.

| System | Rule used | Source |
| --- | --- | --- |
| CBSE Class X CGPA | Indicative percentage = 9.5 × CGPA | [CBSE Circular No. 24, 28 May 2010](https://www.cbse.gov.in/circulars/cir24-2010.pdf) |
| IB Diploma subject grades | Middle of the IB's suggested mark range per grade (7 = 96–100 … 1 = 1–20), averaged over subjects | [International Baccalaureate, Suggested Conversion for students applying to Indian Universities, April 2012](https://aiu.ac.in/documents/evaluation/Grade%20Conversion%20IB.pdf) |
| Cambridge International A Levels | Middle of the percentage uniform mark range per grade (A* = 90–100 … E = 40–49), averaged over subjects | [Cambridge International, India frequently asked questions (2025), Appendix 1](https://www.cambridgeinternational.org/Images/745293-india-frequently-asked-questions.pdf) |
| US GPA | Not converted (no published GPA-to-percentage table); the student enters their nearest percentage. College Board's per-class guide is linked as guidance | [College Board BigFuture](https://bigfuture.collegeboard.org/plan-for-college/get-started/how-to-convert-gpa-4.0-scale) |
| Ontario, British Columbia, Alberta, Manitoba | Not converted: marks are already percentages, as each ministry says (Alberta: the final mark blends 70% course work and 30% diploma exam) | [Ontario](https://www.ontario.ca/page/student-assessment-evaluations-and-report-cards), [British Columbia](https://www2.gov.bc.ca/gov/content/education-training/k-12/administration/legislation-policy/public-schools/student-reporting), [Alberta](https://www.alberta.ca/diploma-exams-overview), [Manitoba](https://www.edu.gov.mb.ca/k12/assess/report_card/docs/provincial_report_card_policy.pdf) |
| Quebec (CEGEP R-score) | Not converted: the R-score is a rank-based score, not a percentage; the student's nearest percentage, marked approximate | [BCI, cote R](https://www.bci-qc.ca/cote-r/) |
| AP | Not converted: AP scores are 1–5 with no published percentage conversion | [College Board, About AP Scores](https://apstudents.collegeboard.org/about-ap-scores) |
| Australia (ATAR) | Not converted: the ATAR is a rank, not a mark | [UAC](https://www.uac.edu.au/future-applicants/atar) |

Saskatchewan and the Atlantic provinces are offered too, kept approximate
until an official page confirms how their marks are reported. What was
checked and left out: [GRADE-SYSTEMS-CONSIDERED.md](https://github.com/shouryabiswas2009/Unicelerate/blob/main/docs/GRADE-SYSTEMS-CONSIDERED.md).

### Course relevance and required courses (profile)

Our own weights, based on published preparation guidance; not official.
The required-course checks quote each program's own page: University of
Waterloo (Computer Science, Software, Mechanical, Electrical and Biomedical
Engineering, Mathematics, Accounting and Financial Management, Economics),
University of Toronto (Computer Science, Engineering), University of
Cambridge (Computer Science, Economics, Engineering, Medicine, Natural
Sciences), LSE (Economics), and MIT's general preparation guidance. URLs and
check dates: [COURSE-RELEVANCE-SOURCES.md](https://github.com/shouryabiswas2009/Unicelerate/blob/main/docs/COURSE-RELEVANCE-SOURCES.md).

### Campus life (proxies, not ratings)

| Source | What we use | Licence / terms |
| --- | --- | --- |
| [IPEDS data files](https://nces.ed.gov/ipeds/datacenter/DataFiles.aspx) (NCES): HD2024, IC2024, IC2023 revised | Setting (NCES locale code), athletic association and football conference, campus housing capacity | U.S. government work, public domain |
| [NCAA.com FBS standings](https://www.ncaa.com/standings/football/fbs) | Which football conferences are the top division (names only) | Facts, linked |
| [Canada West member directory](https://canadawest.org/insidecw/memberdirectory), [SFU News](https://www.sfu.ca/sfunews/media/media-releases/2026/06/simon-fraser-university-becomes-u-sports--59th-member-university.html) | U SPORTS membership for UBC, Alberta, Calgary and SFU | Facts, linked |
| [Waterloo Sedra Student Design Centre](https://uwaterloo.ca/sedra-student-design-centre/catalogs/directory-teams/category), [UBC Engineering design teams](https://engineering.ubc.ca/engineering-design-teams-list) | Design-team counts | Facts from the schools' own pages, linked |

Enrolment, research activity, research impact and co-op come from the
sources above. What was checked and rejected (no review sites, no ranking
sites, nothing behind a bot check):
[CAMPUS-LIFE-DATA.md](https://github.com/shouryabiswas2009/Unicelerate/blob/main/docs/CAMPUS-LIFE-DATA.md).
