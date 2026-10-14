import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import scorecard from "../data/scorecard/universities.json";
import { ATHLETICS_SCORES, LOCALE_URBAN } from "@/lib/campus-life-config";
import {
  academicCommunityScore,
  academicProxyLines,
  coverageFor,
  socialFunScore,
  socialProxyLines,
} from "@/lib/campus-life";
import { computeMatchScore, focusWeights, scoreUniversity } from "@/lib/matching";
import { parseCsv } from "../scripts/curated/csv.mjs";
import type { CampusLife, Focus, Profile, University } from "@/lib/types";

const ROOT = join(__dirname, "..");

const profile = (fields: Partial<Profile> = {}): Profile => ({
  id: "s", full_name: "S", country: "Canada", intended_majors: ["Computer Science"], gpa_percentage: 88, ielts_score: null,
  sat_score: null, budget_min: 0, budget_max: 80000, preferred_countries: [], preferred_degree_level: "Undergraduate",
  focuses: [], created_at: "", updated_at: "", ...fields,
});

const school = (name: string, fields: Partial<University> = {}): University =>
  ({
    id: name, name, country: "United States", tuition: 30000, degree_levels: ["Undergraduate"], acceptance_rate: 50,
    avg_admitted_gpa: null, sat_25: null, sat_75: null, min_ielts: null, living_cost_per_year: 15000,
    popular_programs: ["Computer Science"], qs_ranking: null, program_rankings: {}, source: "College Scorecard",
    created_by: null, coop_program: "unknown", research_intensity: null, research_impact: null, campus_life: null, ...fields,
  }) as University;

// A tech-heavy school: design teams, mandatory co-op, R1, no social figures
// published. A big-sports school: FBS football, big enrolment, a city, lots
// of housing, but teaching-focused and no academic-community figures.
const tech = school("Tech U", {
  coop_program: "mandatory",
  research_intensity: "very_high",
  campus_life: { project_teams: 44, curated: [{ proxy: "project_teams", source_url: "https://example.edu/teams", checked_on: "2026-10-13" }] },
});
const sports = school("Sports U", {
  research_intensity: "non_doctoral",
  campus_life: { locale: 11, undergrads: 40000, housing: 20000, athletics: "ncaa_fbs", football: "Big Ten Conference" },
});
const blank = school("Blank U");

const points = (p: Profile, u: University, key: string) => computeMatchScore(p, u).factors.find((f) => f.key === key);

describe("focus points", () => {
  it("each selected focus splits the 20 focus points; weights still add up to 100", () => {
    const cases: Focus[][] = [["academic_community"], ["social_life"], ["academic_community", "social_life"], ["research", "social_life"]];
    for (const focuses of cases) {
      const w = focusWeights(focuses);
      const total = Object.values(w).reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(100, 6);
      const focusPoints = w.reputation + w.coop + w.research + w.affordability + w.campus_academic + w.campus_social;
      expect(focusPoints).toBeCloseTo(20, 6);
    }
    expect(focusWeights(["academic_community", "social_life"])).toMatchObject({ campus_academic: 10, campus_social: 10, research: 0 });
  });

  it("neither selected: exactly the Balanced weights from before the campus focuses existed", () => {
    expect(focusWeights([])).toEqual({
      budget: 25, major: 20, academic: 15, country: 10, english: 10,
      reputation: 5, coop: 5, research: 5, affordability: 5, campus_academic: 0, campus_social: 0,
    });
    // ...and the campus factors don't appear in the breakdown.
    expect(computeMatchScore(profile(), sports).factors.map((f) => f.key)).not.toContain("campus_social");
  });
});

