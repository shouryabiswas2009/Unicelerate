import { usd } from "@/lib/format";
import { joinFocuses } from "@/lib/focus";
import { FOCUSES, type Application, type Focus } from "@/lib/types";

// ─── Costs ───────────────────────────────────────────────────────────────

// What a year actually costs after the scholarship. A scholarship can also
// cover living costs, so it comes off the total, which never goes below 0.
// Unknown (null) when tuition or living cost isn't filled in — comparing a
// full cost against a tuition-only cost would make the second look cheaper.
export function netCostPerYear(
  application: Pick<Application, "tuition_per_year" | "living_cost_per_year" | "scholarship_per_year">
): number | null {
  const { tuition_per_year: tuition, living_cost_per_year: living } = application;
  if (tuition === null || living === null) return null;
  return Math.max(0, tuition + living - application.scholarship_per_year);
}

export function totalProgramCost(
  application: Pick<
    Application,
    "tuition_per_year" | "living_cost_per_year" | "scholarship_per_year" | "duration_years"
  >
): number | null {
  const perYear = netCostPerYear(application);
  return perYear === null ? null : perYear * application.duration_years;
}

// ─── Ranking offers ──────────────────────────────────────────────────────

// Everything rankOffers needs about one offer, already looked up by the page.
export type OfferInput = {
  id: string;
  universityName: string;
  totalCost: number | null;
  // A ranking entered from its source (verified only; none for most schools).
  overallRank: number | null;
  // The Unicelerate strength index for this student (0-100) and how it's
  // shown ("Tier B, 71" / "est. 45–58"); null for a student's own school.
  strength: number | null;
  strengthLabel: string | null;
  // The ranking for the student's major, when the school has one.
  subjectRank: number | null;
  subjectLabel: string | null;
  matchScore: number; // 0-100, from computeMatchScore
  inPreferredCountry: boolean;
  // 0..1 from researchSignal / coopSignal in lib/matching.ts; null when
  // the school has no figure for it.
  researchScore: number | null;
  researchLabel: string | null;
  // Research impact percentile as 0..1 (Leiden Ranking / OpenAlex, in the
  // student's field when there is one), and its text, e.g. "88th percentile".
  researchImpact: number | null;
  researchImpactLabel: string | null;
  coopScore: number | null;
  coopLabel: string | null;
  // Visa and work rights (lib/visa.ts), 0..1, and a short label; null when
  // the student ignores the visa or nothing is known for the country.
  visaScore?: number | null;
  visaLabel?: string | null;
  // The two campus-life proxies (lib/campus-life.ts), 0..1 with the
  // confidence as the label; null when nothing is published.
  campusAcademicScore?: number | null;
  campusAcademicLabel?: string | null;
  campusSocialScore?: number | null;
  campusSocialLabel?: string | null;
};

export type OfferCriterion =
  | "cost"
  | "ranking"
  | "subjectRanking"
  | "match"
  | "country"
  | "research"
  | "researchImpact"
  | "coop"
  | "visa"
  | "campusAcademic"
  | "campusSocial";

// How much each criterion matters, 0-10 (the sliders on the offers page).
export type OfferWeights = Record<OfferCriterion, number>;

// The starting slider positions. The student can still move every slider;
// these only decide where they start. Balanced keeps the weights the app
// used before focuses existed, with the two newer criteria at a low 1. Each
// focus raises the criteria it's about.
// The campus-life sliders start at 0 unless their focus is ticked.
export const BALANCED_OFFER_WEIGHTS: OfferWeights = {
  cost: 5, ranking: 3, subjectRanking: 3, match: 2, country: 1, research: 1, researchImpact: 3, coop: 1, visa: 0, campusAcademic: 0, campusSocial: 0,
};

