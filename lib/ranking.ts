import { countryMatches, type AdmissionChance, type MatchResult } from "@/lib/matching";
import { qualityScore, type QualityPart } from "@/lib/quality";
import {
  FAR_OVER_BUDGET_RATIO,
  GOOD_QUALITY,
  HIGH_QUALITY,
  NEUTRAL_PEER_WINDOW,
  NEUTRAL_PEERS_MIN,
  PLAUSIBILITY_UNKNOWN,
  PLAUSIBILITY_FLOOR,
  P_FULL,
  QUALITY_UNKNOWN,
  RULE_PLAUSIBILITY,
  VISA_BEST_INFLUENCE,
} from "@/lib/scoring-config";
import type { Profile, UniversitySummary } from "@/lib/types";

// Ranks schools the way a good counsellor would: the best school you can
// realistically get into first, not the easiest one.
//
//   realistic = quality × plausibility, for schools that pass the fit gate
//
// - Fit gate: schools that fail a hard requirement (degree level, far over
//   budget, outside the countries you chose) sort below every school that
//   passes, whatever their other scores.
// - Quality (lib/quality.ts): how strong the school is: the Unicelerate
//   strength index for shared schools (lib/strength.ts, computed at import
//   time), published figures for a student's own school; unknown counts as
//   the middle (QUALITY_UNKNOWN).
// - Plausibility: FLOOR + (1 - FLOOR) × clamp(P / P_FULL, 0, 1) from the
//   admission estimate P;
//   the Reach/Match/Safety rule when there's no estimate; a neutral value
//   when there's no admission data at all.
// All the numbers are in lib/scoring-config.ts.

