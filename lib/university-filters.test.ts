import { describe, expect, it } from "vitest";
import {
  PAGE_SIZE,
  applyFilters,
  boardQuery,
  buildBoard,
  hasActiveFilters,
  NO_FILTERS,
  paginate,
  parseBoardParams,
  searchable,
  topPicksByCountry,
  GROUP_PREVIEW,
} from "@/lib/university-filters";
import type { AdmissionChance, MatchEntry } from "@/lib/matching";
import type { University } from "@/lib/types";

// Only the fields the filters read matter here; the rest are placeholders.
function entry(
  name: string,
  overrides: Partial<University> = {},
  extra: {
    score?: number;
    chance?: AdmissionChance;
    rank?: number | null;
    quality?: number | null;
    plausibility?: number;
    passes?: boolean;
  } = {}
): MatchEntry {
  const university = {
    id: name,
    name,
    country: "Canada",
    tuition: 30000,
    degree_levels: ["Undergraduate", "Masters", "PhD"],
    ...overrides,
  } as University;

  return {
    university,
    match: {
      score: extra.score ?? 50,
      eligible: true,
      factors: [],
      chance: extra.chance ?? "Match",
      chanceSource: "rule",
    },
    explanation: { strengths: [], concerns: [] },
    ranking: { rank: extra.rank === undefined ? 10 : extra.rank, label: "Overall" },
    prediction: null,
    rank: {
      quality: extra.quality === undefined ? 0.5 : extra.quality,
      qualityParts: [],
      plausibility: extra.plausibility ?? 1,
      plausibilitySource: "rule",
      gate: { passes: extra.passes ?? true, reasons: extra.passes === false ? ["outside the countries you chose"] : [] },
      realistic: (extra.quality ?? 0.5) * (extra.plausibility ?? 1),
      visaFactor: 1,
      reason: "",
    },
    visa: null,
  };
}

const names = (entries: MatchEntry[]) => entries.map((e) => e.university.name);

describe("applyFilters", () => {
  const entries = [
    entry("University of Toronto", { tuition: 45000, strength_index: 90 }, { score: 90, chance: "Match", rank: 21 }),
    entry("TU Munich", { country: "Germany", tuition: 3000, strength_index: 80 }, { score: 70, chance: "Safety", rank: 28 }),
    entry("MIT", { country: "United States", tuition: 58000, strength_index: 99.2 }, { score: 60, chance: "Reach", rank: 1 }),
    entry("Local College", { degree_levels: ["Undergraduate"], tuition: 2000 }, { score: 40, rank: null }),
  ];

  it("returns everything, best match first, with no filters", () => {
    expect(names(applyFilters(entries, NO_FILTERS))).toEqual([
      "University of Toronto",
      "TU Munich",
      "MIT",
      "Local College",
    ]);
  });

  it("searches by name, ignoring case", () => {
    expect(names(applyFilters(entries, { ...NO_FILTERS, query: "toRONto" }))).toEqual([
      "University of Toronto",
    ]);
  });

  it("filters by country", () => {
    expect(names(applyFilters(entries, { ...NO_FILTERS, country: "Germany" }))).toEqual([
      "TU Munich",
    ]);
  });

  it("filters by degree level but keeps schools whose levels are unknown", () => {
    const withUnknown = [...entries, entry("Mystery U", { degree_levels: [] })];
    const result = names(applyFilters(withUnknown, { ...NO_FILTERS, degreeLevel: "Masters" }));

    expect(result).not.toContain("Local College");
    expect(result).toContain("Mystery U");
  });

  it("filters by tuition range (inclusive)", () => {
    const result = applyFilters(entries, { ...NO_FILTERS, tuitionMin: 3000, tuitionMax: 45000 });
    expect(names(result)).toEqual(["University of Toronto", "TU Munich"]);
  });

  it("filters by Reach / Match / Safety", () => {
    const result = applyFilters(entries, { ...NO_FILTERS, chances: ["Reach", "Safety"] });
    expect(names(result)).toEqual(["TU Munich", "MIT"]);
  });

  it("sorts strongest first by the Unicelerate index, schools without one last", () => {
    const result = applyFilters(entries, { ...NO_FILTERS, sortBy: "ranking" });
    expect(names(result)).toEqual(["MIT", "University of Toronto", "TU Munich", "Local College"]);
  });

  it("sorts by tuition", () => {
    const result = applyFilters(entries, { ...NO_FILTERS, sortBy: "tuition-asc" });
    expect(names(result)[0]).toBe("Local College");
  });
});

