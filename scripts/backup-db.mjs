// A manual backup of the whole database (schema and data, including every
// student's rows), with pg_dump, into backups/ (git-ignored). Needs
// PostgreSQL's client tools (pg_dump, version 15 or newer) and
// SUPABASE_DB_URL in .env.local (Supabase → Project Settings → Database →
// Connection string). The file holds personal data: keep it private.
//
//   npm run db:backup
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("Set SUPABASE_DB_URL in .env.local first (see .env.local.example).");
  process.exit(1);
}
const dir = join(import.meta.dirname, "..", "backups");
mkdirSync(dir, { recursive: true });
const file = join(dir, `unicelerate-${new Date().toISOString().replace(/[:.]/g, "-")}.dump`);
// Custom format (-Fc): compressed, and pg_restore can restore all of it or
// single tables. Only the schemas the app uses (public, auth).
const result = spawnSync("pg_dump", ["--format=custom", "--no-owner", "--schema=public", "--schema=auth", `--file=${file}`, url], { stdio: "inherit" });
if (result.error) {
  console.error("Couldn't run pg_dump. Install PostgreSQL's client tools (https://www.postgresql.org/download/).");
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Backup written to ${file}. Keep it private: it contains students' data.`);
