import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createInMemoryDb } from "./in-memory-db.mjs";

// Data-changing migrations, run against a real (in-memory) Postgres with
// rows shaped the way they were before the migration.
const SUPABASE = join(import.meta.dirname, "..", "supabase");
const sql = (file) => readFileSync(join(SUPABASE, file), "utf8");

describe("migration_009 (multi-select focus + co-op)", () => {
  it("keeps each student's old focus, retires the old columns, and is safe to re-run", async () => {
    const { db } = await createInMemoryDb({ before: 9 });
    const research = "00000000-0000-0000-0000-000000000001";
    const balanced = "00000000-0000-0000-0000-000000000002";
    for (const id of [research, balanced]) {
      await db.query("insert into auth.users (id) values ($1)", [id]);
    }
    const profile = `insert into public.profiles (id, full_name, country, intended_majors, gpa_percentage,
      budget_min, budget_max, preferred_countries, preferred_degree_level, primary_focus)
      values ($1, 'A', 'India', '{CS}', 90, 0, 40000, '{Canada}', 'Undergraduate', $2)`;
    await db.query(profile, [research, "research"]);
    await db.query(profile, [balanced, "balanced"]);
    // A student-added school that said "yes, it has a co-op" before 009.
    await db.query(`insert into public.universities (name, country, tuition, acceptance_rate, description, created_by, source, has_coop)
      values ('My School', 'Canada', 20000, 50, '', $1, 'user-entered', true)`, [research]);

    await db.exec(sql("migration_009_multi_focus_and_coop.sql"));
    await db.exec(sql("migration_009_multi_focus_and_coop.sql")); // second run changes nothing

    const { rows } = await db.query("select id, focuses from public.profiles order by id");
    expect(rows).toEqual([
      { id: research, focuses: ["research"] },
      { id: balanced, focuses: [] }, // Balanced = nothing ticked
    ]);
    const { rows: schools } = await db.query("select coop_program from public.universities where name = 'My School'");
    expect(schools[0].coop_program).toBe("optional"); // "yes" without saying mandatory

    const { rows: oldColumns } = await db.query(`select column_name from information_schema.columns
      where table_schema = 'public' and column_name in ('primary_focus', 'has_coop')`);
    expect(oldColumns).toEqual([]);
  }, 30_000);

  it("rejects focus and co-op values outside the allowed lists", async () => {
    const { db } = await createInMemoryDb();
    await expect(db.exec("update public.profiles set focuses = '{fame}'")).resolves.toBeDefined(); // no rows yet
    await db.query("insert into auth.users (id) values ('00000000-0000-0000-0000-000000000003')");
    await expect(
      db.query(`insert into public.profiles (id, full_name, country, intended_majors, gpa_percentage,
        budget_min, budget_max, preferred_countries, preferred_degree_level, focuses)
        values ('00000000-0000-0000-0000-000000000003', 'B', 'India', '{CS}', 90, 0, 40000, '{UK}', 'Undergraduate', '{fame}')`)
    ).rejects.toThrow(/profiles_focuses_check/);
    await expect(
      db.exec("update public.universities set coop_program = 'sometimes'")
    ).rejects.toThrow(/universities_coop_check/);
  }, 30_000);
});

describe("migration_011 (curated international data)", () => {
  it("is safe to re-run, and search ignores accents and finds aliases", async () => {
    const { db } = await createInMemoryDb();
    await db.exec(sql("migration_011_international.sql")); // second run
    await db.query(`insert into public.universities (name, country, tuition, acceptance_rate, description, source, aliases, curated_id)
      values ('Université de Montréal', 'Canada', null, null, '', 'curated', '{UdeM}', 'udem')`);
    const find = async (term) =>
      (await db.query("select name from public.universities where search_text like $1", [`%${term}%`])).rows.map((r) => r.name);
    expect(await find("universite de montreal")).toEqual(["Université de Montréal"]);
    expect(await find("udem")).toEqual(["Université de Montréal"]);
  }, 30_000);

  it("allows unknown tuition and admission rate, but still won't let a student label a row curated", async () => {
    const { db } = await createInMemoryDb();
    const student = "00000000-0000-0000-0000-000000000009";
    await db.query("insert into auth.users (id) values ($1)", [student]);
    await expect(
      db.query(`insert into public.universities (name, country, tuition, acceptance_rate, description, source, created_by)
        values ('Mine', 'Canada', null, null, '', 'curated', $1)`, [student])
    ).rejects.toThrow(/universities_source_check/);
    await expect(
      db.query(`insert into public.universities (name, country, description, source, tuition_currency)
        values ('Bad currency', 'Canada', '', 'curated', 'pounds')`)
    ).rejects.toThrow(/universities_money_check/);
  }, 30_000);
});

