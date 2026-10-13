# Performance

Measured before changing anything, then again after, on the same machine
and setup, so the "after" numbers are a like-for-like comparison.

## How it was measured

- **Production build** (`npm run build`, then `next start` on port 3002),
  never the dev server, which compiles on demand and is much slower.
- **Signed-in student** with a saved profile, against the live Supabase
  project (free tier) after the College Scorecard import: 1,624
  universities (1,577 College Scorecard + 47 illustrative).
- **Server time:** `fetch()` from a signed-in browser tab, 5 requests per
  page with `cache: "no-store"`, **median** reported. "To first byte" is
  until the response headers arrive (the server finished its work);
  "total" includes downloading the page.
- **Browser:** 3 full page loads of `/universities`, read from the
  Navigation Timing API (`performance.getEntriesByType("navigation")`)
  plus a count of DOM elements and cards on the page.
- **Pieces:** the universities query and Supabase's auth endpoint timed
  directly from Node (5 runs, median); scoring timed in Vitest over the
  1,577 Scorecard schools (7 runs, median).

The browser-side snippet used is in the "Reproducing" section at the end.
Times depend on the network to Supabase, so compare before vs. after
rather than reading the absolute numbers as universal.

## Before (2026-10-06, commit 3403071)

### Server time per page (median of 5)

| Page | To first byte | Total | Page size |
| --- | --- | --- | --- |
| `/universities` (browse) | 2,124 ms | 2,228 ms | 10,369 KB |
| `/recommendations` | 2,106 ms | 2,220 ms | 10,360 KB |
| `/saved` | 1,070 ms | 1,074 ms | 70 KB |
| `/applications` | 803 ms | 805 ms | 45 KB |
| `/offers` | 1,053 ms | 1,059 ms | 33 KB |
| `/profile` | 798 ms | 801 ms | 48 KB |
| `/universities/[id]` | 1,085 ms | 1,090 ms | 74 KB |
| `/compare` (3 schools) | 1,326 ms | 1,344 ms | 180 KB |

### Browser, `/universities` (3 loads)

| Load | First byte | DOM content loaded | Load event | DOM elements | Cards |
| --- | --- | --- | --- | --- | --- |
| 1 | 1,902 ms | 2,190 ms | 2,728 ms | 51,093 | 1,000 |
| 2 | 1,507 ms | 1,745 ms | 2,147 ms | 51,093 | 1,000 |
| 3 | 2,241 ms | 2,493 ms | 2,952 ms | 51,093 | 1,000 |

### Where the time goes

| Piece | Measured | Notes |
| --- | --- | --- |
| `select *` on universities | 1,047 ms median, 926 KB | Returns **1,000 of 1,624 rows**: Supabase caps API responses at 1,000 rows by default |
| One Supabase auth call (`getUser`) | ~251 ms (auth endpoint round trip) | Made **3 times per page**: the proxy, the root layout (navbar) and the page |
| Scoring all 1,577 Scorecard schools | 9.3 ms median | Not the bottleneck |

### What this shows

1. **A correctness bug, not just slowness.** Browse and recommendations only
   ever saw 1,000 of the 1,624 universities. Browse sorted by name, so
   everything after roughly the first 1,000 names was silently missing.
2. **Every university was sent to the browser.** Each of the 1,000 scored
   schools (with explanations) became a card: about 10 MB of HTML, 51,000
   DOM elements, and 1,000 animated components to hydrate. The browser
   then filtered and sorted all of them.
3. **Auth cost about 750 ms per page** before any data loaded: three
   network round trips to verify the same session.
4. **The same list was re-downloaded on every visit** although it only
   changes when the import is re-run.
5. Scoring itself (9 ms for every school) is cheap. Moving it into SQL
   would duplicate the logic for no measurable gain.

## Changes

### Step 1: one local auth check per request (commit after 3403071)

- `lib/supabase/middleware.ts` (run by `proxy.ts`) uses
  `supabase.auth.getClaims()` instead of `getUser()`. Supabase's Next.js
  guide recommends `getClaims()` for protecting pages: it verifies the
  token's signature against the project's public key, locally. This
  project's key is asymmetric (`ES256`, checked via its JWKS endpoint), so
  there's no network call per request. `getUser()` asks the Auth server
  every time.
- `lib/auth.ts` `getCurrentUser()` does the same check, wrapped in React's
  `cache()`, so the root layout (navbar) and the page share **one** check
  per request instead of making two more network calls.
- Server Actions (saving, deleting) still use `getUser()`: they're rare,
  and a fresh server-side check before a write is worth ~250 ms.

