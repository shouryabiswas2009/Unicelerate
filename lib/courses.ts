import {
  COURSE_BLEND_WEIGHT,
  COURSE_LEVELS,
  COURSE_SUBJECTS,
  LEVEL_MULTIPLIER,
  MAX_COURSES,
  MAX_LEVEL_MULTIPLIER,
  MIN_RELEVANT_COURSES,
  RELEVANCE,
  SUBJECT_LABELS,
  TIER_WEIGHT,
  type CourseLevel,
  type CourseSubject,
  type MajorFamily,
  type RelevanceTier,
} from "@/lib/course-config";
import { PROGRAM_PREREQUISITES, type ProgramPrerequisite } from "@/lib/program-prerequisites";
import type { Profile, UniversitySummary } from "@/lib/types";

// Course weighting (optional): courses relevant to the student's intended
// major count more in a "relevant-coursework average", which is blended into
// the grade used for academic fit. Numbers: lib/course-config.ts; why:
// docs/COURSE-RELEVANCE-SOURCES.md. The demo admission model is NOT changed:
// it was trained without course data and keeps using the overall grade.

export type ProfileCourse = {
  subject: CourseSubject;
  level: CourseLevel;
  grade_percentage: number;
  grade_year: number; // 9-12
};

// The student's intended majors → a major family, by keyword. The first
// major that matches decides. Checked in this order so "Software
// Engineering" is engineering and "Data Science" is computer science.
const FAMILY_PATTERNS: [RegExp, MajorFamily][] = [
  [/engineering|mechatronic|aerospace/, "engineering"],
  [/computer|software|data science|artificial intelligence|machine learning|informatics|computing/, "computer_science"],
  [/mathemat|statistic|actuarial/, "math_stats"],
  [/biolog|medicine|medical|nursing|pharmac|health|neuroscience|biochem|life science|dentist|kinesiology|veterinar/, "life_health"],
  [/physics|chemistry|astronom|earth science|geolog|material|natural science/, "physical_sciences"],
  [/business|econom|financ|accounting|commerce|management|marketing/, "business_econ"],
  [/psycholog|sociolog|politic|international relations|\blaw\b|anthropolog|geograph|criminolog|education/, "social_sciences"],
  [/english|history|philosoph|literature|\barts?\b|music|design|architecture|language|linguistic|film|theatre|journalism|communication/, "humanities_arts"],
];