describe("hasActiveFilters", () => {
  it("ignores the sort order and a blank search", () => {
    expect(hasActiveFilters({ ...NO_FILTERS, sortBy: "ranking", query: "  " })).toBe(false);
    expect(hasActiveFilters({ ...NO_FILTERS, country: "Japan" })).toBe(true);
  });
});

describe("searchable", () => {
  it("ignores accents and case", () => {
    expect(searchable("Université de Montréal")).toBe("universite de montreal");
    expect(searchable("Universität Zürich")).toContain("zurich");
  });

  it("finds accented names from unaccented searches", () => {
    const list = [entry("Université de Montréal", { country: "Canada" })];
    expect(names(applyFilters(list, { ...NO_FILTERS, query: "universite de montreal" }))).toEqual([
      "Université de Montréal",
    ]);
  });
});

describe("board state in the URL", () => {
  it("round-trips through the query string", () => {
    const state = {
      filters: {
        ...NO_FILTERS,
        query: "toronto",
        country: "Canada",
        tuitionMax: 40000,
        chances: ["Match", "Safety"] as AdmissionChance[],
        sortBy: "tuition-asc" as const,
      },
      page: 3,
      showAll: true,
      group: true,
      groupDefault: false,
    };
    const query = boardQuery(state);
    expect(parseBoardParams(Object.fromEntries(new URLSearchParams(query)))).toEqual(state);
  });

  it("keeps default URLs clean", () => {
    expect(boardQuery({ filters: NO_FILTERS, page: 1, showAll: false, group: false, groupDefault: false })).toBe("");
    // On recommendations grouping is the default, so only "off" is written.
    expect(boardQuery({ filters: NO_FILTERS, page: 1, showAll: false, group: true, groupDefault: true })).toBe("");
    expect(boardQuery({ filters: NO_FILTERS, page: 1, showAll: false, group: false, groupDefault: true })).toBe("?group=0");
  });

  it("reads grouping with the page's own default", () => {
    expect(parseBoardParams({}, { groupDefault: true }).group).toBe(true);
    expect(parseBoardParams({ group: "0" }, { groupDefault: true }).group).toBe(false);
    expect(parseBoardParams({}).group).toBe(false);
  });

  it("falls back to defaults for edited or junk values instead of erroring", () => {
    const state = parseBoardParams({ sort: "hack", degree: "Diploma", page: "-4", chance: "Maybe", min: "abc" });
    expect(state).toEqual({ filters: NO_FILTERS, page: 1, showAll: false, group: false, groupDefault: false });
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 50 }, (_, i) => i);

  it("cuts out one page and counts the pages", () => {
    expect(paginate(items, 1)).toMatchObject({ page: 1, totalPages: 3 });
    expect(paginate(items, 3).items).toEqual([48, 49]);
  });

  it("shows the last page for a page number past the end", () => {
    expect(paginate(items, 99)).toMatchObject({ page: 3 });
    expect(paginate([], 2)).toMatchObject({ items: [], page: 1, totalPages: 1 });
  });
});

