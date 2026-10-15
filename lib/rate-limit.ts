// A small fixed-window rate limiter for sign-up, log-in, "report a wrong
// figure" and "send feedback". In memory, per server instance: on Vercel each instance keeps
// its own counts, so it's a first line against bursts (one script hammering
// one instance), not a hard global cap. The hard caps are Supabase Auth's
// own per-IP limits (sign-ups and sign-ins) and, for reports and feedback,
// database rules (supabase/migration_024 and migration_026).

export const RATE_LIMITS = {
  login: { max: 10, windowMs: 5 * 60_000 }, // 10 tries per 5 minutes per IP
  signup: { max: 5, windowMs: 60 * 60_000 }, // 5 sign-ups per hour per IP
  report: { max: 10, windowMs: 60 * 60_000 }, // 10 reports per hour per student
  feedback: { max: 5, windowMs: 60 * 60_000 }, // 5 messages per hour per visitor (IP)
} as const;
export type RateLimitAction = keyof typeof RATE_LIMITS;

// Memory stays bounded: at most this many keys; the oldest go first.
const MAX_KEYS = 10_000;

export function createRateLimiter(now: () => number = Date.now) {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return function allow(action: RateLimitAction, who: string): { ok: true } | { ok: false; retryAfterSeconds: number } {
    const { max, windowMs } = RATE_LIMITS[action];
    const key = `${action}:${who}`;
    const t = now();
    let w = windows.get(key);
    if (!w || w.resetAt <= t) {
      w = { count: 0, resetAt: t + windowMs };
      windows.delete(key);
      windows.set(key, w);
      if (windows.size > MAX_KEYS) windows.delete(windows.keys().next().value!);
    }
    if (w.count >= max) return { ok: false, retryAfterSeconds: Math.ceil((w.resetAt - t) / 1000) };
    w.count++;
    return { ok: true };
  };
}

// The one limiter the server actions share.
export const rateLimit = createRateLimiter();

// The visitor's address as Vercel passes it (the first entry of
// x-forwarded-for); "unknown" counts everyone without one together.
export function clientIp(forwardedFor: string | null): string {
  return forwardedFor?.split(",")[0]?.trim() || "unknown";
}

export function tooManyMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Too many attempts. Please wait about ${minutes} minute${minutes === 1 ? "" : "s"} and try again.`;
}
