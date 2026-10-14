"use server";

import { createClient } from "@/lib/supabase/server";
import { validateFigureReport } from "@/lib/figure-report";
import { rateLimit, tooManyMessage } from "@/lib/rate-limit";

export type ReportState = { ok?: boolean; error?: string } | undefined;

// Saves a "this figure looks wrong" report as the signed-in student. Row
// level security (migration_018) makes sure it's their own and about a
// shared university; the report is reviewed by hand against its source.
export async function reportFigure(_prev: ReportState, formData: FormData): Promise<ReportState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Log in to report a figure." };
  const limited = rateLimit("report", user.id);
  if (!limited.ok) return { error: tooManyMessage(limited.retryAfterSeconds) };

  const result = validateFigureReport(formData);
  if (!result.ok) return { error: result.error };

  const { error } = await supabase.from("figure_reports").insert({ ...result.data, user_id: user.id });
  if (error) {
    // The database's own daily cap (migration_024).
    if (error.message.includes("report_limit")) return { error: "You've sent a lot of reports today. Thank you! Please try again tomorrow." };
    // PGRST205 / 42P01: the table doesn't exist yet (migration_018 not run).
    const pending = error.code === "PGRST205" || error.code === "42P01";
    return { error: pending ? "Reporting isn't switched on yet. Please try again later." : "Couldn't send your report. Please try again." };
  }
  return { ok: true };
}
