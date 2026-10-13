"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  COURSE_BLEND_WEIGHT,
  COURSE_LEVELS,
  COURSE_SUBJECTS,
  FAMILY_LABELS,
  LEVEL_LABELS,
  LEVEL_MULTIPLIER,
  MAX_COURSES,
  MIN_RELEVANT_COURSES,
  SUBJECT_LABELS,
  TIER_WEIGHT,
  type CourseLevel,
  type CourseSubject,
} from "@/lib/course-config";
import { effectiveGrade, familyForProfile, relevantCourseAverage, weightsSummary, type ProfileCourse } from "@/lib/courses";

// Optional course list in "Your academics": each course's subject, level,
// grade (%) and year. Courses relevant to the intended major count more in a
// "relevant-coursework average" (lib/courses.ts). Plain native controls,
// one row per course, keyboard-friendly; sent as parallel lists that the
// server validates (validateCourses).

type Row = { key: number; subject: CourseSubject | ""; level: CourseLevel; grade: string; year: string };

const control = "h-11 w-full rounded-md border bg-background px-2 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

export function CoursesEditor({
  initial,
  overall,
  majors,
}: {
  initial: ProfileCourse[];
  overall: number | null; // the saved overall percentage
  majors: string[];
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    initial.map((c, i) => ({ key: i, subject: c.subject, level: c.level, grade: String(c.grade_percentage), year: String(c.grade_year) }))
  );
  const [nextKey, setNextKey] = useState(initial.length);
  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // Live summary from the rows as typed (the server checks them on save).
  const courses: ProfileCourse[] = rows
    .filter((r) => r.subject && r.grade.trim() && Number.isFinite(Number(r.grade)) && Number(r.grade) >= 0 && Number(r.grade) <= 100)
    .map((r) => ({ subject: r.subject as CourseSubject, level: r.level, grade_percentage: Number(r.grade), grade_year: Number(r.year) || 12 }));
  const family = familyForProfile({ intended_majors: majors });
  const relevant = relevantCourseAverage(courses, family);
  const blended = overall !== null ? effectiveGrade({ gpa_percentage: overall, intended_majors: majors, courses }) : null;
  const change = overall !== null && blended !== null ? Math.round((blended - overall) * 10) / 10 : 0;

  return (
    <fieldset className="space-y-4 sm:col-span-2">
      <legend className="text-sm font-medium">Your courses (optional)</legend>
      <p className="text-xs text-muted-foreground">
        Add the courses on your transcript. Ones relevant to your intended major count more. Leave this empty and
        nothing changes.
      </p>
      <input type="hidden" name="courses_present" value="1" />

      {rows.length > 0 && (
        <div className="divide-y border-y">
          <div className="hidden grid-cols-[1.4fr_1fr_6rem_5rem_2.75rem] gap-2 py-2 text-xs text-muted-foreground sm:grid">
            <span>Subject</span>
            <span>Level</span>
            <span>Grade (%)</span>
            <span>Year</span>
            <span className="sr-only">Remove</span>
          </div>
          {rows.map((r, i) => (
            <div key={r.key} className="grid grid-cols-2 gap-2 py-3 sm:grid-cols-[1.4fr_1fr_6rem_5rem_2.75rem] sm:items-center">
              <select aria-label={`Course ${i + 1} subject`} name="course_subject" value={r.subject} onChange={(e) => update(r.key, { subject: e.target.value as CourseSubject })} className={`${control} col-span-2 sm:col-span-1`}>
                <option value="">Choose a subject</option>
                {COURSE_SUBJECTS.map((s) => (
                  <option key={s} value={s}>
                    {SUBJECT_LABELS[s]}
                  </option>
                ))}
              </select>
              <select aria-label={`Course ${i + 1} level`} name="course_level" value={r.level} onChange={(e) => update(r.key, { level: e.target.value as CourseLevel })} className={control}>
                {COURSE_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {LEVEL_LABELS[l]}
                  </option>
                ))}
              </select>
              <input aria-label={`Course ${i + 1} grade (%)`} name="course_grade" type="number" min={0} max={100} step="0.1" inputMode="decimal" value={r.grade} onChange={(e) => update(r.key, { grade: e.target.value })} placeholder="e.g. 92" className={control} />
              <select aria-label={`Course ${i + 1} year`} name="course_year" value={r.year} onChange={(e) => update(r.key, { year: e.target.value })} className={control}>
                {[12, 11, 10, 9].map((y) => (
                  <option key={y} value={y}>
                    Grade {y}
                  </option>
                ))}
              </select>
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove course ${i + 1}`} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="size-11">
                <X aria-hidden />
              </Button>
            </div>
          ))}
        </div>
      )}
      {rows.length < MAX_COURSES ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => {
            setRows((rs) => [...rs, { key: nextKey, subject: "", level: "standard", grade: "", year: "12" }]);
            setNextKey((k) => k + 1);
          }}
        >
          <Plus aria-hidden /> Add a course
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">That&apos;s the maximum of {MAX_COURSES} courses.</p>
      )}

      {/* What the list does for this student, computed from the rows above. */}
      <div className="space-y-2 border-l-2 border-primary/40 pl-4 text-sm" aria-live="polite">
        {!family ? (
          <p className="text-muted-foreground">Add an intended major (section 03) to see which courses count most.</p>
        ) : !relevant ? (
          <p className="text-muted-foreground">
            Not enough courses to say: add at least {MIN_RELEVANT_COURSES} courses relevant to {FAMILY_LABELS[family]}.
          </p>
        ) : (
          <>
            <p>
              Overall average <strong>{overall ?? "not set"}{overall !== null && "%"}</strong> · relevant-coursework average for{" "}
              {FAMILY_LABELS[family]} <strong>{relevant.average}%</strong> ({relevant.relevantCount} relevant course
              {relevant.relevantCount === 1 ? "" : "s"}
              {relevant.rigorous > 0 ? `, ${relevant.rigorous} at AP/IB/A Level/Honors` : ""}).
            </p>
            {overall !== null && blended !== null && (
              <p>
                {change === 0
                  ? `The grade used for academic fit stays at ${overall}%.`
                  : `The grade used for academic fit moves from ${overall}% to ${blended}% (${change > 0 ? "+" : ""}${change} points).`}{" "}
                <span className="text-muted-foreground">
                  No school in our shared list publishes an admitted-student average yet, so today this changes scores only
                  for schools you add yourself with one, plus the required-course checks.
                </span>
              </p>
            )}
          </>
        )}
        {family && (
          <p className="text-xs text-muted-foreground">
            Weights for {FAMILY_LABELS[family]}:{" "}
            {weightsSummary(family)
              .map((w) => `${w.label} ${w.weight.toFixed(1)}`)
              .join(", ")}
            .
          </p>
        )}
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer underline underline-offset-2">How this works</summary>
          <p className="mt-2">
            Each course counts by how relevant it is to your major: core {TIER_WEIGHT.core}, supporting{" "}
            {TIER_WEIGHT.supporting}, general {TIER_WEIGHT.general}, times a small level multiplier (Standard{" "}
            {LEVEL_MULTIPLIER.standard}, Honors {LEVEL_MULTIPLIER.honors}, AP / IB HL / A Level {LEVEL_MULTIPLIER.ap}) that
            changes how much a course counts, never its grade. The grade used for academic fit is{" "}
            {Math.round((1 - COURSE_BLEND_WEIGHT) * 100)}% your overall average and {Math.round(COURSE_BLEND_WEIGHT * 100)}%
            this relevant-coursework average. These are our weights, based on published preparation guidance from
            university program pages; they&apos;re a modelling choice, not an official equivalence. The demo admission
            estimate doesn&apos;t use courses: it was trained without them and keeps your overall average.
          </p>
        </details>
      </div>
    </fieldset>
  );
}
