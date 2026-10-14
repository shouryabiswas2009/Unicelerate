import { usd } from "@/lib/format";
import {
  ADMISSION_MODEL_INFO,
  chanceFromProbability,
  predictAdmission,
  type AdmissionPrediction,
} from "@/lib/admission-model";
import {
  COOP_LABELS,
  COOP_SCORES,
  RESEARCH_LABELS,
  RESEARCH_SCORES,
  focusesOf,
} from "@/lib/focus";
import { canonicalCountry } from "@/lib/countries";
import { BASE_WEIGHTS, FOCUS_POINTS, VISA_WEIGHT_POINTS } from "@/lib/scoring-config";
import type { CountryInfo } from "@/lib/country-info";
import { visaFit, visaLine, visaModeOf, type VisaFit, type VisaMode } from "@/lib/visa";
import { rankUniversity, type RankInfo } from "@/lib/ranking";
import { researchImpactFor } from "@/lib/research-impact";
import { effectiveGrade, prerequisiteConcerns } from "@/lib/courses";
import {
  academicCommunityScore,
  academicPrefsOf,
  relevantProxyTexts,
  socialFunScore,
  socialPrefsOf,
  type CampusScore,
} from "@/lib/campus-life";
import { CAMPUS_STRONG } from "@/lib/campus-life-config";
import { BALANCED_FOCUSES, FOCUSES, type Focus, type Profile, type UniversitySummary } from "@/lib/types";

// ─── Scoring weights ─────────────────────────────────────────────────────
// The weights live in lib/scoring-config.ts (with every other ranking
// constant). They always add up to 100, so each reads as "how many points
// out of 100 this factor is worth". Budget is heaviest because a school a
// student can't afford isn't a real option.
export { BASE_WEIGHTS, FOCUS_POINTS };

// The other 20 points follow "what matters most to me". Each focus has its
// own factor:
const FOCUS_FACTOR = {
  academic: "reputation",
  work_experience: "coop",
  research: "research",
  affordability: "affordability",
  academic_community: "campus_academic",
  social_life: "campus_social",
} as const satisfies Record<Focus, string>;

export type FactorKey = keyof typeof BASE_WEIGHTS | (typeof FOCUS_FACTOR)[Focus] | "visa";

// Blending rule. Think of each focus as its own weight profile: the 80 base
// points plus all 20 focus points on that focus's factor. When a student
// ticks several focuses, their profiles are averaged with equal weight, so
// each ticked focus gets 20 ÷ (number ticked) points. Balanced (nothing
// ticked) is the average of the four original profiles: 5 points each.
// That's why ticking those four gives exactly the same weights as Balanced:
// caring about everything equally is the same as not prioritizing anything.
// The two campus-life focuses are not part of Balanced, so a student who
// ticks neither gets exactly the scores they had before they existed.
export function focusWeights(focuses: Focus[]): Record<FactorKey, number> {
  const chosen = focuses.length === 0 ? BALANCED_FOCUSES : focuses;
  const weights = { ...BASE_WEIGHTS } as Record<FactorKey, number>;
  for (const focus of FOCUSES) {
    weights[FOCUS_FACTOR[focus]] = chosen.includes(focus) ? FOCUS_POINTS / chosen.length : 0;
  }
  return weights;
}

export const BALANCED_WEIGHTS = focusWeights([]);

// The student's weights: the focus weights, plus "Visa and work rights"
// when they chose to factor it in. Its points (Low / Medium / High) are
// taken proportionally from every other factor, so the total stays 100.
// With visa ignored or only shown, these are exactly the focus weights.
export function fitWeights(profile: Pick<Profile, "focuses" | "primary_focus" | "visa_mode" | "visa_weight">): Record<FactorKey, number> {
  const weights = focusWeights(focusesOf(profile as Profile));
  if (visaModeOf(profile) !== "factor") return weights;
  const points = VISA_WEIGHT_POINTS[profile.visa_weight ?? "medium"];
  const scale = (100 - points) / 100;
  for (const key of Object.keys(weights) as FactorKey[]) weights[key] *= scale;
  weights.visa = points;
  return weights;
}

