import { describe, expect, it } from "vitest";
import {
  BALANCED_WEIGHTS,
  admissionChance,
  computeMatchScore,
  explainMatch,
  focusWeights,
  formatRank,
  getDisplayRanking,
  rankScore,
} from "@/lib/matching";
import type { Focus } from "@/lib/types";
import type { Profile, University } from "@/lib/types";

// A strong student and a school that suits them. Each test overrides only
// the fields it's about, so it's clear what's being tested.
function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "student-1",
    full_name: "Test Student",
    country: "India",
    intended_majors: ["Computer Science"],
    gpa_percentage: 95,
    ielts_score: 7.5,
    sat_score: 1550,
    budget_min: 0,
    budget_max: 60000,
    preferred_countries: ["Canada"],
    preferred_degree_level: "Undergraduate",
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

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

function pointsFor(result: ReturnType<typeof computeMatchScore>, key: string) {
  return result.factors.find((f) => f.key === key)?.points;
}

describe("computeMatchScore", () => {
  it("gives a perfect match 100, a Safety label and no concerns", () => {
    const profile = makeProfile();
    const university = makeUniversity();

    const result = computeMatchScore(profile, university);
    const explanation = explainMatch(profile, university);

    expect(result.score).toBe(100);
    expect(result.eligible).toBe(true);
    expect(result.chance).toBe("Safety");
    expect(explanation.concerns).toEqual([]);
    expect(explanation.strengths.length).toBeGreaterThan(0);
  });

  it("treats a missing SAT and IELTS as unknown, not as a failure", () => {
    const profile = makeProfile({ sat_score: null, ielts_score: null });
    const university = makeUniversity();

    const result = computeMatchScore(profile, university);

    // English can't be judged at all; academic fit falls back to GPA only.
    expect(pointsFor(result, "english")).toBeNull();
    expect(pointsFor(result, "academic")).toBe(BALANCED_WEIGHTS.academic);
    // Everything we *can* judge is perfect, so the rescaled score stays 100.
    expect(result.score).toBe(100);
  });

  it("scores a missing IELTS above one that's below the minimum", () => {
    const university = makeUniversity();
    const missing = computeMatchScore(makeProfile({ ielts_score: null }), university);
    const tooLow = computeMatchScore(makeProfile({ ielts_score: 5.5 }), university);

    expect(missing.score).toBeGreaterThan(tooLow.score);
  });

  it("mentions missing scores as concerns so the student knows to add them", () => {
    const { concerns } = explainMatch(
      makeProfile({ sat_score: null, ielts_score: null }),
      makeUniversity()
    );

    expect(concerns).toContain(
      "No SAT score on your profile yet — admitted students typically score 1300–1500."
    );
    expect(concerns.some((c) => c.startsWith("No IELTS score"))).toBe(true);
  });

  it("loses budget points in proportion to how far over budget a school is", () => {
    // 50% over the 60k budget → half of the 25 budget points.
    const university = makeUniversity({ tuition: 90000 });
    const result = computeMatchScore(makeProfile(), university);
    const { concerns } = explainMatch(makeProfile(), university);

    expect(pointsFor(result, "budget")).toBe(12.5);
    expect(result.score).toBeLessThan(100);
    expect(concerns).toContain("Tuition ($90,000/yr) is $30,000 over your budget.");
  });

  it("labels a very selective school as a Reach even for a strong student", () => {
    const result = computeMatchScore(makeProfile(), makeUniversity({ acceptance_rate: 5 }));
    expect(result.chance).toBe("Reach");
  });

  it("labels a school as a Reach when the student is well below its admit stats", () => {
    const profile = makeProfile({ gpa_percentage: 80, sat_score: 1200 });
    const university = makeUniversity({ avg_admitted_gpa: 95, acceptance_rate: 60 });

    const result = computeMatchScore(profile, university);
    const { concerns } = explainMatch(profile, university);

    expect(result.chance).toBe("Reach");
    expect(concerns).toContain(
      "Your GPA (80) is below the typical admitted average (95)."
    );
    expect(concerns).toContain("Your SAT (1200) is below the typical range (1300–1500).");
  });

  it("scores 0 when the school doesn't offer the student's degree level", () => {
    const profile = makeProfile({ preferred_degree_level: "Masters" });
    const university = makeUniversity({ degree_levels: ["Undergraduate"] });

    const result = computeMatchScore(profile, university);

    expect(result.eligible).toBe(false);
    expect(result.score).toBe(0);
    expect(explainMatch(profile, university).concerns[0]).toMatch(/Doesn't offer Masters/);
  });

  it("doesn't rule out a school whose degree levels are unknown", () => {
    const result = computeMatchScore(makeProfile(), makeUniversity({ degree_levels: [] }));
    expect(result.eligible).toBe(true);
  });
});

describe("explainMatch extra notes", () => {
  it("flags tuition far below the student's minimum budget", () => {
    const { concerns } = explainMatch(
      makeProfile({ budget_min: 20000 }),
      makeUniversity({ tuition: 5000 })
    );
    expect(concerns.some((c) => c.includes("much cheaper than your range"))).toBe(true);
  });

  it("warns when tuition fits but tuition plus living costs doesn't", () => {
    const { strengths, concerns } = explainMatch(
      makeProfile({ budget_max: 60000 }),
      makeUniversity({ tuition: 50000, living_cost_per_year: 15000 })
    );
    // One line that names both figures, never "fits" next to "over".
    expect(concerns).toContain(
      "Tuition alone ($50,000/yr) is within your $60,000 budget, but tuition plus living costs (about $65,000/yr) is over it."
    );
    expect(strengths.join(" ")).not.toMatch(/budget/);
  });

  it("says which figure it compared when the school fits", () => {
    const within = explainMatch(makeProfile({ budget_max: 60000 }), makeUniversity({ tuition: 30000, living_cost_per_year: 15000 }));
    expect(within.strengths).toContain("Tuition plus living costs (about $45,000/yr) is within your budget of $60,000.");
    const noLiving = explainMatch(makeProfile({ budget_max: 60000 }), makeUniversity({ tuition: 30000, living_cost_per_year: null }));
    expect(noLiving.strengths).toContain("Tuition alone ($30,000/yr) is within your budget of $60,000.");
  });
});

describe("admissionChance", () => {
  it("says 'Not enough data' when academic fit is unknown, instead of a fake Match", () => {
    expect(admissionChance(null, 90)).toBe("Not enough data");
    expect(admissionChance(null, null)).toBe("Not enough data");
  });

  it("still calls a very selective school a Reach without academic data", () => {
    expect(admissionChance(null, 5)).toBe("Reach");
  });

  it("never says Safety without a known admission rate", () => {
    expect(admissionChance(0.95, null)).toBe("Match");
  });
});

describe("getDisplayRanking", () => {
  it("uses the subject ranking for the student's major when there is one", () => {
    const university = makeUniversity({ qs_ranking: 50, program_rankings: { "Computer Science": 10 } });
    expect(getDisplayRanking(university, makeProfile())).toEqual({
      rank: 10,
      label: "Computer Science",
    });
  });

  it("falls back to the overall ranking, labeled as such", () => {
    const profile = makeProfile({ intended_majors: ["Law"] });
    const university = makeUniversity({ qs_ranking: 50, program_rankings: { "Computer Science": 10 } });
    expect(getDisplayRanking(university, profile)).toEqual({
      rank: 50,
      label: "Overall",
    });
  });

  it("reports an unranked school as unranked instead of inventing a number", () => {
    const university = makeUniversity({ qs_ranking: null, program_rankings: {} });
    const ranking = getDisplayRanking(university, makeProfile());

    expect(ranking).toEqual({ rank: null, label: "Overall" });
    expect(formatRank(ranking.rank)).toBe("Ranking not available");
  });
});

describe("missing program data", () => {
  it("treats a school with no program list as unknown, not as a mismatch", () => {
    const university = makeUniversity({ popular_programs: [] });
    const result = computeMatchScore(makeProfile(), university);
    const { concerns } = explainMatch(makeProfile(), university);

    expect(result.factors.find((f) => f.key === "major")?.points).toBeNull();
    expect(result.score).toBe(100); // everything known is a perfect fit
    expect(concerns.some((c) => c.startsWith("None of your intended majors"))).toBe(false);
  });
});


describe("what matters most (focuses)", () => {
  const sum = (weights: Record<string, number>) => Object.values(weights).reduce((a, b) => a + b, 0);
  const profileWith = (focuses: Focus[]) => makeProfile({ focuses });

  it("keeps the weights adding up to 100 for every combination of focuses", () => {
    const all: Focus[] = ["academic", "work_experience", "research", "affordability"];
    // Every subset of the four focuses (16 of them, including none).
    for (let mask = 0; mask < 16; mask++) {
      const focuses = all.filter((_, i) => mask & (1 << i));
      expect(sum(focusWeights(focuses))).toBeCloseTo(100, 10);
    }
  });

  it("gives one ticked focus all 20 focus points, and splits them evenly between two", () => {
    expect(focusWeights(["research"])).toMatchObject({ research: 20, coop: 0, reputation: 0, affordability: 0 });
    expect(focusWeights(["research", "work_experience"])).toMatchObject({
      research: 10,
      coop: 10,
      reputation: 0,
      affordability: 0,
    });
  });

  it("treats all four ticked exactly like Balanced (caring about everything equally)", () => {
    expect(focusWeights(["academic", "work_experience", "research", "affordability"])).toEqual(BALANCED_WEIGHTS);
    expect(BALANCED_WEIGHTS).toMatchObject({ reputation: 5, coop: 5, research: 5, affordability: 5 });
  });

  // Same student, two schools: an R1 with a top-10 subject ranking whose
  // tuition is over the 60k budget, and a cheap teaching-focused college
  // with a mandatory co-op.
  const researchSchool = makeUniversity({
    id: "r1",
    tuition: 70000,
    living_cost_per_year: 15000,
    research_intensity: "very_high",
    program_rankings: { "Computer Science": 10 },
    coop_program: "unknown",
  });
  const coopCollege = makeUniversity({
    id: "coop",
    tuition: 15000,
    living_cost_per_year: 10000,
    qs_ranking: null,
    program_rankings: {},
    research_intensity: "non_doctoral",
    coop_program: "mandatory",
  });
  const order = (profile: Profile) =>
    [researchSchool, coopCollege]
      .map((u) => ({ id: u.id, score: computeMatchScore(profile, u).score }))
      .sort((a, b) => b.score - a.score)
      .map((r) => r.id);

  it("ranks the same two schools differently under different focuses", () => {
    expect(order(profileWith(["research"]))).toEqual(["r1", "coop"]);
    expect(order(profileWith(["work_experience"]))).toEqual(["coop", "r1"]);
    expect(order(profileWith(["affordability"]))).toEqual(["coop", "r1"]);
  });

  it("leaves a ticked focus with no data out of the blend, instead of counting it as zero", () => {
    // The R1 has no co-op information. With research + work experience
    // ticked, each gets 10 points; the co-op 10 can't be judged, so they go
    // to research, the student's other priority, and co-op is left out.
    const both = computeMatchScore(profileWith(["research", "work_experience"]), researchSchool);
    expect(both.factors.find((f) => f.key === "research")?.max).toBe(20);
    expect(pointsFor(both, "coop")).toBeNull();
    const withNone = computeMatchScore(
      profileWith(["research", "work_experience"]),
      { ...researchSchool, coop_program: "none" }
    );
    expect(both.score).toBeGreaterThan(withNone.score);
  });

  it("only shows factors that count for this student", () => {
    const keys = computeMatchScore(profileWith(["research"]), researchSchool).factors.map((f) => f.key);
    expect(keys).toContain("research");
    expect(keys).not.toContain("coop");
  });

  it("reads profiles saved before multi-select (old single primary_focus)", () => {
    const legacy = makeProfile({ primary_focus: "research" });
    expect(computeMatchScore(legacy, researchSchool).score).toBe(
      computeMatchScore(profileWith(["research"]), researchSchool).score
    );
    const oldBalanced = makeProfile({ primary_focus: "balanced" });
    expect(computeMatchScore(oldBalanced, researchSchool).score).toBe(
      computeMatchScore(profileWith([]), researchSchool).score
    );
  });

  it("leaves unknown co-op out of the score instead of counting it as none", () => {
    const profile = profileWith(["work_experience"]);
    const unknown = computeMatchScore(profile, makeUniversity({ coop_program: "unknown" }));
    const none = computeMatchScore(profile, makeUniversity({ coop_program: "none" }));
    expect(pointsFor(unknown, "coop")).toBeNull();
    expect(pointsFor(none, "coop")).toBe(0);
    expect(unknown.score).toBeGreaterThan(none.score);
  });

  it("raises a mandatory co-op school for a student who ticked work experience, and only then", () => {
    // A school that isn't already a perfect 100, so there's room to rise.
    const unknown = makeUniversity({ coop_program: "unknown", tuition: 70000, acceptance_rate: 20 });
    const mandatory = { ...unknown, coop_program: "mandatory" as const };
    const work = profileWith(["work_experience"]);
    expect(computeMatchScore(work, mandatory).score).toBeGreaterThan(computeMatchScore(work, unknown).score);
    // Without the focus, a co-op program doesn't move the score.
    const cost = profileWith(["affordability"]);
    expect(computeMatchScore(cost, mandatory).score).toBe(computeMatchScore(cost, unknown).score);
  });

  it("doesn't change a school's score when its co-op is unknown", () => {
    // Ticking work experience adds a co-op factor; with nothing known it's
    // left out and the other weights are re-scaled, so the score is the same.
    const school = makeUniversity({ coop_program: "unknown", tuition: 70000, acceptance_rate: 20 });
    expect(computeMatchScore(profileWith(["affordability", "work_experience"]), school).score).toBe(
      computeMatchScore(profileWith(["affordability"]), school).score
    );
  });

  it("scores mandatory co-op above optional above none", () => {
    const profile = profileWith(["work_experience"]);
    const points = (coop_program: "mandatory" | "optional" | "none") =>
      pointsFor(computeMatchScore(profile, makeUniversity({ coop_program })), "coop");
    expect(points("mandatory")).toBe(20);
    expect(points("optional")).toBe(10);
    expect(points("none")).toBe(0);
  });

  it("doesn't boost work experience for great graduate earnings without co-op information", () => {
    const profile = profileWith(["work_experience"]);
    const highEarnings = makeUniversity({ coop_program: "unknown", median_earnings_10yr: 150000 });
    const lowEarnings = makeUniversity({ coop_program: "unknown", median_earnings_10yr: 20000 });
    expect(computeMatchScore(profile, highEarnings).score).toBe(computeMatchScore(profile, lowEarnings).score);
    expect(pointsFor(computeMatchScore(profile, highEarnings), "coop")).toBeNull();
  });

  it("doesn't break when a school has no data for any ticked focus", () => {
    const blank = makeUniversity({
      qs_ranking: null,
      program_rankings: {},
      research_intensity: null,
      coop_program: "unknown",
      living_cost_per_year: null,
    });
    const result = computeMatchScore(profileWith(["academic", "work_experience", "research", "affordability"]), blank);
    const focusFactors = result.factors.filter((f) =>
      ["reputation", "coop", "research", "affordability"].includes(f.key)
    );
    expect(Number.isFinite(result.score)).toBe(true);
    expect(focusFactors.every((f) => f.points === null)).toBe(true);
  });

  it("puts each ticked focus's lines first, labeled with where the figure came from", () => {
    const { strengths } = explainMatch(
      profileWith(["work_experience", "research"]),
      makeUniversity({ coop_program: "mandatory", research_intensity: "very_high", source: "College Scorecard" })
    );
    expect(strengths[0]).toBe("Has a mandatory co-op program (College Scorecard).");
    expect(strengths[1]).toBe("Very high research activity (R1) — Carnegie classification (College Scorecard).");
  });

  it("says when there's no co-op information, after the real concerns", () => {
    const { concerns } = explainMatch(profileWith(["work_experience"]), makeUniversity({ coop_program: "unknown" }));
    expect(concerns[concerns.length - 1]).toBe("No co-op information available for this school.");
  });

  it("mentions the subject ranking once when academic and research are both ticked", () => {
    const { strengths } = explainMatch(profileWith(["academic", "research"]), makeUniversity());
    expect(strengths.filter((s) => s.startsWith("Strong subject ranking")).length).toBe(1);
  });
});

describe("rankScore", () => {
  it("scores rankings on a log scale", () => {
    expect(rankScore(1)).toBe(1);
    expect(rankScore(1000)).toBe(0);
    expect(rankScore(5) - rankScore(10)).toBeGreaterThan(rankScore(205) - rankScore(210));
  });
});

describe("data that isn't available (most non-US schools)", () => {
  // Shaped like a curated non-US row: no admission rate, no GPA or SAT
  // figures, no English minimum.
  const noAdmissionData = makeUniversity({
    country: "Germany",
    acceptance_rate: null,
    avg_admitted_gpa: null,
    sat_25: null,
    sat_75: null,
    min_ielts: null,
  });

  it("labels the chance 'Not enough data' and leaves the admission factors out", () => {
    const result = computeMatchScore(makeProfile({ preferred_countries: ["Germany"] }), noAdmissionData);
    expect(result.chance).toBe("Not enough data");
    // There is no acceptance-rate factor at all (it rewarded easy admission).
    expect(result.factors.map((f) => f.key as string)).not.toContain("acceptance");
    expect(pointsFor(result, "academic")).toBeNull();
    expect(Number.isFinite(result.score)).toBe(true);
  });

  it("doesn't score unknown tuition as cheap or expensive, and says so", () => {
    const university = makeUniversity({ tuition: null });
    const result = computeMatchScore(makeProfile(), university);
    expect(pointsFor(result, "budget")).toBeNull();
    expect(explainMatch(makeProfile(), university).concerns).toContain(
      "Tuition: not available for this school, so it isn't scored against your budget."
    );
  });
});

describe("graduate students", () => {
  const masters = (overrides: Partial<Profile> = {}) =>
    makeProfile({ preferred_degree_level: "Masters", ...overrides });

  it("doesn't judge a Masters applicant on undergraduate admission figures", () => {
    const result = computeMatchScore(masters(), makeUniversity({ acceptance_rate: 5 }));
    expect(pointsFor(result, "academic")).toBeNull();
    // There is no acceptance-rate factor at all (it rewarded easy admission).
    expect(result.factors.map((f) => f.key as string)).not.toContain("acceptance");
    expect(result.chance).toBe("Not enough data"); // not "Reach" from an undergraduate rate
    const { concerns } = explainMatch(masters(), makeUniversity());
    expect(concerns.some((c) => c.startsWith("Admission figures and tuition here are undergraduate figures"))).toBe(true);
  });

  it("only includes schools that say they offer the level", () => {
    expect(computeMatchScore(masters(), makeUniversity({ degree_levels: [] })).eligible).toBe(false);
    expect(computeMatchScore(masters(), makeUniversity({ degree_levels: ["Undergraduate", "Masters"] })).eligible).toBe(true);
    // Undergraduates still see schools whose levels are unknown.
    expect(computeMatchScore(makeProfile(), makeUniversity({ degree_levels: [] })).eligible).toBe(true);
  });
});

describe("country names", () => {
  it("matches aliases like UK / England / USA to the canonical name", () => {
    const uk = makeUniversity({ country: "United Kingdom" });
    for (const typed of ["UK", "england", " United Kingdom ", "Great Britain"]) {
      expect(computeMatchScore(makeProfile({ preferred_countries: [typed] }), uk).factors.find((f) => f.key === "country")?.points).toBe(10);
    }
    const us = makeUniversity({ country: "United States" });
    expect(computeMatchScore(makeProfile({ preferred_countries: ["USA"] }), us).factors.find((f) => f.key === "country")?.points).toBe(10);
  });
});
