import type { GradeBasis, GradeSystem } from "@/lib/grades";
import type { ProfileCourse } from "@/lib/courses";
import type { StrengthConfidence, StrengthSignalKey, StrengthTier } from "@/lib/strength-config";
import type { AcademicPref, AthleticsLevel, SocialPref } from "@/lib/campus-life-config";
// Shared types matching the Supabase schema in supabase/seed.sql plus the
// numbered migrations in supabase/.

export type DegreeLevel = "Undergraduate" | "Masters" | "PhD";

export const DEGREE_LEVELS: DegreeLevel[] = ["Undergraduate", "Masters", "PhD"];

// "What matters most to me" (migration_009): a student ticks any number of
// these. None ticked means Balanced. Labels, descriptions and how they
// steer scoring live in lib/focus.ts and lib/matching.ts.
// The two campus-life focuses (migration_023, lib/campus-life.ts) come
// last and are not part of Balanced: nothing ticked still means the first
// four, so a student who picks neither sees exactly the same scores.
export const FOCUSES = ["academic", "work_experience", "research", "affordability", "academic_community", "social_life"] as const;

export type Focus = (typeof FOCUSES)[number];

export const BALANCED_FOCUSES: readonly Focus[] = ["academic", "work_experience", "research", "affordability"];

export type Profile = {
  id: string;
  full_name: string;
  country: string;
  intended_majors: string[];
  gpa_percentage: number;
  ielts_score: number | null;
  sat_score: number | null;
  budget_min: number;
  budget_max: number;
  preferred_countries: string[];
  preferred_degree_level: DegreeLevel;
  // Missing (undefined) until migration_009 is run; read it with focusesOf().
  focuses?: Focus[];
  // The old single choice (migration_008). Migration 009 copies it into
  // focuses and drops it; only read as a fallback before 009 has run.
  primary_focus?: "balanced" | Focus;
  // "Show amounts also in" (migration_016), an ISO code like "INR"; missing
  // until that migration runs. See lib/display-currency.ts.
  display_currency?: string;
  // How gpa_percentage was obtained (migration_017; see lib/grades.ts).
  // Missing until that migration runs, which reads as a typed percentage.
  grade_system?: GradeSystem;
  grade_input?: string | null;
  grade_basis?: GradeBasis;
  // Visa and work rights (migration_020; see lib/visa.ts). Missing or null
  // means "ignore", so nothing changes for anyone who hasn't chosen.
  visa_mode?: "ignore" | "show" | "factor" | null;
  visa_weight?: "low" | "medium" | "high" | null;
  stay_after?: "yes" | "unsure" | "no" | null;
  // The student's courses (table profile_courses, migration_022), loaded
  // separately and attached by the page; missing for guests or before that
  // migration runs, which reads as "no courses". See lib/courses.ts.
  courses?: ProfileCourse[];
  // Optional follow-ups to the two campus-life focuses (migration_023);
  // empty or missing = "Not sure" (equal weights).
  campus_academic_prefs?: AcademicPref[];
  campus_social_prefs?: SocialPref[];
  created_at: string;
  updated_at: string;
};

// Fields the user fills in on the profile form (id/timestamps are handled separately)
export type ProfileInput = Omit<Profile, "id" | "created_at" | "updated_at">;