describe("migration_014 (delete my account)", () => {
  const A = "00000000-0000-0000-0000-0000000000aa";
  const B = "00000000-0000-0000-0000-0000000000bb";

  async function seedTwoStudents() {
    const { db } = await createInMemoryDb();
    for (const id of [A, B]) {
      await db.query("insert into auth.users (id) values ($1)", [id]);
      await db.query(
        `insert into public.profiles (id, full_name, country, intended_majors, gpa_percentage,
          budget_min, budget_max, preferred_countries, preferred_degree_level)
          values ($1, 'Student', 'India', '{CS}', 90, 0, 40000, '{Canada}', 'Undergraduate')`,
        [id]
      );
      // Each student adds a school, saves a shared one and tracks an application.
      await db.query(
        `insert into public.universities (name, country, tuition, acceptance_rate, description, created_by, source)
          values ($1, 'Canada', 20000, 50, '', $2, 'user-entered')`,
        [`School of ${id.slice(-2)}`, id]
      );
      const { rows } = await db.query("select id from public.universities where created_by is null order by id limit 1");
      await db.query("insert into public.saved_universities (user_id, university_id) values ($1, $2)", [id, rows[0].id]);
      await db.query("insert into public.applications (user_id, university_id) values ($1, $2)", [id, rows[0].id]);
    }
    return db;
  }

  const count = async (db, sql, params = []) => (await db.query(sql, params)).rows[0].n;

  it("deletes only the caller's account and everything that belongs to them", async () => {
    const db = await seedTwoStudents();
    const sharedBefore = await count(db, "select count(*)::int as n from public.universities where created_by is null");

    await db.exec(`set test.uid = '${A}'`); // act as student A
    await db.query("select public.delete_my_account()");

    for (const [table, column] of [["auth.users", "id"], ["public.profiles", "id"], ["public.saved_universities", "user_id"], ["public.applications", "user_id"], ["public.universities", "created_by"]]) {
      expect(await count(db, `select count(*)::int as n from ${table} where ${column} = $1`, [A])).toBe(0);
      expect(await count(db, `select count(*)::int as n from ${table} where ${column} = $1`, [B])).toBe(1);
    }
    expect(await count(db, "select count(*)::int as n from public.universities where created_by is null")).toBe(sharedBefore);
  }, 30_000);

  it("refuses when nobody is signed in, and is safe to re-run", async () => {
    const db = await seedTwoStudents();
    await db.exec("set test.uid = ''");
    await expect(db.query("select public.delete_my_account()")).rejects.toThrow(/must be signed in/);
    expect(await count(db, "select count(*)::int as n from auth.users")).toBe(2);
    await db.exec(sql("migration_014_delete_my_account.sql"));
  }, 30_000);
});

describe("migration_015 (research impact)", () => {
  const value = (fields) =>
    JSON.stringify({ overall: 80, source: "CWTS Leiden Ranking Open Edition 2025", data_year: "2020–2023", licence: "CC0 1.0", ...fields });

  it("stores a value with its source on a shared school, and is safe to re-run", async () => {
    const { db } = await createInMemoryDb();
    await db.exec(sql("migration_015_research_impact.sql"));
    const { rows } = await db.query("select id from public.universities where created_by is null order by id limit 1");
    await db.query("update public.universities set research_impact = $1::jsonb where id = $2", [value({}), rows[0].id]);
    const { rows: back } = await db.query("select research_impact->>'licence' as licence from public.universities where id = $1", [rows[0].id]);
    expect(back[0].licence).toBe("CC0 1.0");
  }, 30_000);

  it("rejects a value without its source, and any value on a student's own school", async () => {
    const { db } = await createInMemoryDb();
    const { rows } = await db.query("select id from public.universities where created_by is null order by id limit 1");
    await expect(
      db.query("update public.universities set research_impact = '{\"overall\": 80}'::jsonb where id = $1", [rows[0].id])
    ).rejects.toThrow(/universities_research_impact_check/);

    const student = "00000000-0000-0000-0000-0000000000cc";
    await db.query("insert into auth.users (id) values ($1)", [student]);
    await expect(
      db.query(
        `insert into public.universities (name, country, tuition, acceptance_rate, description, created_by, source, research_impact)
          values ('Mine', 'Canada', 1, 50, '', $1, 'user-entered', $2::jsonb)`,
        [student, value({})]
      )
    ).rejects.toThrow(/universities_research_impact_check/);
  }, 30_000);
});

