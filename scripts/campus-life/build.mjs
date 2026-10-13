// Builds the campus-life proxies for every shared university, at import
// time (the site only reads the stored result):
//
//   data/campus-life/coverage.md      how many schools have each proxy
//   supabase/seed_campus_life/*.sql   universities.campus_life, for Supabase
//
//   npm run data:campus-life:build
//
// Inputs (all committed): data/campus-life/ipeds.csv (from
// npm run data:campus-life:download), College Scorecard (data/scorecard),
// the curated schools and co-op rows (data/curated), the hand-checked
// campus-life rows (data/curated/campus_life.csv) and research impact
// (data/research-impact/values.json). The "Not sure" scores are computed
// with lib/campus-life-score.ts, the same code the site uses.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseCsv } from "../curated/csv.mjs";
import { academicCommunityScore, academicProxyValues, socialFunScore, socialProxyValues } from "../../lib/campus-life-score.ts";
import { ACADEMIC_PROXIES, ATHLETICS_LEVELS, SOCIAL_PROXIES } from "../../lib/campus-life-config.ts";
import { CURATED_CSV, IPEDS_CSV, REPORT_MD, ROWS_PER_SQL_FILE, SEED_DIR } from "./config.mjs";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (...p) => readFileSync(join(ROOT, ...p), "utf8");
const num = (v) => (v === "" || v == null ? null : Number(v));

const scorecard = JSON.parse(read("data", "scorecard", "universities.json")).universities;
const curatedSchools = parseCsv(read("data", "curated", "international_universities.csv"));
const coopRows = parseCsv(read("data", "curated", "coop_programs.csv"));
const research = JSON.parse(read("data", "research-impact", "values.json"));
const ipeds = new Map(parseCsv(readFileSync(IPEDS_CSV, "utf8")).map((r) => [Number(r.unitid), r]));
const campusRows = parseCsv(readFileSync(CURATED_CSV, "utf8"));

