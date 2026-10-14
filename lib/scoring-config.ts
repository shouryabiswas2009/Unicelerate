import type { CoopProgram, ResearchIntensity } from "./types.ts";

// Every weight and threshold used to score and rank universities, in one
// place. Change a number here and every page follows. Each value says why.
//
// Three separate ideas (lib/ranking.ts combines them):
//   1. FIT           "does this school work for me?" (budget, major, country,
//                    English, academic fit, what matters most). 0-100.
//   2. QUALITY       "how strong is this school?", only from figures we
//                    actually have (rankings, College Scorecard outcomes).
//   3. PLAUSIBILITY  "can I realistically get in?", from the admission
//                    estimate (or the Reach/Match/Safety rule when there's
//                    no model estimate).

// ─── 1. Fit weights (always add up to 100) ───────────────────────────────
// 80 points are the same for everyone; FOCUS_POINTS follow "what matters
// most to me" (see focusWeights in lib/matching.ts).
//
// There is deliberately NO acceptance-rate factor any more: it gave more
// points to schools that admit almost everyone, which pushed open-admission
// colleges above strong universities. Its 5 points moved to the major (a
// school without your subject isn't an option, however easy to get into).
export const BASE_WEIGHTS = {
  budget: 25,
  major: 20,
  academic: 15,
  country: 10,
  english: 10,
} as const;

export const FOCUS_POINTS = 20;

// ─── 2. Quality ──────────────────────────────────────────────────────────
// Relative weights of the quality signals (they don't need to add up to
// anything: quality is the weighted average of the signals we know).
// Rankings count most where present; Scorecard outcomes cover US schools.
export const QUALITY_WEIGHTS = {
  ranking: 3, // overall ranking (log scale, like rankScore)
  subjectRanking: 2, // ranking in the student's major
  sat: 2, // SAT midpoint of admitted students
  completion: 2, // % finishing within 6 years
  retention: 1, // % of first-years coming back
  earnings: 1.5, // median earnings 10 years after entry (log scale)
  research: 1.5, // Carnegie research level
  // Research impact percentile (Leiden Ranking / OpenAlex), in the student's
  // field when there is one. The one strength signal that exists for
  // universities everywhere, so schools outside the US can be compared.
  researchImpact: 3,
  selectivity: 0.5, // 1 - admission rate: a small, rough proxy only
} as const;

// Ranges mapped onto 0..1 (below the low end → 0, above the high end → 1).
export const QUALITY_RANGES = {
  sat: { low: 1000, high: 1550 }, // SAT midpoint
  completion: { low: 40, high: 95 }, // %
  retention: { low: 60, high: 98 }, // %
  earnings: { low: 35000, high: 110000 }, // US$, compared on a log scale
} as const;

// Quality needs at least this much known weight to count; with less (e.g.
// only the admission rate) we say "quality not available" instead.
export const QUALITY_MIN_KNOWN_WEIGHT = 3;

// ...and at least one of these direct signals. (Research level and
// earnings alone also describe graduate-only places.) Research impact
// counts: outside the US it's often the only figure there is, and schools
// that don't teach the student's degree level are already left out by the
// fit gate.
export const QUALITY_UNDERGRADUATE_SIGNALS: readonly (keyof typeof QUALITY_WEIGHTS)[] = [
  "ranking",
  "subjectRanking",
  "sat",
  "completion",
  "retention",
  "researchImpact",
];

// What an unknown quality counts as when ranking: the middle, so schools
// without published figures (most outside the US) are neither buried nor
// promoted.
export const QUALITY_UNKNOWN = 0.5;

// ─── 3. Plausibility ─────────────────────────────────────────────────────
// plausibility = FLOOR + (1 - FLOOR) × clamp(P / P_FULL, 0, 1)
// where P is the estimated chance of admission.
//
// P_FULL: a chance of 50% or more counts as fully "within reach"; below
// that, a school is discounted in proportion. (It started at 0.25, but then
// a 29% chance, which the model itself labels "Reach", counted as fully
// within reach, and weaker students saw Reach schools first.)
export const P_FULL = 0.5;

// FLOOR: even a long shot keeps a quarter of its weight. The demo model
// gives a strong student only 1-2% at MIT or Stanford; without a floor,
// those schools sank below open-admission colleges. With it, a top school
// that's a long shot still sorts below solid realistic options but above
// weak ones.
export const PLAUSIBILITY_FLOOR = 0.25;