describe("migration_016 (display currency)", () => {
  it("defaults to US dollars, accepts a currency code, rejects anything else, and is safe to re-run", async () => {
    const { db } = await createInMemoryDb();
    await db.exec(sql("migration_016_display_currency.sql"));
    const id = "00000000-0000-0000-0000-0000000000dd";
    await db.query("insert into auth.users (id) values ($1)", [id]);
    await db.query(
      `insert into public.profiles (id, full_name, country, intended_majors, gpa_percentage,
        budget_min, budget_max, preferred_countries, preferred_degree_level)
        values ($1, 'Student', 'India', '{CS}', 90, 0, 40000, '{Canada}', 'Undergraduate')`,
      [id]
    );
    const read = async () => (await db.query("select display_currency from public.profiles where id = $1", [id])).rows[0].display_currency;
    expect(await read()).toBe("USD");
    await db.query("update public.profiles set display_currency = 'INR' where id = $1", [id]);
    expect(await read()).toBe("INR");
    await expect(db.query("update public.profiles set display_currency = 'rupees' where id = $1", [id])).rejects.toThrow(/profiles_display_currency_check/);
  }, 30_000);
});

describe("migration_017 (grade systems)", () => {
  it("defaults to an exact percentage and only accepts known systems and bases", async () => {
    const { db } = await createInMemoryDb();
    await db.exec(sql("migration_017_grade_systems.sql"));
    const id = "00000000-0000-0000-0000-0000000000ee";
    await db.query("insert into auth.users (id) values ($1)", [id]);
    await db.query(
      `insert into public.profiles (id, full_name, country, intended_majors, gpa_percentage,
        budget_min, budget_max, preferred_countries, preferred_degree_level)
        values ($1, 'Student', 'India', '{CS}', 90, 0, 40000, '{Canada}', 'Undergraduate')`,
      [id]
    );
    const { rows } = await db.query("select grade_system, grade_basis from public.profiles where id = $1", [id]);
    expect(rows[0]).toEqual({ grade_system: "percentage", grade_basis: "exact" });
    await db.query("update public.profiles set grade_system = 'ib', grade_input = '7,6,6', grade_basis = 'converted' where id = $1", [id]);
    await expect(db.query("update public.profiles set grade_system = 'made_up' where id = $1", [id])).rejects.toThrow(/profiles_grade_system_check/);
    await expect(db.query("update public.profiles set grade_basis = 'guessed' where id = $1", [id])).rejects.toThrow(/profiles_grade_basis_check/);
  }, 30_000);
});