### Step 2: every row, only the needed columns, cached

`lib/data/universities.ts`:
- `fetchAllRows()` asks for rows 1,000 at a time until a short page, so all
  1,624 schools load instead of the first 1,000. A test with a fake
  1,000-row-capped API guards this.
- Only `LIST_COLUMNS` (what list pages use) are selected.
- The shared list (rows no student added) is cached on the server with
  `unstable_cache` (15 minutes, tag `universities`). It's readable by anyone
  under RLS, so one cached copy serves every student; each student's own
  schools are fetched separately and never cached. The cached list is about
  1 MB for all 1,577 Scorecard schools, under Next.js's 2 MB data-cache
  limit; a test fails if it grows past 1.5 MB.
- If a column from a not-yet-run migration is missing, it selects without
  it and **skips the cache**, so the next request after the migration
  sees the new column instead of waiting 15 minutes.

### Step 3: filter, sort and paginate on the server

Filters, sort, page and "include all schools" live in the URL
(`parseBoardParams` / `boardQuery` in `lib/university-filters.ts`). The
page scores every school (about 9 ms), filters and sorts on the server, and
sends **one page of 24 cards**. Typing in search waits 300 ms after the
last keystroke before asking the server. `buildBoard()` has a test that it
never returns more than one page.

Why not filter in SQL? Sorting by match score needs every school scored,
and the scoring lives in TypeScript (`lib/matching.ts`). Filtering in SQL
would mean either duplicating the scoring in SQL or still fetching every
row to sort. Scoring the cached list takes about 9 ms, so the database
round trip is what to avoid, and the cache does that.

### Step 4: loading state and animations

- `app/(dashboard)/loading.tsx` shows a skeleton instantly while a page
  renders. Next.js streams it first, so "to first byte" is now ~50 ms
  everywhere and is no longer comparable with the before numbers; compare
  **total** time instead.
- Card animations were already capped (the stagger stops growing after
  the 8th card); with 24 cards per page that's fine. They now also respect
  the operating system's "reduce motion" setting.

## After

### After step 1 (same method, median of 5)

| Page | Before | After step 1 | Change |
| --- | --- | --- | --- |
| `/profile` | 798 ms | 279 ms | −65% |
| `/applications` | 803 ms | 305 ms | −62% |
| `/offers` | 1,053 ms | 554 ms | −47% |
| `/saved` | 1,070 ms | 565 ms | −47% |
| `/universities/[id]` | 1,085 ms | 551 ms | −49% |
| `/compare` (3 schools) | 1,326 ms | 802 ms | −40% |
| `/universities` (browse) | 2,124 ms | 1,627 ms | −23% |
| `/recommendations` | 2,106 ms | 1,619 ms | −23% |

(Time to first byte.) Every page got about 500 ms faster, which is the two
auth round trips removed. Browse and recommendations are still slow and
still 10 MB because steps 2–3 aren't done. A signed-out request to
`/profile` still lands on `/login`, so protection works as before.

### After steps 2–4, before migration 010 (interim, uncached)

Measured the same way, after one warm-up request. **Migration 010 hadn't
been run yet**, so `is_featured` was missing and the cache was skipped on
purpose: every request re-read ~1.5 MB of rows (one failed attempt with
`is_featured`, then two 1,000-row pages). These are the worst-case numbers.

| Page | Total before | Total after step 1 | Total now (uncached) | Page size before → now |
| --- | --- | --- | --- | --- |
| `/universities` | 2,228 ms | ~1,730 ms | 2,406 ms | 10,369 KB → **287 KB** |
| `/recommendations` | 2,220 ms | 1,721 ms | 2,318 ms | 10,360 KB → **299 KB** |
| `/universities?q=state&sort=tuition-asc&page=3` | — | — | 2,339 ms | 289 KB |
| `/compare` (3 schools) | 1,344 ms | 819 ms | 2,613 ms | 180 KB → 238 KB |
| `/saved` | 1,074 ms | 570 ms | 620 ms | 70 KB → 74 KB |
| `/profile` | 801 ms | 284 ms | 327 ms | 48 KB → 51 KB |

(The "after step 1" browse total is approximate: that run recorded time
to first byte, 1,627 ms, plus a similar download.)

What changed and what didn't, honestly:
- **Fixed:** browse and recommendations now include all **1,624** schools
  (not 1,000), and send **~36× less** (287 KB instead of 10 MB, 24 cards
  instead of 1,000).
- **Not faster yet:** total server time is about the same as before,
  because without the cache every visit downloads all 1,624 rows from
  Supabase. Compare got slower: its picker now uses the full list instead
  of a names-only query of the first 1,000.