export type University = {
  id: string;
  name: string;
  country: string;
  // US dollars per year; null when not available (migration_011). For a
  // curated row it's converted from tuition_local (see below).
  tuition: number | null;
  // Null for unranked schools a student added themselves.
  qs_ranking: number | null;
  // Per-subject ranking, e.g. { "Computer Science": 5 }. Not every program
  // has an entry — fall back to qs_ranking when one is missing.
  program_rankings: Record<string, number>;
  // Levels the school offers. Empty means unknown, not "offers nothing".
  degree_levels: DegreeLevel[];
  acceptance_rate: number | null; // null: not published (most non-US schools)
  // Illustrative admission stats (migration_004). Null means unknown, e.g.
  // non-US schools have no SAT range.
  avg_admitted_gpa: number | null;
  sat_25: number | null;
  sat_75: number | null;
  min_ielts: number | null;
  living_cost_per_year: number | null;
  popular_programs: string[];
  description: string;
  // Null for the shared seed data; the student's id for a school they added.
  // RLS never returns another student's schools, so a non-null value always
  // means "added by the current student".
  created_by: string | null;
  created_at: string;

  // Where the figures come from (migration_007).
  source: UniversitySource;
  data_year: string | null; // Scorecard's own year label, e.g. "2024"
  fetched_at: string | null;
  source_url: string | null; // optional link for user-entered figures

  // Official College Scorecard fields; null for schools without them.
  scorecard_id: number | null;
  city: string | null;
  state: string | null;
  ownership: "public" | "private nonprofit" | "private for-profit" | null;
  us_region: string | null;
  tuition_in_state: number | null;
  avg_net_price: number | null;
  student_size: number | null;
  completion_rate: number | null; // % finishing within 150% of normal time
  median_earnings_10yr: number | null;

  // Signals for the student's primary focus (migration_008). Optional
  // because they're missing until that migration runs; null = not available.
  research_intensity?: ResearchIntensity | null; // Carnegie classification
  retention_rate?: number | null; // % of first-year students who return
  // Co-op / internship program (migration_009). Only filled from the school's
  // own page, with that page's URL; "unknown" is left out of scoring.
  coop_program?: CoopProgram;
  internship_support_url?: string | null;
  // How many / how long the work terms are, as the school's page says, and
  // the day we read it (migration_025). Detail page only; null = not stated.
  coop_work_terms?: string | null;
  coop_checked_on?: string | null;

  // Shown by default (migration_010; the rule is scripts/relevance-rule.mjs).
  // Missing until that migration runs, which the app reads as "featured".
  is_featured?: boolean;

  // Curated international data (migration_011). Money is kept in its own
  // currency too; tuition / living_cost_per_year above are the US-dollar
  // conversions at the ECB rate of fx_rate_date.
  curated_id?: string | null;
  aliases?: string[];
  tuition_local?: number | null;
  tuition_currency?: string | null; // ISO code, e.g. "GBP"
  tuition_basis?: string | null; // exactly what the figure is
  tuition_year?: string | null; // e.g. "2025-26"
  tuition_source_url?: string | null;
  living_cost_local?: number | null;
  living_cost_currency?: string | null;
  living_cost_source_url?: string | null;
  fx_rate_date?: string | null;
  acceptance_source_url?: string | null;
  programs_source_url?: string | null;

  // Research impact (migration_015), from the Leiden Ranking; null when the
  // school isn't in it. See lib/research-impact.ts.
  research_impact?: ResearchImpact | null;

  // Unicelerate strength index (migration_019): our own estimate from open
  // data, computed at import time (lib/strength.ts). Null for a student's own
  // school, and missing until that migration runs.
  strength_index?: number | null;
  strength_low?: number | null; // estimate range
  strength_high?: number | null;
  strength_tier?: StrengthTier | null;
  strength_confidence?: StrengthConfidence | null;
  strength_is_estimate?: boolean | null;
  strength_position?: number | null;
  strength_signals?: StrengthDetails | null;

  // Campus-life proxies (migration_023), stored at import time by
  // scripts/campus-life/build.mjs. Null for a student's own school, and
  // missing until that migration runs. See lib/campus-life.ts.
  campus_life?: CampusLife | null;
};

// What was measured for one campus-life kind (lib/campus-life-score.ts):
// "Good" only with a direct club, team or event count.
export type CampusCoverage = "Good" | "Partial" | "Not available";

// Published figures behind the two campus-life focuses. Every field is
// null/missing when unknown. US figures come from IPEDS / College
// Scorecard (whole-dataset sources); curated ones carry their own page.
export type CampusLife = {
  locale?: number | null; // NCES locale code, e.g. 11 = large city
  undergrads?: number | null;
  housing?: number | null; // campus housing capacity
  athletics?: AthleticsLevel | null;
  football?: string | null; // football conference (IPEDS), e.g. "Big Ten Conference"
  project_teams?: number | null;
  academic_clubs?: number | null;
  hackathons?: number | null;
  social_clubs?: number | null;
  curated?: { proxy: string; source_url: string; checked_on: string; label?: string }[];
  // Precomputed at import with "Not sure" weights (the data coverage follows
  // from how many proxies are known, so it isn't stored).
  academic_score?: number | null;
  social_score?: number | null;
};

