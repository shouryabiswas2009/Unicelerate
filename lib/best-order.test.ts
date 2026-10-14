import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scoreUniversity, type MatchEntry } from "@/lib/matching";
import { LIST_COLUMNS } from "@/lib/data/universities";
import { buildBoard, parseBoardParams, type SortKey } from "@/lib/university-filters";
import { QUALITY_UNKNOWN } from "@/lib/scoring-config";
import type { Profile, UniversitySummary } from "@/lib/types";

// "Best you can get into" on the REAL shared list (data/fixtures, exported
// from the database with npm run data:export-fixture), through the same
// pipeline as the pages: scoreUniversity → buildBoard. Eight realistic
// students. Run with SHOW_BEST=<file> to write each student's top 15.

const fixture = JSON.parse(readFileSync(join(process.cwd(), "data", "fixtures", "shared-universities.json"), "utf8"));
const universities: UniversitySummary[] = fixture.rows.map(
  (row: unknown[]) => Object.fromEntries(fixture.columns.map((c: string, i: number) => [c, row[i]])) as UniversitySummary
);

const student = (name: string, fields: Partial<Profile>): [string, Profile] => [
  name,
  {
    id: name, full_name: name, country: "India", intended_majors: ["Computer Science"], gpa_percentage: 85,
    ielts_score: null, sat_score: null, budget_min: 0, budget_max: 40000, preferred_countries: [],
    preferred_degree_level: "Undergraduate", focuses: [], created_at: "", updated_at: "", ...fields,
  },
];

export const STUDENTS: [string, Profile][] = [
  student("Strong CS, SAT 1500, IELTS 8, $80k, anywhere", { gpa_percentage: 96, sat_score: 1500, ielts_score: 8, budget_max: 80000 }),
  student("Strong CS, no SAT, IELTS 7.5, $80k, US/UK/Canada", { gpa_percentage: 95, ielts_score: 7.5, budget_max: 80000, preferred_countries: ["United States", "United Kingdom", "Canada"] }),
  student("Middle Economics, SAT 1250, $40k, US", { intended_majors: ["Economics"], gpa_percentage: 84, sat_score: 1250, preferred_countries: ["United States"] }),
  student("Middle Economics, IELTS 6.5, $40k, Canada", { intended_majors: ["Economics"], gpa_percentage: 82, ielts_score: 6.5, preferred_countries: ["Canada"] }),
  student("Weak CS, SAT 1050, $15k, anywhere", { gpa_percentage: 68, sat_score: 1050, budget_max: 15000 }),
  student("Weak Medicine, IELTS 6, $15k, UK/Australia/Germany", { intended_majors: ["Medicine"], gpa_percentage: 70, ielts_score: 6, budget_max: 15000, preferred_countries: ["United Kingdom", "Australia", "Germany"] }),
  student("Middle Medicine, SAT 1300, $40k, US/Canada", { intended_majors: ["Medicine"], gpa_percentage: 86, sat_score: 1300, preferred_countries: ["United States", "Canada"] }),
  student("Strong Economics, no tests, $80k, UK", { intended_majors: ["Economics"], gpa_percentage: 94, budget_max: 80000, preferred_countries: ["United Kingdom"] }),
];

const scoredFor = (profile: Profile) => universities.map((u) => scoreUniversity(profile, u));
const board = (profile: Profile, params: Record<string, string> = {}) => buildBoard(scoredFor(profile), parseBoardParams(params), { withFeatured: true });
const quality = (e: MatchEntry) => e.rank.quality ?? QUALITY_UNKNOWN;
const pct = (v: number) => `${Math.round(v * 100)}`;