describe("buildBoard", () => {
  const featured = (name: string, extra: Partial<University> = {}) =>
    entry(name, { is_featured: true, created_by: null, ...extra });
  const notFeatured = (name: string, extra: Partial<University> = {}) =>
    entry(name, { is_featured: false, created_by: null, ...extra });
  const state = { filters: NO_FILTERS, page: 1, showAll: false, group: false, groupDefault: false };

  it("never sends more than one page of cards to the browser", () => {
    const many = Array.from({ length: 1624 }, (_, i) => featured(`School ${i}`));
    const board = buildBoard(many, state, { withFeatured: true });
    expect(board.entries.length).toBe(PAGE_SIZE);
    expect(board.matchingCount).toBe(1624);
    expect(board.totalPages).toBe(Math.ceil(1624 / PAGE_SIZE));
  });

  it("shows featured schools by default, and everything when asked", () => {
    const list = [featured("A"), notFeatured("B"), notFeatured("Mine", { created_by: "me" })];
    const byDefault = buildBoard(list, state, { withFeatured: true });
    // A student's own schools are always shown.
    expect(names(byDefault.entries).sort()).toEqual(["A", "Mine"]);
    expect(byDefault.featured).toEqual({ featuredCount: 2, allCount: 3, ready: true, searchedAll: false });

    const all = buildBoard(list, { ...state, showAll: true }, { withFeatured: true });
    expect(all.entries).toHaveLength(3);
  });

  it("shows everything before the featured list has been set up", () => {
    // Every is_featured still false (the column default): hiding all of them
    // would leave an empty page.
    const list = [notFeatured("A"), notFeatured("B")];
    const board = buildBoard(list, state, { withFeatured: true });
    expect(board.entries).toHaveLength(2);
    expect(board.featured?.ready).toBe(false);
  });

  it("treats a missing is_featured (migration not run) as featured", () => {
    const board = buildBoard([entry("Old row")], state, { withFeatured: true });
    expect(board.entries).toHaveLength(1);
  });
});

describe("topPicksByCountry", () => {
  it("gives each preferred country its own top few, so one country can't crowd out the rest", () => {
    const list = [
      ...Array.from({ length: 10 }, (_, i) =>
        entry(`US ${i}`, { country: "United States" }, { score: 90 - i })
      ),
      entry("Toronto", { country: "Canada" }, { score: 70 }),
      entry("UBC", { country: "Canada" }, { score: 75 }),
    ];
    const picks = topPicksByCountry(list, ["Canada", "United States", "Germany"], 3);
    expect(picks.map((g) => [g.country, names(g.picks)])).toEqual([
      ["Canada", ["UBC", "Toronto"]],
      ["United States", ["US 0", "US 1", "US 2"]],
      ["Germany", []],
    ]);
  });
});

describe("unknown tuition", () => {
  const list = [
    entry("Known cheap", { tuition: 1000 }),
    entry("Unknown", { tuition: null }),
    entry("Known dear", { tuition: 50000 }),
  ];

  it("sorts schools with unknown tuition last in both directions, never as $0", () => {
    expect(names(applyFilters(list, { ...NO_FILTERS, sortBy: "tuition-asc" }))).toEqual(["Known cheap", "Known dear", "Unknown"]);
    expect(names(applyFilters(list, { ...NO_FILTERS, sortBy: "tuition-desc" }))).toEqual(["Known dear", "Known cheap", "Unknown"]);
  });

  it("leaves unknown tuition out of a tuition-filtered view", () => {
    expect(names(applyFilters(list, { ...NO_FILTERS, tuitionMax: 60000 })).sort()).toEqual(["Known cheap", "Known dear"]);
  });

  it("can filter for 'Not enough data'", () => {
    const withChances = [
      entry("A", {}, { chance: "Not enough data" }),
      entry("B", {}, { chance: "Match" }),
    ];
    expect(names(applyFilters(withChances, { ...NO_FILTERS, chances: ["Not enough data"] }))).toEqual(["A"]);
  });
});

