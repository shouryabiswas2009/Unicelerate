// Lists candidate universities to add, from open data only, so which
// schools we add follows a rule rather than memory:
//
//   in the CWTS Leiden Ranking Open Edition 2025 (CC0: at least 1,500
//   research papers), in the chosen countries, an "education" organisation
//   in ROR (CC0), and not already in our list.
//
// For each one, ROR gives the official name, other names and acronyms, the
// city and the official website. Responses are cached in
// ml/data/raw/candidates/ (git-ignored) and fetched one per second.
//
//   node scripts/curated/candidates.mjs Canada "United Kingdom" … [--top=N]
//   → data/curated/candidates.csv (reviewed by hand before any row is added)
//   --top=N keeps the N largest per country (by Leiden publications), so a
//   country with hundreds of listed universities doesn't need them all.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseCsv, toCsv } from "./csv.mjs";

// parseCsv adds a _line number to each row; it isn't a column.
const withoutLine = (r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== "_line"));

const ROOT = join(import.meta.dirname, "..", "..");
const CACHE = join(ROOT, "ml", "data", "raw", "candidates", "ror");
mkdirSync(CACHE, { recursive: true });
const top = Number(process.argv.find((a) => a.startsWith("--top="))?.slice(6) ?? Infinity);
const countries = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (countries.length === 0) {
  console.error('Usage: node scripts/curated/candidates.mjs Canada "United Kingdom" …');
  process.exit(1);
}

const leiden = JSON.parse(readFileSync(join(ROOT, "ml", "data", "raw", "research-impact", "leiden-2025", "extract.json"), "utf8")).filter(
  (r) => r.field === "All sciences"
);
const values = JSON.parse(readFileSync(join(ROOT, "data", "research-impact", "values.json"), "utf8"));
const ours = new Set(Object.values(values).map((v) => v.ror));
const curated = parseCsv(readFileSync(join(ROOT, "data", "curated", "international_universities.csv"), "utf8"));
const ourNames = new Set(curated.map((c) => `${c.name.toLowerCase()}|${c.country}`));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function ror(id) {
  const file = join(CACHE, `${id}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  await sleep(1000); // polite: one request a second
  const res = await fetch(`https://api.ror.org/v2/organizations/${id}`, { headers: { "User-Agent": "Unicelerate/1.0 (https://www.unicelerate.com)" } });
  if (!res.ok) throw new Error(`ROR ${id} → ${res.status}`);
  const json = await res.json();
  writeFileSync(file, JSON.stringify(json));
  return json;
}

// Leiden lists Hong Kong's universities under China; we list Hong Kong on
// its own (as the universities and their fees do). Its Leiden names all say
// "Hong Kong", and ROR's location confirms each one.
const LEIDEN_COUNTRY = { "Hong Kong": "China" };
const inLeiden = (r, country) =>
  LEIDEN_COUNTRY[country] ? r.country === LEIDEN_COUNTRY[country] && r.name.includes(country) : r.country === country;

const rows = [];
for (const country of countries) {
  const inCountry = leiden.filter((r) => inLeiden(r, country) && !ours.has(r.ror)).sort((a, b) => b.p - a.p).slice(0, top);
  for (const l of inCountry) {
    const org = await ror(l.ror);
    if (LEIDEN_COUNTRY[country] && org.locations?.[0]?.geonames_details?.country_name !== country) continue;
    const name = org.names.find((n) => n.types.includes("ror_display"))?.value ?? l.name;
    if (ourNames.has(`${name.toLowerCase()}|${country}`)) continue;
    const others = org.names.filter((n) => !n.types.includes("ror_display")).map((n) => n.value);
    rows.push({
      ror: l.ror,
      leiden_name: l.name,
      name,
      aliases: [...new Set(others)].join(";"),
      country,
      city: org.locations?.[0]?.geonames_details?.name ?? "",
      website: org.links?.find((k) => k.type === "website")?.value ?? "",
      types: (org.types ?? []).join(";"),
      publications: Math.round(l.p),
      status: org.status,
    });
  }
}
// Added to what earlier runs found (other countries), so batch files can
// keep pointing at their candidates.
const out = join(ROOT, "data", "curated", "candidates.csv");
const earlier = existsSync(out) ? parseCsv(readFileSync(out, "utf8")).filter((r) => !countries.includes(r.country)).map(withoutLine) : [];
writeFileSync(out, toCsv(["ror", "leiden_name", "name", "aliases", "country", "city", "website", "types", "publications", "status"], [...earlier, ...rows]));
console.log(`Wrote ${out}: ${rows.length} candidates (${rows.filter((r) => r.types.split(";").includes("education")).length} education)`);