const FACTOR_LABELS: Record<FactorKey, string> = {
  budget: "Budget",
  major: "Major",
  academic: "Academic fit",
  country: "Country",
  english: "English",
  reputation: "Academic reputation",
  coop: "Co-op / internships",
  research: "Research",
  affordability: "Affordability",
  campus_academic: "Academic & career community",
  campus_social: "Campus social life",
  visa: "Visa and work rights",
};

export type FactorScore = {
  key: FactorKey;
  label: string;
  max: number;
  // null = we can't tell (e.g. no SAT on either side). Unknown factors are
  // left out of the total rather than counted as zero.
  points: number | null;
  // Why points is null, when it isn't simply "unknown".
  note?: string;
};

// "Not enough data": we can't honestly place the school without its
// admission figures (most non-US schools publish none) — never a fake Match.
export type AdmissionChance = "Reach" | "Match" | "Safety" | "Not enough data";

export type MatchResult = {
  score: number; // 0-100
  eligible: boolean; // false when the school lacks the student's degree level
  factors: FactorScore[];
  chance: AdmissionChance;
  // "rule" = the hand-tuned admissionChance() below; "model" = the trained
  // logistic regression (see scoreUniversity).
  chanceSource: "rule" | "model";
};

export type MatchExplanation = { strengths: string[]; concerns: string[] };

// Tuition below this fraction of the student's minimum budget gets a
// "much cheaper than your range" note. A gap that big usually means a
// different system (e.g. tuition-free public universities) or a fee that
// leaves out costs. It never lowers the score: paying less isn't a worse fit.
const MUCH_CHEAPER_RATIO = 0.5;

// Reach/Match/Safety thresholds. This hand-tuned rule is the baseline the
// trained model (lib/admission-model.ts) is measured against; for
// undergraduate profiles scoreUniversity() uses the model instead, because
// it beat this rule on held-out data.
const REACH_IF_ACCEPTANCE_BELOW = 15; // % — this selective is a reach for anyone
const REACH_IF_ACADEMIC_FIT_BELOW = 0.5;
const SAFETY_ACADEMIC_FIT = 0.85;
const SAFETY_MIN_ACCEPTANCE = 50; // %

// ─── Small helpers ───────────────────────────────────────────────────────
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function isKnown(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && !Number.isNaN(value);
}


// Compared by canonical name, so "UK", "England" and "United Kingdom" (or
// "USA" and "United States") all match (lib/countries.ts).
export function countryMatches(profile: Profile, university: UniversitySummary): boolean {
  const country = canonicalCountry(university.country);
  return profile.preferred_countries.some((preferred) => canonicalCountry(preferred) === country);
}

// Admission figures in the data (admission rate, typical GPA, SAT range) are
// undergraduate figures unless a row says otherwise, so they only judge
// undergraduate applicants. For Masters and PhD students they're unknown.
const usesUndergradAdmissions = (profile: Profile) => profile.preferred_degree_level === "Undergraduate";

// Finds the first of the student's intended majors that lines up with one
// of the university's popular programs. Shared by the score, the
// explanation, and the subject-specific ranking lookup.
function findMatchingProgram(
  profile: Profile,
  university: UniversitySummary
): { major: string; program: string } | null {
  for (const rawMajor of profile.intended_majors) {
    const major = rawMajor.trim().toLowerCase();
    if (!major) continue;

    const program = university.popular_programs.find(
      (p) => p.toLowerCase().includes(major) || major.includes(p.toLowerCase())
    );
    if (program) return { major: rawMajor, program };
  }
  return null;
}

// A school that doesn't offer the student's degree level can't be a match,
// however well it scores otherwise. For undergraduates an empty list means
// "unknown" and the school stays in. Masters and PhD students only see
// schools that say they offer that level: almost every school in the data
// teaches undergraduates, so "unknown" usually means "undergraduate only".
export function offersDegreeLevel(profile: Profile, university: UniversitySummary): boolean {
  const levels = university.degree_levels ?? [];
  if (levels.length === 0) return profile.preferred_degree_level === "Undergraduate";
  return levels.includes(profile.preferred_degree_level);
}

function isMuchCheaperThanRange(profile: Profile, university: UniversitySummary): boolean {
  return isKnown(university.tuition) && university.tuition < profile.budget_min * MUCH_CHEAPER_RATIO;
}

// ─── Factor fits: each returns 0..1, or null when unknown ────────────────

