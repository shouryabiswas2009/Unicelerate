import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { getProfileCourses } from "@/lib/data/courses";
import { CombinedProfileForm } from "@/components/profile/section-form";
import { AboutSection, AcademicsSection, MoneySection, PrioritiesSection, StudySection } from "@/components/profile/sections";
import { DeleteAccount } from "@/components/profile/delete-account";
import { MyReports, type MyReport } from "@/components/profile/my-reports";
import { profileCompleteness } from "@/lib/profile-completeness";
import { PROFILE_PRESETS, findPreset, withPreset } from "@/lib/profile-presets";
import type { ProfileSection } from "@/lib/profile-sections";
import type { Profile } from "@/lib/types";
import { TopNow } from "./top-now";

export const metadata: Metadata = { title: "Your profile" };

// The profile as a guided page: a count of what's filled in (and what each
// missing item changes), optional presets, then five short numbered
// sections that each save on their own, with a sticky list of them on
// large screens. A brand-new profile (or an applied preset) is one form
// with one Save, because its required fields span several sections.

const SECTIONS: { id: ProfileSection | "account"; number: string; title: string; description: string }[] = [
  { id: "about", number: "01", title: "About you", description: "Your name and where you live now." },
  { id: "academics", number: "02", title: "Your academics", description: "Grades in your own system, plus any test scores." },
  { id: "study", number: "03", title: "What you want to study", description: "Subjects, degree level and the countries you're considering." },
  { id: "money", number: "04", title: "Money", description: "What you can spend a year, and the currency you think in." },
  { id: "priorities", number: "05", title: "Your priorities", description: "What should count most, including visas and work rights." },
  { id: "account", number: "06", title: "Account", description: "Your reports and account settings." },
];

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ preset?: string }> }) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  const preset = findPreset((await searchParams).preset);

  // Route protection already happens in proxy.ts, but `user` is still
  // typed as possibly-null here, so guard before querying with it.
  const [{ data: profile }, { data: reports }, courses] = user
    ? await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle<Profile>(),
        // Row level security returns only this student's reports; an error
        // (e.g. migration_018 not run yet) just means none are shown.
        supabase
          .from("figure_reports")
          .select("id, field, suggested_value, status, created_at, universities(name)")
          .order("created_at", { ascending: false })
          .limit(20)
          .returns<MyReport[]>(),
        getProfileCourses(supabase, user.id),
      ])
    : [{ data: null }, { data: null }, []];
  if (profile) profile.courses = courses;

  const values = withPreset(profile, preset);
  const completeness = profileCompleteness(profile);
  const oneForm = !profile || preset !== null;

  const body = (
    <>
      <Section {...SECTIONS[0]}>
        <AboutSection profile={values} />
      </Section>
      <Section {...SECTIONS[1]}>
        <AcademicsSection profile={values} />
      </Section>
      <Section {...SECTIONS[2]}>
        <StudySection profile={values} />
      </Section>
      <Section {...SECTIONS[3]}>
        <MoneySection profile={values} />
      </Section>
      <Section {...SECTIONS[4]}>
        <PrioritiesSection profile={values} />
      </Section>
    </>
  );

  return (
    <div className="page-container py-12">
      <header className="max-w-2xl space-y-3">
        <p className="eyebrow">Your profile</p>
        <h1 className="text-section font-bold">{profile ? "Your student profile" : "Set up your profile"}</h1>
        <p className="text-muted-foreground">
          This is what we use to match you with universities. Each section saves on its own; nothing you leave
          blank counts against you.
        </p>
      </header>

      {/* Profile strength: a plain count of real fields, and what's missing. */}
      <section aria-labelledby="strength-heading" className="mt-8 max-w-2xl border-y py-5">
        <h2 id="strength-heading" className="flex items-baseline justify-between gap-3">
          <span className="font-semibold">
            {completeness.filled} of {completeness.total} filled in
          </span>
          <span className="text-xs text-muted-foreground">Profile strength</span>
        </h2>
        <div className="mt-3 flex gap-1" aria-hidden>
          {Array.from({ length: completeness.total }, (_, i) => (
            <span key={i} className={`h-1.5 flex-1 ${i < completeness.filled ? "bg-primary" : "bg-border"}`} />
          ))}
        </div>
        {completeness.missing.length > 0 && (
          <ul className="mt-4 space-y-1.5 text-sm">
            {completeness.missing.map((item) => (
              <li key={item.key}>
                <a href={`#${item.section}`} className="font-medium underline decoration-primary/30 underline-offset-4 hover:decoration-primary">
                  {item.label}
                </a>
                <span className="text-muted-foreground">: {item.why}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* One-tap starting points; they only pre-fill the form. */}
      <section aria-labelledby="presets-heading" className="mt-8 max-w-2xl">
        <h2 id="presets-heading" className="text-sm font-semibold">Quick start</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Pre-fills grades, currency and countries for a common case. Nothing is saved until you press Save, and you can
          change everything.
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {PROFILE_PRESETS.map((p) => (
            <li key={p.key}>
              <Link
                href={`/profile?preset=${p.key}`}
                aria-current={preset?.key === p.key ? "true" : undefined}
                title={p.description}
                className={`inline-flex min-h-11 items-center rounded-md border px-3 text-sm hover:bg-muted ${preset?.key === p.key ? "border-primary bg-primary/5 font-medium" : ""}`}
              >
                {p.label}
              </Link>
            </li>
          ))}
          {preset && (
            <li>
              <Link href="/profile" className="inline-flex min-h-11 items-center px-2 text-sm underline">
                Clear
              </Link>
            </li>
          )}
        </ul>
        {preset && (
          <p className="mt-3 border-l-2 border-primary py-1 pl-3 text-sm">
            <strong>{preset.label}</strong> pre-filled below. Check it, then press <strong>Save</strong> at the bottom.
          </p>
        )}
      </section>

      <div className="mt-10 grid gap-10 lg:grid-cols-[13rem_minmax(0,1fr)_16rem] lg:gap-12">
        <nav aria-label="Profile sections" className="hidden lg:block">
          <ol className="sticky top-24 space-y-1 text-sm">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="flex min-h-9 items-center gap-2 text-muted-foreground hover:text-foreground">
                  <span className="font-heading text-xs font-semibold tabular-nums text-primary">{s.number}</span>
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="min-w-0">
          {oneForm ? (
            <CombinedProfileForm submitLabel={profile ? "Save all" : "Save profile & see recommendations"}>{body}</CombinedProfileForm>
          ) : (
            body
          )}

          <Section {...SECTIONS[5]} quiet>
            {reports && reports.length > 0 ? <MyReports reports={reports} /> : <p className="text-sm text-muted-foreground">No figure reports sent yet.</p>}
            {user && <DeleteAccount />}
          </Section>
        </div>

        {profile && !preset && (
          <div className="lg:sticky lg:top-24 lg:self-start">
            <Suspense fallback={<div className="skeleton h-40 rounded-md" aria-label="Loading your top 3" />}>
              <TopNow profile={profile} />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  id,
  number,
  title,
  description,
  quiet = false,
  children,
}: {
  id: string;
  number: string;
  title: string;
  description: string;
  quiet?: boolean;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-24 border-t py-10 first:border-t-0 first:pt-0">
      <p className="font-heading text-sm font-semibold tabular-nums text-primary">{number}</p>
      <h2 id={`${id}-heading`} className={quiet ? "mt-1 text-lg font-semibold" : "mt-1 text-xl font-bold"}>
        {title}
      </h2>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">{description}</p>
      {children}
    </section>
  );
}