export type RankInfo = {
  quality: number | null; // null = quality not available
  qualityParts: QualityPart[];
  plausibility: number; // 0..1
  plausibilitySource: "model" | "rule" | "unknown";
  gate: { passes: boolean; reasons: string[] };
  realistic: number; // 0..1, the "Best you can get into" score
  // 1 unless the student factors in the visa (lib/visa.ts): then up to
  // VISA_BEST_INFLUENCE less for a weak visa score. Never changes quality.
  visaFactor: number;
  reason: string; // one line for the card
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function plausibilityFrom(
  probability: number | null,
  chance: AdmissionChance
): { value: number; source: RankInfo["plausibilitySource"] } {
  if (probability !== null) {
    return { value: PLAUSIBILITY_FLOOR + (1 - PLAUSIBILITY_FLOOR) * clamp01(probability / P_FULL), source: "model" };
  }
  if (chance === "Not enough data") return { value: PLAUSIBILITY_UNKNOWN, source: "unknown" };
  return { value: RULE_PLAUSIBILITY[chance], source: "rule" };
}

export const OUTSIDE_COUNTRIES = "outside the countries you chose";

export function fitGate(profile: Profile, university: UniversitySummary, match: MatchResult): RankInfo["gate"] {
  const reasons: string[] = [];
  if (!match.eligible) reasons.push(`doesn't list ${profile.preferred_degree_level} programs`);
  const { tuition } = university;
  if (tuition !== null && profile.budget_max > 0 && tuition > profile.budget_max * FAR_OVER_BUDGET_RATIO) {
    reasons.push("tuition is far over your budget");
  }
  if (profile.preferred_countries.length > 0 && !countryMatches(profile, university)) {
    reasons.push(OUTSIDE_COUNTRIES);
  }
  return { passes: reasons.length === 0, reasons };
}

// "Very selective" means a reach for anyone, whatever their profile.
const VERY_SELECTIVE_BELOW = 15; // % admitted

function reasonLine(
  university: UniversitySummary,
  chance: AdmissionChance,
  quality: number | null,
  gate: RankInfo["gate"]
): string {
  if (!gate.passes) return `Below the others because it ${gate.reasons.join(" and ")}.`;
  // An estimated index is the average of similar schools, so it says
  // nothing about this school in particular: no "highly regarded" for it.
  const regard =
    quality === null
      ? null
      : university.strength_is_estimate
        ? "Strength estimated from similar schools"
        : quality >= HIGH_QUALITY
          ? "Highly regarded"
          : quality >= GOOD_QUALITY
            ? "Well regarded"
            : "Fewer signs of strong outcomes";
  const verySelective = university.acceptance_rate !== null && university.acceptance_rate < VERY_SELECTIVE_BELOW;
  if (chance === "Reach") {
    if (verySelective) return `${regard ?? "Very selective"}, and a reach for almost everyone: apply, but don't count on it.`;
    return `${regard ?? "Quality data not available"}, but a reach for you.`;
  }
  if (chance === "Not enough data") {
    return regard ? `${regard}; no admission data to judge your chances.` : "Not enough published data to judge quality or your chances.";
  }
  const reach = chance === "Safety" ? "a likely admit" : "within your reach";
  return regard ? `${regard} and ${reach}.` : `Quality data not available; ${reach}.`;
}

export function rankUniversity(
  profile: Profile,
  university: UniversitySummary,
  match: MatchResult,
  probability: number | null,
  // The visa score when the student factors the visa in (else null).
  visaScore: number | null = null
): RankInfo {
  const { score: quality, parts } = qualityScore(profile, university);
  const visaFactor = visaScore === null ? 1 : 1 - VISA_BEST_INFLUENCE[profile.visa_weight ?? "medium"] * (1 - visaScore);
  const plausibility = plausibilityFrom(probability, match.chance);
  const gate = fitGate(profile, university, match);
  return {
    quality,
    qualityParts: parts,
    plausibility: plausibility.value,
    plausibilitySource: plausibility.source,
    gate,
    realistic: (quality ?? QUALITY_UNKNOWN) * plausibility.value * visaFactor,
    visaFactor,
    reason: reasonLine(university, match.chance, quality, gate),
  };
}

// When a student filters to a country themselves, schools there are judged
// on their merits: "outside the countries you chose" no longer holds them
// back (the other gate reasons still do).
export function withoutCountryGate<T extends Ranked>(entry: T): T {
  const reasons = entry.rank.gate.reasons.filter((r) => r !== OUTSIDE_COUNTRIES);
  if (reasons.length === entry.rank.gate.reasons.length) return entry;
  const gate = { passes: reasons.length === 0, reasons };
  return { ...entry, rank: { ...entry.rank, gate, reason: reasonLine(entry.university, entry.match.chance, entry.rank.quality, gate) } };
}

// ─── Sort orders ─────────────────────────────────────────────────────────

type Ranked = { university: UniversitySummary; match: MatchResult; rank: RankInfo };

const byName = (a: Ranked, b: Ranked) => a.university.name.localeCompare(b.university.name);
const gateFirst = (a: Ranked, b: Ranked) => Number(b.rank.gate.passes) - Number(a.rank.gate.passes);

// "Best you can get into" (the default).
export function compareBest(a: Ranked, b: Ranked): number {
  return (
    gateFirst(a, b) ||
    b.rank.realistic - a.rank.realistic ||
    (b.rank.quality ?? QUALITY_UNKNOWN) - (a.rank.quality ?? QUALITY_UNKNOWN) ||
    // At the same level, a measured strength before one estimated from
    // similar schools.
    Number(a.university.strength_is_estimate === true) - Number(b.university.strength_is_estimate === true) ||
    b.match.score - a.match.score ||
    byName(a, b)
  );
}

// "Safest first": most likely admits first, stronger schools first among
// equally likely ones.
export function compareSafest(a: Ranked, b: Ranked): number {
  return (
    gateFirst(a, b) ||
    b.rank.plausibility - a.rank.plausibility ||
    (b.rank.quality ?? QUALITY_UNKNOWN) - (a.rank.quality ?? QUALITY_UNKNOWN) ||
    b.match.score - a.match.score ||
    byName(a, b)
  );
}

// ─── Reach / Match / Safety groups ───────────────────────────────────────

export const CHANCE_GROUPS: AdmissionChance[] = ["Reach", "Match", "Safety", "Not enough data"];

// Groups like a counsellor's list: each group sorted by quality (strongest
// first), with schools failing the fit gate at the end of their group.
// keepOrder: the entries are already in an order the student picked
// ("Lowest tuition" and so on), so each group keeps it instead of being
// re-sorted by strength (which made those sorts do nothing here).
export function groupByChance<T extends Ranked>(
  entries: T[],
  { keepOrder = false }: { keepOrder?: boolean } = {}
): { chance: AdmissionChance; entries: T[] }[] {
  return CHANCE_GROUPS.map((chance) => {
    const inGroup = entries.filter((e) => e.match.chance === chance);
    return {
      chance,
      entries: keepOrder
        ? inGroup
        : inGroup.sort(
            (a, b) =>
              gateFirst(a, b) ||
              (b.rank.quality ?? QUALITY_UNKNOWN) - (a.rank.quality ?? QUALITY_UNKNOWN) ||
              b.rank.plausibility - a.rank.plausibility ||
              byName(a, b)
          ),
    };
  }).filter((group) => group.entries.length > 0);
}

// ─── Neutral values for unknowns ─────────────────────────────────────────
// A school with no published quality figures counts as the median quality
// of the student's list. A school with no admission data (most non-US
// schools) borrows the chances of known schools of similar strength in the
// same list (NEUTRAL_PEER_WINDOW in lib/scoring-config.ts): for a strong
// student an unknown Oxford is about as reachable as MIT, not a sure admit,
// and for a weaker student an unknown top school isn't put above schools
// they can actually get into. The card still says "not enough data".
export function withNeutralUnknowns<T extends Ranked>(entries: T[]): T[] {
  const median = (values: number[], fallback: number) => {
    if (values.length === 0) return fallback;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  const neutralQuality = median(
    entries.map((e) => e.rank.quality).filter((q): q is number => q !== null),
    QUALITY_UNKNOWN
  );
  const known = entries.filter((e) => e.rank.plausibilitySource !== "unknown");
  const fallback = Math.min(median(known.map((e) => e.rank.plausibility), PLAUSIBILITY_UNKNOWN), PLAUSIBILITY_UNKNOWN);
  const qualityOf = (e: T) => e.rank.quality ?? neutralQuality;
  const peerPlausibility = (quality: number) => {
    const peers = known.filter((k) => Math.abs(qualityOf(k) - quality) <= NEUTRAL_PEER_WINDOW);
    return peers.length >= NEUTRAL_PEERS_MIN ? median(peers.map((k) => k.rank.plausibility), fallback) : fallback;
  };
  return entries.map((e) => {
    if (e.rank.quality !== null && e.rank.plausibilitySource !== "unknown") return e;
    const plausibility = e.rank.plausibilitySource === "unknown" ? peerPlausibility(qualityOf(e)) : e.rank.plausibility;
    const realistic = (e.rank.quality ?? neutralQuality) * plausibility * (e.rank.visaFactor ?? 1);
    return { ...e, rank: { ...e.rank, plausibility, realistic } };
  });
}
