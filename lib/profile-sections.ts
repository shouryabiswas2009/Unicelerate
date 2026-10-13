import { focusesOf } from "@/lib/focus";
import type { Profile } from "@/lib/types";

// The profile page is split into sections, each saved on its own
// (lib/actions/profile.ts, saveProfileSection). To keep ONE validation path
// (lib/profile-validation.ts validates a whole profile), a section save
// starts from the saved profile, replaces only that section's fields with
// what was submitted, and validates the result. So saving "Money" can never
// wipe your majors.

export const PROFILE_SECTIONS = ["about", "academics", "study", "money", "priorities"] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

// The form fields each section owns.
export const SECTION_FIELDS: Record<ProfileSection, readonly string[]> = {
  about: ["full_name", "country"],
  academics: ["grade_system", "grade_input", "gpa_percentage", "sat_score", "ielts_score"],
  study: ["intended_majors", "preferred_degree_level", "preferred_countries"],
  money: ["budget_min", "budget_max", "display_currency"],
  priorities: ["focuses", "campus_academic_prefs", "campus_social_prefs", "visa_mode", "visa_weight", "stay_after"],
};

export function isProfileSection(value: string): value is ProfileSection {
  return (PROFILE_SECTIONS as readonly string[]).includes(value);
}

// A saved profile as the form would submit it.
export function profileToFormData(profile: Profile): FormData {
  const fd = new FormData();
  const put = (name: string, value: unknown) => {
    if (value !== null && value !== undefined) fd.append(name, String(value));
  };
  put("full_name", profile.full_name);
  put("country", profile.country);
  for (const m of profile.intended_majors ?? []) put("intended_majors", m);
  for (const c of profile.preferred_countries ?? []) put("preferred_countries", c);
  put("grade_system", profile.grade_system ?? "percentage");
  put("grade_input", profile.grade_input);
  put("gpa_percentage", profile.gpa_percentage);
  put("ielts_score", profile.ielts_score);
  put("sat_score", profile.sat_score);
  put("budget_min", profile.budget_min);
  put("budget_max", profile.budget_max);
  put("preferred_degree_level", profile.preferred_degree_level);
  for (const f of focusesOf(profile)) put("focuses", f);
  for (const p of profile.campus_academic_prefs ?? []) put("campus_academic_prefs", p);
  for (const p of profile.campus_social_prefs ?? []) put("campus_social_prefs", p);
  put("display_currency", profile.display_currency);
  put("visa_mode", profile.visa_mode);
  put("visa_weight", profile.visa_weight);
  put("stay_after", profile.stay_after);
  return fd;
}

// The saved profile with one section replaced by what was submitted.
export function mergeSectionForm(profile: Profile, section: ProfileSection, submitted: FormData): FormData {
  const owned = new Set(SECTION_FIELDS[section]);
  const merged = new FormData();
  for (const [name, value] of profileToFormData(profile).entries()) {
    if (!owned.has(name)) merged.append(name, value);
  }
  for (const name of owned) {
    for (const value of submitted.getAll(name)) merged.append(name, value);
  }
  return merged;
}
