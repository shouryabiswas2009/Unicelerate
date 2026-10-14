import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CompareControls } from "@/components/universities/compare-controls";
import { CompareTable } from "@/components/universities/compare-table";
import { MAX_COMPARE, parseCompareIds } from "@/lib/compare";
import { scoreUniversity } from "@/lib/matching";
import type { Profile, University } from "@/lib/types";
import { getCurrentUser } from "@/lib/auth";
import { getVisibleUniversities } from "@/lib/data/universities";
import { getCountryInfo } from "@/lib/data/country-info";
import { getProfileCourses } from "@/lib/data/courses";
import { featuredReady, isShownByDefault } from "@/lib/university-filters";

export const metadata: Metadata = { title: "Compare universities" };

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; a?: string; b?: string; all?: string }>;
}) {
  const params = await searchParams;
  const ids = parseCompareIds(params);
  const showAll = params.all === "1";
  const supabase = await createClient();

  const user = await getCurrentUser();
  if (!user) redirect("/login");


  const [{ data: profile }, universities, { data: selected }, countryInfo, courses] = await Promise.all([
    // Everything at once (they don't depend on each other).
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle<Profile>(),
    // The cached list (every row, not just the first 1,000) for the picker.
    getVisibleUniversities(supabase, user.id),
    ids.length > 0
      ? supabase.from("universities").select("*").in("id", ids).returns<University[]>()
      : Promise.resolve({ data: [] as University[] }),
    // Visa guidance (cached; used only when the student shows or factors it).
    getCountryInfo(),
    // The student's courses, for the relevant-coursework average (lib/courses.ts).
    getProfileCourses(supabase, user.id),
  ]);

  // Most rows compare the schools against the student's own scores.
  if (!profile) redirect("/profile");
  profile.courses = courses;

  // The picker offers featured schools unless the student asks for all
  // (same rule as browse; see lib/university-filters.ts).
  const ready = featuredReady(universities);
  const pickable = showAll || !ready ? universities : universities.filter(isShownByDefault);
  const options = pickable
    .map((u) => ({ id: u.id, name: u.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Keep the order from the URL (the database returns rows in any order).
  const entries = ids
    .map((id) => (selected ?? []).find((u) => u.id === id))
    .filter((u): u is University => u !== undefined)
    .map((university) => scoreUniversity(profile, university, { countryInfo: countryInfo.byCountry }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="mb-8 space-y-2">
        <h1 className="text-2xl font-semibold">Compare universities</h1>
        <p className="text-muted-foreground">
          Pick up to {MAX_COMPARE}{" "}universities to see costs, admission
          figures and your fit side by side.
        </p>
      </div>

      <CompareControls
        options={options}
        selectedIds={entries.map((e) => e.university.id)}
        // Names of selected schools that aren't in the (featured) picker.
        selectedNames={Object.fromEntries(entries.map((e) => [e.university.id, e.university.name]))}
        showAll={showAll}
        featured={ready ? { shown: options.length, all: universities.length } : null}
      />

      <div className="mt-8">
        {entries.length >= 2 ? (
          <CompareTable entries={entries} profile={profile} />
        ) : (
          <p className="text-muted-foreground">
            {entries.length === 1
              ? "Add at least one more university to compare."
              : "Add two or more universities above, or tick “Compare” on any university card."}
          </p>
        )}
      </div>
    </div>
  );
}
