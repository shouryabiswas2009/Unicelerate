// Validates the hand-curated CSVs in data/curated/ and writes
// supabase/seed_international/*.sql. Nothing is written if a check fails.
//
//   npm run data:build-international
//
// Files written (run them in order in the SQL Editor, after migration_011):
//   00_link_existing.sql   gives illustrative rows that a curated row
//                          replaces their curated_id, so they're updated in
//                          place (same id: saves and applications survive)
//   01_universities.sql …  upserts every curated university
//   90_coop.sql            co-op programs from data/curated/coop_programs.csv
//   91_rankings.sql        rankings you entered in international_rankings.csv
//
// Money is converted to US dollars here, at the ECB rates in
// lib/exchange-rates.ts (npm run data:fx), and the rate date is stored with
// the row so the app can label the figure "approximate, rate as of <date>".
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RATES_DATE, toUsd } from "../../lib/exchange-rates.ts";
import { parseCsv } from "./csv.mjs";
import { list, validateCoop, validateRankings, validateUniversities } from "./validate-lib.mjs";

const ROOT = join(import.meta.dirname, "..", "..");
const CURATED = join(ROOT, "data", "curated");
const OUT_DIR = join(ROOT, "supabase", "seed_international");
const BATCH_SIZE = 100;

const read = (file) => (existsSync(join(CURATED, file)) ? parseCsv(readFileSync(join(CURATED, file), "utf8")) : []);
const universities = read("international_universities.csv");
const coop = read("coop_programs.csv");
const rankings = read("international_rankings.csv");

const checks = [
  ["international_universities.csv", validateUniversities(universities)],
  ["coop_programs.csv", validateCoop(coop)],
  ["international_rankings.csv", validateRankings(rankings)],
];
let failed = false;
for (const [file, { errors, warnings }] of checks) {
  for (const w of warnings) console.warn(`warning  ${file} ${w}`);
  for (const e of errors) console.error(`ERROR    ${file} ${e}`);
  if (errors.length) failed = true;
}
if (failed) {
  console.error("Nothing written: fix the errors above first.");
  process.exit(1);
}
if (process.argv.includes("--check")) {
  console.log(`OK  ${universities.length} universities, ${coop.length} co-op rows, ${rankings.length} ranking rows: no errors`);
  process.exit(0);
}

// Values → SQL literals (same rules as the Scorecard generator). A Raw value
// is written as is (used for a typed empty jsonb).
class Raw {
  constructor(text) {
    this.text = text;
  }
}
function sql(value) {
  if (value instanceof Raw) return value.text;
  if (value === null || value === undefined || value === "") return "null";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) {
    return value.length ? `array[${value.map(sql).join(", ")}]::text[]` : "'{}'::text[]";
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}
const num = (v) => (v === "" || v == null ? null : Number(v));

function toRow(r) {
  const tuitionUsd = toUsd(num(r.tuition_local), r.tuition_currency);
  const livingUsd = toUsd(num(r.living_cost_local), r.living_cost_currency);
  const converted =
    (r.tuition_local && r.tuition_currency !== "USD") || (r.living_cost_local && r.living_cost_currency !== "USD");
  const place = [r.city, r.country].filter(Boolean).join(", ");
  return {
    curated_id: r.curated_id,
    name: r.name,
    aliases: list(r.aliases),
    country: r.country,
    city: r.city || null,
    degree_levels: list(r.degree_levels),
    tuition: tuitionUsd,
    tuition_local: num(r.tuition_local),
    tuition_currency: r.tuition_local ? r.tuition_currency : null,
    tuition_basis: r.tuition_basis || null,
    tuition_year: r.tuition_year || null,
    tuition_source_url: r.tuition_source_url || null,
    living_cost_per_year: livingUsd,
    living_cost_local: num(r.living_cost_local),
    living_cost_currency: r.living_cost_local ? r.living_cost_currency : null,
    living_cost_source_url: r.living_cost_source_url || null,
    fx_rate_date: converted ? RATES_DATE : null,
    acceptance_rate: num(r.acceptance_rate),
    acceptance_source_url: r.acceptance_source_url || null,
    popular_programs: list(r.popular_programs),
    programs_source_url: r.programs_source_url || null,
    coop_program: r.coop_program || "unknown",
    internship_support_url: r.coop_source_url || null,
    // A co-op status from this CSV was read on the row's checked date.
    coop_checked_on: r.coop_program && r.coop_program !== "unknown" ? r.checked_on : null,
    // A co-op status from this CSV was read on the row's checked date.
    coop_checked_on: r.coop_program && r.coop_program !== "unknown" ? r.checked_on : null,
    source: "curated",
    source_url: r.source_url,
    data_year: r.data_year,
    fetched_at: `${r.checked_on}T00:00:00Z`,
    description: `University in ${place}. Figures checked by hand on its own website; see Sources.`,
    is_featured: true, // hand-picked schools are always featured
    // An illustrative row upgraded to curated must not keep any illustrative
    // figure, so these are reset explicitly (rankings come only from
    // international_rankings.csv; GPA, SAT and IELTS aren't collected).
    qs_ranking: null,
    program_rankings: new Raw("'{}'::jsonb"),
    avg_admitted_gpa: null,
    sat_25: null,
    sat_75: null,
    min_ielts: null,
  };
}