export const FOCUS_OFFER_WEIGHTS: Record<Focus, OfferWeights> = {
  academic: { cost: 3, ranking: 7, subjectRanking: 7, match: 2, country: 1, research: 2, researchImpact: 6, coop: 1, visa: 0, campusAcademic: 0, campusSocial: 0 },
  work_experience: { cost: 4, ranking: 2, subjectRanking: 2, match: 2, country: 1, research: 1, researchImpact: 2, coop: 8, visa: 0, campusAcademic: 0, campusSocial: 0 },
  research: { cost: 3, ranking: 2, subjectRanking: 7, match: 2, country: 1, research: 8, researchImpact: 8, coop: 1, visa: 0, campusAcademic: 0, campusSocial: 0 },
  affordability: { cost: 9, ranking: 2, subjectRanking: 2, match: 2, country: 1, research: 1, researchImpact: 2, coop: 1, visa: 0, campusAcademic: 0, campusSocial: 0 },
  academic_community: { cost: 4, ranking: 3, subjectRanking: 3, match: 2, country: 1, research: 2, researchImpact: 2, coop: 3, visa: 0, campusAcademic: 8, campusSocial: 0 },
  social_life: { cost: 4, ranking: 3, subjectRanking: 2, match: 2, country: 1, research: 1, researchImpact: 2, coop: 1, visa: 0, campusAcademic: 0, campusSocial: 8 },
};

export const DEFAULT_OFFER_WEIGHTS: OfferWeights = BALANCED_OFFER_WEIGHTS;

// Where the visa slider starts: 0 unless the student factors the visa in,
// then by their Low / Medium / High choice.
export const VISA_OFFER_WEIGHT = { low: 2, medium: 4, high: 6 } as const;

// Same blending rule as the match score (lib/matching.ts, focusWeights):
// average the profiles of every ticked focus, each counting equally, then
// round to whole slider steps. Nothing ticked → Balanced.
export function defaultOfferWeights(focuses: Focus[]): OfferWeights {
  if (focuses.length === 0) return BALANCED_OFFER_WEIGHTS;
  const blended = {} as OfferWeights;
  for (const key of Object.keys(BALANCED_OFFER_WEIGHTS) as OfferCriterion[]) {
    const sum = focuses.reduce((total, focus) => total + FOCUS_OFFER_WEIGHTS[focus][key], 0);
    blended[key] = Math.round(sum / focuses.length);
  }
  return blended;
}

// The plain-language line above the sliders: names every ticked focus and
// the criteria that start higher than Balanced because of them.
export function focusWeightsNote(focuses: Focus[]): string {
  const ordered = FOCUSES.filter((f) => focuses.includes(f));
  if (ordered.length === 0) return "You chose Balanced, so no single criterion is boosted.";
  const weights = defaultOfferWeights(ordered);
  const boosted = (Object.keys(weights) as OfferCriterion[])
    .filter((key) => weights[key] > BALANCED_OFFER_WEIGHTS[key])
    // Lowercase the first letter only, so names keep their capitals.
    .map((key) => CRITERION_LABELS[key][0].toLowerCase() + CRITERION_LABELS[key].slice(1));
  const list =
    boosted.length <= 1 ? boosted.join("") : `${boosted.slice(0, -1).join(", ")} and ${boosted[boosted.length - 1]}`;
  const verb = boosted.length === 1 ? "counts" : "count";
  return boosted.length === 0
    ? `You prioritize ${joinFocuses(ordered)}, which balance out, so no single criterion is boosted.`
    : `Because you prioritize ${joinFocuses(ordered)}, ${list} ${verb} more.`;
}

export const CRITERION_LABELS: Record<OfferCriterion, string> = {
  cost: "Total cost",
  ranking: "Strength (Unicelerate index)",
  subjectRanking: "Subject ranking",
  match: "Match score",
  country: "Preferred country",
  research: "Research intensity",
  researchImpact: "Research impact (Leiden Ranking / OpenAlex)",
  coop: "Co-op / internships",
  visa: "Visa and work rights",
  campusAcademic: "Academic & career community",
  campusSocial: "Campus social life",
};

// Generic so callers can pass extra fields (e.g. for display) and get them
// back on `offer` with their types intact.
export type RankedOffer<T extends OfferInput = OfferInput> = {
  offer: T;
  position: number; // 1 = best
  score: number; // 0-100
  // 0..1 per criterion, or null when unknown for this offer.
  criteria: Record<OfferCriterion, number | null>;
  reason: string;
};

// Scales values so the best offer gets 1 and the worst gets 0. If every
// offer has the same value, the criterion can't separate them, so all get 1.
function relativeScores(
  values: (number | null)[],
  better: "higher" | "lower"
): (number | null)[] {
  const known = values.filter((v): v is number => v !== null);
  if (known.length === 0) return values.map(() => null);
  const min = Math.min(...known);
  const max = Math.max(...known);
  return values.map((v) => {
    if (v === null) return null;
    if (max === min) return 1;
    return better === "higher" ? (v - min) / (max - min) : (max - v) / (max - min);
  });
}

