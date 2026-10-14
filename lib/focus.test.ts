import { describe, expect, it } from "vitest";
import { COOP_SHORT_LABELS, coopDetail } from "./focus";

describe("coopDetail", () => {
  it("says the status, the school's work terms and when we checked", () => {
    expect(
      coopDetail({ coop_program: "optional", coop_work_terms: "Four to six four-month work terms", coop_checked_on: "2026-10-14" })
    ).toBe("Optional co-op / internship program: four to six four-month work terms (checked 2026-10-14)");
  });

  it("leaves out what the page didn't say", () => {
    expect(coopDetail({ coop_program: "mandatory" })).toBe("Mandatory co-op program");
  });

  it("never describes an unknown program, even with stray details", () => {
    expect(coopDetail({ coop_program: "unknown", coop_work_terms: "Two terms" })).toBe("Not available");
    expect(coopDetail({})).toBe("Not available");
    expect(COOP_SHORT_LABELS.unknown).toBe("Not available");
  });
});
