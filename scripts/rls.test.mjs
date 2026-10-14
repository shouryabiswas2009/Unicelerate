import { describe, expect, it } from "vitest";
import { createInMemoryDb } from "./in-memory-db.mjs";

// Row level security across every table that holds a student's data, after
// all migrations: student A can't read, change or delete student B's
// profile, courses, applications, saved schools, own schools or reports,
// and "delete my account" removes every one of A's rows (and none of B's).
// Runs as a plain role, like Supabase's "authenticated" (the in-memory
// database's superuser would skip row level security).

const A = "00000000-0000-0000-0000-00000000a0a0";
const B = "00000000-0000-0000-0000-00000000b0b0";

// Every student-owned table and the column that names the owner.
const OWNED = [
  ["profiles", "id"],
  ["profile_courses", "user_id"],
  ["applications", "user_id"],
  ["saved_universities", "user_id"],
  ["universities", "created_by"],
  ["figure_reports", "user_id"],
];

async function twoStudents() {
  const { db } = await createInMemoryDb();
  const shared = (await db.query("select id from public.universities where created_by is null order by id limit 1")).rows[0].id;
  for (const id of [A, B]) {
    await db.query("insert into auth.users (id) values ($1)", [id]);
    await db.query(
      `insert into public.profiles (id, full_name, country, intended_majors, gpa_percentage,
        budget_min, budget_max, preferred_countries, preferred_degree_level)
        values ($1, 'Student', 'Canada', '{CS}', 90, 0, 40000, '{Canada}', 'Undergraduate')`,
      [id]
    );
    await db.query("insert into public.profile_courses (user_id, subject, level, grade_percentage) values ($1, 'calculus', 'ap', 95)", [id]);
    await db.query("insert into public.applications (user_id, university_id) values ($1, $2)", [id, shared]);
    await db.query("insert into public.saved_universities (user_id, university_id) values ($1, $2)", [id, shared]);
    await db.query(
      `insert into public.universities (name, country, tuition, acceptance_rate, description, created_by, source)
        values ($1, 'Canada', 20000, 50, '', $2, 'user-entered')`,
      [`School of ${id.slice(-4)}`, id]
    );
    await db.query("insert into public.figure_reports (user_id, university_id, field, suggested_value) values ($1, $2, 'tuition', '$1')", [id, shared]);
  }
  await db.exec(`
    create role student nologin;
    grant usage on schema public, auth to student;
    grant usage on schema extensions to student; -- as Supabase grants its roles (search_text trigger)
    grant select, insert, update, delete on all tables in schema public to student;
    grant execute on function public.delete_my_account() to student;
  `);
  return { db, shared };
}

const countOwned = async (db, table, column, owner) =>
  (await db.query(`select count(*)::int as n from public.${table} where ${column} = $1`, [owner])).rows[0].n;

describe("row level security: one student can never touch another's data", () => {
  it("can't read another student's rows in any table", async () => {
    const { db } = await twoStudents();
    await db.exec(`set role student; set test.uid = '${A}'`);
    for (const [table, column] of OWNED) {
      expect(await countOwned(db, table, column, B), `${table}: B's rows visible to A`).toBe(0);
      expect(await countOwned(db, table, column, A), `${table}: A's own rows`).toBe(1);
    }
  }, 60_000);

  it("can't change or delete another student's rows", async () => {
    const { db } = await twoStudents();
    await db.exec(`set role student; set test.uid = '${A}'`);
    await db.query("update public.profiles set full_name = 'Hacked' where id = $1", [B]);
    await db.query("update public.applications set status = 'accepted' where user_id = $1", [B]);
    await db.query("update public.universities set name = 'Hacked' where created_by = $1", [B]);
    await db.query("update public.profile_courses set grade_percentage = 0 where user_id = $1", [B]);
    for (const [table, column] of OWNED) {
      await db.query(`delete from public.${table} where ${column} = $1`, [B]).catch(() => {});
    }
    await db.exec("reset role");
    for (const [table, column] of OWNED) expect(await countOwned(db, table, column, B), table).toBe(1);
    expect((await db.query("select full_name from public.profiles where id = $1", [B])).rows[0].full_name).toBe("Student");
    expect((await db.query("select name from public.universities where created_by = $1", [B])).rows[0].name).not.toBe("Hacked");
  }, 60_000);

  it("can't create rows in another student's name", async () => {
    const { db, shared } = await twoStudents();
    await db.exec(`set role student; set test.uid = '${A}'`);
    const attempts = [
      ["insert into public.profile_courses (user_id, subject, grade_percentage) values ($1, 'physics', 90)", [B]],
      ["insert into public.applications (user_id, university_id) values ($1, $2)", [B, shared]],
      ["insert into public.saved_universities (user_id, university_id) values ($1, $2)", [B, shared]],
      ["insert into public.figure_reports (user_id, university_id, field, suggested_value) values ($1, $2, 'tuition', '1')", [B, shared]],
      ["insert into public.universities (name, country, tuition, acceptance_rate, description, created_by, source) values ('X', 'Canada', 1, 50, '', $1, 'user-entered')", [B]],
    ];
    for (const [sql, params] of attempts) await expect(db.query(sql, params), sql).rejects.toThrow(/row-level security/);
  }, 60_000);

  it("'delete my account' removes every table's rows for that student, and none of anyone else's", async () => {
    const { db } = await twoStudents();
    await db.exec(`set role student; set test.uid = '${A}'`);
    await db.query("select public.delete_my_account()");
    await db.exec("reset role");
    for (const [table, column] of OWNED) {
      expect(await countOwned(db, table, column, A), `${table} still has A's rows`).toBe(0);
      expect(await countOwned(db, table, column, B), `${table} lost B's rows`).toBe(1);
    }
    expect((await db.query("select count(*)::int as n from auth.users where id = $1", [A])).rows[0].n).toBe(0);
  }, 60_000);
});
