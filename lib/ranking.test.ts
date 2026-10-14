import { describe, expect, it } from "vitest";
import { computeMatchScore, scoreUniversity } from "@/lib/matching";
import { qualityScore } from "@/lib/quality";
import { fitGate, plausibilityFrom, withNeutralUnknowns } from "@/lib/ranking";
import { PLAUSIBILITY_FLOOR, PLAUSIBILITY_UNKNOWN, P_FULL, RULE_PLAUSIBILITY } from "@/lib/scoring-config";
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

const scorecard = (overrides: Partial<University> = {}) =>
  makeUniversity({
    source: "College Scorecard",
    qs_ranking: null,
    sat_25: 1300,
    sat_75: 1500,
    completion_rate: 85,
    retention_rate: 92,
    median_earnings_10yr: 80000,
    research_intensity: "very_high",
    acceptance_rate: 30,
    ...overrides,
  });

describe("plausibilityFrom", () => {
  it("scales the chance up to P_FULL, with a floor for long shots", () => {
    expect(plausibilityFrom(P_FULL, "Match").value).toBe(1);
    expect(plausibilityFrom(0.9, "Safety").value).toBe(1);
    expect(plausibilityFrom(0, "Reach").value).toBe(PLAUSIBILITY_FLOOR);
    expect(plausibilityFrom(P_FULL / 2, "Reach").value).toBeCloseTo(PLAUSIBILITY_FLOOR + (1 - PLAUSIBILITY_FLOOR) / 2);
  });

  it("falls back to the rule label, then to a neutral value", () => {
    expect(plausibilityFrom(null, "Reach")).toEqual({ value: RULE_PLAUSIBILITY.Reach, source: "rule" });
    expect(plausibilityFrom(null, "Not enough data")).toEqual({ value: PLAUSIBILITY_UNKNOWN, source: "unknown" });
  });
});

describe("qualityScore", () => {
  it("is high for strong outcomes and low for weak ones", () => {
    const strong = qualityScore(makeProfile(), scorecard({ sat_25: 1500, sat_75: 1570, completion_rate: 95, median_earnings_10yr: 120000 }));
    const weak = qualityScore(makeProfile(), scorecard({ sat_25: 800, sat_75: 950, completion_rate: 30, retention_rate: 62, median_earnings_10yr: 38000, research_intensity: "non_doctoral", acceptance_rate: 95 }));
    expect(strong.score!).toBeGreaterThan(0.9);
    expect(weak.score!).toBeLessThan(0.2);
  });

  it("says 'not available' without an undergraduate signal or with too little known", () => {
    const graduateOnly = scorecard({ sat_25: null, sat_75: null, completion_rate: null, retention_rate: null });
    expect(qualityScore(makeProfile(), graduateOnly).score).toBeNull();
    const nothing = makeUniversity({ source: "curated", qs_ranking: null, sat_25: null, sat_75: null, completion_rate: null, retention_rate: null, research_intensity: null, acceptance_rate: null, program_rankings: {} });
    expect(qualityScore(makeProfile(), nothing).score).toBeNull();
  });

  it("ignores the illustrative rankings left on sample schools", () => {
    const withSample = qualityScore(makeProfile(), scorecard({ qs_ranking: 1 }));
    const without = qualityScore(makeProfile(), scorecard({ qs_ranking: null }));
    expect(withSample.score).toBe(without.score);
    expect(qualityScore(makeProfile(), makeUniversity({ source: "curated", qs_ranking: 5, sat_25: null, sat_75: null, completion_rate: null, retention_rate: null, research_intensity: null, acceptance_rate: null })).parts.map((p) => p.key)).toContain("ranking");
  });
});

describe("qualityScore with research impact", () => {
  const impact = { overall: 90, pp_top10: 0.17, publications: 9000, fields: { math_cs: 70 }, ror: "x", source: "Leiden", source_url: "", data_year: "2020–2023", licence: "CC0 1.0", checked_on: "2026-10-07" };
  const onlyImpact = makeUniversity({ source: "curated", qs_ranking: null, sat_25: null, sat_75: null, completion_rate: null, retention_rate: null, research_intensity: null, acceptance_rate: null, program_rankings: {}, research_impact: impact });

  it("gives a school with nothing but research impact a quality score (so schools outside the US compare)", () => {
    const q = qualityScore(makeProfile({ intended_majors: ["History"] }), onlyImpact);
    expect(q.score).toBeCloseTo(0.9);
    expect(q.parts.map((p) => p.label)).toEqual(["Research impact"]);
  });

  it("uses the student's field when the school has a figure for it", () => {
    const q = qualityScore(makeProfile({ intended_majors: ["Computer Science"] }), onlyImpact);
    expect(q.score).toBeCloseTo(0.7);
    expect(q.parts[0].label).toBe("Research impact in mathematics and computer science");
  });

  it("is still 'not available' for a school outside the ranking", () => {
    expect(qualityScore(makeProfile(), { ...onlyImpact, research_impact: null }).score).toBeNull();
  });
});