- **Expected after migration 010:** the shared list comes from the cache,
  so these pages should only wait for the profile and saved-schools
  queries. Measured below.

### Final: after migration 010, cache active (2026-10-06)

Same method: production build, signed in, live Supabase, total time
(server work plus download), median of 5, after one warm-up request.

| Page | Before | After | Change | Page size before → after |
| --- | --- | --- | --- | --- |
| `/universities` (browse) | 2,228 ms | **343 ms** | −85% | 10,369 KB → 286 KB |
| `/recommendations` | 2,220 ms | **327 ms** | −85% | 10,360 KB → 298 KB |
| `/universities?all=1` (all 1,624) | — | 323 ms | | 287 KB |
| `/universities?q=state&sort=tuition-asc&page=3` | — | 330 ms | | 90 KB |
| `/saved` | 1,074 ms | 583 ms | −46% | 70 KB → 74 KB |
| `/compare` (3 schools) | 1,344 ms | 587 ms | −56% | 180 KB → 131 KB |
| `/profile` | 801 ms | 286 ms | −64% | 48 KB → 51 KB |
| `/applications` | 805 ms | 308 ms | −62% | 45 KB → 49 KB |
| `/offers` | 1,059 ms | 557 ms | −47% | 33 KB → 37 KB |
| `/universities/[id]` | 1,090 ms | 604 ms | −45% | 74 KB → 77 KB |

And browse and recommendations now cover all **1,624** schools instead of
the first 1,000.

The pages still around 550–600 ms make two database queries one after
the other (e.g. the profile, then the school or the offers). They're
fast enough for now; running those queries in parallel would be the next
step if they matter.

A cached request still pays about 300 ms: the profile and saved-schools
queries to Supabase (free tier, a round trip each) plus rendering. The
first visitor after the 15-minute cache expires pays the uncached cost
once (about 2.3 s, measured above) while the list is reloaded.

## Reproducing

From a signed-in tab on the production server, in the browser console:

```js
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
async function time(path, runs = 5) {
  const ttfb = [], total = [];
  let bytes = 0;
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    const r = await fetch(path, { cache: "no-store" });
    const t1 = performance.now();
    bytes = (await r.arrayBuffer()).byteLength;
    ttfb.push(t1 - t0);
    total.push(performance.now() - t0);
  }
  return { path, ttfb: Math.round(median(ttfb)), total: Math.round(median(total)), kb: Math.round(bytes / 1024) };
}
await time("/universities");
```

## Landing page redesign (2026-10-07)

Same method (production build, `next start`, logged out): 7 server requests
(median) and 3 browser loads at 1280×800.

| | Before (old landing) | After (new design) |
| --- | --- | --- |
| Time to first byte | 25 ms | 40 ms |
| HTML | 35 KB | 93 KB |
| JavaScript | 239 KB | 202 KB |
| Fonts | 51 KB | 78 KB (Plus Jakarta Sans for headings) |
| Images | none | 47 KB (hero photo, WebP via `next/image`, `priority`) |
| DOM content loaded | 85–103 ms | 80–135 ms |
| Load event | 103–258 ms | 116–445 ms (the slowest is the first load, while the image optimizer fetches the photo) |

The new page reads the cached university list (for the real stats and
examples), which explains the extra ~15 ms before the first byte. It ships
less JavaScript than before because the landing sections are server
components without the animation library. Every number stays well under the
signed-in pages measured above.


## Making the live site fast (2026-10-07)

### Before (live site, www.unicelerate.com, commit da82d02)

**Headers** (logged out, from Montreal): every page except the sitemap was
`Cache-Control: private, no-store` and `x-vercel-cache: MISS`, because the
root layout read the login cookie for the navbar, which made every page
dynamic. Requests entered Vercel at `yul1` (Montreal) and the functions ran
in `iad1` (Washington). The first request to `/` took 2.1 s (cold start and
an empty data cache); later ones 0.2-0.5 s.

**Where the database is:** the Supabase project's database host resolves to
an address in AWS `ap-southeast-1` (Singapore), worked out from the host's
IP and Amazon's published IP ranges (the project address isn't printed).
So every query from Washington crossed the Pacific and back.

**Lighthouse, mobile preset (throttled), median of 3 runs:**

| Page | LCP | CLS | TBT | FCP | Weight | Scripts | JS execution |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | 3,000 ms | 0.000 | 339 ms | 1,545 ms | 393 KB | 16 (227 KB) | 947 ms |
| `/universities` | 2,571 ms | 0.000 | 754 ms | 1,091 ms | 408 KB | 19 (278 KB) | 1,589 ms |
| `/credits` | 2,658 ms | 0.030 | 363 ms | 1,248 ms | 328 KB | 15 (211 KB) | 750 ms |