describe("ranking order", () => {
  it("defaults to the best school you can realistically get into", () => {
    expect(NO_FILTERS.sortBy).toBe("best");
    const easyWeak = entry("Easy weak", {}, { score: 95, quality: 0.3, plausibility: 1 });
    const strongReachable = entry("Strong reachable", {}, { score: 70, quality: 0.9, plausibility: 1 });
    const longShot = entry("Long shot", {}, { score: 60, quality: 1, plausibility: 0.2 });
    expect(names(applyFilters([easyWeak, longShot, strongReachable], NO_FILTERS))).toEqual([
      "Strong reachable",
      "Easy weak",
      "Long shot",
    ]);
    // "Best match" keeps the old fit-score order.
    expect(names(applyFilters([easyWeak, longShot, strongReachable], { ...NO_FILTERS, sortBy: "match" }))[0]).toBe("Easy weak");
  });

  it("puts schools failing the fit gate below every school that passes", () => {
    const failing = entry("Wrong country", {}, { quality: 1, plausibility: 1, passes: false });
    const passing = entry("Fits", {}, { quality: 0.2, plausibility: 0.5 });
    expect(names(applyFilters([failing, passing], NO_FILTERS))).toEqual(["Fits", "Wrong country"]);
  });

  it("sorts safest first by likelihood, then strength", () => {
    const likelyWeak = entry("Likely weak", {}, { quality: 0.3, plausibility: 1 });
    const likelyStrong = entry("Likely strong", {}, { quality: 0.8, plausibility: 1 });
    const reach = entry("Reach", {}, { quality: 1, plausibility: 0.3 });
    expect(names(applyFilters([reach, likelyWeak, likelyStrong], { ...NO_FILTERS, sortBy: "safest" }))).toEqual([
      "Likely strong",
      "Likely weak",
      "Reach",
    ]);
  });

  it("uses the same order for top picks by country", () => {
    const easyWeak = entry("Easy weak", {}, { score: 95, quality: 0.3 });
    const strong = entry("Strong", {}, { score: 60, quality: 0.9 });
    expect(names(topPicksByCountry([easyWeak, strong], ["Canada"], 1)[0].picks)).toEqual(["Strong"]);
  });
});

describe("grouped view", () => {
  const state = { filters: NO_FILTERS, page: 1, showAll: false, group: true, groupDefault: true };

  it("shows the strongest few of each group, with totals, Reach first", () => {
    const reaches = Array.from({ length: 9 }, (_, i) => entry(`Reach ${i}`, {}, { chance: "Reach", quality: i / 10 }));
    const matches = [entry("Match A", {}, { chance: "Match", quality: 0.4 }), entry("Match B", {}, { chance: "Match", quality: 0.8 })];
    const board = buildBoard([...matches, ...reaches], state, { withFeatured: false });
    expect(board.groups?.map((g) => [g.chance, g.entries.length, g.total])).toEqual([
      ["Reach", GROUP_PREVIEW, 9],
      ["Match", 2, 2],
    ]);
    expect(names(board.groups![0].entries)[0]).toBe("Reach 8"); // strongest first
    expect(names(board.groups![1].entries)).toEqual(["Match B", "Match A"]);
  });

  it("applies the student's sort inside each group (it used to be ignored)", () => {
    // Found in the logged-in test pass: "Lowest tuition" didn't reorder
    // "Not enough data", where most non-US schools sit.
    const cheapWeak = entry("Cheap weak", { tuition: 9000 }, { chance: "Not enough data", quality: 0.2 });
    const dearStrong = entry("Dear strong", { tuition: 50000 }, { chance: "Not enough data", quality: 0.9 });
    const unknown = entry("Unknown fee", { tuition: null }, { chance: "Not enough data", quality: 1 });
    const order = (sortBy: "best" | "tuition-asc" | "tuition-desc") =>
      names(buildBoard([dearStrong, unknown, cheapWeak], { ...state, filters: { ...NO_FILTERS, sortBy } }, { withFeatured: false }).groups![0].entries);
    expect(order("tuition-asc")).toEqual(["Cheap weak", "Dear strong", "Unknown fee"]);
    expect(order("tuition-desc")).toEqual(["Dear strong", "Cheap weak", "Unknown fee"]);
    expect(order("best")).toEqual(["Unknown fee", "Dear strong", "Cheap weak"]); // the groups' own order, strongest first
  });

  it("shows the plain list when one group is picked (“See all”)", () => {
    const board = buildBoard([entry("A", {}, { chance: "Reach" })], { ...state, filters: { ...NO_FILTERS, chances: ["Reach"] } }, { withFeatured: false });
    expect(board.groups).toBeUndefined();
  });
});

