import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileCourse } from "@/lib/courses";

// The signed-in student's courses (profile_courses, migration_022). Any
// error (for example the migration not run yet) reads as "no courses", so
// scoring falls back to the overall grade exactly as before.
export async function getProfileCourses(supabase: SupabaseClient, userId: string): Promise<ProfileCourse[]> {
  const { data, error } = await supabase
    .from("profile_courses")
    .select("subject, level, grade_percentage, grade_year")
    .eq("user_id", userId)
    .order("created_at")
    .returns<ProfileCourse[]>();
  if (error || !data) return [];
  return data.map((c) => ({ ...c, grade_percentage: Number(c.grade_percentage) }));
}
