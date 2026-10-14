// International bachelor's tuition for Australian universities, from the
// Australian Government's CRICOS register (data.gov.au, CC BY 2.5 AU):
// every course a provider offers to student-visa holders, with its tuition
// fee for the whole course and its duration in weeks.
//
// For each university: its CRICOS provider (matched by website domain, or
// by name when the register lists another address), and one comparable
// course, the same at every university where possible: its current (not
// expired) Bachelor of Arts, else Bachelor of Business or Commerce, else
// Bachelor of Science, turned into a yearly figure (whole-course tuition ÷
// duration in weeks × 52). Not the lowest course: the register has
// oddities (a nine-thousand-dollar engineering degree) that "lowest" would
// pick. Prints a JSON tuition object per university for a batch file.
//
//   node scripts/curated/cricos-fees.mjs <domain> …   (e.g. adelaide.edu.au)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCsv } from "./csv.mjs";

const ROOT = join(import.meta.dirname, "..", "..");
const RAW = join(ROOT, "ml", "data", "raw", "cricos");
export const CRICOS_SOURCE = "https://data.gov.au/data/dataset/cricos";
export const CRICOS_AS_AT = "2026-09-30"; // the export's last-modified date on data.gov.au

const money = (v) => Number(String(v ?? "").replace(/[$,]/g, ""));
const domainOf = (url) => String(url ?? "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];

const institutions = parseCsv(readFileSync(join(RAW, "institutions.csv"), "utf8"));
const courses = parseCsv(readFileSync(join(RAW, "courses.csv"), "utf8"));

const plain = (s) => String(s ?? "").toLowerCase().replace(/^the /, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

// The courses tried in order: the first that exists is used.
const PREFERRED = [/^bachelor of arts$/i, /^bachelor of (business|commerce)$/i, /^bachelor of science$/i, /^bachelor of (business|commerce)\b/i];

export function cricosFee(domain, name = "") {
  // A CRICOS provider code (like 00122A) picks the provider directly.
  if (/^\d{5}[A-Z]$/.test(name)) return feeFor(domain, institutions.filter((i) => i["CRICOS Provider Code"] === name));
  let providers = institutions.filter((i) => domainOf(i["Website"]) === domain);
  if (providers.length > 1 && name) providers = providers.filter((i) => plain(i["Institution Name"]).startsWith(plain(name)));
  if (providers.length === 0 && name) {
    providers = institutions.filter((i) => [i["Institution Name"], i["Trading Name"]].some((n) => plain(n) === plain(name) || plain(n).startsWith(`${plain(name)} `)));
  }
  return feeFor(domain, providers);
}

function feeFor(domain, providers) {
  if (providers.length !== 1) return { domain, error: `${providers.length} CRICOS providers match` };
  const p = providers[0];
  const current = courses.filter((c) => c["CRICOS Provider Code"] === p["CRICOS Provider Code"] && c["Expired"] === "No");
  // Degree levels the provider registers for international students.
  const levels = [
    ["Undergraduate", /^Bachelor/],
    ["Masters", /^Masters/],
    ["PhD", /^Doctoral/],
  ].filter(([, re]) => current.some((c) => re.test(c["Course Level"]))).map(([level]) => level);
  const bachelors = courses
    .filter((c) => c["CRICOS Provider Code"] === p["CRICOS Provider Code"] && c["Course Level"] === "Bachelor Degree" && c["Expired"] === "No")
    .map((c) => ({ name: c["Course Name"], code: c["CRICOS Course Code"], weeks: Number(c["Duration (Weeks)"]), tuition: money(c["Tuition Fee"]) }))
    .filter((c) => c.weeks >= 104 && c.tuition > 0)
    .map((c) => ({ ...c, perYear: Math.round((c.tuition / c.weeks) * 52) }));
  const pick = PREFERRED.map((re) => bachelors.filter((c) => re.test(c.name.trim())).sort((a, b) => a.perYear - b.perYear)[0]).find(Boolean);
  if (!pick) return { domain, provider: p["Institution Name"], error: "no current Bachelor of Arts, Business, Commerce or Science with a tuition fee" };
  const low = pick;
  return {
    domain,
    provider: `${p["Institution Name"]} (CRICOS ${p["CRICOS Provider Code"]})`,
    courses: bachelors.length,
    degreeLevels: levels.join(";"),
    tuition: {
      local: low.perYear,
      currency: "AUD",
      basis: `${low.name.trim()} (CRICOS ${low.code}): whole-course tuition $${low.tuition.toLocaleString("en-US")} for ${low.weeks} weeks, as a yearly figure (÷ ${low.weeks} × 52)`,
      year: `CRICOS register as at ${CRICOS_AS_AT}`,
      url: CRICOS_SOURCE,
    },
  };
}

// Arguments: domain or domain=Official Name (the name helps when the
// register lists a different website or two providers share one).
if (process.argv.length > 2) {
  for (const arg of process.argv.slice(2)) {
    const [d, n] = arg.split("=");
    console.log(JSON.stringify(cricosFee(d, n)));
  }
}
