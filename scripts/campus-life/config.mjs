// Paths and sources for the campus-life import. How it works and why:
// docs/CAMPUS-LIFE-DATA.md.
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");

// IPEDS files (NCES; US government work, public domain). The zips are
// git-ignored and re-downloadable; only the few columns we use are kept, in
// data/campus-life/ipeds.csv. Documented layout: each zip's *_Dict.xlsx.
export const RAW_DIR = join(ROOT, "ml", "data", "raw", "campus");
export const IPEDS_BASE = "https://nces.ed.gov/ipeds/datacenter/data";
export const IPEDS_FILES = {
  // Directory: NCES locale code (city / suburb / town / rural).
  // Years: IPEDS_YEARS in lib/campus-life-config.ts (shown with the figures).
  directory: { zip: "HD2024", csv: "hd2024.csv" },
  // Institutional characteristics: athletic association and conferences.
  characteristics: { zip: "IC2024", csv: "ic2024.csv", dict: "IC2024_Dict", dictXlsx: "ic2024_dict.xlsx" },
  // Housing capacity was last collected in 2023-24 (IC2024 no longer has
  // it), revised release.
  housing: { zip: "IC2023", csv: "ic2023_rv.csv" },
};

export const OUT_DIR = join(ROOT, "data", "campus-life");
export const IPEDS_CSV = join(OUT_DIR, "ipeds.csv");
export const REPORT_MD = join(OUT_DIR, "coverage.md");
export const CURATED_CSV = join(ROOT, "data", "curated", "campus_life.csv");
export const SEED_DIR = join(ROOT, "supabase", "seed_campus_life");
export const ROWS_PER_SQL_FILE = 300;
