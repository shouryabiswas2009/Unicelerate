import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { getSharedUniversities, getVisibleUniversities, searchUniversityIds } from "@/lib/data/universities";
import { guestBrowseEntry } from "@/lib/guest-browse";
import { scoreUniversity } from "@/lib/matching";
import { buildBoard, parseBoardParams } from "@/lib/university-filters";
import { UniversityBoard } from "@/components/universities/university-board";
import { Button } from "@/components/ui/button";
import { getCountryInfo } from "@/lib/data/country-info";
import { getProfileCourses } from "@/lib/data/courses";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Browse universities" };

// Every university the student can see: the shared list plus any they added
// themselves. Unlike recommendations, nothing is hidden by degree level here
// — that's a filter they can choose. Filtering, sorting and paging happen
// here on the server; only one page of cards goes to the browser.
//
// Visitors without an account can browse too: the shared list ordered by
// quality, without personal scores (lib/guest-browse.ts).
export default async function BrowseUniversitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const state = parseBoardParams(await searchParams);
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return <GuestBrowse state={state} />;

  const [{ data: profile }, universities, { data: saved }, searchIds, countryInfo, courses] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle<Profile>(),
    getVisibleUniversities(supabase, user.id),
    supabase.from("saved_universities").select("university_id").eq("user_id", user.id),
    // Only when searching: one indexed query in Postgres (name + aliases).
    state.filters.query.trim() ? searchUniversityIds(supabase, state.filters.query) : null,
    getCountryInfo(),
    // The student's courses, for the relevant-coursework average (lib/courses.ts).
    getProfileCourses(supabase, user.id),
  ]);

  // Cards show a match score, which needs the profile.
  if (!profile) redirect("/profile");
  profile.courses = courses;

  const scored = universities.map((university) => scoreUniversity(profile, university, { countryInfo: countryInfo.byCountry }));
  const board = buildBoard(scored, state, { withFeatured: true, searchIds: searchIds ?? undefined });

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Browse universities</h1>
          <p className="text-muted-foreground">
            Search and filter every school, scored against your profile.
          </p>
        </div>
        <Button asChild>
          <Link href="/universities/new">
            <Plus className="size-4" />
            Add a university
          </Link>
        </Button>
      </div>

      <UniversityBoard
        entries={board.entries}
        state={{ ...state, page: board.page }}
        totalPages={board.totalPages}
        matchingCount={board.matchingCount}
        hiddenUnknownTuition={board.hiddenUnknownTuition}
        countries={board.countries}
        featured={board.featured}
        savedIds={new Set((saved ?? []).map((row) => row.university_id))}
        showDegreeFilter
        emptyMessage="No universities yet."
      />
    </div>
  );
}

async function GuestBrowse({ state }: { state: ReturnType<typeof parseBoardParams> }) {
  const supabase = await createClient();
  const [universities, searchIds] = await Promise.all([
    getSharedUniversities(),
    state.filters.query.trim() ? searchUniversityIds(supabase, state.filters.query) : null,
  ]);
  const board = buildBoard(universities.map(guestBrowseEntry), state, {
    withFeatured: true,
    searchIds: searchIds ?? undefined,
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Browse universities</h1>
          <p className="max-w-2xl text-muted-foreground">
            Strongest first, by the Unicelerate strength index: our own estimate from open data (graduation,
            earnings, admitted students&apos; SAT and research figures), not an official ranking. Create a free
            profile to see how well each school fits you and your chances.
          </p>
        </div>
        <Button asChild>
          <Link href="/signup">Create free account</Link>
        </Button>
      </div>

      <UniversityBoard
        entries={board.entries}
        state={{ ...state, page: board.page }}
        totalPages={board.totalPages}
        matchingCount={board.matchingCount}
        hiddenUnknownTuition={board.hiddenUnknownTuition}
        countries={board.countries}
        featured={board.featured}
        savedIds={new Set()}
        showDegreeFilter
        guest
        emptyMessage="No universities yet."
      />
    </div>
  );
}
