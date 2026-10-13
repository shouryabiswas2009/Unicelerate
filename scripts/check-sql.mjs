// Applies every SQL file to a throwaway in-memory Postgres (PGlite), the
// same order you'd run them in Supabase: seed.sql, the numbered migrations,
// then supabase/seed_scorecard/*.sql — the Scorecard files twice, to prove
// re-running them is safe. Exits with an error if anything fails.
//
//   npm run db:check
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createInMemoryDb } from "./in-memory-db.mjs";

const SCORECARD_DIR = join(import.meta.dirname, "..", "supabase", "seed_scorecard");

const { db, applied } = await createInMemoryDb();
console.log(`OK  ${applied.join(", ")}`);

const files = readdirSync(SCORECARD_DIR).filter((f) => f.endsWith(".sql")).sort();
const counts = [];
for (const run of [1, 2]) {
  for (const f of files) await db.exec(readFileSync(join(SCORECARD_DIR, f), "utf8"));
  const { rows } = await db.query("select count(*)::int as n from public.universities");
  counts.push(rows[0].n);
  console.log(`OK  seed_scorecard (${files.length} files), run ${run}: ${rows[0].n} universities`);
}

const { rows: bySource } = await db.query(
  "select source, count(*)::int as n from public.universities group by source order by source"
);
console.log("    by source:", bySource.map((r) => `${r.source} ${r.n}`).join(", "));

if (counts[0] !== counts[1]) {
  console.error("FAIL re-running the Scorecard files changed the row count — they should upsert.");
  process.exit(1);
}

// Curated international rows: run twice too. The second run must not add
// rows (upsert by curated_id), and upgraded sample rows must keep their id.
const INTL_DIR = join(import.meta.dirname, "..", "supabase", "seed_international");
const intlFiles = existsSync(INTL_DIR) ? readdirSync(INTL_DIR).filter((f) => f.endsWith(".sql")).sort() : [];
const intlCounts = [];
for (let run = 0; run < 2; run++) {
  for (const f of intlFiles) await db.exec(readFileSync(join(INTL_DIR, f), "utf8"));
  const { rows } = await db.query("select count(*)::int as n from public.universities");
  intlCounts.push(rows[0].n);
}
if (intlFiles.length) {
  const { rows: curated } = await db.query("select count(*)::int as n from public.universities where source = 'curated'");
  console.log(`OK  seed_international (${intlFiles.length} files) run twice: ${intlCounts.join(" → ")} universities, ${curated[0].n} curated`);
  if (intlCounts[0] !== intlCounts[1]) {
    console.error("FAIL re-running seed_international changed the row count — it should upsert.");
    process.exit(1);
  }
}

// Visa and post-study guidance per country (migration_012): run twice too.
const COUNTRY_SQL = join(import.meta.dirname, "..", "supabase", "seed_country_info.sql");
if (existsSync(COUNTRY_SQL)) {
  await db.exec(readFileSync(COUNTRY_SQL, "utf8"));
  await db.exec(readFileSync(COUNTRY_SQL, "utf8"));
  const { rows } = await db.query("select count(*)::int as n from public.country_info");
  console.log(`OK  seed_country_info.sql run twice: ${rows[0].n} countries`);
}

// Research impact (migration_015): run twice; every accepted match must land
// on exactly one row.
const IMPACT_SQL = join(import.meta.dirname, "..", "supabase", "seed_research_impact.sql");
if (existsSync(IMPACT_SQL)) {
  const text = readFileSync(IMPACT_SQL, "utf8");
  await db.exec(text);
  await db.exec(text);
  const expectedImpact = Number(text.match(/\((\d+) accepted\)/)[1]);
  const { rows } = await db.query("select count(*)::int as n from public.universities where research_impact is not null");
  console.log(`OK  seed_research_impact.sql run twice: ${rows[0].n} universities with research impact (expected ${expectedImpact})`);
  if (rows[0].n !== expectedImpact) {
    console.error("FAIL some accepted research-impact matches didn't find their university.");
    process.exit(1);
  }
}

// Strength index (migration_019): run twice; every statement must find
// its university.
const STRENGTH_DIR = join(import.meta.dirname, "..", "supabase", "seed_strength");
const strengthFiles = existsSync(STRENGTH_DIR) ? readdirSync(STRENGTH_DIR).filter((f) => f.endsWith(".sql")).sort() : [];
if (strengthFiles.length) {
  let expectedStrength = 0;
  for (let run = 0; run < 2; run++) {
    for (const f of strengthFiles) {
      const text = readFileSync(join(STRENGTH_DIR, f), "utf8");
      if (run === 0) expectedStrength += (text.match(/^update /gm) ?? []).length;
      await db.exec(text);
    }
  }
  const { rows } = await db.query(
    "select count(*)::int as n, count(*) filter (where strength_is_estimate)::int as est from public.universities where strength_index is not null"
  );
  console.log(`OK  seed_strength (${strengthFiles.length} files) run twice: ${rows[0].n} universities with an index (expected ${expectedStrength}), ${rows[0].est} estimates`);
  if (rows[0].n !== expectedStrength) {
    console.error("FAIL some strength-index rows didn't find their university.");
    process.exit(1);
  }
}

// Campus-life proxies (migration_023): run twice; every statement must find
// its university.
const CAMPUS_DIR = join(import.meta.dirname, "..", "supabase", "seed_campus_life");
const campusFiles = existsSync(CAMPUS_DIR) ? readdirSync(CAMPUS_DIR).filter((f) => f.endsWith(".sql")).sort() : [];
if (campusFiles.length) {
  let expectedCampus = 0;
  for (let run = 0; run < 2; run++) {
    for (const f of campusFiles) {
      const text = readFileSync(join(CAMPUS_DIR, f), "utf8");
      if (run === 0) expectedCampus += (text.match(/^update /gm) ?? []).length;
      await db.exec(text);
    }
  }
  const { rows } = await db.query("select count(*)::int as n from public.universities where campus_life is not null");
  console.log(`OK  seed_campus_life (${campusFiles.length} files) run twice: ${rows[0].n} universities with campus-life data (expected ${expectedCampus})`);
  if (rows[0].n !== expectedCampus) {
    console.error("FAIL some campus-life rows didn't find their university.");
    process.exit(1);
  }
}

// The featured rule exists twice (SQL for the database, JavaScript for counts
// and tests). Run the SQL and check both agree on the Scorecard schools.
const FEATURED_SQL = join(import.meta.dirname, "..", "supabase", "featured", "featured.sql");
await db.exec(readFileSync(FEATURED_SQL, "utf8"));
await db.exec(readFileSync(FEATURED_SQL, "utf8")); // safe to re-run
const { rows: featuredRows } = await db.query(
  "select count(*)::int as n from public.universities where is_featured and source = 'College Scorecard'"
);
const { rows: allRows } = await db.query(
  "select count(*)::int as n from public.universities where is_featured"
);
const expected = Number(readFileSync(FEATURED_SQL, "utf8").match(/Expected: (\d+) of/)[1]);
console.log(
  `OK  featured.sql: ${featuredRows[0].n} College Scorecard schools featured (JavaScript rule: ${expected}), ${allRows[0].n} featured in total`
);
if (featuredRows[0].n !== expected) {
  console.error("FAIL the SQL and JavaScript versions of the featured rule disagree.");
  process.exit(1);
}