describe("the two scores are independent", () => {
  it("a tech-heavy school wins on academic community, a big-sports school on social life", () => {
    expect(academicCommunityScore(tech).score!).toBeGreaterThan(academicCommunityScore(sports).score!);
    expect(socialFunScore(tech).score).toBeNull(); // unknown, never zero
    expect(socialFunScore(sports).score!).toBeGreaterThan(0.8);

    const academicOnly = profile({ focuses: ["academic_community"] });
    const socialOnly = profile({ focuses: ["social_life"] });
    expect(computeMatchScore(academicOnly, tech).score).toBeGreaterThan(computeMatchScore(academicOnly, sports).score);
    expect(points(socialOnly, sports, "campus_social")!.points).toBeGreaterThan(15);
    expect(points(socialOnly, tech, "campus_social")!.points).toBeNull();
  });

  it("selecting one focus ignores the other kind's figures completely", () => {
    const academicOnly = profile({ focuses: ["academic_community"] });
    const louder = { ...sports, campus_life: { ...sports.campus_life, athletics: "none", locale: 43 } as CampusLife };
    expect(computeMatchScore(academicOnly, louder)).toEqual(computeMatchScore(academicOnly, sports));
    const socialOnly = profile({ focuses: ["social_life"] });
    const fewerTeams = { ...sports, research_intensity: "very_high" as const, coop_program: "mandatory" as const };
    expect(computeMatchScore(socialOnly, fewerTeams)).toEqual(computeMatchScore(socialOnly, sports));
  });
});

describe("missing data", () => {
  it("skips unknown proxies and re-weights the rest", () => {
    const onlySport = school("Only sport", { campus_life: { athletics: "ncaa" } });
    expect(socialFunScore(onlySport)).toMatchObject({ score: ATHLETICS_SCORES.ncaa, coverage: "Partial", known: 1, direct: 0 });
    const onlyLocale = school("Only city", { campus_life: { locale: 12 } });
    expect(socialFunScore(onlyLocale).score).toBe(LOCALE_URBAN[12]);
  });

  it("a school with no data neither crashes nor is buried: the factor is left out", () => {
    const both = profile({ focuses: ["academic_community", "social_life"] });
    const result = computeMatchScore(both, blank);
    expect(result.factors.filter((f) => f.key.startsWith("campus_")).every((f) => f.points === null)).toBe(true);
    // Same as scoring it on everything else alone.
    expect(result.score).toBe(computeMatchScore(profile({ focuses: ["research"] }), blank).score);
    expect(academicCommunityScore(blank)).toEqual({ score: null, coverage: "Not available", known: 0, direct: 0 });
  });

  it("calls coverage Good only with a direct club, team or event count; indirect figures alone are Partial", () => {
    // Setting, size, housing and sport: four figures, none of them a club or
    // event count, so never more than Partial (the MIT case).
    expect(socialFunScore(sports)).toMatchObject({ known: 4, direct: 0, coverage: "Partial" });
    // Carnegie level and research impact say nothing about teams or clubs.
    const researchOnly = school("Research U", { research_intensity: "very_high", research_impact: { overall: 90 } as University["research_impact"] });
    expect(academicCommunityScore(researchOnly)).toMatchObject({ known: 2, direct: 0, coverage: "Partial" });
    // A published team count plus enough other figures: Good.
    expect(academicCommunityScore(tech)).toMatchObject({ direct: 1, coverage: "Good" });
    const withClubs = { ...sports, campus_life: { ...sports.campus_life, social_clubs: 160 } };
    expect(socialFunScore(withClubs).coverage).toBe("Good");
    // A direct figure on its own isn't enough figures for Good.
    expect(coverageFor({ project_teams: 0.5, coop: null }, ["project_teams"])).toBe("Partial");
    expect(coverageFor({ a: null }, ["a"])).toBe("Not available");
  });
});

describe("the student's choices", () => {
  const town = school("Town College", { campus_life: { locale: 32, undergrads: 1800, housing: 1500, athletics: "ncaa" } });
  const city = school("City University", { campus_life: { locale: 11, undergrads: 1800, housing: 1500, athletics: "ncaa" } });
  const fun = (u: University, prefs: Profile["campus_social_prefs"]) => socialFunScore(u, prefs).score!;

  it("Quiet & close-knit prefers the small town; City life & nightlife the big city", () => {
    expect(fun(town, ["quiet_close_knit"])).toBeGreaterThan(fun(city, ["quiet_close_knit"]));
    expect(fun(city, ["city_nightlife"])).toBeGreaterThan(fun(town, ["city_nightlife"]));
    const quiet = profile({ focuses: ["social_life"], campus_social_prefs: ["quiet_close_knit"] });
    expect(computeMatchScore(quiet, town).score).toBeGreaterThan(computeMatchScore(quiet, city).score);
  });

  it("Not sure (or nothing) uses equal weights; Greek life alone can't be scored", () => {
    expect(fun(city, ["not_sure"])).toBe(fun(city, []));
    expect(socialFunScore(city, ["greek_life"]).score).toBeNull();
    // Opposite choices balance out instead of one silently winning.
    const both = fun(city, ["quiet_close_knit", "city_nightlife"]);
    expect(both).toBeLessThan(fun(city, ["city_nightlife"]));
    expect(both).toBeGreaterThan(fun(city, ["quiet_close_knit"]));
  });

  it("academic choices re-weight: career & networking leans on co-op, research on research", () => {
    const coopOnly = school("Co-op U", { coop_program: "mandatory", research_intensity: "non_doctoral" });
    expect(academicCommunityScore(coopOnly, ["career_networking"]).score).toBe(1);
    expect(academicCommunityScore(coopOnly, ["research"]).score).toBe(0);
  });

  it("explains in neutral words and names Greek life as not scored", () => {
    const p = profile({ focuses: ["social_life"], campus_social_prefs: ["big_events_sports", "greek_life"] });
    const { explanation } = scoreUniversity(p, sports);
    const text = [...explanation.strengths, ...explanation.concerns].join(" ");
    expect(text).toMatch(/Campus social life: has varsity sport events/);
    expect(explanation.concerns.join(" ")).toMatch(/Greek life: no official source/);
    expect(text).not.toMatch(/party school|not fun|good social scene/i);
  });
});

