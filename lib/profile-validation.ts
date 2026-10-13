import { canonicalCountry } from "@/lib/countries";
import { readList, readNumber, readText } from "@/lib/form-data";
import { DEFAULT_DISPLAY_CURRENCY, isDisplayCurrency } from "@/lib/display-currency";
import { convertsInput, gradeToPercentage, isGradeSystem, type GradeSystem } from "@/lib/grades";
import { STAY_AFTER, VISA_MODES, VISA_WEIGHTS } from "@/lib/visa";
import { ACADEMIC_PREFS, SOCIAL_PREFS } from "@/lib/campus-life-config";
import {
  DEGREE_LEVELS,
  FOCUSES,
  type DegreeLevel,
  type Focus,
  type ProfileInput,
} from "@/lib/types";

export type ProfileFieldErrors = Partial<Record<keyof ProfileInput, string>>;

export type ProfileValidationResult =
  | { ok: true; data: ProfileInput }
  | { ok: false; errors: ProfileFieldErrors };

// Kept as a plain function (no form library) so it can be unit-tested and
// so every rule is visible in one place. The same limits are enforced again
// by check constraints in supabase/migration_003_scores_and_degree_levels.sql.
export function validateProfileForm(formData: FormData): ProfileValidationResult {
  const errors: ProfileFieldErrors = {};

  const full_name = readText(formData, "full_name");
  if (!full_name) errors.full_name = "Please enter your name.";

  const country = canonicalCountry(readText(formData, "country"));
  if (!country) errors.country = "Please enter the country you live in.";

  const intended_majors = readList(formData, "intended_majors");
  if (intended_majors.length === 0) {
    errors.intended_majors = "Add at least one major you're considering.";
  }

  // "UK" and "United Kingdom" are stored the same way (lib/countries.ts).
  const preferred_countries = [...new Set(readList(formData, "preferred_countries").map(canonicalCountry))];
  if (preferred_countries.length === 0) {
    errors.preferred_countries = "Add at least one country you'd like to study in.";
  }

  // Grades: a percentage, or another system converted with its board's
  // published table (lib/grades.ts). Without a system (older forms), the
  // percentage field is used as before.
  const systemText = readText(formData, "grade_system") || "percentage";
  const grade_system: GradeSystem = isGradeSystem(systemText) ? systemText : "percentage";
  if (!isGradeSystem(systemText)) errors.grade_system = "Choose a grading system from the list.";
  const converts = convertsInput(grade_system);
  const grade_input = converts ? readText(formData, "grade_input") : readText(formData, "gpa_percentage");
  const grades = gradeToPercentage(grade_system, grade_input);
  if (!grades.ok) {
    if (converts) errors.grade_input = grades.error;
    else errors.gpa_percentage = "GPA / percentage must be a number from 0 to 100.";
  }
  const gpa = grades.ok ? grades.percentage : null;

  // IELTS bands go up in halves, so 6.5 is valid but 6.3 isn't.
  const ielts = readNumber(formData, "ielts_score");
  if (
    ielts !== null &&
    (Number.isNaN(ielts) || ielts < 0 || ielts > 9 || !Number.isInteger(ielts * 2))
  ) {
    errors.ielts_score = "IELTS must be from 0 to 9 in steps of 0.5 (e.g. 6.5).";
  }

  // SAT totals are always multiples of 10.
  const sat = readNumber(formData, "sat_score");
  if (
    sat !== null &&
    (Number.isNaN(sat) || !Number.isInteger(sat) || sat < 400 || sat > 1600 || sat % 10 !== 0)
  ) {
    errors.sat_score = "SAT must be from 400 to 1600 in steps of 10 (e.g. 1350).";
  }

  const budget_min = readNumber(formData, "budget_min") ?? 0;
  const budget_max = readNumber(formData, "budget_max");
  if (budget_max === null || Number.isNaN(budget_max) || budget_max <= 0) {
    errors.budget_max = "Enter the most you can spend per year.";
  } else if (Number.isNaN(budget_min) || budget_min < 0) {
    errors.budget_min = "Minimum budget can't be negative.";
  } else if (budget_min > budget_max) {
    errors.budget_min = "Minimum budget can't be more than your maximum.";
  }

  const level = readText(formData, "preferred_degree_level");
  if (!DEGREE_LEVELS.includes(level as DegreeLevel)) {
    errors.preferred_degree_level = "Choose a degree level.";
  }

  // Any number of focuses; none ticked means Balanced. Kept in a fixed
  // order and without repeats, so the same choice is always stored the same.
  const ticked = readList(formData, "focuses");
  if (!ticked.every((f) => FOCUSES.includes(f as Focus))) {
    errors.focuses = "Pick from the options listed.";
  }
  const focuses = FOCUSES.filter((f) => ticked.includes(f));

  // Optional follow-ups to the two campus-life focuses, same rules.
  const academicTicked = readList(formData, "campus_academic_prefs");
  const socialTicked = readList(formData, "campus_social_prefs");
  if (!academicTicked.every((p) => (ACADEMIC_PREFS as readonly string[]).includes(p))) errors.campus_academic_prefs = "Pick from the options listed.";
  if (!socialTicked.every((p) => (SOCIAL_PREFS as readonly string[]).includes(p))) errors.campus_social_prefs = "Pick from the options listed.";
  const campus_academic_prefs = ACADEMIC_PREFS.filter((p) => academicTicked.includes(p));
  const campus_social_prefs = SOCIAL_PREFS.filter((p) => socialTicked.includes(p));

  // Only currencies we have an official rate for; empty means US dollars.
  const display_currency = readText(formData, "display_currency") || DEFAULT_DISPLAY_CURRENCY;
  if (!isDisplayCurrency(display_currency)) {
    errors.display_currency = "Choose a currency from the list.";
  }

  // Visa and work rights (lib/visa.ts). Blank means "ignore"; the weight and
  // the stay question only matter when the student factors the visa in.
  const visaText = readText(formData, "visa_mode") || "ignore";
  if (!(VISA_MODES as readonly string[]).includes(visaText)) errors.visa_mode = "Choose one of the options.";
  const weightText = readText(formData, "visa_weight") || "medium";
  if (!(VISA_WEIGHTS as readonly string[]).includes(weightText)) errors.visa_weight = "Choose Low, Medium or High.";
  const stayText = readText(formData, "stay_after");
  if (stayText && !(STAY_AFTER as readonly string[]).includes(stayText)) errors.stay_after = "Choose one of the options.";
  const visa_mode = visaText as NonNullable<ProfileInput["visa_mode"]>;
  const factor = visa_mode === "factor";

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      full_name,
      country,
      intended_majors,
      preferred_countries,
      // Safe casts: every branch that leaves these null/NaN set an error above.
      gpa_percentage: gpa as number,
      grade_system,
      grade_input: converts ? grade_input : null,
      grade_basis: grades.ok ? grades.basis : "exact",
      ielts_score: ielts,
      sat_score: sat,
      budget_min,
      budget_max: budget_max as number,
      preferred_degree_level: level as DegreeLevel,
      focuses,
      campus_academic_prefs,
      campus_social_prefs,
      display_currency,
      visa_mode,
      visa_weight: factor ? (weightText as NonNullable<ProfileInput["visa_weight"]>) : null,
      stay_after: stayText ? (stayText as NonNullable<ProfileInput["stay_after"]>) : null,
    },
  };
}
