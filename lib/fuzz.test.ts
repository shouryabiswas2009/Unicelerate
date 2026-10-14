import { describe, expect, it } from "vitest";
import { GRADE_SYSTEMS, gradeToPercentage } from "@/lib/grades";
import { COURSE_LEVELS, COURSE_SUBJECTS } from "@/lib/course-config";
import { effectiveGrade, relevantCourseAverage, familyForProfile, type ProfileCourse } from "@/lib/courses";
import { ACADEMIC_PREFS, SOCIAL_PREFS } from "@/lib/campus-life-config";
import { academicCommunityScore, socialFunScore } from "@/lib/campus-life";
import { computeMatchScore, fitWeights, scoreUniversity } from "@/lib/matching";
import { validateProfileForm } from "@/lib/profile-validation";
import { FOCUSES, type Profile, type UniversitySummary } from "@/lib/types";

// Property-style tests: thousands of seeded random inputs through the pure
// functions, checking what must always hold (no NaN, scores in range,
// weights adding up, no crash on missing data). Seeded, so a failure is
// reproducible: the seed and the input are in the message.

// mulberry32: a tiny, well-known seeded random number generator.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const RUNS = 2000;
const pick = <T,>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length)];
const maybe = <T,>(r: () => number, value: T, nullShare = 0.3): T | null => (r() < nullShare ? null : value);
const between = (r: () => number, lo: number, hi: number) => lo + r() * (hi - lo);
const isFiniteNumber = (v: unknown) => typeof v === "number" && Number.isFinite(v);

const NASTY = ["", " ", "abc", "-5", "1e9", "NaN", "Infinity", "9.9.9", "100", "0", "7 7 7", "A* A B", "4.0", "85%", ",,,", "١٢٣"];
function randomText(r: () => number): string {
  if (r() < 0.4) return pick(r, NASTY);
  const parts = Array.from({ length: 1 + Math.floor(r() * 6) }, () =>
    r() < 0.5 ? String(Math.round(between(r, -20, 120) * 10) / 10) : pick(r, ["A*", "A", "B", "C", "D", "E", "U", "7", "6", "5", "4", "3", "2", "1", "x"])
  );
  return parts.join(pick(r, [" ", ",", ", ", ";", "/"]));
}

function randomProfile(r: () => number): Profile {
  return {
    id: "fuzz", full_name: "Fuzz", country: pick(r, ["India", "Canada", "", "Nowhere"]),
    intended_majors: Array.from({ length: Math.floor(r() * 3) }, () => pick(r, ["Computer Science", "Economics", "Medicine", "History", "", "Underwater Basket Weaving"])),
    gpa_percentage: Math.round(between(r, 0, 100)),
    ielts_score: maybe(r, Math.round(between(r, 0, 9) * 2) / 2),
    sat_score: maybe(r, Math.round(between(r, 400, 1600) / 10) * 10),
    budget_min: 0,
    budget_max: Math.round(between(r, 1, 120000)),
    preferred_countries: Array.from({ length: Math.floor(r() * 3) }, () => pick(r, ["Canada", "United States", "United Kingdom", "Germany", "UK"])),
    preferred_degree_level: pick(r, ["Undergraduate", "Masters", "PhD"] as const),
    focuses: FOCUSES.filter(() => r() < 0.3),
    campus_academic_prefs: ACADEMIC_PREFS.filter(() => r() < 0.2),
    campus_social_prefs: SOCIAL_PREFS.filter(() => r() < 0.2),
    visa_mode: pick(r, [null, "ignore", "show", "factor"] as const),
    visa_weight: pick(r, [null, "low", "medium", "high"] as const),
    courses: randomCourses(r),
    created_at: "", updated_at: "",
  };
}

function randomCourses(r: () => number): ProfileCourse[] {
  return Array.from({ length: Math.floor(r() * 8) }, () => ({
    subject: pick(r, COURSE_SUBJECTS),
    level: pick(r, COURSE_LEVELS),
    grade_percentage: Math.round(between(r, 0, 100) * 10) / 10,
    grade_year: pick(r, [9, 10, 11, 12]),
  }));
}

