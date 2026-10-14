import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import scorecard from "../../data/scorecard/universities.json";
import { LIST_COLUMNS, MAX_ROWS_PER_REQUEST, fetchAllRows, packRows, unpackRows, slimForList, type PackedRows } from "./universities";
import { DETAIL_ONLY_FIELDS, type StrengthDetails, type University } from "@/lib/types";
import { parseCsv } from "../../scripts/curated/csv.mjs";

// Regression guards for the slowness and the missing-schools bug measured
// in docs/PERFORMANCE.md.

// A fake API that, like Supabase, never returns more than 1,000 rows.
function cappedSource(total: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }));
  const calls: [number, number][] = [];
  const fetchRange = async (from: number, to: number) => {
    calls.push([from, to]);
    const end = Math.min(to + 1, from + MAX_ROWS_PER_REQUEST, total);
    return { data: rows.slice(from, end), error: null };
  };
  return { fetchRange, calls };
}

describe("fetchAllRows", () => {
  it("gets every row past the 1,000-row API limit (1,624 schools, not 1,000)", async () => {
    const { fetchRange, calls } = cappedSource(1624);
    const rows = await fetchAllRows(fetchRange);
    expect(rows).toHaveLength(1624);
    expect(new Set(rows.map((r) => r.id)).size).toBe(1624); // no repeats
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("makes one extra request when the total is an exact multiple of the page size", async () => {
    const { fetchRange, calls } = cappedSource(2000);
    expect(await fetchAllRows(fetchRange)).toHaveLength(2000);
    expect(calls).toHaveLength(3); // the third, empty page says "no more"
  });

  it("fails loudly instead of returning a partial list", async () => {
    const failing = async () => ({ data: null, error: { message: "boom" } });
    await expect(fetchAllRows(failing)).rejects.toThrow("boom");
  });
});

describe("LIST_COLUMNS", () => {
  it("selects exactly the fields of UniversitySummary", () => {
    // Required<University> makes TypeScript insist on every field, so a new
    // column added to the type can't be forgotten here.
    const everyField: Required<University> = {
      id: "", name: "", country: "", tuition: 0, qs_ranking: null, program_rankings: {},
      degree_levels: [], acceptance_rate: 0, avg_admitted_gpa: null, sat_25: null, sat_75: null,
      min_ielts: null, living_cost_per_year: null, popular_programs: [], description: "",
      created_by: null, created_at: "", source: "illustrative", data_year: null, fetched_at: null,
      source_url: null, scorecard_id: null, city: null, state: null, ownership: null, us_region: null,
      tuition_in_state: null, avg_net_price: null, student_size: null, completion_rate: null,
      median_earnings_10yr: null, research_intensity: null, retention_rate: null,
      coop_program: "unknown", internship_support_url: null, is_featured: false,
      curated_id: null, aliases: [], tuition_local: null, tuition_currency: null, tuition_basis: null,
      tuition_year: null, tuition_source_url: null, living_cost_local: null, living_cost_currency: null,
      living_cost_source_url: null, fx_rate_date: null, acceptance_source_url: null, programs_source_url: null,
      research_impact: null,
      strength_index: null, strength_low: null, strength_high: null, strength_tier: null, strength_confidence: null,
      strength_is_estimate: null, strength_position: null, strength_signals: null,
      campus_life: null,
    };
    const summaryFields = Object.keys(everyField).filter(
      (f) => !(DETAIL_ONLY_FIELDS as readonly string[]).includes(f)
    );
    expect([...LIST_COLUMNS].sort()).toEqual(summaryFields.sort());
  });

  it("keeps the cached list well under Next.js's 2 MB data-cache limit", () => {
    // What the cache would hold for every imported school, list columns only.
    const rows = scorecard.universities.map((u) =>
      Object.fromEntries(
        LIST_COLUMNS.map((c) => [c, (u as Record<string, unknown>)[c] ?? null])
      )
    );
    // Cached packed (packRows): column names once, not on every row.
    const bytes = new TextEncoder().encode(JSON.stringify(packRows(rows))).length;
    expect(bytes).toBeLessThan(1.5 * 1024 * 1024);
  });
});

describe("packRows / unpackRows (the cached list)", () => {
  // Every list column for each real College Scorecard school, with the real
  // strength index values from supabase/seed_strength (as the database
  // returns them after migration_019).
  const strength = new Map<number, Record<string, unknown>>();
  for (const file of readdirSync(join(__dirname, "..", "..", "supabase", "seed_strength"))) {
    const sql = readFileSync(join(__dirname, "..", "..", "supabase", "seed_strength", file), "utf8");
    for (const m of sql.matchAll(/strength_index = ([\d.]+), .*strength_signals = '(.*)'::jsonb where created_by is null and scorecard_id = (\d+);/g)) {
      strength.set(Number(m[3]), { strength_index: Number(m[1]), strength_signals: JSON.parse(m[2].replaceAll("''", "'")) });
    }
  }
  // …and the real campus-life proxies (supabase/seed_campus_life, migration_023).
  const campus = new Map<number, unknown>();
  for (const file of readdirSync(join(__dirname, "..", "..", "supabase", "seed_campus_life"))) {
    const sql = readFileSync(join(__dirname, "..", "..", "supabase", "seed_campus_life", file), "utf8");
    for (const m of sql.matchAll(/campus_life = '(.*)'::jsonb where created_by is null and scorecard_id = (\d+);/g)) {
      campus.set(Number(m[2]), JSON.parse(m[1].replaceAll("''", "'")));
    }
  }
  const rows = scorecard.universities.map((u: Record<string, unknown>) => ({
    ...Object.fromEntries(LIST_COLUMNS.map((c) => [c, u[c] ?? null])),
    id: "6845fafb-6f85-41bc-9d31-878a990bb4ff",
    strength_low: null, strength_high: null, strength_tier: "B", strength_confidence: "High",
    strength_is_estimate: false, strength_position: 412,
    ...strength.get(u.scorecard_id as number),
    campus_life: campus.get(u.scorecard_id as number) ?? null,
  }));

  it("gives back exactly the rows it was given", () => {
    const sample = rows.slice(0, 50);
    expect(unpackRows(packRows(sample))).toEqual(sample);
    expect(unpackRows(packRows([]))).toEqual([]);
  });

  it("keeps the whole list, strength index and campus life included, under the 2 MB data-cache limit with headroom", () => {
    expect(strength.size).toBe(scorecard.universities.length);
    expect(campus.size).toBe(scorecard.universities.length);
    const packed = new TextEncoder().encode(JSON.stringify(packRows(rows.map((r) => slimForList(r as { strength_signals?: StrengthDetails | null; fetched_at?: string }))))).length;
    // These are the College Scorecard rows only. The hand-curated
    // international rows are added at their measured size: in the exported
    // list (data/fixtures) a curated row is larger than a Scorecard one
    // (fee notes, other names), by this ratio.
    const fixture = JSON.parse(readFileSync(join(__dirname, "..", "..", "data", "fixtures", "shared-universities.json"), "utf8")) as PackedRows;
    const source = fixture.columns.indexOf("source");
    const avg = (kind: string) => {
      const sizes = fixture.rows.filter((r) => r[source] === kind).map((r) => JSON.stringify(r).length);
      return sizes.reduce((a, b) => a + b, 0) / sizes.length;
    };
    const ratio = avg("curated") / avg("College Scorecard");
    const curated = parseCsv(readFileSync(join(__dirname, "..", "..", "data", "curated", "international_universities.csv"), "utf8")).length;
    const estimate = packed + (packed / rows.length) * ratio * curated;
    console.log(`packed list ≈ ${Math.round(estimate / 1024)} KB for ${rows.length + curated} schools (curated rows ×${ratio.toFixed(2)})`);
    // Next.js skips caching an entry over 2 MB; keep 10% headroom.
    expect(estimate).toBeLessThan(0.9 * 2 * 1024 * 1024);
  });

  it("caches each strength signal's percentile and the fetch day, not raw figures or times", () => {
    const row = {
      name: "X",
      fetched_at: "2026-10-06T13:27:54.954+00:00",
      strength_signals: { signals: { sat: { value: 1400, percentile: 91.2 } }, of: 1790, computed_on: "2026-10-14" },
    };
    expect(slimForList(row)).toEqual({
      name: "X",
      fetched_at: "2026-10-06",
      strength_signals: { signals: { sat: { percentile: 91.2 } }, of: 1790, computed_on: "2026-10-14" },
    });
    expect(row.strength_signals.signals.sat.value).toBe(1400); // the original isn't changed
    expect(slimForList({ name: "Y", strength_signals: null, fetched_at: null })).toEqual({ name: "Y", strength_signals: null, fetched_at: null });
  });

});
