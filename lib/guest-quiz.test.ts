import { describe, expect, it } from "vitest";
import { computeMatchScore } from "@/lib/matching";
import {
  ANY_COUNTRY,
  guestProfile,
  guestTopMatches,
  parseQuizAnswers,
  unknownFactors,
  type QuizAnswers,
} from "@/lib/guest-quiz";
import type { University } from "@/lib/types";

function makeUniversity(overrides: Partial<University> = {}): University {
  return {
    id: "uni-1",
    name: "Test University",
    country: "Canada",
    // Top marks on every focus factor too (rank #1, R1, mandatory co-op,
    // tuition + living = half the 60k budget), so "perfect" really is 100.
    tuition: 20000,
    qs_ranking: 1,
    program_rankings: { "Computer Science": 1 },
    degree_levels: ["Undergraduate", "Masters", "PhD"],
    acceptance_rate: 100,
    avg_admitted_gpa: 90,
    sat_25: 1300,
    sat_75: 1500,
    min_ielts: 6.5,
    living_cost_per_year: 10000,
    popular_programs: ["Computer Science", "Business"],
    description: "",
    created_by: null,
    created_at: "",
    source: "illustrative",
    data_year: null,
    fetched_at: null,
    source_url: null,
    scorecard_id: null,
    city: null,
    state: null,
    ownership: null,
    us_region: null,
    tuition_in_state: null,
    avg_net_price: null,
    student_size: null,
    completion_rate: null,
    median_earnings_10yr: null,
    research_intensity: "very_high",
    coop_program: "mandatory",
    ...overrides,
  };
}

const featured = (overrides: Partial<University>) => makeUniversity({ is_featured: true, ...overrides });
const answers = (overrides: Partial<QuizAnswers> = {}): QuizAnswers => ({
  country: "Canada",
  budget: 40000,
  major: "Computer Science",
  ...overrides,
});

describe("parseQuizAnswers", () => {
  it("accepts the quiz's own options", () => {
    expect(parseQuizAnswers({ country: "Canada", budget: "40000", major: "Computer Science" })).toEqual({
      ok: true,
      answers: { country: "Canada", budget: 40000, major: "Computer Science", visa: "ignore", campus: "none" },
    });
    // The optional visa question: missing = ignore; only listed values.
    expect(parseQuizAnswers({ country: "Canada", budget: "40000", major: "Law", visa: "home" })).toMatchObject({ ok: true, answers: { visa: "home" } });
    expect(parseQuizAnswers({ country: "Canada", budget: "40000", major: "Law", visa: "always" }).ok).toBe(false);
    expect(parseQuizAnswers({ country: ANY_COUNTRY, budget: "15000", major: "Law" }).ok).toBe(true);
    // The optional campus-life question: missing = none; only listed values.
    expect(parseQuizAnswers({ country: "Canada", budget: "40000", major: "Law", campus: "both" })).toMatchObject({ ok: true, answers: { campus: "both" } });
    expect(parseQuizAnswers({ country: "Canada", budget: "40000", major: "Law", campus: "parties" }).ok).toBe(false);
  });

  it("rejects anything the quiz doesn't offer", () => {
    expect(parseQuizAnswers({ country: "Atlantis", budget: "40000", major: "Law" }).ok).toBe(false);
    expect(parseQuizAnswers({ country: "Canada", budget: "41234", major: "Law" }).ok).toBe(false);
    expect(parseQuizAnswers({ country: "Canada", budget: "40000", major: "Wizardry" }).ok).toBe(false);
    expect(parseQuizAnswers({ country: null, budget: null, major: null }).ok).toBe(false);
  });
});

describe("guest scoring", () => {
  it("doesn't count grades, English or admission rate for a guest", () => {
    expect(unknownFactors(answers())).toEqual(["academic", "english"]);
    expect(unknownFactors(answers({ country: ANY_COUNTRY }))).toContain("country");
    const selective = featured({ id: "hard", sat_25: 1550, sat_75: 1600, acceptance_rate: 4, min_ielts: 8.5 });
    const open = featured({ id: "easy", sat_25: 900, sat_75: 1000, acceptance_rate: 90, min_ielts: 5 });
    const profile = guestProfile(answers());
    const unknown = unknownFactors(answers());
    expect(computeMatchScore(profile, selective, { unknown }).score).toBe(computeMatchScore(profile, open, { unknown }).score);
  });

  it("builds a temporary undergraduate profile from the three answers", () => {
    expect(guestProfile(answers({ country: ANY_COUNTRY }))).toMatchObject({
      intended_majors: ["Computer Science"],
      budget_max: 40000,
      preferred_countries: [],
      preferred_degree_level: "Undergraduate",
      sat_score: null,
      ielts_score: null,
    });
  });

  it("returns the top five featured shared schools in the chosen country, best first", () => {
    const list = [
      ...Array.from({ length: 7 }, (_, i) => featured({ id: `ca${i}`, name: `Canada ${i}`, qs_ranking: 10 + i })),
      featured({ id: "uk", name: "UK School", country: "United Kingdom" }),
      featured({ id: "not-featured", name: "Hidden", is_featured: false }),
      featured({ id: "student", name: "Student added", created_by: "someone" }),
    ];
    const top = guestTopMatches(list, answers());
    expect(top).toHaveLength(5);
    expect(top.every((m) => m.country === "Canada")).toBe(true);
    expect(top.map((m) => m.id)).not.toContain("not-featured");
    expect(top.map((m) => m.id)).not.toContain("student");
    for (let i = 1; i < top.length; i++) expect(top[i - 1].score).toBeGreaterThanOrEqual(top[i].score);
  });

  it("ranks an affordable school with the major above an expensive one without it", () => {
    const fits = featured({ id: "fits", name: "Fits", tuition: 15000, popular_programs: ["Computer Science"] });
    const doesnt = featured({ id: "doesnt", name: "Doesnt", tuition: 90000, popular_programs: ["Law"] });
    expect(guestTopMatches([doesnt, fits], answers()).map((m) => m.id)).toEqual(["fits", "doesnt"]);
  });

  it("leaves out schools whose cost can't be checked against the budget", () => {
    const known = featured({ id: "known", name: "Known", tuition: 20000 });
    const unknownCost = featured({ id: "unknown", name: "Unknown", tuition: null, living_cost_per_year: null });
    const top = guestTopMatches([unknownCost, known], answers());
    expect(top.map((m) => m.id)).toEqual(["known"]);
    expect(top[0].knownFactors).toBeGreaterThan(0);
    expect(top[0].knownFactors).toBeLessThanOrEqual(top[0].totalFactors);
  });

  it("searches every country for “Anywhere” and is deterministic", () => {
    const list = [featured({ id: "a", name: "A", country: "Japan" }), featured({ id: "b", name: "B", country: "Germany" })];
    const top = guestTopMatches(list, answers({ country: ANY_COUNTRY }));
    expect(top.map((m) => m.id).sort()).toEqual(["a", "b"]);
    expect(guestTopMatches([...list].reverse(), answers({ country: ANY_COUNTRY }))).toEqual(top);
  });
});

describe("the optional visa question", () => {
  it("leaves the guest profile's visa ignored unless chosen", () => {
    expect(guestProfile({ country: "Canada", budget: 40000, major: "Law" }).visa_mode).toBe("ignore");
    expect(guestProfile({ country: "Canada", budget: 40000, major: "Law", visa: "home" })).toMatchObject({ visa_mode: "factor", visa_weight: "medium", stay_after: "no" });
  });
});
