import { canonicalCountry } from "@/lib/countries";
import type { AdmissionChance, MatchEntry } from "@/lib/matching";
import { compareBest, compareSafest, groupByChance, withNeutralUnknowns, withoutCountryGate } from "@/lib/ranking";
import { DEGREE_LEVELS, type DegreeLevel, type UniversitySummary } from "@/lib/types";

// "best": the best school you can realistically get into (lib/ranking.ts),
// the default. "match": the fit score alone ("Best match").
export type SortKey = "best" | "safest" | "match" | "tuition-asc" | "tuition-desc" | "ranking";

export const DEFAULT_SORT: SortKey = "best";

// null / empty always means "don't filter on this".
export type UniversityFilters = {
  query: string;
  country: string | null;
  degreeLevel: DegreeLevel | null;
  tuitionMin: number | null;
  tuitionMax: number | null;
  chances: AdmissionChance[];
  sortBy: SortKey;
};

export const NO_FILTERS: UniversityFilters = {
  query: "",
  country: null,
  degreeLevel: null,
  tuitionMin: null,
  tuitionMax: null,
  chances: [],
  sortBy: DEFAULT_SORT,
};

// Kept as a plain function (not inside the React component) so the
// filtering rules can be unit-tested without rendering anything.
//
// `searchIds`: when the server has already searched in Postgres (name and
// aliases, accent-insensitive; see searchUniversityIds), the ids it found.
// Without it, the same search runs here in memory.
export function applyFilters(
  entries: MatchEntry[],
  filters: UniversityFilters,
  searchIds?: Set<string>
): MatchEntry[] {
  const query = searchable(filters.query.trim());
  const country = filters.country ? canonicalCountry(filters.country) : null;

  const filtered = entries.filter(({ university, match }) => {
    if (query) {
      const found = searchIds
        ? searchIds.has(university.id)
        : searchable([university.name, ...(university.aliases ?? [])].join(" ")).includes(query);
      if (!found) return false;
    }
    if (country && canonicalCountry(university.country) !== country) return false;

    // Same rule as matching: a school with unknown degree levels stays visible.
    const levels = university.degree_levels ?? [];
    if (filters.degreeLevel && levels.length > 0 && !levels.includes(filters.degreeLevel)) {
      return false;
    }

    // With a tuition filter set, a school whose tuition isn't known can't
    // be shown to fit it, so it's left out of that filtered view.
    const { tuition } = university;
    if (filters.tuitionMin !== null && (tuition === null || tuition < filters.tuitionMin)) return false;
    if (filters.tuitionMax !== null && (tuition === null || tuition > filters.tuitionMax)) return false;
    if (filters.chances.length > 0 && !filters.chances.includes(match.chance)) return false;
    return true;
  });

  return sortEntries(filtered, filters.sortBy);
}

// Every order ends with the same tie-break (name, then id), so the result
// never depends on the order the schools arrived in.
const byNameThenId = (a: MatchEntry, b: MatchEntry) =>
  a.university.name.localeCompare(b.university.name) || (a.university.id < b.university.id ? -1 : a.university.id > b.university.id ? 1 : 0);

export function sortEntries(entries: MatchEntry[], sortBy: SortKey): MatchEntry[] {
  const sorted = [...entries];
  switch (sortBy) {
    // Unknown tuition sorts last either way, never as if it were $0.
    case "tuition-asc":
      return sorted.sort((a, b) => byKnown(a.university.tuition, b.university.tuition, 1) || byNameThenId(a, b));
    case "tuition-desc":
      return sorted.sort((a, b) => byKnown(a.university.tuition, b.university.tuition, -1) || byNameThenId(a, b));
    case "ranking":
      // "Strongest first": highest index first; schools without one (a
      // student's own) last, never as if they were 0.
      return sorted.sort(
        (a, b) => byKnown(numberOrNull(a.university.strength_index), numberOrNull(b.university.strength_index), -1) || byNameThenId(a, b)
      );
    case "match":
      return sorted.sort((a, b) => b.match.score - a.match.score || compareBest(a, b) || byNameThenId(a, b));
    case "safest":
      return sorted.sort((a, b) => compareSafest(a, b) || byNameThenId(a, b));
    default:
      return sorted.sort((a, b) => compareBest(a, b) || byNameThenId(a, b));
  }
}

// Compares two possibly-unknown numbers; unknowns always go last.
function byKnown(a: number | null, b: number | null, direction: 1 | -1): number {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return (a - b) * direction;
}

// Filters the student chose to narrow the list: these search every school,
// not only the featured ones (a name search or a country filter used to
// find nothing for a school that isn't featured). The Reach / Match /
// Safety chips don't count: they pick within the current list.
export function hasNarrowingFilters(filters: UniversityFilters): boolean {
  return (
    filters.query.trim() !== "" ||
    filters.country !== null ||
    filters.degreeLevel !== null ||
    filters.tuitionMin !== null ||
    filters.tuitionMax !== null
  );
}

