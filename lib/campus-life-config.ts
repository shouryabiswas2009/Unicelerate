// Every weight and threshold behind the two campus-life focuses, in one
// place. Why each proxy exists, where it comes from and what was rejected:
// docs/CAMPUS-LIFE-DATA.md. These are our modelling choices (marked as
// such in that doc), not official ratings, and you can edit them.
//
// Two separate kinds of "campus life", never blended into one number:
//   academic  "Academic & career community": project teams, clubs,
//             hackathons, co-op, research.
//   social    "Campus social life & fun": setting, size, residential feel,
//             varsity sport events, social clubs.

// ─── Proxies ─────────────────────────────────────────────────────────────

export const ACADEMIC_PROXIES = [
  "project_teams", // design / competition / project teams (school's own page)
  "academic_clubs", // academic & professional clubs (school or student union page)
  "hackathons", // hackathons the school or an official organiser lists
  "coop", // co-op / internship programme (existing data)
  "research_activity", // Carnegie research level (existing, US)
  "research_impact", // Leiden Ranking percentile (existing)
] as const;
export type AcademicProxy = (typeof ACADEMIC_PROXIES)[number];

export const SOCIAL_PROXIES = [
  "setting", // city / suburb / town / rural (NCES locale, IPEDS)
  "size", // undergraduate enrolment (College Scorecard)
  "residential", // campus housing places per undergraduate (IPEDS)
  "athletics", // varsity sport governing-body membership (IPEDS / conference pages)
  "social_clubs", // social & cultural clubs (school or student union page)
] as const;
export type SocialProxy = (typeof SOCIAL_PROXIES)[number];

// IPEDS collection years of the US figures (scripts/campus-life/config.mjs
// downloads these files). Housing capacity was last collected in 2023-24.
export const IPEDS_YEARS = { locale: "2024-25", athletics: "2024-25", housing: "2023-24" } as const;

// ─── Turning a published figure into 0..1 ────────────────────────────────

// NCES locale codes (IPEDS HD "LOCALE"), as how urban the setting is. The
// order (city > suburb > town > rural) is NCES's own; the spacing is our
// judgement. https://nces.ed.gov/programs/edge/Geographic/LocaleBoundaries
export const LOCALE_LABELS: Record<number, string> = {
  11: "Large city", 12: "Midsize city", 13: "Small city",
  21: "Large suburb", 22: "Midsize suburb", 23: "Small suburb",
  31: "Town (fringe)", 32: "Town (distant)", 33: "Town (remote)",
  41: "Rural (fringe)", 42: "Rural (distant)", 43: "Rural (remote)",
};
export const LOCALE_URBAN: Record<number, number> = {
  11: 1, 12: 0.85, 13: 0.7,
  21: 0.6, 22: 0.5, 23: 0.45,
  31: 0.3, 32: 0.2, 33: 0.15,
  41: 0.1, 42: 0.05, 43: 0,
};

// Enrolment on a log scale: this many undergraduates or fewer → 0, this
// many or more → 1 (doubling counts the same anywhere in between).
export const SIZE_RANGE = { low: 1000, high: 40000 } as const;

// Housing places per undergraduate: this share or more → 1. Capacity can
// exceed undergraduate enrolment where graduate students live on campus
// too, so it's capped.
export const RESIDENTIAL_FULL_SHARE = 1;

// Varsity sport events, by the governing body / level a school competes
// at. A proxy for organised spectator events only ("has varsity sport
// events"), never for atmosphere. Levels and spacing are our judgement.
export const ATHLETICS_LEVELS = ["ncaa_fbs", "ncaa_football", "ncaa", "usports", "other_national", "none"] as const;
export type AthleticsLevel = (typeof ATHLETICS_LEVELS)[number];
export const ATHLETICS_SCORES: Record<AthleticsLevel, number> = {
  ncaa_fbs: 1, // NCAA member, football in a Football Bowl Subdivision conference
  ncaa_football: 0.75, // NCAA member with football
  ncaa: 0.5, // NCAA member, no football
  usports: 0.5, // Canada's national university sport body (U SPORTS)
  other_national: 0.35, // NAIA, NJCAA, NCCAA, NSCAA or another national body
  none: 0, // no national athletic association
};
export const ATHLETICS_LABELS: Record<AthleticsLevel, string> = {
  ncaa_fbs: "NCAA, with football in the top division (FBS)",
  ncaa_football: "NCAA, with football",
  ncaa: "NCAA member",
  usports: "U SPORTS member",
  other_national: "Member of a national athletic association",
  none: "No national athletic association",
};

