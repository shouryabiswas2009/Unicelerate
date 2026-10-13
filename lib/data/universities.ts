import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { PENDING_COLUMNS } from "@/lib/pending-migrations";
import type { University, UniversitySummary } from "@/lib/types";

// Loading the university list for browse, recommendations and the compare
// picker. Three problems this solves (measured in docs/PERFORMANCE.md):
//
// 1. Supabase's API returns at most 1,000 rows per request, so a plain
//    select("*") silently dropped 624 of the 1,624 schools. fetchAllRows()
//    asks for the rows in ranges until it has them all.
// 2. Only the columns list pages need (LIST_COLUMNS), not every column.
// 3. The shared list (everything not added by a student) only changes when
//    the import is re-run, so it's cached on the server and reused across
//    requests instead of being downloaded on every page load.

// Every field of UniversitySummary. A test checks this list against the type.
export const LIST_COLUMNS = [
  "id", "name", "country", "city", "state", "tuition", "qs_ranking", "program_rankings",
  "degree_levels", "acceptance_rate", "avg_admitted_gpa", "sat_25", "sat_75", "min_ielts",
  "living_cost_per_year", "popular_programs", "created_by", "source", "data_year", "fetched_at",
  "source_url", "completion_rate", "research_intensity", "retention_rate", "coop_program",
  "internship_support_url", "is_featured", "aliases", "tuition_local", "tuition_currency",
  "tuition_basis", "fx_rate_date",
  // Used by the quality score (lib/quality.ts).
  "median_earnings_10yr", "research_impact",
  // The strength index (lib/strength.ts), shown on every card.
  "strength_index", "strength_low", "strength_high", "strength_tier", "strength_confidence",
  "strength_is_estimate", "strength_position", "strength_signals",
  // Campus-life proxies (lib/campus-life.ts), shown on cards and scored
  // when a student ticks a campus-life focus.
  "campus_life",
] as const;

// Supabase's default limit on rows per API response.
export const MAX_ROWS_PER_REQUEST = 1000;

type RangeResult<T> = { data: T[] | null; error: { code?: string; message: string } | null };