// A filter or sort change: the new filters, back to page 1 (a page number
// from the old list means nothing in the new one).
export function withFilters(state: BoardState, changes: Partial<UniversityFilters>): BoardState {
  return { ...state, filters: { ...state.filters, ...changes }, page: 1 };
}

export function hasActiveFilters(filters: UniversityFilters): boolean {
  return (
    filters.query.trim() !== "" ||
    filters.country !== null ||
    filters.degreeLevel !== null ||
    filters.tuitionMin !== null ||
    filters.tuitionMax !== null ||
    filters.chances.length > 0
  );
}

// Lower-case and without accents, so "universite de montreal" finds
// "Université de Montréal" and "zurich" finds "Zürich". NFD splits "é" into
// "e" plus a combining accent, which the regex then removes.
export function searchable(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// ─── Board state in the URL ───────────────────────────────────────────────
// Filters, sort, page and "include all schools" live in the URL, and the
// server does the filtering and pagination, so only one page of cards is
// ever sent to the browser. A URL can also be bookmarked or shared.

export const PAGE_SIZE = 24;

export type BoardState = {
  filters: UniversityFilters;
  page: number; // 1-based
  showAll: boolean; // include schools that aren't featured
  // Group by Reach / Match / Safety (on by default on recommendations).
  group: boolean;
  groupDefault: boolean; // what "group" is when the URL doesn't say
};

type SearchParams = Record<string, string | string[] | undefined>;

const SORT_KEYS: SortKey[] = ["best", "safest", "match", "tuition-asc", "tuition-desc", "ranking"];
const CHANCES: AdmissionChance[] = ["Reach", "Match", "Safety", "Not enough data"];

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

function bound(value: string): number | null {
  const n = Number(value);
  return value.trim() === "" || !Number.isFinite(n) ? null : n;
}

// Reads the board state from the URL. Anything unrecognised falls back to
// the default rather than erroring: URLs get edited and shared.
export function parseBoardParams(params: SearchParams, { groupDefault = false } = {}): BoardState {
  const sort = first(params.sort) as SortKey;
  const degree = first(params.degree) as DegreeLevel;
  const page = Number(first(params.page));
  return {
    filters: {
      query: first(params.q).slice(0, 100),
      country: first(params.country) || null,
      degreeLevel: DEGREE_LEVELS.includes(degree) ? degree : null,
      tuitionMin: bound(first(params.min)),
      tuitionMax: bound(first(params.max)),
      chances: first(params.chance)
        .split(",")
        .filter((c): c is AdmissionChance => CHANCES.includes(c as AdmissionChance)),
      sortBy: SORT_KEYS.includes(sort) ? sort : DEFAULT_SORT,
    },
    page: Number.isInteger(page) && page > 1 ? page : 1,
    showAll: first(params.all) === "1",
    group: first(params.group) === "" ? groupDefault : first(params.group) === "1",
    groupDefault,
  };
}

// The query string for a board state ("" when everything is default), so
// default URLs stay clean.
export function boardQuery({ filters, page, showAll, group, groupDefault }: BoardState): string {
  const params = new URLSearchParams();
  if (filters.query.trim()) params.set("q", filters.query.trim());
  if (filters.country) params.set("country", filters.country);
  if (filters.degreeLevel) params.set("degree", filters.degreeLevel);
  if (filters.tuitionMin !== null) params.set("min", String(filters.tuitionMin));
  if (filters.tuitionMax !== null) params.set("max", String(filters.tuitionMax));
  if (filters.chances.length > 0) params.set("chance", filters.chances.join(","));
  if (filters.sortBy !== DEFAULT_SORT) params.set("sort", filters.sortBy);
  if (showAll) params.set("all", "1");
  if (group !== groupDefault) params.set("group", group ? "1" : "0");
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `?${query}` : "";
}

// One page of results. A page past the end shows the last page, so a stale
// "page=9" link after filtering still shows something.
export function paginate<T>(items: T[], page: number, size = PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, page), totalPages);
  return { items: items.slice((current - 1) * size, current * size), page: current, totalPages };
}

// ─── Featured schools ─────────────────────────────────────────────────────

// Shown by default: featured shared schools plus every school the student
// added. A missing is_featured (migration_010 not run) counts as featured,
// so nothing disappears before the migration.
export function isShownByDefault(university: UniversitySummary): boolean {
  return university.created_by !== null || university.is_featured !== false;
}

// True once supabase/featured/featured.sql has marked at least one school.
// Before that, every is_featured is the column's default (false), and
// hiding everything would be worse than showing everything.
export function featuredReady(universities: UniversitySummary[]): boolean {
  return universities.some((u) => u.is_featured === true);
}

