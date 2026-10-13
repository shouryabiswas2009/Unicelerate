// Lets saves keep working while a migration hasn't been run yet on the live
// database (see docs/PENDING-DB-STEPS.md). Reads already cope — select("*")
// just doesn't return the new column — but a write that mentions a column
// the database doesn't have fails completely.
//
// Only the columns listed here are ever dropped, and the caller is told
// which ones, so nothing is lost silently.

// Column → the migration that adds it.
export const PENDING_COLUMNS: Record<string, string> = {
  source: "migration_007_data_sources.sql",
  source_url: "migration_007_data_sources.sql",
  research_intensity: "migration_008_primary_focus.sql",
  focuses: "migration_009_multi_focus_and_coop.sql",
  coop_program: "migration_009_multi_focus_and_coop.sql",
  internship_support_url: "migration_009_multi_focus_and_coop.sql",
  is_featured: "migration_010_featured.sql",
  search_text: "migration_011_international.sql",
  aliases: "migration_011_international.sql",
  tuition_local: "migration_011_international.sql",
  tuition_currency: "migration_011_international.sql",
  tuition_basis: "migration_011_international.sql",
  fx_rate_date: "migration_011_international.sql",
  accept_by: "migration_013_offer_accept_by.sql",
  research_impact: "migration_015_research_impact.sql",
  display_currency: "migration_016_display_currency.sql",
  grade_system: "migration_017_grade_systems.sql",
  grade_input: "migration_017_grade_systems.sql",
  grade_basis: "migration_017_grade_systems.sql",
  visa_mode: "migration_020_visa_preferences.sql",
  visa_weight: "migration_020_visa_preferences.sql",
  stay_after: "migration_020_visa_preferences.sql",
  strength_index: "migration_019_strength_index.sql",
  strength_low: "migration_019_strength_index.sql",
  strength_high: "migration_019_strength_index.sql",
  strength_tier: "migration_019_strength_index.sql",
  strength_confidence: "migration_019_strength_index.sql",
  strength_is_estimate: "migration_019_strength_index.sql",
  strength_position: "migration_019_strength_index.sql",
  strength_signals: "migration_019_strength_index.sql",
  campus_life: "migration_023_campus_life.sql",
  campus_academic_prefs: "migration_023_campus_life.sql",
  campus_social_prefs: "migration_023_campus_life.sql",
};

type DbError = { code?: string; message?: string } | null;

// PostgREST answers a write that names an unknown column with code PGRST204:
// "Could not find the 'primary_focus' column of 'profiles' in the schema cache".
export function missingColumn(error: DbError): string | null {
  if (!error || error.code !== "PGRST204") return null;
  const match = /Could not find the '([^']+)' column/.exec(error.message ?? "");
  return match ? match[1] : null;
}

// Runs `write(payload)`. If the database is missing one of PENDING_COLUMNS,
// drops that field and tries again. Any other error is returned unchanged.
export async function writeSkippingPendingColumns<R extends { error: DbError }>(
  payload: Record<string, unknown>,
  write: (payload: Record<string, unknown>) => PromiseLike<R>
): Promise<{ result: R; skipped: string[] }> {
  const current = { ...payload };
  const skipped: string[] = [];

  for (;;) {
    const result = await write(current);
    const column = missingColumn(result.error);
    if (!column || !(column in PENDING_COLUMNS) || !(column in current)) {
      return { result, skipped };
    }
    delete current[column];
    skipped.push(column);
  }
}

// "Saved, but your focus wasn't stored yet — run migration_008 …"
export function skippedNotice(skipped: string[]): string | undefined {
  if (skipped.length === 0) return undefined;
  const files = [...new Set(skipped.map((c) => PENDING_COLUMNS[c]))].join(" and ");
  return (
    `Saved, except ${skipped.join(", ")}: the database doesn't have ` +
    `${skipped.length === 1 ? "that column" : "those columns"} yet. Run supabase/${files} ` +
    "(see docs/PENDING-DB-STEPS.md), then save again."
  );
}