// Fetches rows `pageSize` at a time until a short page says there are no
// more. `fetchRange(from, to)` must return rows in a stable order (e.g.
// ordered by id), or rows could repeat or go missing between ranges.
export async function fetchAllRows<T>(
  fetchRange: (from: number, to: number) => PromiseLike<RangeResult<T>>,
  pageSize = MAX_ROWS_PER_REQUEST
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchRange(from, from + pageSize - 1);
    if (error) throw new MissingColumnError(error);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

// PostgREST reports a selected column that doesn't exist (a migration not
// run yet) as code 42703: "column universities.is_featured does not exist".
class MissingColumnError extends Error {
  column: string | null;
  constructor(error: { code?: string; message: string }) {
    super(error.message);
    const match = error.code === "42703" ? /column \w+\.(\w+) does not exist/.exec(error.message) : null;
    this.column = match ? match[1] : null;
  }
}

// Selects LIST_COLUMNS; if the database is missing one of them because its
// migration hasn't been run (see lib/pending-migrations.ts), selects
// without it instead of failing the whole page.
async function selectList(
  query: (columns: string) => (from: number, to: number) => PromiseLike<RangeResult<UniversitySummary>>
): Promise<{ rows: UniversitySummary[]; missing: string[] }> {
  let columns: string[] = [...LIST_COLUMNS];
  const missing: string[] = [];
  for (;;) {
    try {
      return { rows: await fetchAllRows(query(columns.join(","))), missing };
    } catch (e) {
      const column = e instanceof MissingColumnError ? e.column : null;
      if (!column || !(column in PENDING_COLUMNS) || !columns.includes(column)) throw e;
      columns = columns.filter((c) => c !== column);
      missing.push(column);
    }
  }
}

// A plain (cookie-less) client: the shared rows are readable by anyone (RLS
// allows created_by is null), so they can be cached once for everyone.
export function anonClient(): SupabaseClient {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

async function loadShared() {
  const supabase = anonClient();
  return selectList((columns) => (from, to) =>
    supabase
      .from("universities")
      .select(columns)
      .is("created_by", null)
      .order("id")
      .range(from, to)
      .returns<UniversitySummary[]>()
  );
}

// Cached for a day (the data only changes when an import is run), or until
// POST /api/revalidate after an import. When it expires, the old list is
// served while the new one loads in the background (stale-while-revalidate),
// so no visitor waits for it.
// The data cache keeps at most 2 MB per entry (Next.js skips larger ones,
// silently). As plain objects, every row repeats all ~40 column names,
// which was over half the list's size; packed, the names are stored once:
// { columns: ["id", "name", …], rows: [["…", "MIT", …], …] }.
export type PackedRows = { columns: string[]; rows: unknown[][] };

export function packRows<T extends object>(rows: T[]): PackedRows {
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return { columns, rows: rows.map((r) => columns.map((c) => (r as Record<string, unknown>)[c] ?? null)) };
}

export function unpackRows<T>({ columns, rows }: PackedRows): T[] {
  return rows.map((values) => Object.fromEntries(columns.map((c, i) => [c, values[i]])) as T);
}

const loadSharedCached = unstable_cache(
  async () => {
    const result = await loadShared();
    // Don't cache a list that's missing a column: once the migration is run
    // the next request should see it, not wait 15 minutes. Throwing skips
    // the cache; the caller then loads it uncached.
    if (result.missing.length > 0) throw new Error("pending migration");
    return packRows(result.rows);
  },
  ["shared-universities", "v5"], // bump the version when LIST_COLUMNS changes
  { revalidate: 86400, tags: ["universities"] }
);

export async function getSharedUniversities(): Promise<UniversitySummary[]> {
  try {
    return unpackRows<UniversitySummary>(await loadSharedCached());
  } catch {
    return (await loadShared()).rows;
  }
}

// Schools the signed-in student added themselves. Never cached: they're
// private (RLS) and change whenever the student edits one.
export async function getOwnUniversities(
  supabase: SupabaseClient,
  userId: string
): Promise<UniversitySummary[]> {
  const { rows } = await selectList((columns) => (from, to) =>
    supabase
      .from("universities")
      .select(columns)
      .eq("created_by", userId)
      .order("id")
      .range(from, to)
      .returns<UniversitySummary[]>()
  );
  return rows;
}

export async function getVisibleUniversities(
  supabase: SupabaseClient,
  userId: string
): Promise<UniversitySummary[]> {
  const [shared, own] = await Promise.all([getSharedUniversities(), getOwnUniversities(supabase, userId)]);
  return [...shared, ...own];
}

// Searches name and aliases in Postgres: search_text is the name plus aliases,
// lower-case and without accents (migration_011), with a trigram index, so
// "universite de montreal" finds "Université de Montréal" and "LSE" finds the
// London School of Economics. Returns the matching ids, or null if the
// search column doesn't exist yet (migration_011 not run), in which case the
// caller searches in memory instead.
export async function searchUniversityIds(
  supabase: SupabaseClient,
  query: string
): Promise<Set<string> | null> {
  // Same normalising as the database: accents off, lower-case. Characters
  // that mean something in a LIKE pattern are escaped.
  const term = query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\\%_]/g, (c) => `\\${c}`);
  if (!term) return null;

  const ids: string[] = [];
  try {
    const rows = await fetchAllRows((from, to) =>
      supabase
        .from("universities")
        .select("id")
        .ilike("search_text", `%${term}%`)
        .order("id")
        .range(from, to)
        .returns<{ id: string }[]>()
    );
    ids.push(...rows.map((r) => r.id));
  } catch (e) {
    if (e instanceof MissingColumnError && e.column === "search_text") return null;
    throw e;
  }
  return new Set(ids);
}

// One shared university (all columns) for its public page, without cookies,
// so the page can be cached for everyone. Student-added schools are never
// returned here (they're private; see /universities/mine/[id]). Cached a day,
// or until revalidateTag("universities") after an import.
export const getPublicUniversity = unstable_cache(
  async (id: string): Promise<University | null> => {
    // Not a valid id → not found (Postgres would reject it with an error).
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const { data, error } = await anonClient()
      .from("universities")
      .select("*")
      .eq("id", id)
      .is("created_by", null)
      .maybeSingle<University>();
    if (error) throw new Error(error.message); // don't cache a failure as "not found"
    return data;
  },
  // Bump the version when a migration adds columns: the data cache outlives
  // deploys, so old rows (without the new columns) would be served for up
  // to a day otherwise. v2: the strength index (migration_019); v3: campus
  // life (migration_023).
  ["public-university", "v3"],
  { revalidate: 86400, tags: ["universities"] }
);
