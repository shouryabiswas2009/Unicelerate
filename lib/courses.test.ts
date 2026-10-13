import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COURSE_SUBJECTS,
  LEVEL_MULTIPLIER,
  MAJOR_FAMILIES,
  MAX_LEVEL_MULTIPLIER,
  RELEVANCE,
  TIER_WEIGHT,
} from "@/lib/course-config";
import {
  effectiveGrade,
  familyForProfile,
  majorFamily,
  prerequisiteConcerns,
  relevantCourseAverage,
  validateCourses,
  type ProfileCourse,
} from "@/lib/courses";
import { computeMatchScore } from "@/lib/matching";
import { PROGRAM_PREREQUISITES } from "@/lib/program-prerequisites";
import { QUIZ_MAJORS } from "@/lib/quiz-options";
import type { Profile, University } from "@/lib/types";

const course = (subject: ProfileCourse["subject"], grade: number, level: ProfileCourse["level"] = "standard"): ProfileCourse => ({
  subject,
  level,
  grade_percentage: grade,
  grade_year: 12,
});
// Same overall average (85), marks reversed between the two students.
const strongQuant = [course("mathematics", 97), course("calculus", 96), course("computer_science", 95), course("economics", 70), course("english", 72)];
const strongEcon = [course("mathematics", 70), course("calculus", 72), course("computer_science", 70), course("economics", 97), course("english", 96)];

const profile = (fields: Partial<Profile> = {}): Profile => ({
  id: "s", full_name: "S", country: "India", intended_majors: ["Computer Science"], gpa_percentage: 85, ielts_score: null,
  sat_score: null, budget_min: 0, budget_max: 60000, preferred_countries: [], preferred_degree_level: "Undergraduate",
  focuses: [], created_at: "", updated_at: "", ...fields,
});
// A school that publishes an admitted-student average (none in our shared
// data do yet; a student's own added school can).
const school = { id: "u", name: "Example U", country: "Canada", tuition: 20000, degree_levels: ["Undergraduate"], acceptance_rate: 60,
  avg_admitted_gpa: 88, sat_25: null, sat_75: null, min_ielts: null, living_cost_per_year: 10000, popular_programs: ["Computer Science", "Economics"],
  qs_ranking: null, program_rankings: {}, source: "user-entered", created_by: "s" } as unknown as University;
const academic = (p: Profile) => computeMatchScore(p, school).factors.find((f) => f.key === "academic")!.points!;

describe("major families", () => {
  it("maps the app's majors (including every quiz major)", () => {
    expect(majorFamily("Computer Science")).toBe("computer_science");
    expect(majorFamily("Software Engineering")).toBe("engineering");
    expect(majorFamily("Data Science")).toBe("computer_science");
    expect(majorFamily("Economics")).toBe("business_econ");
    expect(majorFamily("Biological Sciences")).toBe("life_health");
    expect(majorFamily("Psychology")).toBe("social_sciences");
    expect(majorFamily("Architecture")).toBe("humanities_arts");
    for (const m of QUIZ_MAJORS) expect(majorFamily(m), m).not.toBeNull();
    expect(familyForProfile({ intended_majors: ["Undecided", "Physics"] })).toBe("physical_sciences");
  });

  it("has a valid tier for every subject in every family, and a core subject in each", () => {
    for (const family of MAJOR_FAMILIES) {
      const cells = RELEVANCE[family];
      for (const [subject, tier] of Object.entries(cells)) {
        expect(COURSE_SUBJECTS, `${family}.${subject}`).toContain(subject);
        expect(Object.keys(TIER_WEIGHT)).toContain(tier);
      }
      expect(Object.values(cells), family).toContain("core");
    }
  });
});

describe("relevantCourseAverage", () => {
  it("weights core subjects more for the student's major", () => {
    expect(relevantCourseAverage(strongQuant, "computer_science")!.average).toBeGreaterThan(88);
    expect(relevantCourseAverage(strongEcon, "computer_science")!.average).toBeLessThan(80);
    expect(relevantCourseAverage(strongQuant, "computer_science")!.relevantCount).toBe(4);
  });

  it("says 'not enough courses' (null) with fewer than 2 relevant courses or no major family", () => {
    expect(relevantCourseAverage([course("mathematics", 99)], "computer_science")).toBeNull();
    expect(relevantCourseAverage([course("arts", 99), course("languages", 98), course("mathematics", 97)], "computer_science")).toBeNull();
    expect(relevantCourseAverage(strongQuant, null)).toBeNull();
  });

  it("caps the level effect: hard courses re-weight, they never raise a grade", () => {
    expect(Math.max(...Object.values(LEVEL_MULTIPLIER))).toBeLessThanOrEqual(MAX_LEVEL_MULTIPLIER);
    const hard = relevantCourseAverage([course("mathematics", 60, "ib_hl"), course("calculus", 60, "ap")], "computer_science")!;
    expect(hard.average).toBe(60);
    expect(hard.rigorous).toBe(2);
  });
});