describe("what the student sees", () => {
  it("shows the proxies with their sources, never a number", () => {
    expect(socialProxyLines(sports).map((l) => l.text)).toEqual([
      "Large city setting",
      "40,000 undergraduates",
      "Campus housing for about 50% of undergraduates",
      "Has varsity sport events: NCAA, with football in the top division (FBS) (football: Big Ten Conference)",
    ]);
    expect(academicProxyLines({ ...tech, internship_support_url: null }).map((l) => l.text)).toEqual([
      "44 design / project teams listed",
      "Mandatory co-op program",
      "Very high research activity (R1)",
    ]);
  });
});

describe("data files", () => {
  it("every hand-checked row is cited and dated", () => {
    const rows = parseCsv(readFileSync(join(ROOT, "data", "curated", "campus_life.csv"), "utf8")) as unknown as Record<string, string>[];
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.source_url, r.key).toMatch(/^https:\/\//);
      expect(r.checked_on, r.key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  // The seed SQL the build wrote, as the database will return it.
  const seeded = new Map<string, CampusLife>();
  for (const file of readdirSync(join(ROOT, "supabase", "seed_campus_life"))) {
    const sql = readFileSync(join(ROOT, "supabase", "seed_campus_life", file), "utf8");
    for (const m of sql.matchAll(/campus_life = '(.*)'::jsonb where created_by is null and (\w+) = '?([^';]+)'?;/g)) {
      seeded.set(`${m[2]}:${m[3]}`, JSON.parse(m[1].replaceAll("''", "'")));
    }
  }

  it("covers every shared school, and stores the same Not-sure scores the site computes", () => {
    const curatedCount = parseCsv(readFileSync(join(ROOT, "data", "curated", "international_universities.csv"), "utf8")).length;
    expect(seeded.size).toBe(scorecard.universities.length + curatedCount);
    for (const s of scorecard.universities.slice(0, 300)) {
      const life = seeded.get(`scorecard_id:${s.scorecard_id}`)!;
      const row = { campus_life: life, coop_program: "unknown" as const, research_intensity: s.research_intensity as University["research_intensity"], research_impact: null };
      // Recompute without the stored values, from the proxies alone.
      const fresh = { ...row, campus_life: { ...life, academic_score: undefined, social_score: undefined } };
      expect(socialFunScore(row).score).toBe(socialFunScore(fresh).score);
    }
  });

  it("changes no score or order for students who pick neither focus", () => {
    const p = profile({ focuses: ["research", "affordability"], preferred_countries: ["United States"] });
    const sample = scorecard.universities.slice(0, 200).map((s) =>
      school(s.name, { ...(s as unknown as Partial<University>), id: String(s.scorecard_id), created_by: null })
    );
    const withCampus = sample.map((u) => ({ ...u, campus_life: seeded.get(`scorecard_id:${u.id}`) ?? null }));
    const scores = (list: University[]) => list.map((u) => computeMatchScore(p, u));
    expect(scores(withCampus)).toEqual(scores(sample));
    expect(scores(withCampus).every((m) => m.factors.every((f) => !f.key.startsWith("campus_")))).toBe(true);
  });
});