// When there's no model estimate, the Reach/Match/Safety rule label is used
// instead, as the plausibility of a typical chance for that label (Reach
// ≈ 10%, Match ≈ 40%, Safety ≥ 50%), floor included.
export const RULE_PLAUSIBILITY = { Safety: 1, Match: 0.85, Reach: 0.4 } as const;

// No admission data at all ("Not enough data", e.g. most non-US schools):
// a neutral value between Reach and Match, and the card says so.
export const PLAUSIBILITY_UNKNOWN = 0.6;

// In a student's list, a school with no admission data borrows the chances
// of the schools of similar strength whose chances ARE known (US schools
// with official figures): the median plausibility of those within this
// many quality points (0..1 scale), when there are at least
// NEUTRAL_PEERS_MIN of them. Strong schools tend to be selective, so an
// unknown Oxford is treated like MIT for this student, not like an average
// school; without peers, the list's median, never above PLAUSIBILITY_UNKNOWN.
// (Before 2026-10-14 every unknown school got the list's median, which for
// a strong student was 100%: Oxford counted as a sure admit.)
export const NEUTRAL_PEER_WINDOW = 0.05;
export const NEUTRAL_PEERS_MIN = 5;

// ─── Fit gate ────────────────────────────────────────────────────────────
// Schools failing one of these sort below every school that passes:
// - not offering the student's degree level,
// - tuition more than this many times the student's maximum budget,
// - outside the student's chosen countries (when they chose any).
export const FAR_OVER_BUDGET_RATIO = 1.25;

// ─── Reason line thresholds ──────────────────────────────────────────────
export const HIGH_QUALITY = 0.7; // "highly regarded"
export const GOOD_QUALITY = 0.5; // "well regarded"

// ─── A balanced list ─────────────────────────────────────────────────────
// Shown with the Reach / Match / Safety groups: a common counsellor rule of
// thumb, not a requirement.
export const LIST_MIX = { reach: "2–3", match: "3–4", safety: "2–3" } as const;

// ─── 4. Visa and work rights (optional; lib/visa.ts) ────────────────────
// Only used when the student chooses "Factor it in". Every figure comes
// from country_info (government pages, cited and dated); nothing here is a
// "difficulty" or "approval chance".

// Fit points the visa factor takes, by the student's chosen weight. They're
// taken proportionally from every other factor, so the total stays 100.
export const VISA_WEIGHT_POINTS = { low: 5, medium: 10, high: 15 } as const;
export type VisaWeight = keyof typeof VISA_WEIGHT_POINTS;

// "Best you can get into" multiplies quality × plausibility; with the visa
// factored in, a school with a weak visa score loses up to this share of
// that product (score 1 → no change, score 0 → the full share). Quality
// itself is never touched.
export const VISA_BEST_INFLUENCE = { low: 0.1, medium: 0.2, high: 0.3 } as const;

// How the three cited figures make up the visa score (relative weights;
// a figure we don't have drops out and the rest are re-weighted).
export const VISA_PART_WEIGHTS = {
  postStudy: 6, // post-study work window: the main reason students weigh visas
  funds: 3, // proof of funds compared with what the budget leaves
  work: 1, // hours of work allowed during study: a small plus
} as const;

// A post-study window this long or longer counts as full marks.
export const POST_STUDY_CAP_MONTHS = 36;
// "Not sure" about staying: the post-study window counts half.
export const STAY_UNSURE_POST_STUDY_SHARE = 0.5;
// Work during study: this many hours a week or more counts as full marks.
export const WORK_HOURS_CAP = 24;

// ─── 5. Focus signals ───────────────────────────────────────────────────

// How much each Carnegie level counts toward the research focus, 0..1.
// Hand-chosen and evenly spaced over the doctoral levels: R1 is the most
// research-intensive category, a non-doctoral school (mostly teaching-
// focused) gets nothing for research.
export const RESEARCH_SCORES: Record<ResearchIntensity, number> = {
  very_high: 1,
  high: 0.7,
  doctoral_professional: 0.4,
  non_doctoral: 0,
};

// How much each kind of program counts toward the work-experience focus,
// 0..1. "unknown" isn't here on purpose: no information is left out of the
// score, never treated as "none".
export const COOP_SCORES: Record<Exclude<CoopProgram, "unknown">, number> = {
  mandatory: 1, // every student gets work experience
  optional: 0.5, // available, but the student has to seek it out
  none: 0,
};
