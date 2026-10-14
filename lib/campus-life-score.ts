import {
  ACADEMIC_PREF_WEIGHTS,
  ATHLETICS_SCORES,
  DIRECT_PROXIES,
  GOOD_COVERAGE_MIN_FIGURES,
  COUNT_FULL,
  LOCALE_URBAN,
  QUIET_FLIPPED,
  RESIDENTIAL_FULL_SHARE,
  SIZE_RANGE,
  SOCIAL_PREF_WEIGHTS,
  type AcademicPref,
  type AcademicProxy,
  type SocialPref,
  type SocialProxy,
} from "./campus-life-config.ts";
import { COOP_SCORES, RESEARCH_SCORES } from "./scoring-config.ts";
import type { CampusCoverage, Profile, UniversitySummary } from "./types.ts";

// The scoring half of the campus-life focuses (display: lib/campus-life.ts).
// Plain relative imports so the import script (scripts/campus-life/build.mjs)
// runs this exact code to precompute the stored "Not sure" scores.

export type CampusRow = Pick<UniversitySummary, "campus_life" | "coop_program" | "research_intensity" | "research_impact">;

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const count = (n: number | null | undefined, full: number) => (isNum(n) ? clamp01(n / full) : null);

// ─── Each proxy as 0..1, or null when unknown ────────────────────────────

export function academicProxyValues(u: CampusRow): Record<AcademicProxy, number | null> {
  const life = u.campus_life;
  const coop = u.coop_program ?? "unknown";
  return {
    project_teams: count(life?.project_teams, COUNT_FULL.project_teams),
    academic_clubs: count(life?.academic_clubs, COUNT_FULL.academic_clubs),
    hackathons: count(life?.hackathons, COUNT_FULL.hackathons),
    coop: coop === "unknown" ? null : COOP_SCORES[coop],
    research_activity: u.research_intensity ? RESEARCH_SCORES[u.research_intensity] : null,
    research_impact: isNum(u.research_impact?.overall) ? u.research_impact.overall / 100 : null,
  };
}

// Enrolment on a log scale between SIZE_RANGE.low and .high.
export function sizeValue(undergrads: number): number {
  const { low, high } = SIZE_RANGE;
  return clamp01(Math.log(Math.max(undergrads, 1) / low) / Math.log(high / low));
}

export function socialProxyValues(u: CampusRow): Record<SocialProxy, number | null> {
  const life = u.campus_life;
  const undergrads = isNum(life?.undergrads) && life.undergrads > 0 ? life.undergrads : null;
  return {
    setting: isNum(life?.locale) && life.locale in LOCALE_URBAN ? LOCALE_URBAN[life.locale] : null,
    size: undergrads ? sizeValue(undergrads) : null,
    residential: undergrads && isNum(life?.housing) ? clamp01(life.housing / undergrads / RESIDENTIAL_FULL_SHARE) : null,
    athletics: life?.athletics ? ATHLETICS_SCORES[life.athletics] : null,
    social_clubs: count(life?.social_clubs, COUNT_FULL.social_clubs),
  };
}

// ─── Combining ───────────────────────────────────────────────────────────

// What was actually measured for one kind: "Good" needs a direct club,
// team or event count plus enough figures in all; indirect figures alone
// (setting, size, housing, sport membership, co-op, research) are only ever
// "Partial", however many there are.
export function coverageFor(values: Record<string, number | null>, direct: readonly string[]): CampusCoverage {
  const known = knownCount(values);
  if (known === 0) return "Not available";
  const hasDirect = direct.some((p) => values[p] !== null && values[p] !== undefined);
  return hasDirect && known >= GOOD_COVERAGE_MIN_FIGURES ? "Good" : "Partial";
}

// Weighted mean of the known proxies; null when none of the weighted ones
// is known (left out, never a zero).
function weightedMean<P extends string>(values: Record<P, number | null>, weights: Partial<Record<P, number>>, flip: readonly P[] = []): number | null {
  let sum = 0;
  let total = 0;
  for (const [proxy, weight] of Object.entries(weights) as [P, number][]) {
    const value = values[proxy];
    if (value === null || !weight) continue;
    sum += weight * (flip.includes(proxy) ? 1 - value : value);
    total += weight;
  }
  return total > 0 ? sum / total : null;
}

// Each chosen option is scored on its own and the results averaged, so two
// opposite choices (e.g. "Big events" and "Quiet") balance out instead of
// one silently winning. No choice = "Not sure" (equal weights). Options
// with no known proxy (always "Greek life") are skipped; if none is left,
// the score is unknown.
function combine<P extends string, Pref extends string>(
  values: Record<P, number | null>,
  prefs: Pref[],
  weights: Record<Pref, Partial<Record<P, number>>>,
  flips: Partial<Record<Pref, readonly P[]>> = {}
): number | null {
  const chosen = prefs.length === 0 ? (["not_sure"] as Pref[]) : prefs;
  const scores = chosen.map((p) => weightedMean(values, weights[p], flips[p])).filter(isNum);
  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
}

export type CampusScore = {
  score: number | null;
  coverage: CampusCoverage;
  known: number; // figures known for this kind
  direct: number; // of which club, team or event counts
};

const directCount = (values: Record<string, number | null>, direct: readonly string[]) =>
  direct.filter((p) => values[p] !== null && values[p] !== undefined).length;

export const knownCount = (values: Record<string, number | null>) => Object.values(values).filter((v) => v !== null).length;
const round2 = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);

// With no choices ("Not sure"), the score stored at import time is used;
// the student's choices re-weight the same proxies here.
export function academicCommunityScore(u: CampusRow, prefs: AcademicPref[] = []): CampusScore {
  const values = academicProxyValues(u);
  const stored = u.campus_life?.academic_score;
  const score = prefs.length === 0 && stored !== undefined ? stored : round2(combine(values, prefs, ACADEMIC_PREF_WEIGHTS));
  return {
    score,
    coverage: coverageFor(values, DIRECT_PROXIES.academic),
    known: knownCount(values),
    direct: directCount(values, DIRECT_PROXIES.academic),
  };
}

export function socialFunScore(u: CampusRow, prefs: SocialPref[] = []): CampusScore {
  const values = socialProxyValues(u);
  const stored = u.campus_life?.social_score;
  const score =
    prefs.length === 0 && stored !== undefined ? stored : round2(combine(values, prefs, SOCIAL_PREF_WEIGHTS, { quiet_close_knit: QUIET_FLIPPED }));
  return {
    score,
    coverage: coverageFor(values, DIRECT_PROXIES.social),
    known: knownCount(values),
    direct: directCount(values, DIRECT_PROXIES.social),
  };
}

// The student's optional choices, keeping only known values.
export function academicPrefsOf(profile: Pick<Profile, "campus_academic_prefs">): AcademicPref[] {
  return (profile.campus_academic_prefs ?? []).filter((p) => p in ACADEMIC_PREF_WEIGHTS);
}
export function socialPrefsOf(profile: Pick<Profile, "campus_social_prefs">): SocialPref[] {
  return (profile.campus_social_prefs ?? []).filter((p) => p in SOCIAL_PREF_WEIGHTS);
}