function randomUniversity(r: () => number, i: number): UniversitySummary {
  const sat25 = maybe(r, Math.round(between(r, 800, 1500)));
  return {
    id: `u${i}`, name: `School ${i}`, country: pick(r, ["United States", "Canada", "United Kingdom", "Germany", "Atlantis"]),
    city: maybe(r, "City"), state: null,
    tuition: maybe(r, Math.round(between(r, 0, 90000))), qs_ranking: maybe(r, Math.round(between(r, 1, 1500)), 0.8),
    program_rankings: {}, degree_levels: r() < 0.2 ? [] : (["Undergraduate", "Masters"] as UniversitySummary["degree_levels"]),
    acceptance_rate: maybe(r, Math.round(between(r, 2, 100))), avg_admitted_gpa: maybe(r, Math.round(between(r, 60, 100)), 0.7),
    sat_25: sat25, sat_75: sat25 === null ? null : sat25 + Math.round(between(r, 0, 200)), min_ielts: maybe(r, 6.5, 0.6),
    living_cost_per_year: maybe(r, Math.round(between(r, 5000, 30000))),
    popular_programs: r() < 0.2 ? [] : ["Computer Science", "Business", "Health Professions"].filter(() => r() < 0.6),
    created_by: null, source: pick(r, ["College Scorecard", "curated", "user-entered"] as const), data_year: null, fetched_at: null,
    source_url: null, completion_rate: maybe(r, Math.round(between(r, 10, 99))), research_intensity: maybe(r, pick(r, ["very_high", "high", "doctoral_professional", "non_doctoral"] as const)),
    retention_rate: maybe(r, Math.round(between(r, 40, 99))), coop_program: pick(r, ["mandatory", "optional", "none", "unknown"] as const),
    internship_support_url: null, is_featured: r() < 0.5, aliases: [], tuition_local: null, tuition_currency: null, tuition_basis: null, fx_rate_date: null,
    median_earnings_10yr: maybe(r, Math.round(between(r, 20000, 150000))), research_impact: null,
    strength_index: maybe(r, Math.round(between(r, 0, 100) * 10) / 10), strength_low: null, strength_high: null, strength_tier: null,
    strength_confidence: null, strength_is_estimate: r() < 0.1, strength_position: null, strength_signals: null,
    campus_life: r() < 0.3 ? null : {
      locale: maybe(r, pick(r, [11, 12, 13, 21, 22, 23, 31, 32, 33, 41, 42, 43, 99])),
      undergrads: maybe(r, Math.round(between(r, 0, 60000))), housing: maybe(r, Math.round(between(r, 0, 30000))),
      athletics: maybe(r, pick(r, ["ncaa_fbs", "ncaa_football", "ncaa", "usports", "other_national", "none"] as const)),
      project_teams: maybe(r, Math.round(between(r, 0, 80)), 0.8), social_clubs: maybe(r, Math.round(between(r, 0, 400)), 0.8),
    },
  } as UniversitySummary;
}

describe("fuzz: grade conversion", () => {
  it("never returns NaN or a percentage outside 0-100, whatever is typed", () => {
    const r = rng(1);
    for (let i = 0; i < RUNS; i++) {
      const system = pick(r, GRADE_SYSTEMS);
      const input = randomText(r);
      const result = gradeToPercentage(system, input);
      if (result.ok) {
        expect(isFiniteNumber(result.percentage), `${system} "${input}"`).toBe(true);
        expect(result.percentage, `${system} "${input}"`).toBeGreaterThanOrEqual(0);
        expect(result.percentage, `${system} "${input}"`).toBeLessThanOrEqual(100);
      } else {
        expect(result.error.length, `${system} "${input}"`).toBeGreaterThan(0);
      }
    }
  });
});

