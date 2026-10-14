import { describe, expect, it } from "vitest";
import { fieldOf, withoutEdited } from "./form-errors";

describe("withoutEdited", () => {
  it("hides only the errors of fields the student has changed since saving", () => {
    const errors = { gpa_percentage: "Must be 0 to 100", intended_majors: "Add a major" };
    expect(withoutEdited(errors, new Set(["gpa_percentage"]))).toEqual({ intended_majors: "Add a major" });
    expect(withoutEdited(errors, new Set())).toEqual(errors);
  });
});

describe("fieldOf", () => {
  it("names the field by its name, else its id", () => {
    expect(fieldOf({ name: "gpa_percentage", id: "x" } as unknown as EventTarget)).toBe("gpa_percentage");
    expect(fieldOf({ name: "", id: "intended_majors" } as unknown as EventTarget)).toBe("intended_majors");
    expect(fieldOf(null)).toBeNull();
  });
});
