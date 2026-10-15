import { describe, expect, it } from "vitest";
import { feedbackPage, validateFeedback } from "./feedback";

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

describe("validateFeedback", () => {
  it("accepts a message with an optional email and the page it was sent from", () => {
    expect(validateFeedback(form({ message: "The UCC fee looks old", email: "", page: "/universities/x" }))).toEqual({
      ok: true,
      data: { message: "The UCC fee looks old", email: null, page: "/universities/x" },
    });
    expect(validateFeedback(form({ message: "Thanks!", email: "me@example.com" }))).toMatchObject({ ok: true, data: { email: "me@example.com", page: null } });
  });

  it("needs a real message, and a valid email if one is given", () => {
    expect(validateFeedback(form({ message: "  " })).ok).toBe(false);
    expect(validateFeedback(form({ message: "x".repeat(2001) })).ok).toBe(false);
    expect(validateFeedback(form({ message: "Hello there", email: "not-an-email" })).ok).toBe(false);
  });
});

describe("feedbackPage", () => {
  it("keeps only a path on this site", () => {
    expect(feedbackPage("/offers")).toBe("/offers");
    expect(feedbackPage("https://evil.example")).toBeNull();
    expect(feedbackPage("//evil.example")).toBeNull();
    expect(feedbackPage("/a b")).toBeNull();
    expect(feedbackPage(undefined)).toBeNull();
  });
});
