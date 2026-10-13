import { scoreUniversity } from "@/lib/matching";
import type { AdmissionChance } from "@/lib/matching";
import { focusesOf } from "@/lib/focus";
import type { Focus, Profile, UniversitySummary } from "@/lib/types";

// The "What if?" panel on the details page: the student moves sliders for
// GPA, SAT and IELTS and sees the match score and admission estimate
// recomputed. It only re-runs the same pure scoring functions the rest of
// the app uses (scoreUniversity), on a copy of the profile; nothing is saved.

export type WhatIfKey = "gpa_percentage" | "sat_score" | "ielts_score";

// Same ranges and steps as the profile form (lib/profile-validation.ts).
export const WHAT_IF_RANGES: Record<WhatIfKey, { label: string; min: number; max: number; step: number; tryValue: number }> = {
  gpa_percentage: { label: "GPA / percentage", min: 0, max: 100, step: 1, tryValue: 85 },
  sat_score: { label: "SAT", min: 400, max: 1600, step: 10, tryValue: 1200 },
  ielts_score: { label: "IELTS", min: 0, max: 9, step: 0.5, tryValue: 6.5 },
};

// SAT and IELTS may be "not taken" (null); GPA is always set. The two
// campus-life focuses can be switched on or off too ("what if campus life
// counted?"); left out, the saved choice stays.
export type WhatIfValues = {
  gpa_percentage: number;
  sat_score: number | null;
  ielts_score: number | null;
  academic_community?: boolean;
  social_life?: boolean;
};

const CAMPUS_FOCUSES = ["academic_community", "social_life"] as const satisfies readonly Focus[];

export function valuesFromProfile(profile: Profile): WhatIfValues {
  const focuses = focusesOf(profile);
  return {
    gpa_percentage: profile.gpa_percentage,
    sat_score: profile.sat_score,
    ielts_score: profile.ielts_score,
    academic_community: focuses.includes("academic_community"),
    social_life: focuses.includes("social_life"),
  };
}

// The saved focuses with the campus-life ones switched as chosen.
function whatIfFocuses(profile: Profile, values: WhatIfValues): Focus[] {
  const focuses = focusesOf(profile).filter((f) => !(CAMPUS_FOCUSES as readonly Focus[]).includes(f) || values[f as (typeof CAMPUS_FOCUSES)[number]] !== false);
  for (const f of CAMPUS_FOCUSES) if (values[f] && !focuses.includes(f)) focuses.push(f);
  return focuses;
}

// Keeps a slider value inside its range and on its step (e.g. SAT 1347 → 1350),
// so the scoring never sees a score the real form wouldn't accept.
export function snapToStep(key: WhatIfKey, value: number): number {
  const { min, max, step } = WHAT_IF_RANGES[key];
  const clamped = Math.min(max, Math.max(min, value));
  const snapped = Math.round((clamped - min) / step) * step + min;
  // Avoid 6.499999 from floating-point steps.
  return Number(snapped.toFixed(2));
}

// A copy of the profile with the slider values in place of the real ones.
export function applyWhatIf(profile: Profile, values: WhatIfValues): Profile {
  return {
    ...profile,
    gpa_percentage: snapToStep("gpa_percentage", values.gpa_percentage),
    sat_score: values.sat_score === null ? null : snapToStep("sat_score", values.sat_score),
    ielts_score: values.ielts_score === null ? null : snapToStep("ielts_score", values.ielts_score),
    focuses: whatIfFocuses(profile, values),
  };
}

export type WhatIfOutcome = {
  score: number;
  chance: AdmissionChance;
  chanceSource: "model" | "rule";
  // Admission probability from the demo model, or null when the model
  // doesn't apply to this school / degree level.
  probability: number | null;
};

function outcome(profile: Profile, university: UniversitySummary): WhatIfOutcome {
  const entry = scoreUniversity(profile, university);
  return {
    score: entry.match.score,
    chance: entry.match.chance,
    chanceSource: entry.match.chanceSource,
    probability: entry.prediction?.probability ?? null,
  };
}

export type WhatIfComparison = {
  actual: WhatIfOutcome;
  whatIf: WhatIfOutcome;
  scoreChange: number; // points, what-if minus actual
  probabilityChange: number | null; // percentage points, when both are known
  changed: boolean; // any slider differs from the saved profile
};

export function compareWhatIf(profile: Profile, university: UniversitySummary, values: WhatIfValues): WhatIfComparison {
  const actual = outcome(profile, university);
  const whatIfProfile = applyWhatIf(profile, values);
  const whatIf = outcome(whatIfProfile, university);
  return {
    actual,
    whatIf,
    scoreChange: whatIf.score - actual.score,
    probabilityChange:
      actual.probability !== null && whatIf.probability !== null
        ? Math.round(whatIf.probability * 100) - Math.round(actual.probability * 100)
        : null,
    changed:
      whatIfProfile.gpa_percentage !== profile.gpa_percentage ||
      whatIfProfile.sat_score !== profile.sat_score ||
      whatIfProfile.ielts_score !== profile.ielts_score ||
      [...whatIfProfile.focuses!].sort().join() !== [...focusesOf(profile)].sort().join(),
  };
}

// "+5", "−3", "±0" for the change labels.
export function signed(n: number): string {
  if (n === 0) return "±0";
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}