// ─── Check the hand-checked rows first: every one cited and dated ────────
const keys = new Set([...scorecard.map((s) => `scorecard:${s.scorecard_id}`), ...curatedSchools.map((c) => `curated:${c.curated_id}`)]);
const COUNT_PROXIES = ["project_teams", "academic_clubs", "hackathons", "social_clubs"];
const errors = [];
for (const r of campusRows) {
  const where = `campus_life.csv line ${r._line}`;
  if (!keys.has(r.key)) errors.push(`${where}: unknown school key ${r.key}`);
  if (!/^https:\/\//.test(r.source_url)) errors.push(`${where}: source_url must be an https link`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.checked_on)) errors.push(`${where}: checked_on must be YYYY-MM-DD`);
  if (r.proxy === "athletics") {
    if (!ATHLETICS_LEVELS.includes(r.value)) errors.push(`${where}: athletics must be one of ${ATHLETICS_LEVELS.join(", ")}`);
  } else if (!COUNT_PROXIES.includes(r.proxy)) {
    errors.push(`${where}: proxy must be athletics or one of ${COUNT_PROXIES.join(", ")}`);
  } else if (!Number.isInteger(Number(r.value)) || Number(r.value) < 0) {
    errors.push(`${where}: ${r.proxy} must be a whole number`);
  }
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
const curatedFor = (key) => campusRows.filter((r) => r.key === key);

// ─── One campus_life object per school (unknown fields left out) ──────────
function lifeFor(key, base) {
  const life = { ...base };
  const cited = [];
  for (const r of curatedFor(key)) {
    life[r.proxy] = r.proxy === "athletics" ? r.value : Number(r.value);
    cited.push({ proxy: r.proxy, source_url: r.source_url, checked_on: r.checked_on, label: r.label || undefined });
  }
  if (cited.length) life.curated = cited;
  for (const k of Object.keys(life)) if (life[k] === null || life[k] === undefined || life[k] === "") delete life[k];
  return life;
}

const coopByKey = new Map(coopRows.map((r) => [r.key, r.coop_program]));
const schools = [
  ...scorecard.map((s) => {
    const key = `scorecard:${s.scorecard_id}`;
    const row = ipeds.get(s.scorecard_id) ?? {};
    const conference = row.football_conference;
    const life = lifeFor(key, {
      locale: num(row.locale),
      undergrads: s.student_size ?? null,
      housing: num(row.housing_capacity),
      athletics: row.athletics || null,
      football: conference || null,
    });
    return { key, where: `scorecard_id = ${Number(s.scorecard_id)}`, name: s.name, country: s.country, life,
      coop_program: coopByKey.get(key) ?? "unknown", research_intensity: s.research_intensity ?? null, research_impact: research[key] ?? null };
  }),
  ...curatedSchools.map((c) => {
    const key = `curated:${c.curated_id}`;
    return { key, where: `curated_id = '${c.curated_id.replaceAll("'", "''")}'`, name: c.name, country: c.country, life: lifeFor(key, {}),
      coop_program: c.coop_program || "unknown", research_intensity: null, research_impact: research[key] ?? null };
  }),
];

// The "Not sure" scores, stored with the proxies.
for (const s of schools) {
  const row = { campus_life: s.life, coop_program: s.coop_program, research_intensity: s.research_intensity, research_impact: s.research_impact };
  const a = academicCommunityScore(row);
  const o = socialFunScore(row);
  s.life.academic_score = a.score;
  s.life.social_score = o.score;
  s.confidence = { academic: a.confidence, social: o.confidence };
  s.values = { ...academicProxyValues(row), ...socialProxyValues(row) };
}

// ─── SQL ─────────────────────────────────────────────────────────────────
const sqlText = (v) => `'${v.replaceAll("'", "''")}'`;
if (existsSync(SEED_DIR)) for (const f of readdirSync(SEED_DIR)) rmSync(join(SEED_DIR, f));
mkdirSync(SEED_DIR, { recursive: true });
const parts = Math.ceil(schools.length / ROWS_PER_SQL_FILE);
for (let i = 0; i < parts; i++) {
  const chunk = schools.slice(i * ROWS_PER_SQL_FILE, (i + 1) * ROWS_PER_SQL_FILE);
  writeFileSync(
    join(SEED_DIR, `${String(i + 1).padStart(2, "0")}_campus_life.sql`),
    [
      `-- Unicelerate campus-life proxies, part ${i + 1} of ${parts} (${chunk.length} universities)`,
      "-- Generated by scripts/campus-life/build.mjs. Do not edit by hand.",
      "-- Published figures only (IPEDS, College Scorecard, school and conference pages); a proxy, not a rating.",
      "-- Run after migration_023_campus_life.sql, files in order. Safe to re-run.",
      "",
      "begin;",
      ...chunk.map((s) => `update public.universities set campus_life = ${sqlText(JSON.stringify(s.life))}::jsonb where created_by is null and ${s.where};`),
      "commit;",
      "",
    ].join("\n")
  );
}

// ─── Coverage report ─────────────────────────────────────────────────────
const isUS = (s) => s.key.startsWith("scorecard:");
const groups = [["All shared schools", () => true], ["US (College Scorecard)", isUS], ["Outside the US (curated)", (s) => !isUS(s)]];
const count = (pred) => schools.filter(pred).length;
const lines = [
  "# Campus-life proxy coverage",
  "",
  "Generated by `npm run data:campus-life:build`. How each proxy is built and",
  "why: docs/CAMPUS-LIFE-DATA.md.",
  "",
  `| Proxy | ${groups.map(([g]) => g).join(" | ")} |`,
  `| --- | ${groups.map(() => "---").join(" | ")} |`,
  ...[...ACADEMIC_PROXIES, ...SOCIAL_PROXIES].map(
    (p) => `| ${ACADEMIC_PROXIES.includes(p) ? "Academic" : "Social"}: ${p} | ${groups.map(([, f]) => count((s) => f(s) && s.values[p] !== null)).join(" | ")} |`
  ),
  "",
  "## Confidence (proxies known: 3+ High, 2 Medium, 1 Low, 0 Not available)",
  "",
  `| Kind | Confidence | ${groups.map(([g]) => g).join(" | ")} |`,
  `| --- | --- | ${groups.map(() => "---").join(" | ")} |`,
];
for (const kind of ["academic", "social"]) {
  for (const c of ["High", "Medium", "Low", "Not available"]) {
    lines.push(`| ${kind} | ${c} | ${groups.map(([, f]) => count((s) => f(s) && s.confidence[kind] === c)).join(" | ")} |`);
  }
}
writeFileSync(REPORT_MD, lines.join("\n") + "\n");
console.log(`Wrote ${REPORT_MD} and ${parts} SQL files in ${SEED_DIR} (${schools.length} universities, ${campusRows.length} curated rows)`);
