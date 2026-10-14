import { describe, expect, it } from "vitest";
import {
  COST_GAP_FOR_ZERO,
  costScores,
  BALANCED_OFFER_WEIGHTS,
  CLEAR_WINNER_SHARE,
  DEFAULT_OFFER_WEIGHTS,
  DUE_SOON_DAYS,
  acceptByStatus,
  jiggleWeights,
  offerSensitivity,
  offerVerdict,
  seededRandom,
  FOCUS_OFFER_WEIGHTS,
  defaultOfferWeights,
  focusWeightsNote,
  netCostPerYear,
  rankOffers,
  summarizeOffers,
  totalProgramCost,
  type OfferInput,
  type OfferWeights,
} from "@/lib/offers";

function offer(overrides: Partial<OfferInput> & { id: string }): OfferInput {
  return {
    universityName: overrides.id,
    totalCost: 100000,
    overallRank: 50,
    strength: null,
    strengthLabel: null,
    subjectRank: null,
    subjectLabel: null,
    matchScore: 70,
    inPreferredCountry: true,
    researchScore: null,
    researchLabel: null,
    researchImpact: null,
    researchImpactLabel: null,
    coopScore: null,
    coopLabel: null,
    ...overrides,
  };
}

const only = (key: keyof OfferWeights): OfferWeights => ({
  cost: 0,
  ranking: 0,
  subjectRanking: 0,
  match: 0,
  country: 0,
  research: 0,
  researchImpact: 0,
  coop: 0,
  visa: 0,
  campusAcademic: 0,
  campusSocial: 0,
  [key]: 10,
});

describe("netCostPerYear / totalProgramCost", () => {
  const base = { tuition_per_year: 30000, living_cost_per_year: 15000, scholarship_per_year: 5000 };

  it("subtracts the scholarship from tuition plus living cost", () => {
    expect(netCostPerYear(base)).toBe(40000);
    expect(totalProgramCost({ ...base, duration_years: 4 })).toBe(160000);
  });

  it("never goes below zero when the scholarship covers everything", () => {
    expect(netCostPerYear({ ...base, scholarship_per_year: 60000 })).toBe(0);
  });

  it("is unknown when tuition or living cost is missing", () => {
    expect(netCostPerYear({ ...base, living_cost_per_year: null })).toBeNull();
    expect(totalProgramCost({ ...base, tuition_per_year: null, duration_years: 4 })).toBeNull();
  });
});

