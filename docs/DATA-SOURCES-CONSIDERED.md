# Data sources considered for university strength

Every source looked at for the Unicelerate strength index, what its
licence or terms say about reuse (read on 2026-10-07), and what we decided.
The rule: only use a source whose licence or terms explicitly allow reuse.
If the terms couldn't be read or are unclear, the source is treated as not
allowed.

| Source | Licence / terms (checked 2026-10-07) | Decision |
| --- | --- | --- |
| **QS World University Rankings** (topuniversities.com) | The terms page refuses automated access (HTTP 403), so its terms couldn't be read. | **Not used.** Unclear terms count as not allowed; no QS numbers anywhere. Permission can be requested at content@qs.com (see docs/RESEARCH-IMPACT.md). |
| **Times Higher Education** (timeshighereducation.com) | [Website Terms of Use](https://www.timeshighereducation.com/website-terms-of-use): requests to reproduce or distribute rankings data must go to THE; scraping, spiders and data mining are not allowed. | **Not used.** |
| **U.S. News & World Report** (usnews.com) | Its terms page didn't respond to our requests (timed out twice), so the terms couldn't be read. | **Not used** (unclear = not allowed). |
| **ShanghaiRanking / ARWU** (shanghairanking.com) | Only "Copyright © 2026 ShanghaiRanking Consultancy. All Rights Reserved." No licence for reuse. | **Not used.** |
| **Webometrics** (webometrics.info) | The site couldn't be reached (the domain didn't resolve), so no terms could be read. | **Not used** (unclear = not allowed). |
| **uniRank** (unirank.org) | [Terms](https://www.unirank.org/terms/): scraping or republishing university data without prior written permission isn't allowed. | **Not used.** |
| **Wikipedia ranking lists** | Wikipedia text is CC BY-SA 4.0, but its ranking tables copy QS, THE, ARWU and U.S. News figures, whose own terms don't allow reuse. The share-alike licence can't grant rights Wikipedia doesn't have. | **Not used.** |
| **OpenAlex** (openalex.org) | Data released under **CC0 1.0** (the snapshot's `LICENSE.txt`; docs: data is free, the API free for casual use). | **Used**: citation signals per institution (works, citations, h-index, i10-index, 2-year mean citedness) and names/websites for matching. |
| **CWTS Leiden Ranking Open Edition 2025** | Results and data released under **CC0 1.0** ([resources page](https://open.leidenranking.com/resources)). | **Used**: research impact, PP(top 10%), overall and per field. |
| **Wikidata** | "All structured data … is released into the public domain under Creative Commons Zero" ([licensing](https://www.wikidata.org/wiki/Wikidata:Licensing)). | **Used** only for IPEDS id ↔ ROR id, to match US schools. Student counts, founding years and institution types were **not** used: coverage and consistency vary between items, and the index doesn't need them (US peer groups use the Carnegie level from College Scorecard). |
| **ROR** (Research Organization Registry) | CC0 1.0. | **Used** as the shared identifier (via Leiden, OpenAlex and Wikidata). |
| **US College Scorecard** (US Department of Education) | The [data.gov record](https://catalog.data.gov/dataset/college-scorecard) lists the licence as CC BY (attribution); it's a US government dataset. | **Used** (already imported): graduation rate, retention rate, median earnings, SAT, Carnegie research level. Credited on /credits. |
| **Other national bodies** (UK HESA / Discover Uni, Australia QILT, others) | HESA's copyright page refused automated access (HTTP 403); the others weren't evaluated in depth. | **Not used yet.** Each would need its own terms check and matching; a possible later addition for non-US outcome data. |

Commercial rankings never enter the site or database. An exact rank isn't
needed: the strength index is our own labelled estimate built from the
open sources above (docs/STRENGTH-INDEX.md).

## Study-visa grant or refusal rates (for the visa factor)

Checked 2026-10-08. The visa factor (lib/visa.ts) uses only the cited
figures in `country_info` (post-study work window, proof of funds, work
hours). A "difficulty" signal would only ever come from an officially
published statistic, with its source, year and check date.

| Country | Official figure? | Decision |
| --- | --- | --- |
| United Kingdom | Home Office *Immigration system statistics*: entry clearance visa applications and outcomes for sponsored study, by nationality ([gov.uk release](https://www.gov.uk/government/statistics/immigration-system-statistics-year-ending-june-2026/why-do-people-come-to-the-uk-study)); a grant rate can be derived from applications and outcomes (Open Government Licence). | Not added yet (see below). |
| Australia | Department of Home Affairs, *Student visa program* reports: lodged, granted and grant rate by citizenship country, monthly ([data.gov.au listing via researchdata.edu.au](https://researchdata.edu.au/student-visa-program)). | Not added yet. |
| Canada | No open dataset of study-permit approval rates; IRCC has given approval rates by **country of residence**, top 10 countries only, in answers to a parliamentary committee ([CIMM, 28 Feb 2024](https://www.canada.ca/en/immigration-refugees-citizenship/corporate/transparency/committees/cimm-feb-28-2024/intake-output-issued.html)). | Not added: not a regular, complete series. |
| United States | The State Department publishes adjusted refusal rates by nationality for **B (visitor) visas only**; F-1 student refusal rates by nationality are not published. | Not available. |
| Others in `country_info` | No official, linkable study-visa refusal or grant rate found. | Not available. |

**Why none is shown yet.** Where official figures exist, they differ a lot
by nationality (in the same months, very different grant rates for
different countries of citizenship), and Unicelerate doesn't ask for
nationality: the profile's country is where the student lives. A single
country-wide rate would mislead most students, so the app says "No
refusal-rate figure shown: official rates vary by nationality" and never
calls a country easy or hard. Adding a nationality question would make the
UK and Australian figures usable, with their source, year and check date.

## Which non-US universities are listed, and where their figures come from

Checked 2026-10-14 (batches in `data/curated/batches/`).

| Source | Licence / terms | Decision |
| --- | --- | --- |
| **CWTS Leiden Ranking Open Edition 2025** | CC0 1.0. | **Used to choose schools**: a university is a candidate when it's in Leiden (at least 1,500 papers), its country is one we cover, and ROR calls it an "education" organisation (`scripts/curated/candidates.mjs`). Not a ranking position: only whether it's listed. Postgraduate-only, distance and specialist medical institutions are left out by hand. |
| **ROR** | CC0 1.0. | **Used for identity**: official name, other names, city and website of each new school. |
| **Australian Government CRICOS register** (data.gov.au) | CC BY 2.5 AU. | **Used** for Australian international tuition (a comparable bachelor's course, whole-course fee ÷ weeks × 52) and degree levels. Credited on /credits. |
| **Each university's own fee page** | Facts, linked. | **Used** for every other fee: read from the page (`fetch-page.mjs`, `amounts.mjs`), with the basis, year, link and checked date on the row. When the page is blocked, a PDF we can't read, a calculator, or gives no figure for the year, the fee is left empty and the school is listed in `docs/HAND-CHECK.md`. |
| **Each university's homepage and study pages** | Facts, linked. | **Used** for degree levels: a level is listed only when the official pages mention it; when undergraduate study isn't shown, the list is left empty (unknown) rather than partial. |
| **QS, THE, U.S. News, ShanghaiRanking, Niche** and similar | See the table at the top. | **Not used**, including for choosing which schools to add. |