// ─── Everything a board page needs, worked out on the server ──────────────

export type BoardData = {
  entries: MatchEntry[]; // the current page only
  page: number;
  totalPages: number;
  matchingCount: number;
  countries: string[];
  featured?: { featuredCount: number; allCount: number; ready: boolean; searchedAll: boolean };
  // Every school in the pool (before filters). Server-side only, for the
  // "top picks by country" section; never sent to the browser in full.
  pool: MatchEntry[];
  // Schools a tuition filter left out only because their tuition isn't
  // published (0 without a tuition filter), so the page can say so.
  hiddenUnknownTuition: number;
  // True when the list covers every school because a filter or search is
  // on (the featured limit only applies to the unfiltered view).
  searchedAll: boolean;
  // In the grouped view: the strongest few of each group and how many the
  // group has in total (the rest are one "See all" click away).
  groups?: { chance: AdmissionChance; entries: MatchEntry[]; total: number }[];
};

// How many schools each Reach / Match / Safety group shows before "See all".
export const GROUP_PREVIEW = 6;

// From every scored school to one page of cards: pick the pool (featured
// only, unless the student asked for all), filter and sort it, then cut out
// the requested page. `withFeatured: false` (the saved page) skips the
// featured step: a student's saved schools are always shown.
export function buildBoard(
  scoredAll: MatchEntry[],
  state: BoardState,
  { withFeatured, searchIds }: { withFeatured: boolean; searchIds?: Set<string> }
): BoardData {
  // Unknown quality / chance count as typical for this student's schools.
  const neutral = withNeutralUnknowns(scoredAll);
  // Filtering to a country yourself: its schools aren't "outside your countries".
  const country = state.filters.country ? canonicalCountry(state.filters.country) : null;
  const scored = country
    ? neutral.map((e) => (canonicalCountry(e.university.country) === country ? withoutCountryGate(e) : e))
    : neutral;
  const ready = featuredReady(scored.map((e) => e.university));
  const defaultPool = scored.filter((e) => isShownByDefault(e.university));
  const searchedAll = withFeatured && ready && !state.showAll && hasNarrowingFilters(state.filters);
  const pool = !withFeatured || state.showAll || !ready || searchedAll ? scored : defaultPool;

  const filtered = applyFilters(pool, state.filters, searchIds);
  const tuitionFilter = state.filters.tuitionMin !== null || state.filters.tuitionMax !== null;
  const hiddenUnknownTuition = tuitionFilter
    ? applyFilters(pool, { ...state.filters, tuitionMin: null, tuitionMax: null }, searchIds).filter((e) => e.university.tuition === null).length
    : 0;

  // Grouped view: no pages, just the top of each group. A filter on one
  // chance (from "See all") shows the plain list instead.
  if (state.group && state.filters.chances.length === 0) {
    const groups = groupByChance(filtered).map((g) => ({
      chance: g.chance,
      entries: g.entries.slice(0, GROUP_PREVIEW),
      total: g.entries.length,
    }));
    return {
      entries: groups.flatMap((g) => g.entries),
      page: 1,
      totalPages: 1,
      matchingCount: filtered.length,
      countries: Array.from(new Set(pool.map((e) => canonicalCountry(e.university.country)))).sort(),
      featured: withFeatured ? { featuredCount: defaultPool.length, allCount: scored.length, ready, searchedAll } : undefined,
      pool,
      groups,
      hiddenUnknownTuition,
      searchedAll,
    };
  }

  const { items, page, totalPages } = paginate(filtered, state.page);

  return {
    entries: items,
    page,
    totalPages,
    matchingCount: filtered.length,
    countries: Array.from(new Set(pool.map((e) => canonicalCountry(e.university.country)))).sort(),
    featured: withFeatured
      ? { featuredCount: defaultPool.length, allCount: scored.length, ready, searchedAll }
      : undefined,
    pool,
    hiddenUnknownTuition,
    searchedAll,
  };
}

// The best few schools in each of the student's preferred countries, so one
// country (with far more schools in the data) can't crowd the others out of
// the top of the list.
export function topPicksByCountry(
  entries: MatchEntry[],
  preferredCountries: string[],
  perCountry = 3
): { country: string; picks: MatchEntry[] }[] {
  // Canonical names, so a student who typed "UK" still sees UK schools.
  // Same order as the main list ("Best you can get into"), so a weak but
  // easy school can't top a country.
  const best = [...entries].sort(compareBest);
  return [...new Set(preferredCountries.map(canonicalCountry))].map((country) => ({
    country,
    picks: best.filter((e) => canonicalCountry(e.university.country) === country).slice(0, perCountry),
  }));
}

const numberOrNull = (v: number | null | undefined) => (v === null || v === undefined ? null : Number(v));
