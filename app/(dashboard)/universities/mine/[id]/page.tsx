import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UniversityDetails } from "@/components/universities/university-details";
import { FitSection } from "@/components/universities/fit-section";
import { SaveButton } from "@/components/universities/save-button";
import { DeleteUniversityButton } from "@/components/universities/delete-university-button";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { getCountryInfo } from "@/lib/data/country-info";
import { scoreUniversity } from "@/lib/matching";
import { getProfileCourses } from "@/lib/data/courses";
import type { Profile, University } from "@/lib/types";

export const metadata: Metadata = { title: "Your university", robots: { index: false } };

// A university the student added themselves. Private (RLS: only its owner
// can read it), so this page is rendered per request and never cached.
// Shared schools have their own cached page at /universities/<id>.
export default async function OwnUniversityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/universities/mine/${id}`);
  const supabase = await createClient();

  // Everything at once: the school, the profile, the saved state, country guidance.
  const [{ data: university }, { data: profile }, { data: savedRow }, countryInfo, courses] = await Promise.all([
    supabase.from("universities").select("*").eq("id", id).eq("created_by", user.id).maybeSingle<University>(),
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle<Profile>(),
    supabase.from("saved_universities").select("id").eq("user_id", user.id).eq("university_id", id).maybeSingle(),
    getCountryInfo(),
    // The student's courses, for the relevant-coursework average (lib/courses.ts).
    getProfileCourses(supabase, user.id),
  ]);
  if (!university) notFound();
  if (profile) profile.courses = courses;
  const entry = profile ? scoreUniversity(profile, university, { countryInfo: countryInfo.byCountry }) : null;

  return (
    <UniversityDetails
      university={university}
      countryInfo={countryInfo}
      ranking={entry?.ranking}
      highlightLevel={profile?.preferred_degree_level}
      backLink={
        <Button variant="ghost" size="sm" asChild className="mb-6 -ml-2">
          <Link href="/recommendations">
            <ArrowLeft className="size-4" />
            Back to recommendations
          </Link>
        </Button>
      }
      headerAction={<SaveButton universityId={university.id} initiallySaved={Boolean(savedRow)} />}
      afterHeader={
        <div className="mt-4 flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/universities/${university.id}/edit`}>
              <Pencil className="size-4" />
              Edit
            </Link>
          </Button>
          <DeleteUniversityButton id={university.id} name={university.name} />
        </div>
      }
      fit={entry && profile ? <FitSection entry={entry} profile={profile} university={university} /> : undefined}
    />
  );
}
