import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { getPublicUniversity } from "@/lib/data/universities";
import { scoreUniversity, type MatchEntry } from "@/lib/matching";
import { getCountryInfo } from "@/lib/data/country-info";
import { getProfileCourses } from "@/lib/data/courses";
import type { Profile } from "@/lib/types";

export type PersonalFitResponse =
  | { signedIn: false }
  | { signedIn: true; saved: boolean; profile: Profile | null; entry: MatchEntry | null };

// The personal part of a (cached, public) university page: is it saved, and
// how well does it fit this student. Called from the browser only when the
// visitor has a login cookie. Never cached: it's one person's data.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const noStore = { headers: { "Cache-Control": "private, no-store" } };
  if (!user) return NextResponse.json({ signedIn: false } satisfies PersonalFitResponse, noStore);

  const supabase = await createClient();
  // All three at once: the university comes from the shared cache.
  const [university, { data: profile }, { data: savedRow }, countryInfo, courses] = await Promise.all([
    getPublicUniversity(id),
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle<Profile>(),
    supabase.from("saved_universities").select("id").eq("user_id", user.id).eq("university_id", id).maybeSingle(),
    getCountryInfo(),
    // The student's courses, for the relevant-coursework average (lib/courses.ts).
    getProfileCourses(supabase, user.id),
  ]);
  if (profile) profile.courses = courses;
  const entry = university && profile ? scoreUniversity(profile, university, { countryInfo: countryInfo.byCountry }) : null;
  return NextResponse.json(
    { signedIn: true, saved: Boolean(savedRow), profile: profile ?? null, entry } satisfies PersonalFitResponse,
    noStore
  );
}
