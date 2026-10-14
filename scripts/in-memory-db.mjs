// Builds a throwaway, in-memory copy of the Unicelerate database by running
// supabase/seed.sql and every supabase/migration_*.sql in order, using PGlite
// (real PostgreSQL compiled to run inside Node). Nothing touches Supabase.
//
// Used by scripts that need the same data the app has, without a network
// connection or database credentials.
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_DIR = join(import.meta.dirname, "..", "supabase");

// `before`: stop before this migration number (e.g. 9 applies up to 008),
// so a test can add old-style rows and then check a migration converts them.
// `parsers`: how to turn column types into JavaScript values (PGlite's
// option), e.g. numeric as numbers, as Supabase's API returns them.
export async function createInMemoryDb({ before = Infinity, parsers } = {}) {
  // The same extensions Supabase offers that migration_011 uses.
  const db = new PGlite({ extensions: { pg_trgm, unaccent }, ...(parsers ? { parsers } : {}) });

  // Minimal stand-ins for the parts of Supabase the migrations reference.
  await db.exec(`
    create schema auth;
    create schema extensions;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  `);

  const migrations = readdirSync(SUPABASE_DIR)
    .filter((f) => /^migration_\d+.*\.sql$/.test(f))
    .filter((f) => Number(f.match(/^migration_(\d+)/)[1]) < before)
    .sort();

  for (const file of ["seed.sql", ...migrations]) {
    await db.exec(readFileSync(join(SUPABASE_DIR, file), "utf8"));
  }

  return { db, applied: ["seed.sql", ...migrations] };
}

// Every generated seed, in the order the live database got them (see
// docs/PENDING-DB-STEPS.md), so the in-memory copy has the full shared list
// with research impact, strength, campus life and the featured rule.
export async function loadAllSeeds(db) {
  const sqlFiles = (dir) =>
    existsSync(join(SUPABASE_DIR, dir))
      ? readdirSync(join(SUPABASE_DIR, dir)).filter((f) => f.endsWith(".sql")).sort().map((f) => join(SUPABASE_DIR, dir, f))
      : [];
  const files = [
    ...sqlFiles("seed_scorecard"),
    ...sqlFiles("seed_international"),
    join(SUPABASE_DIR, "seed_country_info.sql"),
    join(SUPABASE_DIR, "seed_research_impact.sql"),
    ...sqlFiles("seed_strength"),
    ...sqlFiles("seed_campus_life"),
    join(SUPABASE_DIR, "featured", "featured.sql"),
  ];
  for (const file of files) if (existsSync(file)) await db.exec(readFileSync(file, "utf8"));
}