describe("migration_018 (figure reports)", () => {
  const A = "00000000-0000-0000-0000-0000000000a1";
  const B = "00000000-0000-0000-0000-0000000000b2";

  // The in-memory database runs as a superuser, which skips row level
  // security; a plain role (like Supabase's "authenticated") doesn't.
  async function asStudents() {
    const { db } = await createInMemoryDb();
    for (const id of [A, B]) await db.query("insert into auth.users (id) values ($1)", [id]);
    const { rows } = await db.query("select id from public.universities where created_by is null order by id limit 1");
    await db.query(
      `insert into public.universities (name, country, tuition, acceptance_rate, description, created_by, source)
        values ('Own school', 'Canada', 1, 50, '', $1, 'user-entered')`,
      [A]
    );
    const own = (await db.query("select id from public.universities where created_by = $1", [A])).rows[0].id;
    await db.exec(`
      create role student nologin;
      grant usage on schema public, auth to student;
      grant select on public.universities to student;
      grant select, insert, update, delete on public.figure_reports to student;
      set role student;
    `);
    const as = (id) => db.exec(`set test.uid = '${id}'`);
    return { db, as, shared: rows[0].id, own };
  }

  const report = (db, universityId, extra = "") =>
    db.query(`insert into public.figure_reports (university_id, field, suggested_value${extra ? ", user_id" : ""})
      values ($1, 'tuition', '$40,000'${extra ? ", $2" : ""})`, extra ? [universityId, extra] : [universityId]);

  it("lets a student add reports about shared schools and read only their own", async () => {
    const { db, as, shared } = await asStudents();
    await as(A);
    await report(db, shared);
    await as(B);
    await report(db, shared);
    expect((await db.query("select count(*)::int as n from public.figure_reports")).rows[0].n).toBe(1);
    await as(A);
    const { rows } = await db.query("select user_id, status from public.figure_reports");
    expect(rows).toEqual([{ user_id: A, status: "open" }]);
  }, 30_000);

  it("refuses reports as someone else, about a student's own school, or already closed", async () => {
    const { db, as, shared, own } = await asStudents();
    await as(A);
    await expect(report(db, shared, B)).rejects.toThrow(/row-level security/);
    await expect(report(db, own)).rejects.toThrow(/row-level security/);
    await expect(
      db.query("insert into public.figure_reports (university_id, field, status) values ($1, 'tuition', 'fixed')", [shared])
    ).rejects.toThrow(/row-level security/);
  }, 30_000);

  it("doesn't let students change or delete reports", async () => {
    const { db, as, shared } = await asStudents();
    await as(A);
    await report(db, shared);
    await db.query("update public.figure_reports set status = 'fixed'");
    await db.query("delete from public.figure_reports");
    const { rows } = await db.query("select status from public.figure_reports");
    expect(rows).toEqual([{ status: "open" }]); // both silently matched no rows
  }, 30_000);

  it("rejects unknown fields and non-web source links", async () => {
    const { db, as, shared } = await asStudents();
    await as(A);
    await expect(db.query("insert into public.figure_reports (university_id, field) values ($1, 'vibes')", [shared])).rejects.toThrow(/check/);
    await expect(
      db.query("insert into public.figure_reports (university_id, field, source_url) values ($1, 'tuition', 'javascript:alert(1)')", [shared])
    ).rejects.toThrow(/check/);
  }, 30_000);
});

describe("migration_019 (strength index)", () => {
  const set = (db, id, fields) =>
    db.query(`update public.universities set ${fields} where id = $1`, [id]);
  const base = "strength_index = 70, strength_tier = 'B', strength_confidence = 'High', strength_position = 10, strength_signals = '{}'::jsonb";

  it("stores a measured index and an estimate with its range, and clears illustrative Scorecard rankings", async () => {
    const { db } = await createInMemoryDb();
    const { rows } = await db.query("select id from public.universities where created_by is null order by id limit 1");
    await set(db, rows[0].id, `${base}, strength_is_estimate = false`);
    await set(db, rows[0].id, `${base}, strength_is_estimate = true, strength_low = 60, strength_high = 75`);
    await db.query("update public.universities set source = 'College Scorecard', qs_ranking = 1 where id = $1", [rows[0].id]);
    await db.exec(sql("migration_019_strength_index.sql")); // safe to re-run; clears the leftover rank
    const { rows: after } = await db.query("select qs_ranking, strength_low from public.universities where id = $1", [rows[0].id]);
    expect(after[0]).toEqual({ qs_ranking: null, strength_low: "60.0" });
  }, 30_000);

  it("rejects an estimate without a range, a bad tier, and an index on a student's own school", async () => {
    const { db } = await createInMemoryDb();
    const { rows } = await db.query("select id from public.universities where created_by is null order by id limit 1");
    await expect(set(db, rows[0].id, `${base}, strength_is_estimate = true`)).rejects.toThrow(/universities_strength_check/);
    await expect(set(db, rows[0].id, `${base.replace("'B'", "'F'")}, strength_is_estimate = false`)).rejects.toThrow(/universities_strength_check/);
    const student = "00000000-0000-0000-0000-0000000000ff";
    await db.query("insert into auth.users (id) values ($1)", [student]);
    await db.query(
      `insert into public.universities (name, country, tuition, acceptance_rate, description, created_by, source) values ('Mine', 'Canada', 1, 50, '', $1, 'user-entered')`,
      [student]
    );
    const own = (await db.query("select id from public.universities where created_by = $1", [student])).rows[0].id;
    await expect(set(db, own, `${base}, strength_is_estimate = false`)).rejects.toThrow(/universities_strength_check/);
  }, 30_000);
});