export function majorFamily(major: string): MajorFamily | null {
  const text = major.trim().toLowerCase();
  return FAMILY_PATTERNS.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

export function familyForProfile(profile: Pick<Profile, "intended_majors">): MajorFamily | null {
  for (const major of profile.intended_majors ?? []) {
    const family = majorFamily(major);
    if (family) return family;
  }
  return null;
}

export function tierFor(family: MajorFamily, subject: CourseSubject): RelevanceTier {
  return RELEVANCE[family][subject] ?? "general";
}

export type RelevantAverage = {
  average: number; // 0-100, one decimal
  relevantCount: number; // core or supporting courses
  rigorous: number; // AP / IB / A Level / Honors among them
};

// Weighted mean of all the student's grades, weight = relevance × level
// multiplier (capped). Null with fewer than MIN_RELEVANT_COURSES core or
// supporting courses: "not enough courses to say".
export function relevantCourseAverage(courses: ProfileCourse[], family: MajorFamily | null): RelevantAverage | null {
  if (!family) return null;
  const relevant = courses.filter((c) => tierFor(family, c.subject) !== "general");
  if (relevant.length < MIN_RELEVANT_COURSES) return null;
  let sum = 0;
  let weight = 0;
  for (const c of courses) {
    const w = TIER_WEIGHT[tierFor(family, c.subject)] * Math.min(LEVEL_MULTIPLIER[c.level], MAX_LEVEL_MULTIPLIER);
    sum += w * c.grade_percentage;
    weight += w;
  }
  return {
    average: Math.round((sum / weight) * 10) / 10,
    relevantCount: relevant.length,
    rigorous: relevant.filter((c) => LEVEL_MULTIPLIER[c.level] > 1).length,
  };
}

// The grade academic fit uses: the overall grade, blended with the
// relevant-coursework average when there is one. With no (or too few)
// courses this is exactly the overall grade, so nothing changes.
export function effectiveGrade(profile: Pick<Profile, "gpa_percentage" | "intended_majors" | "courses">): number {
  const relevant = relevantCourseAverage(profile.courses ?? [], familyForProfile(profile));
  if (!relevant) return profile.gpa_percentage;
  return Math.round(((1 - COURSE_BLEND_WEIGHT) * profile.gpa_percentage + COURSE_BLEND_WEIGHT * relevant.average) * 10) / 10;
}

// Required courses a featured program publishes that are missing from the
// student's list. Only when the student entered courses at all, and only
// for programs in their major family at this university.
export function prerequisiteGaps(profile: Pick<Profile, "intended_majors" | "courses">, university: Pick<UniversitySummary, "name">): { program: ProgramPrerequisite; missing: string[] }[] {
  const courses = profile.courses ?? [];
  const family = familyForProfile(profile);
  if (courses.length === 0 || !family) return [];
  const have = new Set(courses.map((c) => c.subject));
  return PROGRAM_PREREQUISITES.filter((p) => p.university === university.name && p.family === family)
    .map((program) => ({
      program,
      missing: program.requires.filter((g) => g.anyOf.filter((s) => have.has(s)).length < (g.count ?? 1)).map((g) => g.label),
    }))
    .filter((gap) => gap.missing.length > 0);
}

export function prerequisiteConcerns(profile: Pick<Profile, "intended_majors" | "courses">, university: Pick<UniversitySummary, "name">): string[] {
  return prerequisiteGaps(profile, university).map(
    ({ program, missing }) =>
      `${university.name} ${program.program} expects ${missing.join(", ")}; none in your course list (check the school's page).`
  );
}

// "Mathematics 1.0, Calculus 1.0, Physics 0.6, …" for the profile page.
export function weightsSummary(family: MajorFamily): { subject: CourseSubject; label: string; weight: number }[] {
  return COURSE_SUBJECTS.filter((s) => s !== "other")
    .map((subject) => ({ subject, label: SUBJECT_LABELS[subject], weight: TIER_WEIGHT[tierFor(family, subject)] }))
    .sort((a, b) => b.weight - a.weight);
}

// Server-side validation of the course rows (sent as parallel lists).
export type CourseValidation = { ok: true; courses: ProfileCourse[] } | { ok: false; error: string };

export function validateCourses(formData: FormData): CourseValidation {
  const subjects = formData.getAll("course_subject").map(String);
  const levels = formData.getAll("course_level").map(String);
  const grades = formData.getAll("course_grade").map(String);
  const years = formData.getAll("course_year").map(String);
  const courses: ProfileCourse[] = [];
  for (let i = 0; i < subjects.length; i++) {
    // A row left completely blank is ignored.
    if (!subjects[i] && !grades[i]?.trim()) continue;
    const subject = subjects[i] as CourseSubject;
    const level = (levels[i] || "standard") as CourseLevel;
    const grade = Number(grades[i]);
    const year = Number(years[i] || 12);
    if (!(COURSE_SUBJECTS as readonly string[]).includes(subject)) return { ok: false, error: `Course ${i + 1}: choose a subject from the list.` };
    if (!(COURSE_LEVELS as readonly string[]).includes(level)) return { ok: false, error: `Course ${i + 1}: choose a level from the list.` };
    if (!grades[i]?.trim() || !Number.isFinite(grade) || grade < 0 || grade > 100) return { ok: false, error: `Course ${i + 1}: the grade must be a percentage from 0 to 100.` };
    if (!Number.isInteger(year) || year < 9 || year > 12) return { ok: false, error: `Course ${i + 1}: the year must be 9 to 12.` };
    courses.push({ subject, level, grade_percentage: Math.round(grade * 10) / 10, grade_year: year });
  }
  if (courses.length > MAX_COURSES) return { ok: false, error: `Up to ${MAX_COURSES} courses, please.` };
  return { ok: true, courses };
}
