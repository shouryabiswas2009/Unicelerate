import { BALANCED_FOCUSES, FOCUSES, type CoopProgram, type Focus, type Profile, type ResearchIntensity } from "@/lib/types";

// "What matters most to me": a student ticks any number of focuses (none =
// Balanced). They steer the match score (lib/matching.ts, focusWeights)
// and the starting slider weights on the offers page (lib/offers.ts). Every
// label and description the student sees comes from this file.

export const BALANCED_LABEL = "Balanced";

export const FOCUS_LABELS: Record<Focus, string> = {
  academic: "Academic reputation",
  work_experience: "Work experience",
  research: "Research",
  affordability: "Affordability",
  academic_community: "Academic & career community",
  social_life: "Campus social life & fun",
};

// The one-line description under each checkbox on the profile form. It
// names the signals actually used, so it never promises data we don't have.
export const FOCUS_DESCRIPTIONS: Record<Focus, string> = {
  academic: "Rankings (overall and in your subject) and how many students stay and graduate.",
  work_experience: "Schools with co-op or internship programs (a mandatory co-op counts more than an optional one).",
  research: "How research-intensive the university is (Carnegie classification) and your subject's ranking.",
  affordability: "The lowest total cost — tuition plus living costs — compared with your budget.",
  academic_community: "Published design and project teams, clubs, co-op and research activity. A proxy, not a rating.",
  social_life: "Published setting, size, campus housing and varsity sport membership. A proxy, not a rating of how fun a place is.",
};

export const BALANCED_DESCRIPTION =
  "Leave everything unticked for Balanced: reputation, work experience, research and cost each count a little, none more than the others. The two campus-life focuses only count when you tick them.";

// The focuses Balanced spreads its points over (the campus-life ones only
// count when ticked). Re-exported for the scoring code.
export { BALANCED_FOCUSES };

// The student's focuses, in a fixed order. Before migration_009 the profile
// only has the old single primary_focus, so fall back to that.
export function focusesOf(profile: Pick<Profile, "focuses" | "primary_focus">): Focus[] {
  const raw: string[] = Array.isArray(profile.focuses)
    ? profile.focuses
    : profile.primary_focus && profile.primary_focus !== "balanced"
      ? [profile.primary_focus]
      : [];
  return FOCUSES.filter((f) => raw.includes(f));
}

// "research", "research and work experience", "academic reputation,
// research and affordability". Lower-case so it reads inside a sentence.
export function joinFocuses(focuses: Focus[]): string {
  const names = focuses.map((f) => FOCUS_LABELS[f].toLowerCase());
  if (names.length <= 1) return names[0] ?? BALANCED_LABEL.toLowerCase();
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// For headings: "Balanced" or "Research + Work experience".
export function focusSummary(focuses: Focus[]): string {
  return focuses.length === 0 ? BALANCED_LABEL : focuses.map((f) => FOCUS_LABELS[f]).join(" + ");
}

export const RESEARCH_LABELS: Record<ResearchIntensity, string> = {
  very_high: "Very high research activity (R1)",
  high: "High research activity (R2)",
  doctoral_professional: "Doctoral/professional university",
  non_doctoral: "Not a doctoral research university",
};

// How much each Carnegie level and co-op kind counts (0..1): in
// lib/scoring-config.ts, so import scripts can use them too.
export { COOP_SCORES, RESEARCH_SCORES } from "@/lib/scoring-config";

export const COOP_LABELS: Record<CoopProgram, string> = {
  mandatory: "Mandatory co-op program",
  optional: "Optional co-op / internship program",
  none: "No co-op program",
  unknown: "Not available",
};

