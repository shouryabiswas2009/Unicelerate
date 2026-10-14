// Exports the shared university list (what every visitor can already see,
// read with the public key) into data/fixtures/shared-universities.json, so
// ranking and filter tests run on the real data the site uses: strength
// index, curated tuition in US dollars, campus life and all.
//
//   npm run data:export-fixture
//
// Re-run after an import changes the shared list. Only the list columns
// (LIST_COLUMNS in lib/data/universities.ts, checked by a test) are kept,
// packed by column like the site's cache.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const COLUMNS = [
  "id", "name", "country", "city", "state", "tuition", "qs_ranking", "program_rankings",
  "degree_levels", "acceptance_rate", "avg_admitted_gpa", "sat_25", "sat_75", "min_ielts",
  "living_cost_per_year", "popular_programs", "created_by", "source", "data_year", "fetched_at",
  "source_url", "completion_rate", "research_intensity", "retention_rate", "coop_program",
  "internship_support_url", "is_featured", "aliases", "tuition_local", "tuition_currency",
  "tuition_basis", "fx_rate_date", "median_earnings_10yr", "research_impact",
  "strength_index", "strength_low", "strength_high", "strength_tier", "strength_confidence",
  "strength_is_estimate", "strength_position", "strength_signals", "campus_life",
];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Needs NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (from .env.local).");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase
    .from("universities")
    .select(COLUMNS.join(","))
    .is("created_by", null)
    .order("id")
    .range(from, from + 999);
  if (error) throw new Error(error.message);
  rows.push(...data);
  if (data.length < 1000) break;
}
// Drop the bulky per-signal detail the ranking doesn't read.
for (const r of rows) r.strength_signals = null;

const out = join(import.meta.dirname, "..", "data", "fixtures", "shared-universities.json");
writeFileSync(out, JSON.stringify({ exported_on: new Date().toISOString().slice(0, 10), columns: COLUMNS, rows: rows.map((r) => COLUMNS.map((c) => r[c] ?? null)) }));
console.log(`Wrote ${out}: ${rows.length} universities`);