describe("academic fit", () => {
  it("lifts a CS student with strong Maths/CS above the same average with the marks reversed", () => {
    expect(academic(profile({ courses: strongQuant }))).toBeGreaterThan(academic(profile({ courses: strongEcon })));
  });

  it("follows published requirements for Economics (Maths first), and reverses for Humanities", () => {
    // Economics: LSE and Cambridge require Maths and say Economics isn't
    // required, so Maths/Calculus are core and Economics supporting: the
    // quantitative student still comes out ahead for an Economics major.
    const econ = { intended_majors: ["Economics"] };
    expect(effectiveGrade(profile({ ...econ, courses: strongQuant }))).toBeGreaterThan(effectiveGrade(profile({ ...econ, courses: strongEcon })));
    // For a Humanities major the English/History-heavy list wins.
    const humanitiesStrong = [course("english", 96), course("social_studies", 95), course("mathematics", 70), course("calculus", 72)];
    const quantStrong = [course("english", 70), course("social_studies", 72), course("mathematics", 96), course("calculus", 95)];
    const arts = { intended_majors: ["English Literature"] };
    expect(effectiveGrade(profile({ ...arts, courses: humanitiesStrong }))).toBeGreaterThan(effectiveGrade(profile({ ...arts, courses: quantStrong })));
    expect(academic(profile({ ...arts, courses: humanitiesStrong }))).toBeGreaterThan(academic(profile({ ...arts, courses: quantStrong })));
    // …and the CS student the other way round with the same two lists.
    expect(academic(profile({ courses: quantStrong }))).toBeGreaterThan(academic(profile({ courses: humanitiesStrong })));
  });

  it("changes nothing without courses, or with too few relevant ones", () => {
    const plain = computeMatchScore(profile(), school);
    expect(computeMatchScore(profile({ courses: [] }), school)).toEqual(plain);
    expect(computeMatchScore(profile({ courses: [course("mathematics", 100)] }), school)).toEqual(plain);
    expect(effectiveGrade(profile())).toBe(85);
  });
});

describe("validateCourses", () => {
  const fd = (rows: [string, string, string, string][]) => {
    const f = new FormData();
    for (const [s, l, g, y] of rows) {
      f.append("course_subject", s);
      f.append("course_level", l);
      f.append("course_grade", g);
      f.append("course_year", y);
    }
    return f;
  };
  it("accepts good rows and skips blank ones", () => {
    expect(validateCourses(fd([["mathematics", "ap", "93.5", "12"], ["", "standard", "", "12"]]))).toEqual({
      ok: true,
      courses: [{ subject: "mathematics", level: "ap", grade_percentage: 93.5, grade_year: 12 }],
    });
  });
  it("rejects unknown subjects or levels, grades outside 0-100, odd years, and too many rows", () => {
    expect(validateCourses(fd([["astrology", "standard", "90", "12"]])).ok).toBe(false);
    expect(validateCourses(fd([["physics", "olympiad", "90", "12"]])).ok).toBe(false);
    expect(validateCourses(fd([["physics", "standard", "120", "12"]])).ok).toBe(false);
    expect(validateCourses(fd([["physics", "standard", "abc", "12"]])).ok).toBe(false);
    expect(validateCourses(fd([["physics", "standard", "90", "8"]])).ok).toBe(false);
    expect(validateCourses(fd(Array.from({ length: 21 }, () => ["physics", "standard", "90", "12"] as [string, string, string, string]))).ok).toBe(false);
  });
});

describe("prerequisites", () => {
  it("flags a missing required course only once the student has entered courses", () => {
    const waterloo = { name: "University of Waterloo" };
    expect(prerequisiteConcerns(profile(), waterloo)).toEqual([]);
    const noCalc = profile({ courses: [course("mathematics", 90), course("english", 85)] });
    expect(prerequisiteConcerns(noCalc, waterloo)).toEqual([
      "University of Waterloo Computer Science expects Calculus; none in your course list (check the school's page).",
    ]);
    const complete = profile({ courses: [course("mathematics", 90), course("calculus", 92), course("english", 85)] });
    expect(prerequisiteConcerns(complete, waterloo)).toEqual([]);
    // Another major family's requirements don't apply.
    expect(prerequisiteConcerns({ ...noCalc, intended_majors: ["History"] }, waterloo)).toEqual([]);
  });

  it("counts 'two of' requirements", () => {
    const natsci = profile({ intended_majors: ["Physics"], courses: [course("mathematics", 95), course("physics", 94)] });
    expect(prerequisiteConcerns(natsci, { name: "University of Cambridge" })[0]).toMatch(/two of Biology, Chemistry, Physics/);
  });

  it("cites every program, and only for universities we have", () => {
    const curated = readFileSync(join(__dirname, "..", "data", "curated", "international_universities.csv"), "utf8");
    for (const p of PROGRAM_PREREQUISITES) {
      expect(p.source_url, p.program).toMatch(/^https:\/\//);
      expect(p.checked_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(curated, p.university).toContain(`,${p.university},`);
    }
    expect(PROGRAM_PREREQUISITES.length).toBeGreaterThanOrEqual(15);
  });
});
