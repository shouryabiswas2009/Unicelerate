"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { validateFeedback } from "@/lib/feedback";
import { clientIp, rateLimit, tooManyMessage } from "@/lib/rate-limit";

export type FeedbackState = { ok?: boolean; error?: string } | undefined;

// Saves a "Send feedback" message, logged in or not. Row level security
// (migration_026) lets anyone add one and nobody read them back; a logged-in
// student's is linked to their account by the table's default (auth.uid()).
export async function sendFeedback(_prev: FeedbackState, formData: FormData): Promise<FeedbackState> {
  // A field people never see (hidden from screen readers too): only bots
  // fill it in. Pretend it worked, so they don't learn to skip it.
  if (String(formData.get("website") ?? "") !== "") return { ok: true };

  const limited = rateLimit("feedback", clientIp((await headers()).get("x-forwarded-for")));
  if (!limited.ok) return { error: tooManyMessage(limited.retryAfterSeconds) };

  const result = validateFeedback(formData);
  if (!result.ok) return { error: result.error };

  const supabase = await createClient();
  // No .select(): nobody can read feedback back, not even its sender.
  const { error } = await supabase.from("feedback").insert(result.data);
  if (error) {
    // The database's own caps (migration_026).
    if (error.message.includes("feedback_limit")) return { error: "Lots of messages right now. Thank you! Please try again later." };
    // PGRST205 / 42P01: the table doesn't exist yet (migration_026 not run).
    const pending = error.code === "PGRST205" || error.code === "42P01";
    return { error: pending ? "Feedback isn't switched on yet. Please try again later." : "Couldn't send your message. Please try again." };
  }
  return { ok: true };
}