// Football Bowl Subdivision conferences, as NCAA.com lists them
// (https://www.ncaa.com/standings/football/fbs, checked 2026-10-13), by the
// name IPEDS uses for each.
export const FBS_CONFERENCES = [
  "American Athletic Conference",
  "Atlantic Coast Conference",
  "Big Ten Conference",
  "Big Twelve Conference",
  "Conference USA",
  "Division I-A Independents",
  "Mid-American Conference",
  "Mountain West Conference",
  "Pacific-12 Conference",
  "Southeastern Conference",
  "Sun Belt Conference",
] as const;

// Club and team counts: this many or more → 1 (straight line below). Raw
// counts, not per 1,000 students, because most curated schools publish no
// enrolment we could divide by.
export const COUNT_FULL = { project_teams: 40, academic_clubs: 150, social_clubs: 300, hackathons: 2 } as const;

// ─── What the student can tune ───────────────────────────────────────────

export const ACADEMIC_PREFS = ["hackathons_tech", "competitions_teams", "clubs_societies", "career_networking", "research", "not_sure"] as const;
export type AcademicPref = (typeof ACADEMIC_PREFS)[number];
export const SOCIAL_PREFS = ["big_events_sports", "greek_life", "city_nightlife", "festivals_concerts", "quiet_close_knit", "not_sure"] as const;
export type SocialPref = (typeof SOCIAL_PREFS)[number];

export const ACADEMIC_PREF_LABELS: Record<AcademicPref, string> = {
  hackathons_tech: "Hackathons & tech",
  competitions_teams: "Competitions & project teams",
  clubs_societies: "Clubs & societies",
  career_networking: "Career & networking events",
  research: "Research",
  not_sure: "Not sure",
};
export const SOCIAL_PREF_LABELS: Record<SocialPref, string> = {
  big_events_sports: "Big events & sports",
  greek_life: "Greek life",
  city_nightlife: "City life & nightlife",
  festivals_concerts: "Festivals & concerts",
  quiet_close_knit: "Quiet & close-knit",
  not_sure: "Not sure",
};

// Which proxies count for each choice, and how much (relative weights; a
// proxy we don't know drops out and the rest are re-weighted). "Not sure"
// weighs every proxy equally. Our judgement, in docs/CAMPUS-LIFE-DATA.md.
export const ACADEMIC_PREF_WEIGHTS: Record<AcademicPref, Partial<Record<AcademicProxy, number>>> = {
  hackathons_tech: { hackathons: 3, project_teams: 1, academic_clubs: 1 },
  competitions_teams: { project_teams: 3, hackathons: 1 },
  clubs_societies: { academic_clubs: 3, project_teams: 1 },
  career_networking: { coop: 3, academic_clubs: 1 },
  research: { research_activity: 2, research_impact: 2 },
  not_sure: Object.fromEntries(ACADEMIC_PROXIES.map((p) => [p, 1])),
};

// Greek life has no proxy: no official, free source says which schools
// have fraternities and sororities, so that choice can't change a score
// (the profile page says so).
export const SOCIAL_PREF_WEIGHTS: Record<SocialPref, Partial<Record<SocialProxy, number>>> = {
  big_events_sports: { athletics: 3, size: 2, residential: 1 },
  greek_life: {},
  city_nightlife: { setting: 3, size: 1 },
  festivals_concerts: { size: 2, social_clubs: 2, setting: 1 },
  quiet_close_knit: { size: 2, setting: 1, athletics: 1, residential: 2 },
  not_sure: Object.fromEntries(SOCIAL_PROXIES.map((p) => [p, 1])),
};

// "Quiet & close-knit": a small, low-event campus suits this student, so
// these signals count the other way round (1 − value). Living on campus
// still counts as a plus: it's what makes a small place close-knit.
export const QUIET_FLIPPED: readonly SocialProxy[] = ["size", "setting", "athletics"];

// ─── Confidence ──────────────────────────────────────────────────────────
// How many proxies a school has for one kind: 3+ High, 2 Medium, 1 Low,
// 0 "Not available".
export const CONFIDENCE_THRESHOLDS = { high: 3, medium: 2 } as const;

// Explanation lines: a score at or above this reads as a strength.
export const CAMPUS_STRONG = 0.6;