describe("rankOffers", () => {
  const cheapLowRanked = offer({ id: "Cheap", totalCost: 40000, overallRank: 200 });
  const pricyTopRanked = offer({ id: "Pricey", totalCost: 240000, overallRank: 5 });

  it("puts the cheaper offer first when only cost matters", () => {
    const ranked = rankOffers([pricyTopRanked, cheapLowRanked], only("cost"));
    expect(ranked.map((r) => r.offer.id)).toEqual(["Cheap", "Pricey"]);
    expect(ranked[0].score).toBe(100);
    expect(ranked[1].score).toBe(0);
  });

  it("doesn't let a small cost difference outweigh a much better school", () => {
    // $500 apart on ~$40,000: nearly the same cost score, so a far better
    // ranking wins even when cost is weighted more.
    const a = offer({ id: "Cheaper by $500", totalCost: 40000, overallRank: 300 });
    const b = offer({ id: "Much stronger", totalCost: 40500, overallRank: 20 });
    const ranked = rankOffers([a, b], { ...only("cost"), cost: 7, ranking: 3 });
    expect(ranked[0].offer.id).toBe("Much stronger");
    expect(ranked.find((r) => r.offer.id === "Much stronger")!.criteria.cost).toBeGreaterThan(0.97);
    // ...while a large gap still counts in full.
    expect(costScores([40000, 240000])).toEqual([1, 0]);
    expect(costScores([60000, 90000])[1]).toBeCloseTo(1 - 30000 / (COST_GAP_FOR_ZERO * 90000), 6);
    expect(costScores([null, 50000])).toEqual([null, 1]);
  });

  it("puts the better-ranked offer first when only ranking matters", () => {
    const ranked = rankOffers([cheapLowRanked, pricyTopRanked], only("ranking"));
    expect(ranked[0].offer.id).toBe("Pricey");
  });

  it("compares rankings on a log scale (#5 vs #10 counts more than #200 vs #205)", () => {
    const ranked = rankOffers(
      [
        offer({ id: "R5", overallRank: 5 }),
        offer({ id: "R10", overallRank: 10 }),
        offer({ id: "R200", overallRank: 200 }),
        offer({ id: "R205", overallRank: 205 }),
      ],
      only("ranking")
    );
    const scoreOf = (id: string) => ranked.find((r) => r.offer.id === id)!.score;
    expect(scoreOf("R5") - scoreOf("R10")).toBeGreaterThan(scoreOf("R200") - scoreOf("R205"));
  });

  it("leaves an unknown criterion out instead of counting it as zero", () => {
    // B has no cost info; on ranking alone it ties A, so it shouldn't drop to 0.
    const ranked = rankOffers(
      [
        offer({ id: "A", totalCost: 50000, overallRank: 10 }),
        offer({ id: "B", totalCost: null, overallRank: 10 }),
      ],
      { ...only("ranking"), cost: 10 }
    );
    const b = ranked.find((r) => r.offer.id === "B")!;
    expect(b.criteria.cost).toBeNull();
    expect(b.score).toBe(100);
  });

  it("scores everything 0 when every weight is 0, without crashing", () => {
    const zero = { cost: 0, ranking: 0, subjectRanking: 0, match: 0, country: 0, research: 0, researchImpact: 0, coop: 0, visa: 0, campusAcademic: 0, campusSocial: 0 };
    const ranked = rankOffers([cheapLowRanked, pricyTopRanked], zero);
    expect(ranked.every((r) => r.score === 0)).toBe(true);
  });

  it("explains the rank in plain language, including the weak spot", () => {
    const [first, second] = rankOffers([pricyTopRanked, cheapLowRanked], {
      ...DEFAULT_OFFER_WEIGHTS,
      cost: 10,
      ranking: 2,
    });
    expect(first.reason).toMatch(/^#1 mainly because of the lowest total cost \(\$40,000\)/);
    expect(first.reason).toMatch(/weak spot is its overall ranking \(#200\)/);
    expect(second.reason).toMatch(/^#2/);
  });

  it("ranks a single offer first without dividing by zero", () => {
    const [only1] = rankOffers([cheapLowRanked], DEFAULT_OFFER_WEIGHTS);
    expect(only1.position).toBe(1);
    expect(Number.isFinite(only1.score)).toBe(true);
  });
});

describe("focuses and the default weights", () => {
  // A cheap teaching-focused school with a mandatory co-op vs. an expensive
  // R1 with a strong subject ranking and no co-op information.
  const cheapCoop = offer({
    id: "Cheap co-op",
    totalCost: 60000,
    subjectRank: 300,
    subjectLabel: "Physics",
    researchScore: 0,
    researchLabel: "Not a doctoral research university",
    coopScore: 1,
    coopLabel: "Mandatory co-op program",
  });
  const pricyResearch = offer({
    id: "Pricey R1",
    totalCost: 200000,
    subjectRank: 20,
    subjectLabel: "Physics",
    researchScore: 1,
    researchLabel: "Very high research activity (R1)",
  });
  const order = (weights: OfferWeights) =>
    rankOffers([cheapCoop, pricyResearch], weights).map((r) => r.offer.id);

  it("changes which offer comes first", () => {
    expect(order(defaultOfferWeights(["research"]))[0]).toBe("Pricey R1");
    expect(order(defaultOfferWeights(["work_experience"]))[0]).toBe("Cheap co-op");
    expect(order(defaultOfferWeights(["affordability"]))[0]).toBe("Cheap co-op");
  });

  it("boosts the criteria each focus is about", () => {
    const balanced = BALANCED_OFFER_WEIGHTS;
    expect(FOCUS_OFFER_WEIGHTS.research.research).toBeGreaterThan(balanced.research);
    expect(FOCUS_OFFER_WEIGHTS.research.subjectRanking).toBeGreaterThan(balanced.subjectRanking);
    expect(FOCUS_OFFER_WEIGHTS.work_experience.coop).toBeGreaterThan(balanced.coop);
    expect(FOCUS_OFFER_WEIGHTS.affordability.cost).toBeGreaterThan(balanced.cost);
    expect(FOCUS_OFFER_WEIGHTS.academic.ranking).toBeGreaterThan(balanced.ranking);
  });

  it("blends several focuses by averaging their weights, rounded to slider steps", () => {
    // research: subjectRanking 7, research 8, coop 1; work: 2, 1, 8 → 4.5 → 5 each
    expect(defaultOfferWeights(["research", "work_experience"])).toMatchObject({
      subjectRanking: 5,
      research: 5,
      coop: 5,
    });
    expect(defaultOfferWeights([])).toEqual(BALANCED_OFFER_WEIGHTS);
  });

  it("keeps every default on the 0-10 slider scale", () => {
    for (const weights of [BALANCED_OFFER_WEIGHTS, ...Object.values(FOCUS_OFFER_WEIGHTS)]) {
      for (const w of Object.values(weights)) expect(w >= 0 && w <= 10).toBe(true);
    }
    expect(DEFAULT_OFFER_WEIGHTS).toEqual(BALANCED_OFFER_WEIGHTS);
  });

  it("names every ticked focus and what counts more because of them", () => {
    expect(focusWeightsNote(["research"])).toBe(
      "Because you prioritize research, subject ranking, research intensity and research impact (Leiden Ranking / OpenAlex) count more."
    );
    expect(focusWeightsNote(["work_experience", "research"])).toBe(
      "Because you prioritize work experience and research, subject ranking, research intensity, research impact (Leiden Ranking / OpenAlex) and co-op / internships count more."
    );
    expect(focusWeightsNote([])).toBe("You chose Balanced, so no single criterion is boosted.");
  });

  it("names the research level or co-op program when it decides the ranking", () => {
    const [byResearch] = rankOffers([cheapCoop, pricyResearch], only("research"));
    expect(byResearch.reason).toContain("Very high research activity (R1)");
    const [byCoop] = rankOffers([cheapCoop, pricyResearch], only("coop"));
    expect(byCoop.reason).toContain("mandatory co-op program");
  });
});

describe("summarizeOffers", () => {
  it("names the best overall, cheapest and highest-ranked offers", () => {
    const ranked = rankOffers(
      [
        offer({ id: "A", totalCost: 90000, overallRank: 30, matchScore: 95 }),
        offer({ id: "B", totalCost: 40000, overallRank: 120 }),
        offer({ id: "C", totalCost: 200000, overallRank: 3 }),
      ],
      only("match")
    );
    const summary = summarizeOffers(ranked);
    expect(summary.bestOverall?.id).toBe("A");
    expect(summary.cheapest?.id).toBe("B");
    expect(summary.highestRanked?.id).toBe("C");
  });

  it("handles no offers", () => {
    expect(summarizeOffers([])).toEqual({ bestOverall: null, cheapest: null, highestRanked: null });
  });
});

describe("seededRandom / jiggleWeights", () => {
  it("gives the same numbers for the same seed, in [0, 1)", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const first = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(first);
    expect(first.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(seededRandom(43)()).not.toBe(first[0]);
  });

  it("keeps each weight within ±50% and leaves ignored (0) criteria at 0", () => {
    const random = seededRandom(1);
    for (let i = 0; i < 200; i++) {
      const w = jiggleWeights({ ...BALANCED_OFFER_WEIGHTS, coop: 0 }, random);
      expect(w.coop).toBe(0);
      expect(w.cost).toBeGreaterThanOrEqual(2.5);
      expect(w.cost).toBeLessThanOrEqual(7.5);
    }
  });
});

describe("offerSensitivity", () => {
  it("is deterministic for a given seed", () => {
    const offers = [offer({ id: "a", totalCost: 90000 }), offer({ id: "b", overallRank: 20 })];
    const one = offerSensitivity(offers, BALANCED_OFFER_WEIGHTS, { seed: 7 });
    const two = offerSensitivity(offers, BALANCED_OFFER_WEIGHTS, { seed: 7 });
    expect(two).toEqual(one);
  });

  it("runs 1,000 times by default and each offer's rank shares add up to 1", () => {
    const offers = [offer({ id: "a" }), offer({ id: "b", totalCost: 80000 }), offer({ id: "c", overallRank: 10 })];
    const result = offerSensitivity(offers, BALANCED_OFFER_WEIGHTS);
    expect(result.runs).toBe(1000);
    for (const o of result.offers) {
      expect(o.rankShares).toHaveLength(3);
      expect(o.rankShares.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    }
    // Every run has exactly one winner.
    expect(result.offers.reduce((sum, o) => sum + o.firstShare, 0)).toBeCloseTo(1);
  });

  it("calls an offer that's better on everything a clear winner", () => {
    const offers = [
      offer({ id: "best", totalCost: 60000, overallRank: 5, matchScore: 95 }),
      offer({ id: "worse", totalCost: 120000, overallRank: 200, matchScore: 50 }),
    ];
    const result = offerSensitivity(offers, BALANCED_OFFER_WEIGHTS);
    expect(result.offers[0]).toMatchObject({ id: "best", firstShare: 1, typicalRank: 1 });
    expect(result.verdict?.kind).toBe("clear");
    expect(result.verdict?.message).toMatch(/Clear winner: best comes first in 100% of 1,000/);
  });

  it("calls a trade-off between cost and ranking a close call when both weigh the same", () => {
    const offers = [
      offer({ id: "cheap", totalCost: 60000, overallRank: 100 }),
      offer({ id: "famous", totalCost: 120000, overallRank: 10 }),
    ];
    const weights = { ...only("cost"), ranking: 10 };
    const result = offerSensitivity(offers, weights);
    expect(result.offers[0].firstShare).toBeLessThan(CLEAR_WINNER_SHARE);
    expect(result.offers[1].firstShare).toBeGreaterThan(0);
    expect(result.verdict?.kind).toBe("close");
    expect(result.verdict?.message).toMatch(/^Close call: /);
  });

  it("has no verdict with a single offer", () => {
    expect(offerSensitivity([offer({ id: "only" })], BALANCED_OFFER_WEIGHTS).verdict).toBeNull();
    expect(offerVerdict([], 1000)).toBeNull();
  });
});

describe("acceptByStatus", () => {
  const today = new Date("2026-10-06T20:00:00Z");

  it("is upcoming far ahead, due soon within a week, overdue after the date", () => {
    expect(acceptByStatus("2026-11-01", "admitted", today)).toMatchObject({ state: "upcoming", daysLeft: 26 });
    expect(acceptByStatus("2026-10-13", "admitted", today)).toMatchObject({ state: "due-soon", daysLeft: DUE_SOON_DAYS });
    expect(acceptByStatus("2026-10-06", "admitted", today)?.label).toMatch(/\(today\)/);
    expect(acceptByStatus("2026-10-07", "admitted", today)?.label).toMatch(/\(tomorrow\)/);
    const overdue = acceptByStatus("2026-10-01", "admitted", today);
    expect(overdue).toMatchObject({ state: "overdue", daysLeft: -5 });
    expect(overdue?.label).toBe("Overdue: accept by Oct 1, 2026 (5 days ago)");
  });

  it("shows nothing without a date, with a bad date, or once accepted", () => {
    expect(acceptByStatus(null, "admitted", today)).toBeNull();
    expect(acceptByStatus(undefined, "admitted", today)).toBeNull();
    expect(acceptByStatus("soon", "admitted", today)).toBeNull();
    expect(acceptByStatus("2026-10-01", "accepted", today)).toBeNull();
  });
});

describe("the strength index in offers", () => {
  it("uses the index on its fixed scale when offers have one", () => {
    const strong = offer({ id: "strong", totalCost: 100000, overallRank: null, strength: 92, strengthLabel: "Tier A, 92" });
    const weaker = offer({ id: "weaker", totalCost: 100000, overallRank: null, strength: 40, strengthLabel: "Tier D, 40" });
    const ranked = rankOffers([weaker, strong], only("ranking"));
    expect(ranked.map((r) => r.offer.id)).toEqual(["strong", "weaker"]);
    expect(ranked[0].criteria.ranking).toBeCloseTo(0.92);
    expect(ranked[0].reason).toContain("its strength (Tier A, 92)");
  });

  it("calls the strongest offer by the index", () => {
    const summary = summarizeOffers(
      rankOffers([offer({ id: "a", strength: 60 }), offer({ id: "b", strength: 85 }), offer({ id: "c", strength: null })], DEFAULT_OFFER_WEIGHTS)
    );
    expect(summary.highestRanked?.id).toBe("b");
  });
});

describe("visa and work rights in offers", () => {
  it("counts the visa score only when its slider is above 0, and leaves unknowns out", () => {
    const longWindow = offer({ id: "long", visaScore: 1, visaLabel: "3-year post-study work" });
    const shortWindow = offer({ id: "short", visaScore: 0.2, visaLabel: "6-month post-study work" });
    const unknown = offer({ id: "unknown", visaScore: null });
    expect(rankOffers([shortWindow, longWindow], DEFAULT_OFFER_WEIGHTS)[0].criteria.visa).toBeDefined();
    const ranked = rankOffers([shortWindow, longWindow, unknown], only("visa"));
    expect(ranked[0].offer.id).toBe("long");
    expect(ranked.find((r) => r.offer.id === "unknown")!.criteria.visa).toBeNull();
    // At the default 0 the visa can't change the order.
    const before = rankOffers([shortWindow, longWindow], DEFAULT_OFFER_WEIGHTS).map((r) => r.offer.id);
    const noVisa = rankOffers([{ ...shortWindow, visaScore: null }, { ...longWindow, visaScore: null }], DEFAULT_OFFER_WEIGHTS).map((r) => r.offer.id);
    expect(before).toEqual(noVisa);
  });
});