describe("'Best you can get into' on the real list", () => {
  it("prints each student's top 15 (SHOW_BEST=<file>)", () => {
    if (!process.env.SHOW_BEST) return;
    const out: string[] = [];
    for (const [name, profile] of STUDENTS) {
      out.push(`\n## ${name}`);
      board(profile).entries.slice(0, 15).forEach((e, i) => {
        const estimate = e.university.strength_is_estimate ? " (est.)" : "";
        out.push(
          `${i + 1}. ${e.university.name} [${e.university.country}] quality ${e.rank.quality === null ? "?" : pct(e.rank.quality)}${estimate} · plausibility ${pct(e.rank.plausibility)} (${e.rank.plausibilitySource}) · ${e.match.chance}${e.rank.gate.passes ? "" : " · GATE: " + e.rank.gate.reasons.join(", ")}`
        );
      });
    }
    writeFileSync(process.env.SHOW_BEST, out.join("\n"));
  });

  it.each(STUDENTS)("%s: no school in the top 10 is both weaker and less reachable than one below it", (_, profile) => {
    const top = board(profile).entries.slice(0, 10);
    for (let i = 0; i < top.length; i++) {
      for (let j = i + 1; j < top.length; j++) {
        const [a, b] = [top[i], top[j]];
        if (a.rank.gate.passes !== b.rank.gate.passes) continue; // gate decides first
        const dominated = quality(a) < quality(b) && a.rank.plausibility < b.rank.plausibility;
        expect(dominated, `${a.university.name} (#${i + 1}) above ${b.university.name} (#${j + 1})`).toBe(false);
      }
    }
  });

  it.each(STUDENTS)("%s: an estimated strength never sits above a measured school it doesn't beat", (_, profile) => {
    const top = board(profile).entries.slice(0, 15);
    for (let i = 0; i < top.length; i++) {
      for (let j = i + 1; j < top.length; j++) {
        const [a, b] = [top[i], top[j]];
        if (!a.university.strength_is_estimate || b.university.strength_is_estimate || a.rank.gate.passes !== b.rank.gate.passes) continue;
        expect(a.rank.realistic, `${a.university.name} (estimate) above ${b.university.name}`).toBeGreaterThan(b.rank.realistic);
      }
    }
  });
});

describe("filters and sorting on the real list", () => {
  const [, middle] = STUDENTS[2];

  it("a search finds a school that isn't featured (searches cover every school)", () => {
    const hidden = universities.find((u) => u.is_featured === false && u.source === "College Scorecard")!;
    const found = board(middle, { q: hidden.name }).entries.map((e) => e.university.id);
    expect(found).toContain(hidden.id);
  });

  it("a country filter covers every school in that country, not only featured ones", () => {
    const all = universities.filter((u) => u.country === "United States").length;
    expect(board(middle, { country: "United States" }).matchingCount).toBe(all);
  });

  it("applying then removing a filter gives back exactly the original list", () => {
    const ids = (params: Record<string, string>) => board(middle, params).entries.map((e) => e.university.id);
    const original = ids({});
    expect(ids({ country: "Canada" })).not.toEqual(original);
    expect(ids({})).toEqual(original);
  });

  it("says how many schools a tuition filter hid because their tuition isn't known", () => {
    const result = board(middle, { max: "30000" });
    const unknown = universities.filter((u) => u.tuition === null).length;
    expect(result.hiddenUnknownTuition).toBe(unknown);
    expect(board(middle).hiddenUnknownTuition).toBe(0);
  });

  it("a student who filters to another country sees those schools judged on their merits, not as 'outside your countries'", () => {
    const [, canadaOnly] = STUDENTS[3];
    const top = board(canadaOnly, { country: "United States" }).entries.slice(0, 10);
    expect(top.every((e) => e.rank.gate.passes)).toBe(true);
  });

  it.each(["best", "safest", "match", "tuition-asc", "tuition-desc", "ranking"] as SortKey[])(
    "sort '%s' gives the same order whatever order the schools come in",
    (sort) => {
      const scored = scoredFor(middle);
      const state = parseBoardParams({ sort, all: "1" });
      const forward = buildBoard(scored, state, { withFeatured: true }).entries.map((e) => e.university.id);
      const backward = buildBoard([...scored].reverse(), state, { withFeatured: true }).entries.map((e) => e.university.id);
      expect(backward).toEqual(forward);
    }
  );

  it("visa 'ignore' or 'show', and campus focuses not ticked, never change the order", () => {
    const ids = (p: Profile) => board(p, { all: "1" }).entries.map((e) => e.university.id);
    const base = ids(middle);
    expect(ids({ ...middle, visa_mode: "ignore" })).toEqual(base);
    expect(ids({ ...middle, visa_mode: "show" })).toEqual(base);
    expect(ids({ ...middle, campus_social_prefs: ["quiet_close_knit"] })).toEqual(base);
  });

  it("the fixture has only list columns", () => {
    for (const c of fixture.columns) expect(LIST_COLUMNS as readonly string[]).toContain(c);
  });
});

describe("board state", () => {
  it("goes back to page 1 on any filter or sort change", async () => {
    const { withFilters } = await import("@/lib/university-filters");
    const onPage3 = { ...parseBoardParams({ page: "3", country: "Canada" }) };
    expect(onPage3.page).toBe(3);
    expect(withFilters(onPage3, { country: "United States" }).page).toBe(1);
    expect(withFilters(onPage3, { sortBy: "match" }).page).toBe(1);
    expect(withFilters(onPage3, { tuitionMax: 30000 }).filters).toMatchObject({ country: "Canada", tuitionMax: 30000 });
  });
});