function budgetFit(profile: Profile, university: UniversitySummary): number | null {
  const { tuition } = university;
  if (!isKnown(tuition)) return null; // tuition not available
  if (tuition <= profile.budget_max) return 1;
  // Lose credit in proportion to how far over budget: 50% over → 0.5.
  const overBy = (tuition - profile.budget_max) / profile.budget_max;
  return clamp01(1 - overBy);
}

// GPA gap in percentage points vs the typical admitted student:
// +5 or more → 1, exactly average → 0.75, -10 → 0.25, -15 or worse → 0.
function gpaFit(profile: Profile, university: UniversitySummary): number | null {
  if (!isKnown(university.avg_admitted_gpa)) return null;
  // The grade blended with the relevant-coursework average when the student
  // entered enough courses (lib/courses.ts); otherwise the overall grade.
  const gap = effectiveGrade(profile) - university.avg_admitted_gpa;
  return clamp01(0.75 + gap / 20);
}

// Position within the middle-50% SAT range: at the 25th percentile → 0.5,
// at the 75th or above → 1, one full range-width below the 25th → 0.
function satFit(profile: Profile, university: UniversitySummary): number | null {
  if (!isKnown(profile.sat_score) || !isKnown(university.sat_25) || !isKnown(university.sat_75)) {
    return null;
  }
  const rangeWidth = Math.max(university.sat_75 - university.sat_25, 10);
  const position = (profile.sat_score - university.sat_25) / rangeWidth;
  return clamp01(0.5 + 0.5 * position);
}

// Average of whichever academic signals we have. GPA is always on the
// profile; SAT is optional and US-only, so it often drops out.
function academicFit(profile: Profile, university: UniversitySummary): number | null {
  if (!usesUndergradAdmissions(profile)) return null;
  const parts = [gpaFit(profile, university), satFit(profile, university)].filter(isKnown);
  if (parts.length === 0) return null;
  return parts.reduce((sum, x) => sum + x, 0) / parts.length;
}

// Meeting the minimum → 1; half a band short → 0.5; a full band short → 0.
function englishFit(profile: Profile, university: UniversitySummary): number | null {
  if (!isKnown(profile.ielts_score) || !isKnown(university.min_ielts)) return null;
  return clamp01(1 + (profile.ielts_score - university.min_ielts));
}

// ─── Focus factors ───────────────────────────────────────────────────────
// One fit per focus, each 0..1 or null. A fit only uses figures we
// actually have, and is null (left out of the score) when none are known.

// Rankings on a log scale, like the offers page: #1 → 1, #10 → 0.67,
// #100 → 0.33, #1000 or lower → 0. Going from #10 to #5 matters more than
// going from #210 to #205.
export function rankScore(rank: number): number {
  return clamp01(1 - Math.log10(Math.max(rank, 1)) / 3);
}

const average = (parts: (number | null | undefined)[]): number | null => {
  const known = parts.filter(isKnown);
  return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
};

// Tuition + living cost per year, or null when living cost is unknown —
// tuition alone would make a school look cheaper than it is.
function totalCostPerYear(university: UniversitySummary): number | null {
  const { tuition, living_cost_per_year: living } = university;
  return isKnown(tuition) && isKnown(living) ? tuition + living : null;
}

// Total cost vs. the student's maximum budget: half the budget or less → 1,
// exactly the budget → 0.5, 1.5× the budget or more → 0.
function affordabilityScore(total: number, budgetMax: number): number {
  return clamp01(1.5 - total / budgetMax);
}

export function subjectRanking(profile: Profile, university: UniversitySummary) {
  const match = findMatchingProgram(profile, university);
  const rank = match ? university.program_rankings?.[match.program] : undefined;
  return match && isKnown(rank) ? { program: match.program, rank } : null;
}

// Research intensity as a 0..1 signal with its label, or null if unknown.
// Exported for the offers page.
export function researchSignal(university: UniversitySummary): { value: number; label: string } | null {
  const level = university.research_intensity;
  return level ? { value: RESEARCH_SCORES[level], label: RESEARCH_LABELS[level] } : null;
}

