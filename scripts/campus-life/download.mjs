// Downloads the IPEDS files behind the campus-life proxies ONCE into
// ml/data/raw/campus/ (git-ignored) and keeps only what we use, for the
// College Scorecard schools we list, in data/campus-life/ipeds.csv:
//
//   unitid, locale, athletics, football_conference, housing_capacity
//
//   npm run data:campus-life:download              # skips what's there
//   npm run data:campus-life:download -- --refresh # downloads again
//
// Scorecard ids are IPEDS UNITIDs, so the match is exact.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import ExcelJS from "exceljs";
import { parseCsv, toCsv } from "../curated/csv.mjs";
import { IPEDS_BASE, IPEDS_CSV, IPEDS_FILES, OUT_DIR, RAW_DIR } from "./config.mjs";
import { FBS_CONFERENCES } from "../../lib/campus-life-config.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const refresh = process.argv.includes("--refresh");
mkdirSync(RAW_DIR, { recursive: true });

async function downloadZip(name) {
  const file = join(RAW_DIR, `${name}.zip`);
  if (refresh || !existsSync(file)) {
    console.log(`Downloading ${name}.zip…`);
    const res = await fetch(`${IPEDS_BASE}/${name}.zip`);
    if (!res.ok) throw new Error(`${name}.zip → ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return readFileSync(file);
}

// A minimal zip reader (central directory + deflate), enough for the IPEDS
// zips, without adding a dependency. Returns { lowercased name: Buffer }.
function unzip(buffer) {
  const files = {};
  let eocd = buffer.length - 22;
  while (eocd >= 0 && buffer.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("not a zip file");
  let p = buffer.readUInt32LE(eocd + 16);
  const count = buffer.readUInt16LE(eocd + 10);
  for (let i = 0; i < count; i++) {
    const method = buffer.readUInt16LE(p + 10);
    const size = buffer.readUInt32LE(p + 20);
    const nameLength = buffer.readUInt16LE(p + 28);
    const extra = buffer.readUInt16LE(p + 30);
    const comment = buffer.readUInt16LE(p + 32);
    const local = buffer.readUInt32LE(p + 42);
    const name = buffer.toString("utf8", p + 46, p + 46 + nameLength);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const data = buffer.subarray(start, start + size);
    files[name.toLowerCase()] = method === 0 ? data : inflateRawSync(data);
    p += 46 + nameLength + extra + comment;
  }
  return files;
}

const csvFrom = async (spec) => {
  const files = unzip(await downloadZip(spec.zip));
  const text = files[spec.csv];
  if (!text) throw new Error(`${spec.zip}.zip has no ${spec.csv} (found: ${Object.keys(files).join(", ")})`);
  // UTF-8 with a byte-order mark (parseCsv drops it).
  return new Map(parseCsv(text.toString("utf8")).map((r) => [Number(r.UNITID), r]));
};

// Conference code → name, from the documented value list in the
// dictionary's "Frequencies" sheet.
async function conferenceNames(spec) {
  const files = unzip(await downloadZip(spec.dict));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(files[spec.dictXlsx]);
  const names = new Map();
  workbook.eachSheet((sheet) =>
    sheet.eachRow((row) => {
      const [, , varName, code, label] = row.values; // number, name, code, label
      if (varName === "CONFNO1" && label) names.set(String(code), String(label).trim());
    })
  );
  if (names.size === 0) throw new Error("no CONFNO1 codes in the dictionary");
  return names;
}

const directory = await csvFrom(IPEDS_FILES.directory);
const characteristics = await csvFrom(IPEDS_FILES.characteristics);
const housing = await csvFrom(IPEDS_FILES.housing);
const conferences = await conferenceNames(IPEDS_FILES.characteristics);
for (const fbs of FBS_CONFERENCES) {
  if (![...conferences.values()].includes(fbs)) throw new Error(`FBS conference "${fbs}" isn't in the IPEDS list: check the name`);
}

// IPEDS codes: 1 = yes, 0/2 = no, -1 = not reported, -2 = not applicable.
const positive = (v) => Number(v) > 0 ? Number(v) : null;
function athletics(ic) {
  if (!ic) return { level: "", conference: "" };
  const yes = (v) => Number(v) === 1;
  if (Number(ic.ATHASSOC) === 2) return { level: "none", conference: "" };
  if (yes(ic.ASSOC1)) {
    const conference = yes(ic.SPORT1) ? conferences.get(String(Number(ic.CONFNO1))) ?? "" : "";
    if (!yes(ic.SPORT1)) return { level: "ncaa", conference: "" };
    return { level: FBS_CONFERENCES.includes(conference) ? "ncaa_fbs" : "ncaa_football", conference };
  }
  if ([ic.ASSOC2, ic.ASSOC3, ic.ASSOC4, ic.ASSOC5, ic.ASSOC6].some(yes)) return { level: "other_national", conference: "" };
  return { level: "", conference: "" }; // not reported / not applicable
}

const scorecard = JSON.parse(readFileSync(join(ROOT, "data", "scorecard", "universities.json"), "utf8")).universities;
const rows = scorecard.map((s) => {
  const hd = directory.get(s.scorecard_id);
  const ic = characteristics.get(s.scorecard_id);
  const room = housing.get(s.scorecard_id);
  const sport = athletics(ic);
  const locale = hd ? Number(hd.LOCALE) : NaN;
  return {
    unitid: s.scorecard_id,
    locale: locale > 0 ? locale : "",
    athletics: sport.level,
    football_conference: sport.conference,
    // ROOM = 1: offers housing; ROOMCAP its capacity. "No housing" is a
    // real 0, not unknown.
    housing_capacity: room ? (Number(room.ROOM) === 2 ? 0 : positive(room.ROOMCAP) ?? "") : "",
  };
});

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(IPEDS_CSV, toCsv(["unitid", "locale", "athletics", "football_conference", "housing_capacity"], rows));
const filled = (k) => rows.filter((r) => r[k] !== "").length;
console.log(`Wrote ${IPEDS_CSV}: ${rows.length} schools; locale ${filled("locale")}, athletics ${filled("athletics")}, housing ${filled("housing_capacity")}`);