describe("fuzz: budgets on the profile form", () => {
  it("either accepts a budget with min ≤ max (both finite, not negative) or explains why not", () => {
    const r = rng(2);
    for (let i = 0; i < RUNS; i++) {
      const fd = new FormData();
      fd.set("full_name", "Fuzz");
      fd.set("country", "India");
      fd.append("intended_majors", "Computer Science");
      fd.set("grade_system", "percentage");
      fd.set("grade_input", "85");
      fd.set("preferred_degree_level", "Undergraduate");
      const min = pick(r, ["", "0", "-100", "abc", "1e12", String(Math.round(between(r, 0, 100000)))]);
      const max = pick(r, ["", "0", "-5", "NaN", "Infinity", String(Math.round(between(r, 0, 100000)))]);
      fd.set("budget_min", min);
      fd.set("budget_max", max);
      const result = validateProfileForm(fd);
      if (result.ok) {
        const { budget_min, budget_max } = result.data;
        expect(isFiniteNumber(budget_min) && isFiniteNumber(budget_max), `${min} / ${max}`).toBe(true);
        expect(budget_min, `${min} / ${max}`).toBeGreaterThanOrEqual(0);
        expect(budget_min, `${min} / ${max}`).toBeLessThanOrEqual(budget_max);
      } else {
        expect(Object.values(result.errors).join(" ").length, `${min} / ${max}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("fuzz: course lists", () => {
  it("relevant averages and the blended grade stay within 0-100", () => {
    const r = rng(3);
    for (let i = 0; i < RUNS; i++) {
      const profile = randomProfile(r);
      const courses = profile.courses ?? [];
      const relevant = relevantCourseAverage(courses, familyForProfile(profile));
      if (relevant) {
        expect(isFiniteNumber(relevant.average)).toBe(true);
        expect(relevant.average).toBeGreaterThanOrEqual(0);
        expect(relevant.average).toBeLessThanOrEqual(100);
      }
      const grade = effectiveGrade(profile);
      expect(isFiniteNumber(grade) && grade >= 0 && grade <= 100, JSON.stringify(courses)).toBe(true);
    }
  });
});

describe("fuzz: matching and ranking", () => {
  it("weights always add up to 100, and every score is a number in range", () => {
    const r = rng(4);
    for (let i = 0; i < RUNS; i++) {
      const profile = randomProfile(r);
      const university = randomUniversity(r, i);
      const weights = fitWeights(profile);
      expect(Object.values(weights).reduce((a, b) => a + b, 0), JSON.stringify(profile.focuses)).toBeCloseTo(100, 6);

      const match = computeMatchScore(profile, university);
      expect(Number.isInteger(match.score) && match.score >= 0 && match.score <= 100, `${i}: ${match.score}`).toBe(true);
      for (const f of match.factors) {
        expect(f.points === null || (isFiniteNumber(f.points) && f.points >= 0 && f.points <= f.max + 1e-9), `${i}: ${f.key} ${f.points}/${f.max}`).toBe(true);
      }

      const entry = scoreUniversity(profile, university);
      expect(isFiniteNumber(entry.rank.realistic) && entry.rank.realistic >= 0 && entry.rank.realistic <= 1, `${i}: realistic`).toBe(true);
      expect(entry.rank.plausibility).toBeGreaterThanOrEqual(0);
      expect(entry.rank.plausibility).toBeLessThanOrEqual(1);
      expect(entry.rank.quality === null || (entry.rank.quality >= 0 && entry.rank.quality <= 1), `${i}: quality`).toBe(true);
      for (const line of [...entry.explanation.strengths, ...entry.explanation.concerns]) {
        expect(line, `${i}`).not.toMatch(/NaN|undefined|Infinity/);
      }

      const academic = academicCommunityScore(university, profile.campus_academic_prefs ?? []);
      const social = socialFunScore(university, profile.campus_social_prefs ?? []);
      for (const s of [academic.score, social.score]) expect(s === null || (s >= 0 && s <= 1), `${i}: campus ${s}`).toBe(true);
    }
  });
});
