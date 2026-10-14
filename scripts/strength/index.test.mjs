// Sanity checks on the real, generated index (data/strength/index.csv, from
// npm run data:strength:build). If a data refresh breaks one of these, look
// at the inputs before changing the test.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsv } from "../curated/csv.mjs";

const ROOT = join(import.meta.dirname, "..", "..");
const rows = parseCsv(readFileSync(join(ROOT, "data", "strength", "index.csv"), "utf8"));
const scorecard = new Map(
  JSON.parse(readFileSync(join(ROOT, "data", "scorecard", "universities.json"), "utf8")).universities.map((u) => [`scorecard:${u.scorecard_id}`, u])
);
const byName = (name) => {
  const row = rows.find((r) => r.name === name);
  if (!row) throw new Error(`${name} isn't in the index`);
  return row;
};

describe("the generated strength index", () => {
  it("covers every shared university, and every featured one", () => {
    // Every school in the import: College Scorecard plus the curated list.
    const curated = parseCsv(readFileSync(join(import.meta.dirname, "..", "..", "data", "curated", "international_universities.csv"), "utf8"));
    const scorecard = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "data", "scorecard", "universities.json"), "utf8")).universities;
    expect(rows).toHaveLength(scorecard.length + curated.length);
    expect(rows.every((r) => r.index !== "" && r.tier !== "")).toBe(true);
  });

  it("puts well-known strong universities in the top tier", () => {
    for (const name of [
      "Massachusetts Institute of Technology", "Harvard University", "Stanford University", "Princeton University",
      "California Institute of Technology", "Yale University", "University of Oxford", "University of Cambridge", "ETH Zurich",
    ]) {
      expect(byName(name).tier, name).toBe("A");
    }
  });

  it("keeps strong teaching colleges high even though they publish little", () => {
    for (const name of ["Williams College", "Amherst College", "Swarthmore College", "Pomona College", "Wellesley College"]) {
      expect(["A", "B"], name).toContain(byName(name).tier);
    }
  });

  it("puts no R1 research university in the bottom tier, and places weak outcomes low", () => {
    const r1 = rows.filter((r) => scorecard.get(r.key)?.research_intensity === "very_high");
    expect(r1.length).toBeGreaterThan(100);
    expect(r1.some((r) => r.tier === "E")).toBe(false);
    // Colleges where fewer than a third graduate are mostly in D or E.
    const lowGrad = rows.filter((r) => (scorecard.get(r.key)?.completion_rate ?? 100) < 33);
    const lowTiers = lowGrad.filter((r) => r.tier === "D" || r.tier === "E").length;
    expect(lowTiers / lowGrad.length).toBeGreaterThan(0.8);
  });

  it("marks every estimate low-confidence with a range", () => {
    const estimates = rows.filter((r) => r.estimate === "yes");
    expect(estimates.every((r) => r.confidence === "Low" && /^[\d.]+-[\d.]+$/.test(r.range))).toBe(true);
    expect(rows.filter((r) => r.confidence === "Low" && r.estimate === "no")).toHaveLength(0);
  });
});