describe("qualityScore with the strength index", () => {
  it("uses the stored index for shared schools, so none counts as unknown quality", () => {
    const u = makeUniversity({ source: "curated", qs_ranking: null, sat_25: null, sat_75: null, completion_rate: null, retention_rate: null, research_intensity: null, acceptance_rate: null,
      strength_index: 72, strength_tier: "B", strength_confidence: "Medium", strength_is_estimate: false, strength_position: 300,
      strength_signals: { signals: { leiden: { value: 72, percentile: 72 } }, of: 1688, computed_on: "2026-10-08" } });
    expect(qualityScore(makeProfile({ intended_majors: ["History"] }), u)).toEqual({ score: 0.72, parts: [{ key: "strength", label: "Strength (Unicelerate index)", value: 0.72 }] });
  });

  it("doesn't call an estimated school 'highly regarded'", () => {
    const u = makeUniversity({ strength_index: 95, strength_low: 90, strength_high: 98, strength_tier: "A", strength_confidence: "Low", strength_is_estimate: true, strength_position: 5,
      strength_signals: { signals: {}, of: 1688, computed_on: "2026-10-08", peer_group: "all schools", peer_count: 1600, position_range: [1, 40] } });
    const { rank } = scoreUniversity(makeProfile(), u);
    expect(rank.reason).not.toMatch(/regarded/);
    expect(rank.reason).toMatch(/estimated from similar schools/);
  });
});

describe("fitGate", () => {
  it("passes a school that fits", () => {
    const u = makeUniversity();
    expect(fitGate(makeProfile(), u, computeMatchScore(makeProfile(), u))).toEqual({ passes: true, reasons: [] });
  });

  it("fails on degree level, far over budget, or outside the chosen countries", () => {
    const profile = makeProfile({ preferred_degree_level: "PhD", budget_max: 20000, preferred_countries: ["Japan"] });
    const u = makeUniversity({ degree_levels: ["Undergraduate"], tuition: 40000 });
    const gate = fitGate(profile, u, computeMatchScore(profile, u));
    expect(gate.passes).toBe(false);
    expect(gate.reasons).toEqual(["doesn't list PhD programs", "tuition is far over your budget", "outside the countries you chose"]);
  });

  it("doesn't use the country check when the student chose no countries", () => {
    const profile = makeProfile({ preferred_countries: [] });
    const u = makeUniversity({ country: "Japan" });
    expect(fitGate(profile, u, computeMatchScore(profile, u)).passes).toBe(true);
  });
});

describe("reason line", () => {
  it("is honest that very selective schools are a reach for almost everyone", () => {
    const entry = scoreUniversity(makeProfile(), scorecard({ acceptance_rate: 4, sat_25: 1520, sat_75: 1580 }));
    expect(entry.match.chance).toBe("Reach");
    expect(entry.rank.reason).toMatch(/reach for almost everyone: apply, but don't count on it/);
  });
});

describe("withNeutralUnknowns", () => {
  it("treats unknown quality and chance like a typical school on the list", () => {
    const profile = makeProfile();
    const known = [0.4, 0.6, 0.8].map((q, i) => {
      const e = scoreUniversity(profile, scorecard({ id: `k${i}` }));
      return { ...e, rank: { ...e.rank, quality: q, plausibility: 1, plausibilitySource: "model" as const, realistic: q } };
    });
    const mystery = scoreUniversity(profile, makeUniversity({ id: "m", source: "curated", qs_ranking: null, program_rankings: {}, avg_admitted_gpa: null, acceptance_rate: null, sat_25: null, sat_75: null, completion_rate: null, retention_rate: null, research_intensity: null }));
    const [m] = withNeutralUnknowns([mystery, ...known]).filter((e) => e.university.id === "m");
    expect(m.rank.quality).toBeNull(); // still shown as not available
    // Median quality 0.6; too few peers of that strength, so the list's
    // median plausibility (1) capped at PLAUSIBILITY_UNKNOWN (0.6).
    expect(m.rank.realistic).toBeCloseTo(0.6 * 0.6);
  });

  it("gives a school with no admission data the chances of known schools of similar strength", () => {
    const profile = makeProfile();
    // Five strong known schools that are long shots, five average ones that are sure admits.
    const known = [0.95, 0.96, 0.97, 0.95, 0.96, 0.5, 0.52, 0.48, 0.5, 0.51].map((q, i) => {
      const e = scoreUniversity(profile, scorecard({ id: `k${i}` }));
      return { ...e, rank: { ...e.rank, quality: q, plausibility: q > 0.9 ? 0.3 : 1, plausibilitySource: "model" as const, realistic: q * (q > 0.9 ? 0.3 : 1) } };
    });
    const unknownStrong = scoreUniversity(profile, makeUniversity({ id: "u", source: "curated", acceptance_rate: null, sat_25: null, sat_75: null, avg_admitted_gpa: null }));
    const withQuality = { ...unknownStrong, rank: { ...unknownStrong.rank, quality: 0.96, plausibilitySource: "unknown" as const } };
    const [u] = withNeutralUnknowns([withQuality, ...known]).filter((e) => e.university.id === "u");
    expect(u.rank.plausibility).toBeCloseTo(0.3); // like its strong peers, not a sure admit
  });
});
