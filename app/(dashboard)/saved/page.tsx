import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { scoreUniversity } from "@/lib/matching";
import { UniversityBoard } from "@/components/universities/university-board";
import { buildBoard, parseBoardParams } from "@/lib/university-filters";
import { Button } from "@/components/ui/button";
import type { ApplicationStatus, Profile, University } from "@/lib/types";
import { getCountryInfo } from "@/lib/data/country-info";
import { getProfileCourses } from "@/lib/data/courses";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Saved universities" };

export default async function SavedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const state = parseBoardParams(await searchParams);
  const supabase = await createClient();
  const user = await getCurrentUser();

  if (!user) redirect("/login");


  const [{ data: profile }, { data: saved }, { data: applications }, countryInfo, courses] = await Promise.all([
    // Everything at once (they don't depend on each other).
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle<Profile>(),
    supabase
      .from("saved_universities")
      .select("university_id, universities(*)")
      .eq("user_id", user.id)
      .returns<{ university_id: string; universities: University }[]>(),
    supabase
      .from("applications")
      .select("id, university_id, status")
      .eq("user_id", user.id)
      .returns<{ id: string; university_id: string; status: ApplicationStatus }[]>(),
    getCountryInfo(),
    // The student's courses, for the relevant-coursework average (lib/courses.ts).
    getProfileCourses(supabase, user.id),
  ]);

  if (!profile) redirect("/profile");
  profile.courses = courses;

  const universities = (saved ?? []).map((row) => row.universities);

  const scored = universities.map((university) => scoreUniversity(profile, university, { countryInfo: countryInfo.byCountry }));
  // Saved schools are always shown (no featured step); just filter and page.
  const board = buildBoard(scored, state, { withFeatured: false });

  // Lets each card show its application status, keyed by university id.
  const applicationsByUniversity = Object.fromEntries(
    (applications ?? []).map((a) => [a.university_id, { id: a.id, status: a.status }])
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Saved universities</h1>
          <p className="text-muted-foreground">
            Universities you&apos;ve bookmarked while exploring.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/recommendations">Browse recommendations</Link>
        </Button>
      </div>

      <UniversityBoard
        entries={board.entries}
        state={{ ...state, page: board.page }}
        totalPages={board.totalPages}
        matchingCount={board.matchingCount}
        countries={board.countries}
        savedIds={new Set(universities.map((u) => u.id))}
        applications={applicationsByUniversity}
        emptyMessage={
          <>
            You haven&apos;t saved any universities yet. Bookmark one from
            your{" "}
            <Link href="/recommendations" className="underline">
              recommendations
            </Link>{" "}
            to see it here.
          </>
        }
      />
    </div>
  );
}