// Rankings are compared on a log scale: going from #10 to #5 is a much
// bigger deal than going from #210 to #205.
const logRank = (rank: number | null) => (rank === null ? null : Math.log(rank));

// Scores each offer 0-100 from the criteria and the student's weights,
// then sorts best first. Like the match score, a criterion that's unknown
// for an offer (e.g. no subject ranking) is left out of that offer's score
// instead of counting as zero.
export function rankOffers<T extends OfferInput>(
  offers: T[],
  weights: OfferWeights
): RankedOffer<T>[] {
  return scoreOffers(offers, weights).map((s, i) => ({
    ...s,
    position: i + 1,
    reason: explainOffer(s.offer, s.criteria, weights, i + 1),
  }));
}

// The scoring and sorting behind rankOffers, without the written reasons,
// so the sensitivity check below can run it a thousand times cheaply.
function scoreOffers<T extends OfferInput>(
  offers: T[],
  weights: OfferWeights
): { offer: T; criteria: Record<OfferCriterion, number | null>; score: number }[] {
  const cost = relativeScores(offers.map((o) => o.totalCost), "lower");
  const ranking = relativeScores(offers.map((o) => logRank(o.overallRank)), "lower");
  const subject = relativeScores(offers.map((o) => logRank(o.subjectRank)), "lower");

  const scored = offers.map((offer, i) => {
    const criteria: Record<OfferCriterion, number | null> = {
      cost: cost[i],
      // The strength index is on a fixed 0-100 scale; without one (a
      // student's own school), a verified ranking compared between offers.
      ranking: offer.strength !== null ? offer.strength / 100 : ranking[i],
      subjectRanking: subject[i],
      match: offer.matchScore / 100,
      country: offer.inPreferredCountry ? 1 : 0,
      // Already on a fixed 0..1 scale (not relative to the other offers),
      // so an offer only gets full marks for an actual R1 / mandatory co-op.
      research: offer.researchScore,
      researchImpact: offer.researchImpact,
      coop: offer.coopScore,
      visa: offer.visaScore ?? null,
      campusAcademic: offer.campusAcademicScore ?? null,
      campusSocial: offer.campusSocialScore ?? null,
    };

    let earned = 0;
    let possible = 0;
    for (const key of Object.keys(criteria) as OfferCriterion[]) {
      const value = criteria[key];
      if (value === null || weights[key] <= 0) continue;
      earned += weights[key] * value;
      possible += weights[key];
    }
    const score = possible > 0 ? Math.round((earned / possible) * 100) : 0;

    return { offer, criteria, score };
  });

  // Best score first; ties broken by cheaper total cost, then by name so the
  // order is always the same.
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (a.offer.totalCost ?? Infinity) - (b.offer.totalCost ?? Infinity) ||
      a.offer.universityName.localeCompare(b.offer.universityName)
  );

  return scored;
}

// ─── Plain-language reasons ─────────────────────────────────────────────

function strongPhrase(key: OfferCriterion, offer: OfferInput, value: number): string {
  switch (key) {
    case "cost":
      return `${value === 1 ? "the lowest" : "a low"} total cost (${usd(offer.totalCost ?? 0)})`;
    case "ranking":
      return offer.strength !== null ? `its strength (${offer.strengthLabel})` : `a strong overall ranking (#${offer.overallRank})`;
    case "subjectRanking":
      return `a strong ${offer.subjectLabel} ranking (#${offer.subjectRank})`;
    case "match":
      return `a high match score (${offer.matchScore}%)`;
    case "country":
      return "being in one of your preferred countries";
    case "research":
      return `its research intensity (${offer.researchLabel})`;
    case "researchImpact":
      return `its research impact (${offer.researchImpactLabel})`;
    case "coop":
      return `its co-op program (${offer.coopLabel?.toLowerCase()})`;
    case "visa":
      return `its visa and work rights (${offer.visaLabel})`;
    case "campusAcademic":
      return `its published academic & career community figures (${offer.campusAcademicLabel})`;
    case "campusSocial":
      return `its published campus-life figures for what you chose (${offer.campusSocialLabel})`;
  }
}

