import { describe, expect, it } from "vitest";
import { COMMON_PASSWORDS, MIN_PASSWORD_LENGTH, passwordErrors, validateSignup, weakPasswordReason } from "@/lib/signup-validation";

describe("passwordErrors", () => {
  it("accepts matching passwords of the minimum length", () => {
    expect(passwordErrors("river-otter-7", "river-otter-7")).toEqual({});
    expect(passwordErrors("ab3".repeat(3).slice(0, MIN_PASSWORD_LENGTH), "ab3".repeat(3).slice(0, MIN_PASSWORD_LENGTH))).toEqual({});
  });

  it("says when the passwords don't match", () => {
    expect(passwordErrors("river-otter-7", "river-otter-8")).toEqual({ confirmPassword: "Passwords don't match." });
  });

  it("asks for the confirmation when it's empty", () => {
    expect(passwordErrors("river-otter-7", "")).toEqual({ confirmPassword: "Type your password again to confirm it." });
  });

  it("needs at least 8 characters", () => {
    expect(MIN_PASSWORD_LENGTH).toBeGreaterThanOrEqual(8);
    expect(passwordErrors("abc1234", "abc1234")).toEqual({ password: "Use at least 8 characters." });
  });

  it("refuses very common passwords and one repeated character, in plain words", () => {
    expect(passwordErrors("Password1", "Password1").password).toMatch(/one of the most common passwords/);
    expect(passwordErrors("12345678", "12345678").password).toMatch(/most common/);
    expect(passwordErrors("aaaaaaaaaa", "aaaaaaaaaa").password).toMatch(/one character repeated/);
    expect(weakPasswordReason("correct horse battery")).toBeNull();
    for (const p of COMMON_PASSWORDS) expect(p.length, p).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH);
  });

  it("keeps the minimum-length rule", () => {
    expect(passwordErrors("abc", "abc")).toEqual({ password: `Use at least ${MIN_PASSWORD_LENGTH} characters.` });
    expect(passwordErrors("", "")).toMatchObject({ password: "Enter a password." });
  });

  it("reports both problems at once (too short and not matching)", () => {
    expect(passwordErrors("abc", "abd")).toEqual({
      password: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
      confirmPassword: "Passwords don't match.",
    });
  });

  it("compares exactly (case and spaces count)", () => {
    expect(passwordErrors("River-otter-7", "river-otter-7").confirmPassword).toBe("Passwords don't match.");
    expect(passwordErrors("river-otter-7 ", "river-otter-7").confirmPassword).toBe("Passwords don't match.");
  });
});

describe("validateSignup", () => {
  it("passes a valid sign-up through, trimming only the email", () => {
    expect(validateSignup("  me@example.com ", "river-otter-7", "river-otter-7")).toEqual({
      ok: true,
      email: "me@example.com",
      password: "river-otter-7",
    });
  });

  it("returns field errors, never the passwords", () => {
    const result = validateSignup("not-an-email", "river-otter-7", "different");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual({ email: "Enter a valid email address.", confirmPassword: "Passwords don't match." });
      expect(JSON.stringify(result)).not.toContain("river-otter-7");
      expect(JSON.stringify(result)).not.toContain("different");
    }
  });

  it("requires an email", () => {
    const result = validateSignup("", "river-otter-7", "river-otter-7");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.email).toBe("Enter your email address.");
  });
});