// Research impact (Leiden Ranking / OpenAlex) as 0..1, in the student's
// field when there is one; null when the school isn't in the ranking.
function researchImpactScore(profile: Profile, university: UniversitySummary): number | null {
  const impact = researchImpactFor(profile, university);
  return impact ? impact.percentile / 100 : null;
}

// The school's co-op / internship program as a 0..1 signal, or null when
// unknown. "Work experience" means these programs only — not employment
// rates or graduate earnings, which say nothing about whether the school
// helps a student get experience while studying. Exported for the offers page.
export function coopSignal(university: UniversitySummary): { value: number; label: string } | null {
  const program = university.coop_program ?? "unknown";
  return program === "unknown" ? null : { value: COOP_SCORES[program], label: COOP_LABELS[program] };
}

function focusFits(profile: Profile, university: UniversitySummary): Record<(typeof FOCUS_FACTOR)[Focus], number | null> {
  const subject = subjectRanking(profile, university);
  const subjectScore = subject ? rankScore(subject.rank) : null;
  const { qs_ranking, completion_rate, retention_rate } = university;
  const total = totalCostPerYear(university);

  return {
    reputation: average([
      subjectScore,
      isKnown(qs_ranking) ? rankScore(qs_ranking) : null,
      isKnown(completion_rate) ? completion_rate / 100 : null,
      isKnown(retention_rate) ? retention_rate / 100 : null,
    ]),
    coop: coopSignal(university)?.value ?? null,
    research: average([researchSignal(university)?.value, subjectScore, researchImpactScore(profile, university)]),
    affordability: total === null ? null : affordabilityScore(total, profile.budget_max),
    // Proxies only (lib/campus-life.ts); null = nothing published, left out.
    campus_academic: academicCommunityScore(university, academicPrefsOf(profile)).score,
    campus_social: socialFunScore(university, socialPrefsOf(profile)).score,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────

export function admissionChance(
  academic: number | null,
  acceptanceRate: number | null
): AdmissionChance {
  // A very selective school is a reach for anyone, even without knowing
  // how this student compares.
  if (acceptanceRate !== null && acceptanceRate < REACH_IF_ACCEPTANCE_BELOW) return "Reach";
  // Without knowing how the student compares with admitted students, any
  // label would be a guess.
  if (academic === null) return "Not enough data";
  if (academic < REACH_IF_ACADEMIC_FIT_BELOW) return "Reach";
  // Safety also needs a known, generous admission rate.
  if (
    academic >= SAFETY_ACADEMIC_FIT &&
    acceptanceRate !== null &&
    acceptanceRate >= SAFETY_MIN_ACCEPTANCE
  ) {
    return "Safety";
  }
  return "Match";
}

// How well a university fits a student: a 0-100 score plus the points
// behind it, so the UI can show *why* and not just a number.
// `unknown`: factors to treat as "we don't know" for this student, e.g. the
// landing-page quiz knows a guest's budget, country and major but not their
// grades or English score. Unknown factors are left out and the score is
// scaled over the rest, the same rule as a missing SAT.
export function computeMatchScore(
  profile: Profile,
  university: UniversitySummary,
  { unknown = [], visa = null }: { unknown?: FactorKey[]; visa?: VisaFit | null } = {}
): MatchResult {
  const weights = fitWeights(profile);
  const fits: Record<FactorKey, number | null> = {
    budget: budgetFit(profile, university),
    // No program list at all means we don't know, not that none match.
    major: (university.popular_programs ?? []).length === 0
      ? null
      : findMatchingProgram(profile, university) ? 1 : 0,
    academic: academicFit(profile, university),
    country: countryMatches(profile, university) ? 1 : 0,
    english: englishFit(profile, university),
    ...focusFits(profile, university),
    // Only weighted when the student factors the visa in; unknown = left out.
    visa: visa?.score ?? null,
  };
  for (const key of unknown) fits[key] = null;

  // A ticked focus we know nothing about for this school (say, co-op where
  // the school's page doesn't say) hands its points to the student's other
  // ticked focuses that we do know, so their priorities still count for the
  // same share of the score and an unknown never moves it. With no known
  // focus at all, the rescale below covers it.
  const focusKeys = [...new Set(Object.values(FOCUS_FACTOR))].filter((key) => weights[key] > 0);
  const knownFocus = focusKeys.filter((key) => fits[key] !== null);
  const unknownPoints = focusKeys.filter((key) => fits[key] === null).reduce((sum, key) => sum + weights[key], 0);
  if (unknownPoints > 0 && knownFocus.length > 0) {
    const knownPoints = knownFocus.reduce((sum, key) => sum + weights[key], 0);
    for (const key of knownFocus) weights[key] += (unknownPoints * weights[key]) / knownPoints;
  }

  // Factors worth 0 points for this student (a focus they didn't tick) are
  // left out of the breakdown entirely.
  const factors: FactorScore[] = (Object.keys(weights) as FactorKey[])
    .filter((key) => weights[key] > 0)
    .map((key) => {
      const fit = fits[key];
      return {
        key,
        label: FACTOR_LABELS[key],
        max: Math.round(weights[key] * 10) / 10,
        points: fit === null ? null : Math.round(fit * weights[key] * 10) / 10,
      };
    });

  // Rescale over the factors we actually know, so a missing SAT or IELTS
  // is "unknown", not a zero that drags the score down.
  const known = factors.filter((f) => f.points !== null);
  const earned = known.reduce((sum, f) => sum + (f.points ?? 0), 0);
  const possible = known.reduce((sum, f) => sum + f.max, 0);

  const eligible = offersDegreeLevel(profile, university);
  const score = eligible && possible > 0 ? Math.round((earned / possible) * 100) : 0;

  return {
    score,
    eligible,
    factors,
    chance: admissionChance(
      fits.academic,
      usesUndergradAdmissions(profile) ? university.acceptance_rate : null
    ),
    chanceSource: "rule",
  };
}

// Rankings on curated rows come only from data/curated/international_rankings.csv
// (copied by hand from the public ranking pages); everywhere else they're
// the illustrative sample rankings, or the student's own.
function rankingSource(university: UniversitySummary): string {
  if (university.source === "curated") return "ranking entered from the public ranking page";
  if (university.source === "user-entered") return "ranking entered by you";
  return "illustrative ranking";
}

// Says where a figure came from, so an official number and one a student
// typed in never read the same.
function fromWhere(university: UniversitySummary): string {
  if (university.source === "College Scorecard") return "College Scorecard";
  if (university.source === "user-entered") return "entered by you";
  // Curated figures were read on the university's own pages, so they must
  // never be called illustrative (found in the logged-in test pass).
  if (university.source === "curated") return "the school's own website";
  return "illustrative";
}

// Lines about the focuses the student ticked. They go first in the lists,
// so the short card view shows them. "Not available" notes go last, after
// the real concerns, so they don't crowd out what we do know.
function explainFocuses(
  focuses: Focus[],
  profile: Profile,
  university: UniversitySummary
): MatchExplanation & { unavailable: string[] } {
  const strengths: string[] = [];
  const concerns: string[] = [];
  const unavailable: string[] = [];
  const source = fromWhere(university);
  const fits = focusFits(profile, university);

  // Ranking lines always say where the ranking came from (see
  // rankingSource). Academic reputation and research both use the subject
  // ranking; say it once.
  let subjectSaid = false;
  const subjectLine = () => {
    const subject = subjectRanking(profile, university);
    if (!subject || subjectSaid) return;
    subjectSaid = true;
    const text = `#${subject.rank} in ${subject.program} (${rankingSource(university)}).`;
    if (subject.rank <= 100) strengths.push(`Strong subject ranking: ${text}`);
    else concerns.push(`Subject ranking outside the top 100: ${text}`);
  };

  for (const focus of focuses) {
    switch (focus) {
      case "academic": {
        subjectLine();
        const rank = university.qs_ranking;
        if (isKnown(rank) && rank <= 100) strengths.push(`Ranked #${rank} overall (${rankingSource(university)}).`);
        else if (isKnown(rank) && rank > 200) concerns.push(`Ranked #${rank} overall (${rankingSource(university)}).`);

        const completion = university.completion_rate;
        if (isKnown(completion) && completion >= 80) {
          strengths.push(`${completion}% of students graduate within 6 years (${source}).`);
        } else if (isKnown(completion) && completion < 60) {
          concerns.push(`Only ${completion}% of students graduate within 6 years (${source}).`);
        }
        const retention = university.retention_rate;
        if (isKnown(retention) && retention >= 90) {
          strengths.push(`${retention}% of first-year students come back for a second year (${source}).`);
        } else if (isKnown(retention) && retention < 75) {
          concerns.push(`Only ${retention}% of first-year students come back for a second year (${source}).`);
        }
        if (fits.reputation === null) {
          unavailable.push("Rankings, graduation and retention rates: not available for this school.");
        }
        break;
      }
      case "work_experience": {
        // Co-op / internship programs only. Earnings and employment rates
        // aren't used here, on purpose (see coopSignal).
        const coop = university.coop_program ?? "unknown";
        if (coop === "mandatory") strengths.push(`Has a mandatory co-op program (${source}).`);
        else if (coop === "optional") strengths.push(`Has an optional co-op / internship program (${source}).`);
        else if (coop === "none") concerns.push(`No co-op program (${source}).`);
        else unavailable.push("No co-op information available for this school.");
        break;
      }
      case "research": {
        const research = researchSignal(university);
        if (!research) {
          unavailable.push("Research intensity: not available for this school.");
        } else {
          const line = `${research.label} — Carnegie classification (${source}).`;
          (research.value >= RESEARCH_SCORES.high ? strengths : concerns).push(line);
        }
        subjectLine();
        break;
      }
      case "affordability": {
        const total = totalCostPerYear(university);
        if (total === null) {
          unavailable.push("Living costs: not available, so the total cost can't be checked against your budget.");
        } else if (total <= profile.budget_max / 2) {
          strengths.push(`Tuition plus living costs (about ${usd(total)}/yr) is well under your budget.`);
        } else if (total <= profile.budget_max) {
          strengths.push(`Tuition plus living costs (about ${usd(total)}/yr) fits your budget.`);
        } else {
          concerns.push(
            `Tuition plus living costs (about ${usd(total)}/yr) is ${usd(total - profile.budget_max)} over your budget.`
          );
        }
        break;
      }
      case "academic_community": {
        const prefs = academicPrefsOf(profile);
        campusLines("Academic & career community", academicCommunityScore(university, prefs), relevantProxyTexts("academic", university, prefs));
        break;
      }
      case "social_life": {
        const prefs = socialPrefsOf(profile);
        campusLines("Campus social life", socialFunScore(university, prefs), relevantProxyTexts("social", university, prefs));
        if (prefs.includes("greek_life")) unavailable.push("Greek life: no official source lists fraternities and sororities, so it isn't scored.");
        break;
      }
    }
  }
  return { strengths, concerns, unavailable };

  // Neutral wording on purpose: these are proxies from published figures,
  // never a verdict on how social or fun a school is.
  function campusLines(label: string, result: CampusScore, proxies: string) {
    const limited = result.direct === 0 ? "; partial data, no club or event counts published" : "";
    if (result.score === null) {
      unavailable.push(`${label}: no published figures for this school, so it isn't scored (limited data, not a judgement).`);
    } else if (result.score >= CAMPUS_STRONG) {
      strengths.push(`${label}: ${proxies} (proxy from published figures${limited}).`);
    } else {
      concerns.push(`${label}: the published figures point less to what you chose here (${proxies}${limited}). A proxy, not a rating.`);
    }
  }
}

// Plain-language strengths and concerns built from the same factors as the
// score, so the weak spots are visible and not just the good news. Some
// concerns (like living costs) don't change the score but are worth knowing.
export function explainMatch(profile: Profile, university: UniversitySummary): MatchExplanation {
  if (!offersDegreeLevel(profile, university)) {
    return {
      strengths: [],
      concerns: [`Doesn't offer ${profile.preferred_degree_level} programs, so it isn't an option for you.`],
    };
  }

  // The ticked focuses go first, so they show even on the short card view.
  const focuses = focusesOf(profile);
  const focusLines = explainFocuses(focuses, profile, university);
  const strengths: string[] = [...focusLines.strengths];
  const concerns: string[] = [...focusLines.concerns];

  // Budget
  const { tuition, living_cost_per_year: living } = university;
  if (!isKnown(tuition)) {
    concerns.push("Tuition: not available for this school, so it isn't scored against your budget.");
  } else if (tuition <= profile.budget_max) {
    // The budget factor compares tuition alone; each line names which
    // figure it compares, so "fits" and "over" never seem to contradict.
    const total = isKnown(living) ? tuition + living : null;
    if (total !== null && total <= profile.budget_max) {
      strengths.push(`Tuition plus living costs (about ${usd(total)}/yr) is within your budget of ${usd(profile.budget_max)}.`);
    } else if (total === null || focuses.includes("affordability")) {
      // (The affordability focus already compared the total, above.)
      strengths.push(`Tuition alone (${usd(tuition)}/yr) is within your budget of ${usd(profile.budget_max)}.`);
    } else {
      concerns.push(
        `Tuition alone (${usd(tuition)}/yr) is within your ${usd(profile.budget_max)} budget, but tuition plus living costs (about ${usd(total)}/yr) is over it.`
      );
    }
  } else {
    concerns.push(
      `Tuition (${usd(tuition)}/yr) is ${usd(tuition - profile.budget_max)} over your budget.`
    );
  }
  if (isMuchCheaperThanRange(profile, university)) {
    concerns.push(
      `Tuition is much cheaper than your range (you set a minimum of ${usd(profile.budget_min)}) — check what the fee covers.`
    );
  }

  // Country
  if (countryMatches(profile, university)) {
    strengths.push(`In one of your preferred countries (${university.country}).`);
  } else {
    concerns.push(`Not in your preferred countries (it's in ${university.country}).`);
  }

  // Major, with the subject ranking when we have one
  const match = findMatchingProgram(profile, university);
  if (match) {
    const subjectRank = university.program_rankings?.[match.program];
    strengths.push(
      subjectRank != null
        ? `Offers ${match.program} (subject ranking #${subjectRank}).`
        : `Offers ${match.program}.`
    );
  } else {
    if ((university.popular_programs ?? []).length > 0) {
      concerns.push("None of your intended majors are among its popular programs.");
    }
  }

  // GPA (undergraduate admit figures; see usesUndergradAdmissions)
  const avgGpa = university.avg_admitted_gpa;
  if (usesUndergradAdmissions(profile) && isKnown(avgGpa)) {
    if (profile.gpa_percentage >= avgGpa) {
      strengths.push(
        `Your GPA (${profile.gpa_percentage}) is at or above the typical admitted average (${avgGpa}).`
      );
    } else {
      concerns.push(
        `Your GPA (${profile.gpa_percentage}) is below the typical admitted average (${avgGpa}).`
      );
    }
  }

  // SAT — only US schools have a range, and only for undergraduates
  const { sat_25, sat_75 } = university;
  if (usesUndergradAdmissions(profile) && isKnown(sat_25) && isKnown(sat_75)) {
    const range = `${sat_25}–${sat_75}`;
    const sat = profile.sat_score;
    if (!isKnown(sat)) {
      concerns.push(`No SAT score on your profile yet — admitted students typically score ${range}.`);
    } else if (sat >= sat_75) {
      strengths.push(`Your SAT (${sat}) is above the typical range (${range}).`);
    } else if (sat >= sat_25) {
      strengths.push(`Your SAT (${sat}) is within the typical range (${range}).`);
    } else {
      concerns.push(`Your SAT (${sat}) is below the typical range (${range}).`);
    }
  }

  // English
  const minIelts = university.min_ielts;
  if (isKnown(minIelts)) {
    const ielts = profile.ielts_score;
    if (!isKnown(ielts)) {
      concerns.push(
        `No IELTS score on your profile — international applicants need at least ${minIelts.toFixed(1)}.`
      );
    } else if (ielts >= minIelts) {
      strengths.push(`Your IELTS (${ielts.toFixed(1)}) meets the ${minIelts.toFixed(1)} minimum.`);
    } else {
      concerns.push(`Your IELTS ${ielts.toFixed(1)} is below the ${minIelts.toFixed(1)} minimum.`);
    }
  }

  // Selectivity (an undergraduate figure; unknown for most non-US schools)
  const rate = university.acceptance_rate;
  if (usesUndergradAdmissions(profile) && isKnown(rate)) {
    if (rate < REACH_IF_ACCEPTANCE_BELOW) {
      concerns.push(`Very selective: only about ${rate}% of applicants are admitted.`);
    } else if (rate >= SAFETY_MIN_ACCEPTANCE) {
      strengths.push(`Admits about ${rate}% of applicants.`);
    }
  }
  if (!usesUndergradAdmissions(profile)) {
    concerns.push(
      `Admission figures and tuition here are undergraduate figures, so they aren't used to judge your ${profile.preferred_degree_level} application — check the program's own page.`
    );
  }

  concerns.push(...focusLines.unavailable);
  return { strengths, concerns };
}

// rank is null for an unranked school (only possible for ones students add).
export type DisplayRanking = { rank: number | null; label: string };

// The ranking to show a given student for a given university: subject-specific
// when their intended major lines up with a ranked program, otherwise the
// university-wide ranking — always labeled so it's never misleading.
export function getDisplayRanking(
  university: UniversitySummary,
  profile: Profile
): DisplayRanking {
  const match = findMatchingProgram(profile, university);
  if (match) {
    const subjectRank = university.program_rankings?.[match.program];
    if (subjectRank != null) {
      return { rank: subjectRank, label: match.program };
    }
  }

  return { rank: university.qs_ranking ?? null, label: "Overall" };
}

export function formatRank(rank: number | null): string {
  // "Not available" rather than "Unranked": most official (Scorecard) schools
  // simply have no QS ranking in this dataset, which isn't the same as being
  // unranked.
  return rank === null ? "Ranking not available" : `#${rank}`;
}

// Everything a university card needs, computed in one place so every page
// that lists universities scores them the same way.
export type MatchEntry = {
  university: UniversitySummary;
  match: MatchResult;
  explanation: MatchExplanation;
  ranking: DisplayRanking;
  // Estimated admission probability from the trained model, or null when
  // it doesn't apply (see below).
  prediction: AdmissionPrediction | null;
  // Quality, plausibility and the "Best you can get into" score
  // (lib/ranking.ts).
  rank: RankInfo;
  // Visa and work rights, only when the student chose to show or factor it
  // (lib/visa.ts); null when they ignore it.
  visa: { mode: VisaMode; fit: VisaFit; line: string; info: CountryInfo | null } | null;
};

// The trained model only replaces the rule-based Reach/Match/Safety label
// when (1) training showed it beats the rule on held-out data, (2) the
// student is applying for undergraduate study, and (3) the school has
// official College Scorecard figures — the synthetic training data was
// built around those schools' real admission rates and SAT ranges, so
// using it on illustrative or student-entered figures would be guesswork.
export function scoreUniversity(
  profile: Profile,
  university: UniversitySummary,
  // Visa guidance per country (lib/data/country-info.ts). Only needed when
  // the student shows or factors in the visa; otherwise it's not used.
  { countryInfo }: { countryInfo?: Map<string, CountryInfo> } = {}
): MatchEntry {
  const mode = visaModeOf(profile);
  const info = countryInfo?.get(canonicalCountry(university.country)) ?? null;
  const fit = mode !== "ignore" && countryInfo ? visaFit(profile, info, { tuition: university.tuition }) : null;
  const factored = mode === "factor" ? fit : null;
  const match = computeMatchScore(profile, university, { visa: factored });
  const prediction =
    profile.preferred_degree_level === "Undergraduate" &&
    university.source === "College Scorecard" &&
    university.acceptance_rate !== null
      ? predictAdmission(profile, { ...university, acceptance_rate: university.acceptance_rate })
      : null;

  if (prediction && ADMISSION_MODEL_INFO.beatsBaseline) {
    match.chance = chanceFromProbability(prediction.probability);
    match.chanceSource = "model";
  }

  const explanation = explainMatch(profile, university);
  // Required courses this program publishes that aren't in the student's
  // list (only once they've entered courses; lib/program-prerequisites.ts).
  explanation.concerns.push(...prerequisiteConcerns(profile, university));
  if (factored) {
    explanation.strengths.push(...factored.reasons);
    explanation.concerns.push(...factored.concerns);
  }

  return {
    university,
    match,
    explanation,
    ranking: getDisplayRanking(university, profile),
    prediction,
    // The model's probability only drives plausibility when it also drives
    // the Reach/Match/Safety label, so the two never disagree.
    rank: rankUniversity(profile, university, match, match.chanceSource === "model" ? prediction!.probability : null, factored?.score ?? null),
    visa: fit ? { mode, fit, line: visaLine(info), info } : null,
  };
}