function weakPhrase(key: OfferCriterion, offer: OfferInput): string {
  switch (key) {
    case "cost":
      return `its higher total cost (${usd(offer.totalCost ?? 0)})`;
    case "ranking":
      if (offer.strength !== null) return `its lower strength (${offer.strengthLabel})`;
      return offer.overallRank === null ? "having no overall ranking" : `its overall ranking (#${offer.overallRank})`;
    case "subjectRanking":
      return `its ${offer.subjectLabel} ranking (#${offer.subjectRank})`;
    case "match":
      return `its lower match score (${offer.matchScore}%)`;
    case "country":
      return "not being in your preferred countries";
    case "research":
      return `its lower research intensity (${offer.researchLabel})`;
    case "researchImpact":
      return `its lower research impact (${offer.researchImpactLabel})`;
    case "coop":
      return `its co-op situation (${offer.coopLabel?.toLowerCase()})`;
    case "visa":
      return `its visa and work rights (${offer.visaLabel})`;
    case "campusAcademic":
      return `fewer published academic & career community figures (${offer.campusAcademicLabel})`;
    case "campusSocial":
      return `published campus-life figures that point less to what you chose (${offer.campusSocialLabel})`;
  }
}

// "#1 mainly because of X and Y. Its weak spot is Z." Strengths and weak
// spots are the criteria that count most for this student (weight × value).
function explainOffer(
  offer: OfferInput,
  criteria: Record<OfferCriterion, number | null>,
  weights: OfferWeights,
  position: number
): string {
  const active = (Object.keys(criteria) as OfferCriterion[]).filter(
    (key) => criteria[key] !== null && weights[key] > 0
  );

  const strengths = active
    .filter((key) => (criteria[key] as number) >= 0.75)
    .sort((a, b) => weights[b] * (criteria[b] as number) - weights[a] * (criteria[a] as number))
    .slice(0, 2)
    .map((key) => strongPhrase(key, offer, criteria[key] as number));

  const weakSpot = active
    .filter((key) => (criteria[key] as number) <= 0.25)
    .sort((a, b) => weights[b] * (1 - (criteria[b] as number)) - weights[a] * (1 - (criteria[a] as number)))[0];

  const parts: string[] = [];
  parts.push(
    strengths.length > 0
      ? `#${position} mainly because of ${strengths.join(" and ")}.`
      : `#${position}: no single standout strength for what you weighted most.`
  );
  if (weakSpot) parts.push(`Its weak spot is ${weakPhrase(weakSpot, offer)}.`);
  return parts.join(" ");
}

// ─── Summary ─────────────────────────────────────────────────────────────

export type OfferSummary<T extends OfferInput = OfferInput> = {
  bestOverall: T | null;
  cheapest: T | null;
  highestRanked: T | null;
};

export function summarizeOffers<T extends OfferInput>(ranked: RankedOffer<T>[]): OfferSummary<T> {
  const offers = ranked.map((r) => r.offer);
  const withCost = offers.filter((o) => o.totalCost !== null);
  const withRank = offers.filter((o) => o.overallRank !== null);
  const withStrength = offers.filter((o) => o.strength !== null);

  return {
    bestOverall: ranked[0]?.offer ?? null,
    cheapest: withCost.length
      ? withCost.reduce((a, b) => ((b.totalCost as number) < (a.totalCost as number) ? b : a))
      : null,
    // Strongest by the index when offers have one, else best verified rank.
    highestRanked: withStrength.length
      ? withStrength.reduce((a, b) => ((b.strength as number) > (a.strength as number) ? b : a))
      : withRank.length
        ? withRank.reduce((a, b) => ((b.overallRank as number) < (a.overallRank as number) ? b : a))
        : null,
  };
}

// ─── How sure is the ranking? (sensitivity) ─────────────────────────────

// The sliders are rough: "cost 7" vs "cost 6" is not a precise statement.
// So we re-rank the offers many times with weights jiggled around the
// student's own (each non-zero weight moved randomly by up to ±50%) and
// count how often each offer comes first. If one offer wins almost every
// time, small changes in what the student cares about don't matter; if
// two trade places, it's a close call worth a closer look.

export const SENSITIVITY_RUNS = 1000;
export const SENSITIVITY_SPREAD = 0.5; // ±50% around each weight
// A fixed seed: the same weights always give the same percentages, so the
// numbers don't flicker on every render and tests are repeatable.
export const SENSITIVITY_SEED = 20261006;
// Coming first in at least this share of runs makes a "clear winner".
export const CLEAR_WINNER_SHARE = 0.75;