// universities.strength_signals: which signals were used, each with its
// value and percentile; for an estimate, the peers it came from. The cached
// list leaves value out (slimForList); a school's page has it.
export type StrengthDetails = {
  signals: Partial<Record<StrengthSignalKey, { value?: number; percentile: number }>>;
  of: number; // schools in our list
  computed_on: string;
  openalex_fetched_on?: string;
  peer_group?: string;
  peer_count?: number;
  position_range?: [number, number];
};

export type ResearchFieldKey = "biomedical" | "life_earth" | "math_cs" | "physical_eng" | "social_humanities";

// One school's value in universities.research_impact (written by
// scripts/research-impact/build.mjs). Percentiles are 0-100 among all
// universities in the ranking; a field is missing when the school has too
// few publications in it.
export type ResearchImpact = {
  overall: number;
  pp_top10: number; // share of its publications among the 10% most cited
  publications: number; // fractionally counted, in data_year
  fields: Partial<Record<ResearchFieldKey, number>>;
  ror: string;
  source: string;
  source_url: string;
  data_year: string;
  licence: string;
  checked_on: string;
};

export const COOP_PROGRAMS = ["mandatory", "optional", "none", "unknown"] as const;

export type CoopProgram = (typeof COOP_PROGRAMS)[number];

// What list pages need: everything except the detail-page-only figures.
// Browse and recommendations load ~1,600 of these (lib/data/universities.ts),
// so leaving out unused columns keeps that list small enough to cache.
export type UniversitySummary = Omit<University, DetailOnlyField>;

export const DETAIL_ONLY_FIELDS = [
  "description",
  "tuition_in_state",
  "avg_net_price",
  "student_size",
  "ownership",
  "us_region",
  "scorecard_id",
  "created_at",
  "curated_id",
  "tuition_year",
  "tuition_source_url",
  "living_cost_local",
  "living_cost_currency",
  "living_cost_source_url",
  "acceptance_source_url",
  "programs_source_url",
  "coop_work_terms",
  "coop_checked_on",
] as const;

type DetailOnlyField = (typeof DETAIL_ONLY_FIELDS)[number];

// Carnegie Classification research activity, as reported by College
// Scorecard: R1, R2, other doctoral/professional, or not a doctoral school.
export const RESEARCH_INTENSITIES = [
  "very_high",
  "high",
  "doctoral_professional",
  "non_doctoral",
] as const;

export type ResearchIntensity = (typeof RESEARCH_INTENSITIES)[number];

export type UniversitySource = "College Scorecard" | "curated" | "illustrative" | "user-entered";

// Fields the "add a university" form fills in.
export type UniversityInput = Pick<
  University,
  | "name"
  | "country"
  | "tuition"
  | "qs_ranking"
  | "acceptance_rate"
  | "avg_admitted_gpa"
  | "sat_25"
  | "sat_75"
  | "min_ielts"
  | "living_cost_per_year"
  | "popular_programs"
  | "degree_levels"
  | "description"
  | "source_url"
  | "research_intensity"
  | "coop_program"
  | "internship_support_url"
>;

// Application tracker (migration_006). An "admitted" application doubles as
// the record of the offer that the offers page ranks.
export const APPLICATION_STATUSES = [
  "planning",
  "applied",
  "admitted",
  "waitlisted",
  "rejected",
  "accepted",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export type Application = {
  id: string;
  user_id: string;
  university_id: string;
  status: ApplicationStatus;
  program: string;
  deadline: string | null; // "YYYY-MM-DD", the application deadline
  // "YYYY-MM-DD": the date to accept an offer by (migration_013). Optional,
  // and missing entirely until that migration is run.
  accept_by?: string | null;
  tuition_per_year: number | null;
  scholarship_per_year: number;
  living_cost_per_year: number | null;
  duration_years: number;
  notes: string;
  created_at: string;
  updated_at: string;
};

// Fields the application details form edits.
export type ApplicationInput = Pick<
  Application,
  | "status"
  | "program"
  | "deadline"
  | "accept_by"
  | "tuition_per_year"
  | "scholarship_per_year"
  | "living_cost_per_year"
  | "duration_years"
  | "notes"
>;

export type SavedUniversity = {
  id: string;
  user_id: string;
  university_id: string;
  created_at: string;
};
