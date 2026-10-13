"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { VISA_MODES } from "@/lib/visa";
import { SECTION_FIELDS, isProfileSection, mergeSectionForm } from "@/lib/profile-sections";
import { validateCourses } from "@/lib/courses";
import type { Profile } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";
import {
  validateProfileForm,
  type ProfileFieldErrors,
} from "@/lib/profile-validation";
import { skippedNotice, writeSkippingPendingColumns } from "@/lib/pending-migrations";

export type ProfileFormState =
  | {
      error?: string;
      // Saved, but with a caveat (e.g. a column whose migration isn't run).
      notice?: string;
      fieldErrors?: ProfileFieldErrors;
      // What the student typed, so the form can refill itself. React 19
      // resets a form after its action runs, which would otherwise wipe
      // their input whenever validation fails.
      values?: Record<string, string>;
      focuses?: string[]; // ticked checkboxes, echoed like `values`
    }
  | undefined;

// Single-value inputs to echo back. Tag inputs (majors, countries) and the
// degree-level select keep their own state, so they don't need this.
const ECHOED_FIELDS = [
  "full_name",
  "country",
  "gpa_percentage",
  "grade_input",
  "ielts_score",
  "sat_score",
  "budget_min",
  "budget_max",
];

function submittedValues(formData: FormData): Record<string, string> {
  return Object.fromEntries(
    ECHOED_FIELDS.map((name) => [name, String(formData.get(name) ?? "")])
  );
}

export async function saveProfile(
  _prevState: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in to save a profile." };
  }

  // Validate on the server even though the inputs have min/max attributes:
  // browser checks are easy to bypass.
  const result = validateProfileForm(formData);
  const courseCheck = formData.has("courses_present") ? validateCourses(formData) : null;
  if (courseCheck && !courseCheck.ok) {
    return {
      error: courseCheck.error,
      values: submittedValues(formData),
      focuses: formData.getAll("focuses").map(String),
    };
  }
  if (!result.ok) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: result.errors,
      values: submittedValues(formData),
      focuses: formData.getAll("focuses").map(String),
    };
  }

  // If migration_009 hasn't been run yet, the profile still saves without
  // focuses, and the student is told why their choice didn't stick.
  const {
    result: { error },
    skipped,
  } = await writeSkippingPendingColumns({ id: user.id, ...result.data }, (row) =>
    supabase.from("profiles").upsert(row)
  );

  if (error) {
    return { error: error.message, values: submittedValues(formData), focuses: formData.getAll("focuses").map(String) };
  }
  const courses = await saveCoursesIfPresent(supabase, user.id, formData);
  if (courses.error || courses.notice) {
    return { error: courses.error, notice: courses.notice, values: submittedValues(formData), focuses: formData.getAll("focuses").map(String) };
  }
  if (skipped.length > 0) {
    return { notice: skippedNotice(skipped), values: submittedValues(formData), focuses: formData.getAll("focuses").map(String) };
  }

  redirect("/recommendations");
}

// The quick "Visa and work rights" switch on the recommendations page.
// Only changes visa_mode; the weight and the stay question stay as saved
// (Medium and "unsure" count until the student sets them on the profile).
export async function setVisaMode(formData: FormData): Promise<void> {
  const mode = String(formData.get("visa_mode") ?? "");
  if (!(VISA_MODES as readonly string[]).includes(mode)) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await writeSkippingPendingColumns({ visa_mode: mode }, (row) => supabase.from("profiles").update(row).eq("id", user.id));
  revalidatePath("/recommendations");
}

export type SectionState =
  | {
      ok?: boolean;
      savedAt?: number;
      error?: string;
      notice?: string;
      fieldErrors?: ProfileFieldErrors;
      values?: Record<string, string>;
    }
  | undefined;

// Saves one section of the profile page (lib/profile-sections.ts): the
// saved profile with only this section's fields replaced, validated as a
// whole by the same rules as before, so a section can never wipe another.
export async function saveProfileSection(_prev: SectionState, formData: FormData): Promise<SectionState> {
  const section = String(formData.get("section") ?? "");
  if (!isProfileSection(section)) return { error: "Unknown section." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in to save your profile." };

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle<Profile>();
  if (!profile) return { error: "Create your profile first (the form below saves everything at once)." };

  const echo = Object.fromEntries(SECTION_FIELDS[section].map((name) => [name, String(formData.get(name) ?? "")]));
  if (formData.has("courses_present")) {
    const courses = validateCourses(formData);
    if (!courses.ok) return { error: courses.error, values: echo };
  }
  const result = validateProfileForm(mergeSectionForm(profile, section, formData));
  if (!result.ok) {
    const own = Object.keys(result.errors).some((k) => SECTION_FIELDS[section].includes(k));
    return {
      error: own ? "Please fix the highlighted fields." : "Another section has a problem; check the fields marked there.",
      fieldErrors: result.errors,
      values: echo,
    };
  }

  const {
    result: { error },
    skipped,
  } = await writeSkippingPendingColumns({ id: user.id, ...result.data }, (row) => supabase.from("profiles").upsert(row));
  if (error) return { error: "Couldn't save. Please try again.", values: echo };
  const courses = await saveCoursesIfPresent(supabase, user.id, formData);
  if (courses.error) return { error: courses.error, values: echo };

  revalidatePath("/profile");
  revalidatePath("/recommendations");
  return { ok: true, savedAt: Date.now(), notice: courses.notice ?? (skipped.length ? skippedNotice(skipped) : undefined) };
}

// Replaces the student's course list when the form included the course
// editor (the hidden "courses_present" field), so saving another section
// never touches courses. Returns a notice instead of failing the whole save
// if the courses table doesn't exist yet (migration_022 not run).
async function saveCoursesIfPresent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  formData: FormData
): Promise<{ error?: string; notice?: string }> {
  if (!formData.has("courses_present")) return {};
  const result = validateCourses(formData);
  if (!result.ok) return { error: result.error };
  const removed = await supabase.from("profile_courses").delete().eq("user_id", userId);
  if (removed.error) {
    const pending = removed.error.code === "PGRST205" || removed.error.code === "42P01";
    return pending ? { notice: "Courses can't be saved yet (a database step is pending); everything else was saved." } : { error: "Couldn't save your courses." };
  }
  if (result.courses.length === 0) return {};
  const inserted = await supabase.from("profile_courses").insert(result.courses.map((c) => ({ ...c, user_id: userId })));
  return inserted.error ? { error: "Couldn't save your courses." } : {};
}