// Mulberry32: a tiny, well-known seeded random number generator. Same seed →
// same sequence of numbers in [0, 1), unlike Math.random().
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One random set of weights near the student's. A criterion set to 0
// ("ignore") stays ignored.
export function jiggleWeights(weights: OfferWeights, random: () => number, spread = SENSITIVITY_SPREAD): OfferWeights {
  const result = {} as OfferWeights;
  for (const key of Object.keys(weights) as OfferCriterion[]) {
    result[key] = weights[key] * (1 + spread * (2 * random() - 1));
  }
  return result;
}

export type OfferRobustness = {
  id: string;
  universityName: string;
  firstShare: number; // 0..1: share of runs where this offer came first
  // rankShares[k] = share of runs where it came (k + 1)th.
  rankShares: number[];
  typicalRank: number; // the position it got most often (1 = first)
};

export type OfferVerdict = { kind: "clear" | "close"; message: string };

export type OfferSensitivity = {
  runs: number;
  offers: OfferRobustness[]; // most often first, first
  verdict: OfferVerdict | null; // null with fewer than 2 offers
};

export function offerSensitivity<T extends OfferInput>(
  offers: T[],
  weights: OfferWeights,
  { runs = SENSITIVITY_RUNS, seed = SENSITIVITY_SEED, spread = SENSITIVITY_SPREAD } = {}
): OfferSensitivity {
  const random = seededRandom(seed);
  const counts = new Map(offers.map((o) => [o.id, new Array<number>(offers.length).fill(0)]));
  for (let run = 0; run < runs; run++) {
    scoreOffers(offers, jiggleWeights(weights, random, spread)).forEach(({ offer }, position) => {
      counts.get(offer.id)![position] += 1;
    });
  }

  const robustness: OfferRobustness[] = offers.map((offer) => {
    const rankShares = counts.get(offer.id)!.map((n) => n / runs);
    const typicalRank = rankShares.indexOf(Math.max(...rankShares)) + 1;
    return { id: offer.id, universityName: offer.universityName, firstShare: rankShares[0] ?? 0, rankShares, typicalRank };
  });
  robustness.sort((a, b) => b.firstShare - a.firstShare || a.typicalRank - b.typicalRank || a.universityName.localeCompare(b.universityName));

  return { runs, offers: robustness, verdict: offerVerdict(robustness, runs) };
}

const pct = (share: number) => `${Math.round(share * 100)}%`;

export function offerVerdict(offers: OfferRobustness[], runs: number): OfferVerdict | null {
  if (offers.length < 2) return null;
  const [top, second] = offers;
  const variations = `${runs.toLocaleString("en-US")} slightly different versions of your weights`;
  if (top.firstShare >= CLEAR_WINNER_SHARE) {
    return {
      kind: "clear",
      message: `Clear winner: ${top.universityName} comes first in ${pct(top.firstShare)} of ${variations}.`,
    };
  }
  return {
    kind: "close",
    message:
      `Close call: ${top.universityName} comes first in ${pct(top.firstShare)} and ` +
      `${second.universityName} in ${pct(second.firstShare)} of ${variations}. ` +
      "Small changes in what matters to you change the winner, so compare the details.",
  };
}

// ─── Accept-by dates ────────────────────────────────────────────────────

// An offer due within this many days is "due soon".
export const DUE_SOON_DAYS = 7;

export type AcceptByStatus = {
  state: "overdue" | "due-soon" | "upcoming";
  daysLeft: number; // negative when overdue
  label: string;
};

// Badge for the date an offer must be accepted by. Nothing to show when no
// date is entered, or when the offer has already been accepted.
export function acceptByStatus(
  acceptBy: string | null | undefined,
  status: string,
  today: Date = new Date()
): AcceptByStatus | null {
  if (!acceptBy || status === "accepted") return null;
  const due = Date.parse(`${acceptBy}T00:00:00Z`);
  if (Number.isNaN(due)) return null;
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const daysLeft = Math.round((due - todayUtc) / 86_400_000);
  const date = new Date(due).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  if (daysLeft < 0) {
    const ago = -daysLeft;
    return { state: "overdue", daysLeft, label: `Overdue: accept by ${date} (${ago} day${ago === 1 ? "" : "s"} ago)` };
  }
  const when = daysLeft === 0 ? "today" : daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`;
  return {
    state: daysLeft <= DUE_SOON_DAYS ? "due-soon" : "upcoming",
    daysLeft,
    label: `Accept by ${date} (${when})`,
  };
}