The mobile LCP element on `/` is the hero photo. Signed-in timings weren't
measured this time (no test login available to the tooling); the signed-out
numbers above are what everyone sees first.

### What was changed, and why

1. **Public pages are cached.** The root layout no longer reads cookies. The
   navbar renders both its member and visitor versions and CSS shows one,
   based on `<html data-auth>`, which a tiny inline script sets from the
   login cookie before the page paints (`lib/auth-cookie.ts`; re-checked
   after client navigations). Result: `/`, `/privacy`, `/credits` and
   `/signup` are static; `/` is rebuilt at most hourly (ISR); each shared
   university page (`/universities/<id>`) is built on its first visit and
   cached for a day. Their personal parts (save, your fit) load in the
   browser from `/api/universities/<id>/me`, only for signed-in students.
   Schools a student added are private, so they moved to
   `/universities/mine/<id>` (rendered per request; old links redirect).
   Logging in or out no longer calls `revalidatePath("/", "layout")`, which
   used to empty every page's cache for everyone.
2. **Functions run next to the database:** `vercel.json` `"regions": ["sin1"]`
   (Singapore). Pages that waited on the profile before their other queries
   (compare, saved, offers) now run them in parallel.
3. **Longer data cache:** the university list and country guidance are
   cached for a day (they only change when an import runs), with
   stale-while-revalidate, so no visitor waits when they expire. After an
   import, `POST /api/revalidate` (with `REVALIDATE_SECRET`) refreshes them.
4. **Less JavaScript for visitors:** the quiz no longer pulls the whole
   scoring engine into the browser (its option lists moved to
   `lib/quiz-options.ts`); the unused toast library was removed; the
   members' dropdown menu (~40 KB with its positioning library) loads only
   for signed-in members; the code font isn't preloaded.
5. **Vercel Speed Insights** (free tier) added for real-visitor scores.

Local check of the landing page (production build, same mobile preset):
17 scripts / 209 KB (was 227 KB live), JS execution 650 ms (was 947 ms),
TBT 110 ms (was 339 ms). LCP isn't comparable locally (the local image
optimizer fetches the photo from Unsplash on first use), so the "after"
table below is measured on the live site, like the "before".

### After (live site, commit 972e4ff, same tools and conditions)

**Headers:** `/`, `/credits`, `/privacy`, `/signup` and the sitemap answer
`x-vercel-cache: HIT` (the first request after a deploy says `PRERENDER`,
then `HIT`). A shared university page is a `MISS` on its first visits while
it's built, then `HIT`. `/universities` and members' pages stay per request,
now in `sin1` (`x-vercel-id: yul1::sin1::...`). Members' pages still redirect
to `/login?next=...` when logged out, `/api/universities/<id>/me` answers
`{"signedIn":false}` with `private, no-store`, and `/api/revalidate`
answers 401 without the secret.

**Time to first byte from Montreal** (curl, 5 requests each, after warm-up):
`/` 0.11-0.15 s (was 0.24-0.44 s, and 2.1 s on a cold start), `/credits`
0.12-0.13 s, a university page 0.11-0.14 s, `/universities` 0.36-0.40 s
(rendered in Singapore, so it includes the trip there and back).

**Lighthouse, mobile preset (throttled), median of 3 runs:**

| Page | LCP | CLS | TBT | FCP | Weight | Scripts | JS execution |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | 2,393 ms (was 3,000) | 0.000 | 126 ms (was 339) | 1,445 ms | 350 KB (was 393) | 16 (191 KB, was 227) | 710 ms (was 947) |
| `/universities` | 2,733 ms (was 2,571) | 0.000 | 387 ms (was 754) | 1,033 ms | 431 KB (was 408) | 22 (294 KB, was 278) | 1,215 ms (was 1,589) |
| `/credits` | 2,177 ms (was 2,658) | 0.004 | 72 ms (was 363) | 960 ms | 318 KB (was 328) | 15 (188 KB, was 211) | 542 ms (was 750) |

Notes, honestly:
- `/universities` LCP: the three "before" runs were 2,132 / 2,571 / 3,002 ms
  and the "after" runs 2,646 / 2,733 / 2,820 ms, so the difference is within
  run-to-run noise rather than a regression. Its LCP is a line of text whose
  time is mostly render delay on the throttled CPU; blocking time halved.
  It gained a few KB: the Speed Insights script (4.9 KB) and the small
  loader for the members' menu. Nothing was reverted.