const rows = universities.map(toRow);
const COLUMNS = Object.keys(rows[0] ?? toRow({ checked_on: "2000-01-01" }));
const UPDATED = COLUMNS.filter((c) => c !== "curated_id");

const header = (what) => `-- Unicelerate: curated international universities — ${what}
-- Generated by scripts/curated/build-international-sql.mjs from data/curated/.
-- Figures were checked by hand on each university's own website (URLs stored
-- with each row). Converted amounts use ECB rates of ${RATES_DATE}.
-- Run after migration_011 and migration_025, files in order. Safe to re-run.
`;

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

// 00: link illustrative rows that a curated row replaces.
const links = universities
  .filter((r) => r.match_existing_name)
  .map(
    (r) =>
      `update public.universities set curated_id = ${sql(r.curated_id)}\n  where name = ${sql(r.match_existing_name)} and created_by is null and curated_id is null and source = 'illustrative';`
  );
writeFileSync(
  join(OUT_DIR, "00_link_existing.sql"),
  header("link existing sample rows") + "\n" + (links.join("\n") || "-- (none)") + "\n"
);

// 01…: the universities themselves.
for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  const batch = rows.slice(i, i + BATCH_SIZE);
  const values = batch.map((row) => `  (${COLUMNS.map((c) => sql(row[c])).join(", ")})`).join(",\n");
  const part = String(i / BATCH_SIZE + 1).padStart(2, "0");
  writeFileSync(
    join(OUT_DIR, `${part}_universities.sql`),
    header(`universities, part ${part}`) +
      `
insert into public.universities (${COLUMNS.join(", ")})
values
${values}
on conflict (curated_id) do update set
${UPDATED.map((c) => `  ${c} = excluded.${c}`).join(",\n")}
where universities.created_by is null;
`
  );
}

// 90: co-op programs, by Scorecard id or curated id.
const coopSql = coop.map((r) => {
  const [kind, id] = r.key.split(":");
  const where = kind === "scorecard" ? `scorecard_id = ${Number(id)}` : `curated_id = ${sql(id)}`;
  return (
    `update public.universities set coop_program = ${sql(r.coop_program)}, internship_support_url = ${sql(r.source_url)}, ` +
    `coop_work_terms = ${sql(r.work_terms)}, coop_checked_on = ${sql(r.checked_on)}\n  where ${where} and created_by is null; -- ${r.university.replaceAll("\n", " ")}`
  );
});
writeFileSync(join(OUT_DIR, "90_coop.sql"), header("co-op programs") + "\n" + (coopSql.join("\n") || "-- (none yet)") + "\n");

// 91: rankings you entered by hand from public ranking pages.
const rankingSql = rankings.flatMap((r) => {
  const where = `lower(name) = lower(${sql(r.university)}) and created_by is null`;
  const out = [];
  if (r.overall_rank) out.push(`update public.universities set qs_ranking = ${Number(r.overall_rank)} where ${where};`);
  if (r.subject && r.subject_rank) {
    out.push(
      `update public.universities set program_rankings = program_rankings || jsonb_build_object(${sql(r.subject)}, ${Number(r.subject_rank)}) where ${where};`
    );
  }
  return out;
});
writeFileSync(join(OUT_DIR, "91_rankings.sql"), header("rankings") + "\n" + (rankingSql.join("\n") || "-- (none yet)") + "\n");

const count = (pred) => rows.filter(pred).length;
console.log(`Wrote supabase/seed_international/: ${rows.length} universities, ${links.length} upgraded in place, ${coop.length} co-op rows, ${rankings.length} ranking rows`);
console.log(`  with tuition: ${count((r) => r.tuition_local !== null)}, converted to USD: ${count((r) => r.tuition !== null)}`);
console.log(`  with living cost: ${count((r) => r.living_cost_local !== null)}, co-op known: ${count((r) => r.coop_program !== "unknown")}`);
