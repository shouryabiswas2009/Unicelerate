"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SaveButton } from "@/components/universities/save-button";
import { FitSection } from "@/components/universities/fit-section";
import { hasAuthCookie } from "@/lib/auth-cookie";
import { useSignedIn } from "@/components/layout/use-signed-in";
import type { PersonalFitResponse } from "@/app/api/universities/[id]/me/route";
import type { UniversitySummary } from "@/lib/types";

// The personal parts of a cached public university page. The page itself
// is the same for everyone; here, in the browser, a signed-in student's
// saved state and fit are fetched once (/api/universities/<id>/me) and
// filled in. Visitors without a login cookie never make the request: they
// see the sign-up prompts, which are the only version in the HTML (the
// members' parts are added in the browser, see useSignedIn).

const requests = new Map<string, Promise<PersonalFitResponse>>();

function usePersonalFit(id: string): PersonalFitResponse | null {
  const [data, setData] = useState<PersonalFitResponse | null>(null);
  useEffect(() => {
    if (!hasAuthCookie(document.cookie)) return;
    let cancelled = false;
    if (!requests.has(id)) {
      requests.set(
        id,
        fetch(`/api/universities/${id}/me`, { cache: "no-store" })
          .then((r) => r.json() as Promise<PersonalFitResponse>)
          // Only shared by the two pieces asking at the same moment; the next
          // visit asks again, so the saved state is never stale.
          .finally(() => setTimeout(() => requests.delete(id), 0))
      );
    }
    requests.get(id)!.then((result) => {
      // A leftover cookie from an expired session: show the visitor view.
      if (!result.signedIn) document.documentElement.dataset.auth = "out";
      if (!cancelled) setData(result);
    }, () => {});
    return () => {
      cancelled = true;
    };
  }, [id]);
  return data;
}

export function PersonalSave({ id }: { id: string }) {
  const data = usePersonalFit(id);
  // A leftover cookie from an expired session counts as a visitor.
  const member = useSignedIn() && data?.signedIn !== false;
  if (!member) {
    return (
      <span className="guest-only">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/login?next=/universities/${id}`}>Log in to save</Link>
        </Button>
      </span>
    );
  }
  return data?.signedIn ? (
    <SaveButton universityId={id} initiallySaved={data.saved} />
  ) : (
    <span className="skeleton block size-8 rounded-md" aria-hidden />
  );
}

export function PersonalFit({ university }: { university: UniversitySummary }) {
  const data = usePersonalFit(university.id);
  const member = useSignedIn() && data?.signedIn !== false;
  if (!member) {
    return (
      <div className="guest-only">
        <div className="mt-6 flex flex-col gap-3 border-l-2 border-primary py-1 pl-4 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm">
            <strong>How well does it fit you?</strong> Create a free profile to see your match score,
            admission estimate and the What if? sliders for this university.
          </p>
          <Button asChild size="sm">
            <Link href="/signup">Create free account</Link>
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div aria-live="polite">
      {!data ? (
        <div className="skeleton mt-8 h-48 rounded-lg" aria-label="Loading your fit" />
      ) : data.entry && data.profile ? (
        <FitSection entry={data.entry} profile={data.profile} university={university} />
      ) : (
        <p className="mt-6 border-l-2 border-primary py-1 pl-4 text-sm">
          <Link href="/profile" className="font-semibold underline">Fill in your profile</Link> to see how well
          this university fits you.
        </p>
      )}
    </div>
  );
}