describe("migration_020 (visa preferences)", () => {
  it("starts as null (ignore), accepts the listed values, rejects others, and is safe to re-run", async () => {
    const { db } = await createInMemoryDb();
    await db.exec(sql("migration_020_visa_preferences.sql"));
    const id = "00000000-0000-0000-0000-0000000000ab";
    await db.query("insert into auth.users (id) values ($1)", [id]);
    await db.query(
      `insert into public.profiles (id, full_name, country, intended_majors, gpa_percentage,
        budget_min, budget_max, preferred_countries, preferred_degree_level)
        values ($1, 'Student', 'India', '{CS}', 90, 0, 40000, '{Canada}', 'Undergraduate')`,
      [id]
    );
    const { rows } = await db.query("select visa_mode, visa_weight, stay_after from public.profiles where id = $1", [id]);
    expect(rows[0]).toEqual({ visa_mode: null, visa_weight: null, stay_after: null });
    await db.query("update public.profiles set visa_mode = 'factor', visa_weight = 'high', stay_after = 'no' where id = $1", [id]);
    await expect(db.query("update public.profiles set visa_mode = 'always' where id = $1", [id])).rejects.toThrow(/profiles_visa_mode_check/);
    await expect(db.query("update public.profiles set visa_weight = 'max' where id = $1", [id])).rejects.toThrow(/profiles_visa_weight_check/);
    await expect(db.query("update public.profiles set stay_after = 'later' where id = $1", [id])).rejects.toThrow(/profiles_stay_after_check/);
  }, 30_000);
});

describe("migration_021 (more grade systems)", () => {
  it("accepts the new systems, keeps the old ones, still rejects unknown keys, and is safe to re-run", async () => {
    const { db } = await createInMemoryDb();
    await db.exec(sql("migration_021_more_grade_systems.sql"));
    const id = "00000000-0000-0000-0000-0000000000ac";
    await db.query("insert into auth.users (id) values ($1)", [id]);
    await db.query(
      `insert into public.profiles (id, full_name, country, intended_majors, gpa_percentage,
        budget_min, budget_max, preferred_countries, preferred_degree_level, grade_system)
        values ($1, 'Student', 'Canada', '{CS}', 90, 0, 40000, '{Canada}', 'Undergraduate', 'ib')`,
      [id]
    );
    for (const system of ["ca_ontario", "ca_quebec", "ap", "au_atar", "other"]) {
      await db.query("update public.profiles set grade_system = $2 where id = $1", [id, system]);
    }
    await expect(db.query("update public.profiles set grade_system = 'made_up' where id = $1", [id])).rejects.toThrow(/profiles_grade_system_check/);
  }, 30_000);
});

describe("migration_022 (profile courses)", () => {
  const A = "00000000-0000-0000-0000-0000000000c1";
  const B = "00000000-0000-0000-0000-0000000000c2";
  async function twoStudents() {
    const { db } = await createInMemoryDb();
    for (const id of [A, B]) {
      await db.query("insert into auth.users (id) values ($1)", [id]);
      await db.query(
        `insert into public.profiles (id, full_name, country, intended_majors, gpa_percentage,
          budget_min, budget_max, preferred_countries, preferred_degree_level)
          values ($1, 'Student', 'Canada', '{CS}', 90, 0, 40000, '{Canada}', 'Undergraduate')`,
        [id]
      );
      await db.query("insert into public.profile_courses (user_id, subject, level, grade_percentage) values ($1, 'calculus', 'ap', 95)", [id]);
    }
    return db;
  }

  it("keeps courses private to their owner (row level security)", async () => {
    const db = await twoStudents();
    await db.exec(`
      create role student nologin;
      grant usage on schema public, auth to student;
      grant select, insert, update, delete on public.profile_courses to student;
      set role student;
      set test.uid = '${A}';
    `);
    expect((await db.query("select count(*)::int as n from public.profile_courses")).rows[0].n).toBe(1);
    await expect(
      db.query("insert into public.profile_courses (user_id, subject, grade_percentage) values ($1, 'physics', 90)", [B])
    ).rejects.toThrow(/row-level security/);
    await db.query("delete from public.profile_courses where user_id = $1", [B]); // matches nothing
    await db.exec("reset role");
    expect((await db.query("select count(*)::int as n from public.profile_courses where user_id = $1", [B])).rows[0].n).toBe(1);
  }, 30_000);

  it("rejects unknown subjects, levels and grades outside 0-100", async () => {
    const db = await twoStudents();
    for (const values of ["'astrology', 'standard', 90", "'physics', 'olympiad', 90", "'physics', 'standard', 101"]) {
      await expect(db.query(`insert into public.profile_courses (user_id, subject, level, grade_percentage) values ($1, ${values})`, [A])).rejects.toThrow(/check/);
    }
  }, 30_000);

  it("goes with the account (delete_my_account)", async () => {
    const db = await twoStudents();
    await db.exec(`set test.uid = '${A}'`);
    await db.query("select public.delete_my_account()");
    expect((await db.query("select count(*)::int as n from public.profile_courses where user_id = $1", [A])).rows[0].n).toBe(0);
    expect((await db.query("select count(*)::int as n from public.profile_courses where user_id = $1", [B])).rows[0].n).toBe(1);
  }, 30_000);
});

