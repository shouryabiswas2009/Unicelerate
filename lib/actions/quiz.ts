"use server";

import { getSharedUniversities } from "@/lib/data/universities";
import { getCountryInfo } from "@/lib/data/country-info";
import { guestTopMatches, parseQuizAnswers } from "@/lib/guest-quiz";
import { tuitionDisplay } from "@/lib/money";

export type GuestMatch = {
  id: string;
  name: string;
  country: string;
  city: string | null;
  score: number;
  knownFactors: number;
  totalFactors: number;
  tuition: string;
};

export type QuizState = { matches?: GuestMatch[]; error?: string } | undefined;

// Runs the landing-page quiz for a visitor without an account. Nothing is
// written anywhere: the answers only live for this one request.
export async function guestMatches(_prevState: QuizState, formData: FormData): Promise<QuizState> {
  const parsed = parseQuizAnswers({
    country: formData.get("country"),
    budget: formData.get("budget"),
    major: formData.get("major"),
    visa: formData.get("visa"),
    campus: formData.get("campus"),
  });
  if (!parsed.ok) return { error: parsed.error };

  const [universities, countryInfo] = await Promise.all([getSharedUniversities(), getCountryInfo()]);
  const matches = guestTopMatches(universities, parsed.answers, 5, countryInfo.byCountry).map(({ university, ...match }) => ({
    ...match,
    tuition: tuitionDisplay(university).text,
  }));
  if (matches.length === 0) {
    return { error: "No featured universities in that country have a known tuition yet. Try “Anywhere”." };
  }
  return { matches };
}
