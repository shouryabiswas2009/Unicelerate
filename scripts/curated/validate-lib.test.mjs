import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "./csv.mjs";
import { validateCoop, validateRankings, validateUniversities } from "./validate-lib.mjs";

// A complete, valid row; each test breaks one thing.
const good = (overrides = {}) => ({
  _line: 2,
  curated_id: "uwaterloo",
  name: "University of Waterloo",
  aliases: "UW;Waterloo",
  country: "Canada",
  city: "Waterloo",
  degree_levels: "Undergraduate;Masters;PhD",
  tuition_local: "60000",
  tuition_currency: "CAD",
  tuition_basis: "Lowest published international undergraduate fee",
  tuition_year: "2025-26",
  tuition_source_url: "https://uwaterloo.ca/fees",
  coop_program: "optional",
  coop_source_url: "https://uwaterloo.ca/co-operative-education",
  source_url: "https://uwaterloo.ca",
  data_year: "2025-26",
  checked_on: "2026-10-06",
  ...overrides,
});

describe("parseCsv", () => {
  it("handles quoted commas, quotes and line breaks", () => {
    const text = 'name,notes\n"University of California, Berkeley","says ""hi""\nsecond line"\n';
    expect(parseCsv(text)).toEqual([
      { _line: 2, name: "University of California, Berkeley", notes: 'says "hi"\nsecond line' },
    ]);
  });

  it("round-trips through toCsv", () => {
    const records = [{ name: 'A, "B"', n: "1" }];
    const parsed = parseCsv(toCsv(["name", "n"], records));
    expect(parsed.map((r) => ({ name: r.name, n: r.n }))).toEqual(records);
  });
});

describe("validateUniversities", () => {
  it("accepts a complete row", () => {
    expect(validateUniversities([good()]).errors).toEqual([]);
  });

  it("requires a source page for every figure", () => {
    const { errors } = validateUniversities([
      good({ tuition_source_url: "", coop_source_url: "", popular_programs: "Engineering" }),
    ]);
    expect(errors.join("\n")).toMatch(/tuition_source_url is required/);
    expect(errors.join("\n")).toMatch(/coop_source_url is required/);
    expect(errors.join("\n")).toMatch(/programs_source_url is required/);
  });

  it("requires the currency, basis and year with a tuition amount", () => {
    const { errors } = validateUniversities([good({ tuition_currency: "dollars", tuition_basis: "", tuition_year: "" })]);
    expect(errors).toHaveLength(3);
  });

  it("allows unknown figures: no tuition, no admission rate, co-op unknown", () => {
    const row = good({
      tuition_local: "", tuition_currency: "", tuition_basis: "", tuition_year: "", tuition_source_url: "",
      coop_program: "", coop_source_url: "",
    });
    expect(validateUniversities([row]).errors).toEqual([]);
  });

  it("checks ranges and formats", () => {
    const { errors } = validateUniversities([
      good({ acceptance_rate: "140", acceptance_source_url: "https://x.ca", curated_id: "Bad ID", checked_on: "06/10/2026", source_url: "javascript:alert(1)" }),
    ]);
    const text = errors.join("\n");
    expect(text).toMatch(/acceptance_rate/);
    expect(text).toMatch(/curated_id/);
    expect(text).toMatch(/checked_on/);
    expect(text).toMatch(/source_url/);
  });

  it("rejects duplicates by id and by name + country", () => {
    const { errors } = validateUniversities([
      good(),
      good({ _line: 3, curated_id: "uwaterloo" }),
      good({ _line: 4, curated_id: "waterloo-2" }),
    ]);
    expect(errors.some((e) => /duplicate curated_id/.test(e))).toBe(true);
    expect(errors.some((e) => /duplicate university/.test(e))).toBe(true);
  });

  it("rejects degree levels the app doesn't know", () => {
    expect(validateUniversities([good({ degree_levels: "Undergraduate;Diploma" })]).errors[0]).toMatch(/Diploma/);
  });
});

describe("validateCoop", () => {
  const row = { _line: 2, key: "scorecard:167358", university: "Northeastern", coop_program: "optional", source_url: "https://x.edu/coop", checked_on: "2026-10-06" };

  it("accepts a sourced row and rejects 'unknown' (just leave the school out)", () => {
    expect(validateCoop([row]).errors).toEqual([]);
    expect(validateCoop([{ ...row, coop_program: "unknown" }]).errors).toHaveLength(1);
  });

  it("needs a stable key and a source page", () => {
    expect(validateCoop([{ ...row, key: "Northeastern", source_url: "" }]).errors).toHaveLength(2);
  });
});

describe("validateRankings", () => {
  it("needs the year, a whole-number rank and the public page", () => {
    const row = { _line: 2, university: "X", ranking_year: "2026", overall_rank: "12.5", subject: "", subject_rank: "", source_url: "" };
    expect(validateRankings([row]).errors).toHaveLength(2);
  });
});

describe("validateUniversities: links, duplicates and plausible fees", () => {
  it("refuses plain http links", () => {
    expect(validateUniversities([good({ source_url: "http://www.example.ac.uk" })]).errors.join(" ")).toMatch(/https/);
  });

  it("refuses two rows with the same website, even with different names", () => {
    const { errors } = validateUniversities([
      good({ curated_id: "a", name: "A University", source_url: "https://www.same.ac.uk" }),
      good({ curated_id: "b", name: "B University", source_url: "https://same.ac.uk/" }),
    ]);
    expect(errors.join(" ")).toMatch(/same website/);
  });

  it("stops a tuition figure outside its currency's plausible band, without changing it", () => {
    const row = good({ tuition_local: "290000", tuition_currency: "GBP", tuition_basis: "x", tuition_year: "2026-27", tuition_source_url: "https://www.example.ac.uk/fees" });
    expect(validateUniversities([row]).errors.join(" ")).toMatch(/outside the plausible band/);
    expect(row.tuition_local).toBe("290000");
    const unknownCurrency = good({ tuition_local: "1000", tuition_currency: "XYZ", tuition_basis: "x", tuition_year: "2026-27", tuition_source_url: "https://www.example.ac.uk/fees" });
    expect(validateUniversities([unknownCurrency]).errors.join(" ")).toMatch(/no plausible-tuition band/);
  });
});

