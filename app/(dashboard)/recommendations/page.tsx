import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { getVisibleUniversities, searchUniversityIds } from "@/lib/data/universities";
import { offersDegreeLevel, scoreUniversity } from "@/lib/matching";
import { focusesOf, joinFocuses } from "@/lib/focus";
import { buildBoard, parseBoardParams, topPicksByCountry } from "@/lib/university-filters";
import { UniversityBoard } from "@/components/universities/university-board";
import { TopPicks } from "@/components/universities/top-picks";
import { Button } from "@/components/ui/button";
import { VisaQuickControl } from "@/components/universities/visa-quick-control";
import { getCountryInfo } from "@/lib/data/country-info";
import { visaModeOf } from "@/lib/visa";
import { getProfileCourses } from "@/lib/data/courses";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Your recommendations" };

export default async function RecommendationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Grouped by Reach / Match / Safety unless the student switches it off.
  const state = parseBoardParams(await searchParams, { groupDefault: true });
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [{ data: profile }, universities, { data: saved }, searchIds, countryInfo, courses] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle<Profile>(),
    getVisibleUniversities(supabase, user.id),
    supabase.from("saved_universities").select("university_id").eq("user_id", user.id),
    // Only when searching: one indexed query in Postgres (name + aliases).
    state.filters.query.trim() ? searchUniversityIds(supabase, state.filters.query) : null,
    // Visa guidance (cached; only used when the student shows or factors it).
    getCountryInfo(),
    // The student's courses, for the relevant-coursework average (lib/courses.ts).
    getProfileCourses(supabase, user.id),
  ]);

  // No profile yet — we need it to compute matches, so send them there first.
  if (!profile) redirect("/profile");
  profile.courses = courses;

  const scored = universities
    // Schools without the student's degree level aren't recommendations at
    // all, so leave them out rather than showing them with a 0% score.
    .filter((university) => offersDegreeLevel(profile, university))
    .map((university) => scoreUniversity(profile, university, { countryInfo: countryInfo.byCountry }));
  const board = buildBoard(scored, state, { withFeatured: true, searchIds: searchIds ?? undefined });
  const focuses = focusesOf(profile);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Your recommendations</h1>
          <p className="max-w-2xl text-muted-foreground">
            The strongest schools you can realistically get into come first: each one is checked against your
            budget, countries and subjects
            {focuses.length === 0 ? "" : ` (with extra weight on ${joinFocuses(focuses)})`}, then ordered by
            how strong it is and how likely you are to be admitted. Admission chances are demo estimates, not
            promises.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/profile">Edit profile</Link>
        </Button>
      </div>
      <div className="-mt-4 mb-8">
        <VisaQuickControl mode={visaModeOf(profile)} />
      </div>

      {/* Only on the first page, so it doesn't repeat while paging. */}
      {state.page === 1 && board.matchingCount > 0 && (
        <TopPicks groups={topPicksByCountry(board.pool, profile.preferred_countries)} />
      )}

      <UniversityBoard
        entries={board.entries}
        state={{ ...state, page: board.page }}
        totalPages={board.totalPages}
        matchingCount={board.matchingCount}
        hiddenUnknownTuition={board.hiddenUnknownTuition}
        countries={board.countries}
        featured={board.featured}
        savedIds={new Set((saved ?? []).map((row) => row.university_id))}
        emptyMessage={`No universities offering ${profile.preferred_degree_level} programs yet. Try a different degree level on your profile.`}
        groups={board.groups}
        groupable
      />
    </div>
  );
}
