// The "Try it" quiz's answer options. Kept separate from lib/guest-quiz.ts
// (which scores answers on the server) so the form in the browser only
// downloads these lists, not the scoring engine.

export const ANY_COUNTRY = "any";

export const QUIZ_BUDGETS = [15000, 25000, 40000, 60000, 80000] as const;

// The subject names the university data uses (College Scorecard fields and
// the curated program lists), so a pick matches real program lists.
export const QUIZ_MAJORS = [
  "Computer Science",
  "Data Science",
  "Engineering",
  "Business",
  "Economics",
  "Mathematics",
  "Physics",
  "Chemistry",
  "Biological Sciences",
  "Medicine",
  "Psychology",
  "Law",
  "Architecture",
] as const;

// Optional fourth question: should visa and work rights count? "ignore" is
// the default, so guests who skip it see exactly the same matches as before.
export const QUIZ_VISA = {
  ignore: "Don't consider it",
  stay: "Consider it: I may stay and work after",
  home: "Consider it: I'll return home after",
} as const;
export type QuizVisa = keyof typeof QUIZ_VISA;

// Optional fifth question: should campus life count? Same default rule:
// "none" leaves the matches exactly as before.
export const QUIZ_CAMPUS = {
  none: "Don't consider it",
  academic: "Academic & career community",
  social: "Campus social life & fun",
  both: "Both",
} as const;
export type QuizCampus = keyof typeof QUIZ_CAMPUS;
