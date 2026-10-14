// Appends a batch of reviewed universities to
// data/curated/international_universities.csv. The batch is a JSON file of
// facts already read from official pages (see fetch-page.mjs); identity
// (official name, other names, city, website) comes from the ROR record of
// each candidate (data/curated/candidates.csv), never typed by hand.
//
//   node scripts/curated/add-batch.mjs data/curated/batches/<name>.json
//
// A batch row: { ror, curated_id, degree_levels, tuition?: { local,
// currency, basis, year, url }, notes? }. Rows already in the file (same
// curated_id) are skipped, so re-running is safe.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseCsv, toCsv } from "./csv.mjs";
import { UNIVERSITY_COLUMNS } from "./validate-lib.mjs";

// parseCsv adds a _line number to each row; it isn't a column.
const withoutLine = (r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== "_line"));

const ROOT = join(import.meta.dirname, "..", "..");
const CSV = join(ROOT, "data", "curated", "international_universities.csv");
const batch = JSON.parse(readFileSync(process.argv[2], "utf8"));
const candidates = new Map(parseCsv(readFileSync(join(ROOT, "data", "curated", "candidates.csv"), "utf8")).map((c) => [c.ror, c]));
const existing = parseCsv(readFileSync(CSV, "utf8"));
const have = new Set(existing.map((r) => r.curated_id));

// https, without a trailing slash, as the other rows are written.
const site = (url) => url.replace(/^http:\/\//, "https://").replace(/\/+$/, "");

// --fill: for rows already in the file, only fill a tuition that's empty
// (never overwrite one), adding where it came from to the notes.
const fill = process.argv.includes("--fill");
let filled = 0;
if (fill) {
  const byId = new Map(existing.map((r) => [r.curated_id, r]));
  for (const b of batch.rows) {
    const r = byId.get(b.curated_id);
    if (!r || r.tuition_local !== "" || !b.tuition) continue;
    Object.assign(r, {
      tuition_local: String(b.tuition.local),
      tuition_currency: b.tuition.currency,
      tuition_basis: b.tuition.basis,
      tuition_year: b.tuition.year,
      tuition_source_url: b.tuition.url,
      notes: [r.notes, b.notes].filter(Boolean).join("; "),
    });
    filled++;
  }
}

const added = [];
for (const b of batch.rows) {
  if (have.has(b.curated_id)) continue;
  const c = candidates.get(b.ror);
  if (!c) throw new Error(`${b.curated_id}: ROR ${b.ror} isn't in candidates.csv`);
  const t = b.tuition;
  added.push({
    curated_id: b.curated_id,
    // A batch can override identity when ROR is out of date (a merger).
    name: b.name ?? c.name,
    aliases: b.aliases ?? c.aliases,
    country: c.country,
    city: b.city ?? c.city,
    match_existing_name: "",
    degree_levels: b.degree_levels,
    tuition_local: t?.local ?? "",
    tuition_currency: t?.currency ?? "",
    tuition_basis: t?.basis ?? "",
    tuition_year: t?.year ?? "",
    tuition_source_url: t?.url ?? "",
    living_cost_local: "",
    living_cost_currency: "",
    living_cost_source_url: "",
    acceptance_rate: "",
    acceptance_source_url: "",
    popular_programs: "",
    programs_source_url: "",
    coop_program: "unknown",
    coop_source_url: "",
    source_url: site(b.website ?? c.website),
    data_year: batch.data_year,
    checked_on: batch.checked_on,
    notes: b.notes ?? "",
  });
}
const header = readFileSync(CSV, "utf8").split("\n")[0].replace(/^﻿/, "").split(",");
if (header.join(",") !== UNIVERSITY_COLUMNS.join(",")) throw new Error("international_universities.csv columns changed: update add-batch.mjs");
const all = [...existing.map(withoutLine), ...added];
writeFileSync(CSV, toCsv(UNIVERSITY_COLUMNS, all));
if (fill) console.log(`Filled tuition for ${filled} existing universities.`);
console.log(`Added ${added.length} universities (${added.filter((r) => r.tuition_local !== "").length} with tuition); ${all.length} in the file.`);
