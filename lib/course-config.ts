// Course weighting: every number in one place, with why. How it works:
// docs/COURSE-RELEVANCE-SOURCES.md. These are OUR weights, based on
// published preparation guidance (sources in that doc); they are not
// official or empirical, and they're meant to be edited.

export const COURSE_SUBJECTS = [
  "mathematics",
  "calculus",
  "statistics",
  "computer_science",
  "physics",
  "chemistry",
  "biology",
  "economics",
  "business",
  "english",
  "social_studies",
  "languages",
  "arts",
  "other",
] as const;
export type CourseSubject = (typeof COURSE_SUBJECTS)[number];

export const SUBJECT_LABELS: Record<CourseSubject, string> = {
  mathematics: "Mathematics",
  calculus: "Calculus / Advanced Maths",
  statistics: "Statistics",
  computer_science: "Computer Science",
  physics: "Physics",
  chemistry: "Chemistry",
  biology: "Biology",
  economics: "Economics",
  business: "Business",
  english: "English / Literature",
  social_studies: "Social Studies / History",
  languages: "Languages",
  arts: "Arts",
  other: "Other",
};

export const COURSE_LEVELS = ["standard", "honors", "ap", "ib_sl", "ib_hl", "a_level", "other"] as const;
export type CourseLevel = (typeof COURSE_LEVELS)[number];

export const LEVEL_LABELS: Record<CourseLevel, string> = {
  standard: "Standard",
  honors: "Honors / Advanced",
  ap: "AP",
  ib_sl: "IB SL",
  ib_hl: "IB HL",
  a_level: "A Level",
  other: "Other",
};

// How much more a harder course counts in the average. A modelling choice,
// not an official equivalence between AP, IB and A Level. It only changes a
// course's WEIGHT, never its grade, and is capped at MAX_LEVEL_MULTIPLIER,
// so a few hard courses can't hide weak marks.
export const LEVEL_MULTIPLIER: Record<CourseLevel, number> = {
  standard: 1.0,
  honors: 1.05,
  ap: 1.1,
  ib_sl: 1.05,
  ib_hl: 1.1,
  a_level: 1.1,
  other: 1.0,
};
export const MAX_LEVEL_MULTIPLIER = 1.1;

// Three tiers only, instead of many invented decimals.
export const TIER_WEIGHT = { core: 1.0, supporting: 0.6, general: 0.3 } as const;
export type RelevanceTier = keyof typeof TIER_WEIGHT;

export const MAJOR_FAMILIES = [
  "computer_science",
  "engineering",
  "math_stats",
  "physical_sciences",
  "life_health",
  "business_econ",
  "social_sciences",
  "humanities_arts",
] as const;
export type MajorFamily = (typeof MAJOR_FAMILIES)[number];

export const FAMILY_LABELS: Record<MajorFamily, string> = {
  computer_science: "Computer Science",
  engineering: "Engineering",
  math_stats: "Mathematics & Statistics",
  physical_sciences: "Physical Sciences",
  life_health: "Life Sciences & Health",
  business_econ: "Business & Economics",
  social_sciences: "Social Sciences",
  humanities_arts: "Humanities & Arts",
};

// Which tier each subject is for each major family. Subjects not listed are
// "general". docs/COURSE-RELEVANCE-SOURCES.md says which cells are backed by
// a published requirement and which are our judgement.
export const RELEVANCE: Record<MajorFamily, Partial<Record<CourseSubject, RelevanceTier>>> = {
  computer_science: { mathematics: "core", calculus: "core", computer_science: "core", physics: "supporting", statistics: "supporting", english: "supporting" },
  engineering: { mathematics: "core", calculus: "core", physics: "core", chemistry: "core", computer_science: "supporting", english: "supporting", statistics: "supporting" },
  math_stats: { mathematics: "core", calculus: "core", statistics: "core", computer_science: "supporting", physics: "supporting", english: "supporting" },
  physical_sciences: { mathematics: "core", calculus: "core", physics: "core", chemistry: "core", biology: "supporting", computer_science: "supporting", statistics: "supporting" },
  life_health: { biology: "core", chemistry: "core", mathematics: "supporting", calculus: "supporting", physics: "supporting", statistics: "supporting", english: "supporting" },
  business_econ: { mathematics: "core", calculus: "core", economics: "supporting", business: "supporting", statistics: "supporting", english: "supporting" },
  social_sciences: { social_studies: "core", english: "core", economics: "supporting", statistics: "supporting", languages: "supporting", mathematics: "supporting" },
  humanities_arts: { english: "core", languages: "core", arts: "core", social_studies: "core" },
};

// Fewer relevant (core or supporting) courses than this: "not enough
// courses to say", never a number from one course.
export const MIN_RELEVANT_COURSES = 2;
export const MAX_COURSES = 20;

// How much the relevant-coursework average counts in academic fit:
// effectiveGrade = (1 - w) × overall + w × relevantAverage. Only when a
// relevant average exists; otherwise the overall grade is used as before.
export const COURSE_BLEND_WEIGHT = 0.3;