describe("migration_023 (campus life)", () => {
  const id = "00000000-0000-0000-0000-0000000000d1";
  async function withStudent() {
    const { db } = await createInMemoryDb();
    await db.query("insert into auth.users (id) values ($1)", [id]);
    await db.query(
      `insert into public.profiles (id, full_name, country, intended_majors, gpa_percentage,
        budget_min, budget_max, preferred_countries, preferred_degree_level)
        values ($1, 'Student', 'Canada', '{CS}', 90, 0, 40000, '{Canada}', 'Undergraduate')`,
      [id]
    );
    return db;
  }

  it("accepts the two new focuses and their follow-ups, rejects anything else, and is safe to re-run", async () => {
    const db = await withStudent();
    await db.exec(sql("migration_023_campus_life.sql"));
    const { rows } = await db.query("select campus_academic_prefs, campus_social_prefs from public.profiles where id = $1", [id]);
    expect(rows[0]).toEqual({ campus_academic_prefs: [], campus_social_prefs: [] });
    await db.query(
      `update public.profiles set focuses = '{research,academic_community,social_life}',
        campus_academic_prefs = '{hackathons_tech,research}', campus_social_prefs = '{quiet_close_knit}' where id = $1`,
      [id]
    );
    await expect(db.query("update public.profiles set focuses = '{parties}' where id = $1", [id])).rejects.toThrow(/profiles_focuses_check/);
    await expect(db.query("update public.profiles set campus_academic_prefs = '{robotics}' where id = $1", [id])).rejects.toThrow(/profiles_campus_academic_prefs_check/);
    await expect(db.query("update public.profiles set campus_social_prefs = '{party_school}' where id = $1", [id])).rejects.toThrow(/profiles_campus_social_prefs_check/);
  }, 30_000);

  it("stores campus life on shared schools only, and the seed files run", async () => {
    const db = await withStudent();
    const shared = (await db.query("select id from public.universities where created_by is null order by id limit 1")).rows[0].id;
    await db.query(`update public.universities set campus_life = '{"locale":11,"academic_score":0.5}'::jsonb where id = $1`, [shared]);
    await db.query(
      `insert into public.universities (name, country, tuition, acceptance_rate, description, created_by, source) values ('Mine', 'Canada', 1, 50, '', $1, 'user-entered')`,
      [id]
    );
    await expect(
      db.query(`update public.universities set campus_life = '{"locale":11}'::jsonb where created_by = $1`, [id])
    ).rejects.toThrow(/universities_campus_life_check/);
    await expect(db.query(`update public.universities set campus_life = '[1]'::jsonb where id = $1`, [shared])).rejects.toThrow(/universities_campus_life_check/);
    for (const file of readdirSync(join(SUPABASE, "seed_campus_life"))) {
      await db.exec(readFileSync(join(SUPABASE, "seed_campus_life", file), "utf8"));
    }
  }, 60_000);
});

describe("migration_024 (report rate limit)", () => {
  it("refuses a 21st report from one student within a day, not another student's first, and is safe to re-run", async () => {
    const { db } = await createInMemoryDb();
    await db.exec(sql("migration_024_report_rate_limit.sql"));
    const [A, B] = ["00000000-0000-0000-0000-0000000000e1", "00000000-0000-0000-0000-0000000000e2"];
    for (const id of [A, B]) await db.query("insert into auth.users (id) values ($1)", [id]);
    const shared = (await db.query("select id from public.universities where created_by is null order by id limit 1")).rows[0].id;
    const report = (id) => db.query("insert into public.figure_reports (user_id, university_id, field, suggested_value) values ($1, $2, 'tuition', '1')", [id, shared]);
    for (let i = 0; i < 20; i++) await report(A);
    await expect(report(A)).rejects.toThrow(/report_limit/);
    await report(B);
    // Older reports don't count.
    await db.query("update public.figure_reports set created_at = now() - interval '2 days' where user_id = $1", [A]);
    await report(A);
  }, 60_000);
});
