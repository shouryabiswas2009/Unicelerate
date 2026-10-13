import type { CourseSubject, MajorFamily } from "@/lib/course-config";

// High-school courses that a few featured programs REQUIRE, copied from the
// school's own program page (source_url, checked_on). Only used to add a
// concern line when a student has entered courses and none of a required
// group is in their list. Programs whose requirement couldn't be verified
// are left out (docs/COURSE-RELEVANCE-SOURCES.md lists them).
//
// `requires`: groups; each group is satisfied by any one of its subjects
// (e.g. A Level Mathematics counts whether the student listed
// "Mathematics" or "Calculus / Advanced Maths"); `count` asks for several.

export type RequirementGroup = { label: string; anyOf: CourseSubject[]; count?: number };

export type ProgramPrerequisite = {
  university: string; // exactly as in our data (name)
  program: string;
  family: MajorFamily;
  requires: RequirementGroup[];
  source_url: string;
  checked_on: string;
};

const MATHS: RequirementGroup = { label: "Mathematics", anyOf: ["mathematics", "calculus"] };
const ADVANCED_FUNCTIONS: RequirementGroup = { label: "Advanced Functions", anyOf: ["mathematics", "calculus"] };
const CALCULUS: RequirementGroup = { label: "Calculus", anyOf: ["calculus"] };
const ENGLISH: RequirementGroup = { label: "English", anyOf: ["english"] };
const PHYSICS: RequirementGroup = { label: "Physics", anyOf: ["physics"] };
const CHEMISTRY: RequirementGroup = { label: "Chemistry", anyOf: ["chemistry"] };
const CHECKED = "2026-10-13";

const waterlooEngineering = (program: string, slug: string): ProgramPrerequisite => ({
  university: "University of Waterloo",
  program,
  family: "engineering",
  requires: [ADVANCED_FUNCTIONS, CALCULUS, CHEMISTRY, PHYSICS, ENGLISH],
  source_url: `https://uwaterloo.ca/future-students/programs/${slug}`,
  checked_on: CHECKED,
});

export const PROGRAM_PREREQUISITES: ProgramPrerequisite[] = [
  {
    university: "University of Waterloo",
    program: "Computer Science",
    family: "computer_science",
    requires: [ADVANCED_FUNCTIONS, CALCULUS, ENGLISH],
    source_url: "https://uwaterloo.ca/future-students/programs/computer-science",
    checked_on: CHECKED,
  },
  waterlooEngineering("Software Engineering", "software-engineering"),
  waterlooEngineering("Mechanical Engineering", "mechanical-engineering"),
  waterlooEngineering("Electrical Engineering", "electrical-engineering"),
  waterlooEngineering("Biomedical Engineering", "biomedical-engineering"),
  {
    university: "University of Waterloo",
    program: "Mathematics",
    family: "math_stats",
    requires: [ADVANCED_FUNCTIONS, CALCULUS, ENGLISH],
    source_url: "https://uwaterloo.ca/future-students/programs/mathematics",
    checked_on: CHECKED,
  },
  {
    university: "University of Waterloo",
    program: "Accounting and Financial Management",
    family: "business_econ",
    requires: [ADVANCED_FUNCTIONS, CALCULUS, ENGLISH],
    source_url: "https://uwaterloo.ca/future-students/programs/accounting-and-financial-management",
    checked_on: CHECKED,
  },
  {
    university: "University of Waterloo",
    program: "Economics",
    family: "business_econ",
    requires: [ENGLISH], // calculus is "strongly recommended", not required
    source_url: "https://uwaterloo.ca/future-students/programs/economics",
    checked_on: CHECKED,
  },
  {
    university: "University of Toronto",
    program: "Computer Science",
    family: "computer_science",
    requires: [CALCULUS, ENGLISH],
    source_url: "https://future.utoronto.ca/undergraduate-programs/computer-science/",
    checked_on: CHECKED,
  },
  {
    university: "University of Toronto",
    program: "Engineering",
    family: "engineering",
    requires: [MATHS, CHEMISTRY, PHYSICS],
    source_url: "https://discover.engineering.utoronto.ca/applying/admission-requirements/",
    checked_on: CHECKED,
  },
  {
    university: "University of Cambridge",
    program: "Computer Science",
    family: "computer_science",
    requires: [MATHS],
    source_url: "https://www.undergraduate.study.cam.ac.uk/courses/computer-science",
    checked_on: CHECKED,
  },
  {
    university: "University of Cambridge",
    program: "Economics",
    family: "business_econ",
    requires: [MATHS],
    source_url: "https://www.undergraduate.study.cam.ac.uk/courses/economics",
    checked_on: CHECKED,
  },
  {
    university: "University of Cambridge",
    program: "Engineering",
    family: "engineering",
    requires: [MATHS, PHYSICS],
    source_url: "https://www.undergraduate.study.cam.ac.uk/courses/engineering",
    checked_on: CHECKED,
  },
  {
    university: "University of Cambridge",
    program: "Medicine",
    family: "life_health",
    requires: [CHEMISTRY, { label: "Biology, Mathematics or Physics", anyOf: ["biology", "mathematics", "calculus", "physics"] }],
    source_url: "https://www.undergraduate.study.cam.ac.uk/courses/medicine",
    checked_on: CHECKED,
  },
  {
    university: "University of Cambridge",
    program: "Natural Sciences",
    family: "physical_sciences",
    requires: [MATHS, { label: "two of Biology, Chemistry, Physics", anyOf: ["biology", "chemistry", "physics"], count: 2 }],
    source_url: "https://www.undergraduate.study.cam.ac.uk/courses/natural-sciences",
    checked_on: CHECKED,
  },
  {
    university: "London School of Economics and Political Science",
    program: "Economics",
    family: "business_econ",
    requires: [MATHS],
    source_url: "https://www.lse.ac.uk/study-at-lse/undergraduate/bsc-economics",
    checked_on: CHECKED,
  },
];
