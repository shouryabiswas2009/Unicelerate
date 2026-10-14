import { describe, expect, it } from "vitest";
import { RATE_LIMITS, clientIp, createRateLimiter, tooManyMessage } from "@/lib/rate-limit";

describe("rate limiter", () => {
  it("allows up to the limit in a window, then refuses until it resets", () => {
    let t = 0;
    const allow = createRateLimiter(() => t);
    for (let i = 0; i < RATE_LIMITS.login.max; i++) expect(allow("login", "1.2.3.4").ok).toBe(true);
    const refused = allow("login", "1.2.3.4");
    expect(refused).toEqual({ ok: false, retryAfterSeconds: RATE_LIMITS.login.windowMs / 1000 });
    t += RATE_LIMITS.login.windowMs;
    expect(allow("login", "1.2.3.4").ok).toBe(true);
  });

  it("counts each address and each action separately", () => {
    const allow = createRateLimiter(() => 0);
    for (let i = 0; i < RATE_LIMITS.signup.max; i++) allow("signup", "a");
    expect(allow("signup", "a").ok).toBe(false);
    expect(allow("signup", "b").ok).toBe(true);
    expect(allow("login", "a").ok).toBe(true);
  });

  it("reads the visitor's address and says when to try again", () => {
    expect(clientIp("203.0.113.7, 10.0.0.1")).toBe("203.0.113.7");
    expect(clientIp(null)).toBe("unknown");
    expect(tooManyMessage(250)).toBe("Too many attempts. Please wait about 5 minutes and try again.");
    expect(tooManyMessage(10)).toBe("Too many attempts. Please wait about 1 minute and try again.");
  });
});
