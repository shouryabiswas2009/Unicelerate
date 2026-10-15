import { readText } from "@/lib/form-data";

// "Send feedback" (table feedback, migration_026). Checked here and again
// by the table's constraints, with the same limits.

export const FEEDBACK_MAX = 2000;

export type Feedback = { message: string; email: string | null; page: string | null };
export type FeedbackResult = { ok: true; data: Feedback } | { ok: false; error: string };

// The page the feedback is about: a path on this site only ("/offers"),
// never another site's address.
export function feedbackPage(value: unknown): string | null {
  const page = typeof value === "string" ? value.trim() : "";
  if (!page.startsWith("/") || page.startsWith("//") || page.length > 200 || /\s/.test(page)) return null;
  return page;
}

export function validateFeedback(formData: FormData): FeedbackResult {
  const message = readText(formData, "message");
  if (message.length < 3) return { ok: false, error: "Write a few words, please." };
  if (message.length > FEEDBACK_MAX) return { ok: false, error: `Please keep it under ${FEEDBACK_MAX.toLocaleString("en-US")} characters.` };

  const email = readText(formData, "email");
  if (email && (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) {
    return { ok: false, error: "That email address doesn't look right (or leave it empty)." };
  }
  return { ok: true, data: { message, email: email || null, page: feedbackPage(readText(formData, "page")) } };
}