- Signed-in timings weren't measured (no test login for the tooling).
- Speed Insights' real-visitor numbers appear in the Vercel dashboard once
  it's enabled there and visitors arrive.

## Strength index and visa factor (2026-10-08)

The index is computed at import time and stored; pages only read it. The
cached university list is packed by column (`packRows`), so it stays far
below Next.js's 2 MB data-cache limit with the new columns (tested with the
real values in `lib/data/universities.test.ts`).

**Server:** time to first byte after the release, from Montreal (5 requests
each): `/` 0.13–0.18 s, a university page 0.12 s (cached), `/universities`
0.38–0.44 s (one slow outlier at 0.96 s), `/recommendations` (logged out,
a redirect to login: signed-in timing can't be measured by the tooling)
0.11–0.15 s. Same ranges as before.

**Browser, `/universities`, A/B on the same machine and database**
(production builds served locally, Lighthouse mobile, 3 runs each; local
numbers run higher than live because the server shares the machine):

| Build | Total blocking time | JavaScript execution |
| --- | --- | --- |
| Before the strength index (1c5fe02) | 652 / 655 / 764 ms | 1,715 / 1,945 / 2,160 ms |
| Strength index, first version | 696 / 936 / 962 ms | 2,653 / 3,215 / 3,409 ms |
| Same card without the strength cell (diagnosis) | 575 / 623 / 689 ms | 2,504 / 2,524 / 2,650 ms |
| **Strength index with shared number formatters** | 502 / 712 / 730 ms | 1,726 / 2,108 / 2,140 ms |

The first version **was slower**: every card formatted its numbers with
`toLocaleString("en-US")` / `new Intl.NumberFormat(...)`, which builds a new
formatter on every call, twice per card (server render and hydration).
Sharing one formatter (`NUMBER_FORMAT` in lib/format.ts, one per currency
in lib/money.ts) brought it back to the pre-index range, so the release
doesn't make the page slower. Older live figures (TBT 387 ms after the
caching work) were measured before research impact, currency and the other
features shipped, so they aren't a like-for-like comparison.

## Redesign (2026-10-08)

Production build served locally, Lighthouse mobile, 3 runs each:

| Page | Total blocking time | Layout shift | Weight | Accessibility |
| --- | --- | --- | --- | --- |
| `/` | 87 / 164 / 214 ms | 0.000 | 345 KB | 100 (light and dark) |
| `/universities` | 141 / 326 / 381 ms | 0.000 | 442 KB | 100 (light and dark) |

No new assets: the redesign removed shadows, icon circles and boxes, and
added no images, fonts or scripts. Layout shift stays 0. The first run
found two accessibility issues, both fixed before release: the faint
placeholder numbers in "Try it" were 3.6:1 in dark mode (now the normal
muted colour), and "How is this calculated?" was a 16px-tall target (now at
least 24px).

## Profile page redesign (2026-10-08)

Browser JavaScript referenced by `/profile` (the build's client reference
manifest, uncompressed): **9 chunks / 238 KB before, 7 chunks / 161 KB
after**. The dropdown library (Radix Select) is no longer used there:
grading system, degree level and currency are native selects. "Your top 3
right now" is computed on the server and cached per saved profile, so it
adds no work per keystroke. The page needs a login, so Lighthouse can't
measure it from here.

## Course weighting and campus life (2026-10-13)

Browser JavaScript referenced by each page (the build's client reference
manifest, uncompressed), same method as above, measured on compile-only
builds of each commit:

| Page | Before (cd0dd6d) | Course weighting (95c16bb) | + Campus life |
| --- | --- | --- | --- |
| `/profile` | 7 chunks / 161 KB | 7 / 175 KB | 7 / 179 KB |
| `/recommendations` (and `/universities`) | 11 chunks / 378 KB | 11 / 386 KB | 12 / 396 KB |

The course editor (profile) and the campus-life rows on cards (the proxy
text lives in a small shared module) account for the growth: +18 KB in
total on each page, under 5%. Scoring work per card is a few additions;
the "Not sure" campus scores are stored at import time.

The cached university list grows with the campus-life proxies (about
110 bytes per school after trimming the stored JSON to the figures
themselves; years and confidence are derived, not stored): **≈1,511 KB**
packed for all 1,688 schools, under the 1.5 MB budget the test keeps
below Next.js's 2 MB data-cache limit. That budget is now close, so the
next column added to the list should come with a trim elsewhere.

Server timing of the signed-in pages can't be measured from here (they
need a login); logged-out timings are re-checked on the live site after
the release.
