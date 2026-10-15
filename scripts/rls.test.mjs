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

describe("feedback (migration_026): anyone can send it, nobody can read it through the API", () => {
  async function asRole(role, uid = "") {
    const { db } = await createInMemoryDb();
    if (uid) await db.query("insert into auth.users (id) values ($1)", [uid]);
    await db.exec(`grant usage on schema public, auth to ${role}; set role ${role}; set test.uid = '${uid}'`);
    return db;
  }

  it("a logged-out visitor can send feedback but can't read any back", async () => {
    const db = await asRole("anon");
    await db.query("insert into public.feedback (message, email, page) values ('The fee looks old', 'me@example.com', '/universities')");
    await expect(db.query("select * from public.feedback")).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
    expect((await db.query("select count(*)::int as n from public.feedback where status = 'new'")).rows[0].n).toBe(1);
  }, 60_000);

  it("a student can't send it in someone else's name, set a status, or change or delete any", async () => {
    const db = await asRole("authenticated", A);
    await db.exec("reset role");
    await db.query("insert into auth.users (id) values ($1)", [B]);
    await db.exec("set role authenticated");
    await expect(db.query("insert into public.feedback (message, user_id) values ('hi there', $1)", [B])).rejects.toThrow(/row-level security/);
    await expect(db.query("insert into public.feedback (message, status) values ('hi there', 'fixed')")).rejects.toThrow(/permission denied/);
    await db.query("insert into public.feedback (message) values ('mine')");
    await expect(db.query("update public.feedback set status = 'fixed'")).rejects.toThrow(/permission denied/);
    await expect(db.query("delete from public.feedback")).rejects.toThrow(/permission denied/);
    await db.exec("reset role");
    expect((await db.query("select user_id from public.feedback")).rows).toEqual([{ user_id: A }]);
  }, 60_000);

  it("caps a student at 10 messages a day (the database rule)", async () => {
    const db = await asRole("authenticated", A);
    for (let i = 0; i < 10; i++) await db.query("insert into public.feedback (message) values ($1)", [`message ${i}`]);
    await expect(db.query("insert into public.feedback (message) values ('one more')")).rejects.toThrow(/feedback_limit/);
  }, 60_000);

  it("the owner's inbox view is out of reach of the API roles", async () => {
    for (const role of ["anon", "authenticated"]) {
      const db = await asRole(role);
      await expect(db.query("select * from public.owner_inbox"), role).rejects.toThrow(/permission denied/);
    }
  }, 120_000);

  it("the owner's inbox lists feedback and figure reports on one status scale", async () => {
    const { db } = await createInMemoryDb();
    const shared = (await db.query("select id from public.universities where created_by is null limit 1")).rows[0]?.id;
    await db.query("insert into auth.users (id) values ($1)", [A]);
    await db.query("insert into public.feedback (message) values ('hello there')");
    if (shared) {
      await db.query("insert into public.figure_reports (user_id, university_id, field, suggested_value, status) values ($1, $2, 'tuition', '1', 'rejected')", [A, shared]);
    }
    const rows = (await db.query("select kind, status from public.owner_inbox order by kind")).rows;
    expect(rows).toEqual([{ kind: "feedback", status: "new" }, ...(shared ? [{ kind: "figure report", status: "wont_fix" }] : [])]);
  }, 60_000);

  it("goes when the student deletes their account", async () => {
    const db = await asRole("authenticated", A);
    await db.query("insert into public.feedback (message) values ('bye for now')");
    await db.exec("reset role");
    await db.query("delete from auth.users where id = $1", [A]);
    expect((await db.query("select count(*)::int as n from public.feedback")).rows[0].n).toBe(0);
  }, 60_000);
});
