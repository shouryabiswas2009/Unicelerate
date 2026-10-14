// A local stand-in for Supabase, so logged-in pages can be tested on
// localhost without touching the real project:
//
// - the database is real PostgreSQL (PGlite, in memory) with every
//   migration and seed applied, so row level security, constraints,
//   triggers and "delete my account" are the real ones;
// - a small auth service (sign up, log in, refresh, current user, log out)
//   that keeps test accounts in memory and signs its tokens with a
//   local-only secret (HS256), which the Supabase client checks by asking
//   /auth/v1/user, as it does for any HS256 token;
// - the part of the PostgREST API the app uses: select (with columns and
//   one level of embedding, like universities(id, name)), filters, order,
//   offset/limit, insert/upsert, update, delete, single(), and rpc.
//
//   node scripts/local-supabase/server.mjs      (http://127.0.0.1:54321)
//
// Then run the app against it, for example (PowerShell):
//   $env:NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"; $env:NEXT_PUBLIC_SUPABASE_ANON_KEY="local-anon-key"; npm run dev
//
// Nothing is written to disk; stopping it forgets every account. Listens on
// 127.0.0.1 only. Not for production: no email, rate limits or OAuth.
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { createInMemoryDb, loadAllSeeds } from "../in-memory-db.mjs";

const PORT = Number(process.env.LOCAL_SUPABASE_PORT ?? 54321);
// Local only: tokens signed with this can't be used anywhere else.
const SECRET = process.env.LOCAL_SUPABASE_SECRET ?? randomBytes(32).toString("hex");
const TOKEN_SECONDS = 3600;

const started = Date.now();
// Values as Supabase's API returns them: numeric and bigint as numbers,
// date and timestamps as text (PostgREST sends "2026-10-14", not a Date).
// Timestamps in ISO form ("2026-10-14 19:28:05+00" → "2026-10-14T19:28:05+00:00").
const iso = (value) => value.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00");
const { db } = await createInMemoryDb({
  parsers: { 1700: Number, 20: Number, 1082: (value) => value, 1114: iso, 1184: iso },
});
await loadAllSeeds(db);
// Supabase's two API roles. Policies use auth.uid(), which reads test.uid
// (scripts/in-memory-db.mjs); grants mirror what Supabase gives them.
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public, auth, extensions to anon, authenticated;
  grant select, insert, update, delete on all tables in schema public to anon, authenticated;
  grant usage, select on all sequences in schema public to anon, authenticated;
  grant execute on all functions in schema public to anon, authenticated;
`);
const universityCount = (await db.query("select count(*)::int as n from public.universities")).rows[0].n;

// ─── Auth ───────────────────────────────────────────────────────────────
const accounts = new Map(); // email → { id, email, hash, salt, created_at }
const refreshTokens = new Map(); // refresh token → user id

const b64url = (data) => Buffer.from(data).toString("base64url");
function sign(payload) {
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  return `${head}.${body}.${createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url")}`;
}
function verify(token) {
  const [head, body, sig] = String(token ?? "").split(".");
  if (!head || !body || !sig) return null;
  const expected = createHmac("sha256", SECRET).update(`${head}.${body}`).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const claims = JSON.parse(Buffer.from(body, "base64url").toString());
  return claims.exp * 1000 > Date.now() ? claims : null;
}
const hashPassword = (password, salt) => scryptSync(password, salt, 32).toString("hex");

const accountById = (id) => [...accounts.values()].find((a) => a.id === id) ?? null;
// "Delete my account" removes the auth.users row; the account goes with it.
async function stillExists(account) {
  const { rows } = await db.query("select 1 from auth.users where id = $1", [account.id]);
  if (rows.length === 0) accounts.delete(account.email);
  return rows.length > 0;
}

function userJson(account) {
  return {
    id: account.id,
    aud: "authenticated",
    role: "authenticated",
    email: account.email,
    email_confirmed_at: account.created_at,
    confirmed_at: account.created_at,
    created_at: account.created_at,
    updated_at: account.created_at,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
  };
}
function session(account) {
  const now = Math.floor(Date.now() / 1000);
  const refresh = randomBytes(24).toString("hex");
  refreshTokens.set(refresh, account.id);
  return {
    access_token: sign({
      sub: account.id, email: account.email, role: "authenticated", aud: "authenticated",
      iat: now, exp: now + TOKEN_SECONDS, session_id: randomUUID(), aal: "aal1",
    }),
    token_type: "bearer",
    expires_in: TOKEN_SECONDS,
    expires_at: now + TOKEN_SECONDS,
    refresh_token: refresh,
    user: userJson(account),
  };
}
const authError = (status, code, message) => [status, { code: status, error_code: code, msg: message, message }];

async function handleAuth(method, path, url, body, bearer) {
  if (method === "POST" && path === "/signup") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return authError(400, "validation_failed", "Unable to validate email address: invalid format");
    if (password.length < 6) return authError(422, "weak_password", "Password should be at least 6 characters.");
    if (accounts.has(email)) return authError(422, "user_already_exists", "User already registered");
    const salt = randomBytes(16).toString("hex");
    const account = { id: randomUUID(), email, salt, hash: hashPassword(password, salt), created_at: new Date().toISOString() };
    await db.query("insert into auth.users (id) values ($1)", [account.id]);
    accounts.set(email, account);
    // Like a project with email confirmation off: signed in straight away.
    return [200, session(account)];
  }
  if (method === "POST" && path === "/token") {
    const grant = url.searchParams.get("grant_type");
    if (grant === "password") {
      const account = accounts.get(String(body.email ?? "").trim().toLowerCase());
      const ok = account && (await stillExists(account)) && timingSafeEqual(Buffer.from(hashPassword(String(body.password ?? ""), account.salt), "hex"), Buffer.from(account.hash, "hex"));
      return ok ? [200, session(account)] : authError(400, "invalid_credentials", "Invalid login credentials");
    }
    if (grant === "refresh_token") {
      const id = refreshTokens.get(String(body.refresh_token ?? ""));
      refreshTokens.delete(String(body.refresh_token ?? ""));
      const account = id && accountById(id);
      return account && (await stillExists(account)) ? [200, session(account)] : authError(400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found");
    }
    return authError(400, "unsupported_grant_type", "Unsupported grant type");
  }
  if (method === "GET" && path === "/user") {
    const claims = verify(bearer);
    const account = claims && accountById(claims.sub);
    return account && (await stillExists(account)) ? [200, userJson(account)] : authError(403, "bad_jwt", "invalid JWT");
  }
  if (method === "POST" && path === "/logout") return [204, null];
  return authError(404, "not_found", `Not supported by the local stand-in: ${method} /auth/v1${path}`);
}

// ─── PostgREST subset ───────────────────────────────────────────────────
const ident = (name) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw Object.assign(new Error(`bad identifier: ${name}`), { status: 400 });
  return `"${name}"`;
};
const pgError = (status, code, message, details = null) => [status, { code, message, details, hint: null }];

// "*, universities(id, name)" → { columns: ["*"], embeds: [{ table, columns }] }
function parseSelect(select = "*") {
  const columns = [];
  const embeds = [];
  let depth = 0;
  let current = "";
  for (const ch of `${select},`) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      const part = current.trim();
      current = "";
      if (!part) continue;
      const embed = /^([a-z_]+)\((.*)\)$/s.exec(part);
      if (embed) embeds.push({ table: embed[1], columns: embed[2].split(",").map((c) => c.trim()).filter(Boolean) });
      else columns.push(part);
      continue;
    }
    current += ch;
  }
  return { columns: columns.length ? columns : embeds.length ? [] : ["*"], embeds };
}

// Filters from the query string → SQL with $n parameters.
function where(url, params) {
  const clauses = [];
  for (const [key, raw] of url.searchParams) {
    if (["select", "order", "offset", "limit", "on_conflict", "columns"].includes(key)) continue;
    const dot = raw.indexOf(".");
    let op = raw.slice(0, dot);
    let value = raw.slice(dot + 1);
    let negate = false;
    if (op === "not") {
      negate = true;
      const next = value.indexOf(".");
      op = value.slice(0, next);
      value = value.slice(next + 1);
    }
    const col = ident(key);
    const param = (v) => {
      params.push(v);
      return `$${params.length}`;
    };
    let sql;
    switch (op) {
      case "eq": sql = `${col}::text = ${param(value)}`; break;
      case "neq": sql = `${col}::text <> ${param(value)}`; break;
      case "gt": sql = `${col} > ${param(value)}`; break;
      case "gte": sql = `${col} >= ${param(value)}`; break;
      case "lt": sql = `${col} < ${param(value)}`; break;
      case "lte": sql = `${col} <= ${param(value)}`; break;
      case "like": sql = `${col}::text like ${param(value.replaceAll("*", "%"))}`; break;
      case "ilike": sql = `${col}::text ilike ${param(value.replaceAll("*", "%"))}`; break;
      case "is":
        sql = value === "null" ? `${col} is null` : value === "true" ? `${col} is true` : value === "false" ? `${col} is false` : null;
        break;
      case "in": {
        const items = value.replace(/^\(|\)$/g, "").split(",").map((v) => v.replace(/^"|"$/g, ""));
        sql = `${col}::text = any(${param(items)}::text[])`;
        break;
      }
      default:
        throw Object.assign(new Error(`filter "${op}" isn't supported by the local stand-in`), { status: 400 });
    }
    if (sql === null) throw Object.assign(new Error(`is.${value} isn't supported`), { status: 400 });
    clauses.push(negate ? `not (${sql})` : sql);
  }
  return clauses.length ? `where ${clauses.join(" and ")}` : "";
}

function orderBy(url) {
  const order = url.searchParams.get("order");
  if (!order) return "";
  return `order by ${order
    .split(",")
    .map((part) => {
      const [col, dir = "asc", nulls] = part.split(".");
      return `${ident(col)} ${dir === "desc" ? "desc" : "asc"}${nulls === "nullsfirst" ? " nulls first" : nulls === "nullslast" ? " nulls last" : ""}`;
    })
    .join(", ")}`;
}

async function tableColumns(tx, table) {
  const { rows } = await tx.query(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position",
    [table]
  );
  return rows.map((r) => r.column_name);
}
async function primaryKey(tx, table) {
  const { rows } = await tx.query(
    `select a.attname as name from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
     where i.indrelid = $1::regclass and i.indisprimary`,
    [`public.${table}`]
  );
  return rows.map((r) => r.name);
}

// One level of many-to-one embedding: applications.university_id → universities.
async function attachEmbeds(tx, table, rows, embeds) {
  for (const embed of embeds) {
    const fk = `${embed.table.replace(/ies$/, "y").replace(/s$/, "")}_id`;
    const ids = [...new Set(rows.map((r) => r[fk]).filter(Boolean))];
    const cols = embed.columns.length === 0 || embed.columns.includes("*") ? "*" : [...new Set(["id", ...embed.columns])].map(ident).join(", ");
    const related = ids.length ? (await tx.query(`select ${cols} from public.${ident(embed.table)} where id::text = any($1::text[])`, [ids])).rows : [];
    const byId = new Map(related.map((r) => [String(r.id), r]));
    for (const row of rows) {
      const match = byId.get(String(row[fk])) ?? null;
      if (match && cols !== "*" && !embed.columns.includes("id")) delete match.id;
      row[embed.table] = match ? { ...match } : null;
    }
  }
}

async function handleRest(method, table, url, body, headers, uid) {
  const prefer = headers.prefer ?? "";
  const wantsObject = (headers.accept ?? "").includes("vnd.pgrst.object+json");
  const representation = prefer.includes("return=representation");

  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? "authenticated" : "anon"}`);
    await tx.query("select set_config('test.uid', $1, true)", [uid ?? ""]);

    if (table.startsWith("rpc/")) {
      const fn = ident(table.slice(4));
      const { rows } = await tx.query(`select to_json(public.${fn}()) as result`);
      return [200, rows[0]?.result ?? null];
    }

    const known = await tableColumns(tx, table);
    if (known.length === 0) return pgError(404, "PGRST205", `Could not find the table 'public.${table}' in the schema cache`);
    const { columns, embeds } = parseSelect(url.searchParams.get("select") ?? "*");
    for (const c of columns) {
      if (c !== "*" && !known.includes(c)) return pgError(400, "42703", `column ${table}.${c} does not exist`);
    }
    const fks = embeds.map((e) => `${e.table.replace(/ies$/, "y").replace(/s$/, "")}_id`);
    const selectList = columns.includes("*") ? "*" : [...new Set([...columns, ...fks.filter((f) => known.includes(f))])].map(ident).join(", ");
    const shape = async (rows) => {
      await attachEmbeds(tx, table, rows, embeds);
      if (!columns.includes("*")) for (const row of rows) for (const f of fks) if (!columns.includes(f)) delete row[f];
      return rows;
    };
    const params = [];

    if (method === "GET" || method === "HEAD") {
      const filter = where(url, params);
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : null;
      const { rows } = await tx.query(
        `select ${selectList} from public.${ident(table)} ${filter} ${orderBy(url)} ${limit === null ? "" : `limit ${limit}`} offset ${offset}`,
        params
      );
      return reply(await shape(rows), wantsObject);
    }

    if (method === "POST") {
      const records = Array.isArray(body) ? body : [body];
      const cols = [...new Set(records.flatMap((r) => Object.keys(r)))].filter((c) => known.includes(c));
      const unknown = [...new Set(records.flatMap((r) => Object.keys(r)))].filter((c) => !known.includes(c));
      if (unknown.length) return pgError(400, "PGRST204", `Could not find the '${unknown[0]}' column of '${table}' in the schema cache`);
      params.push(JSON.stringify(records));
      let sql = `insert into public.${ident(table)} (${cols.map(ident).join(", ")})
        select ${cols.map(ident).join(", ")} from json_populate_recordset(null::public.${ident(table)}, $1::json)`;
      if (prefer.includes("resolution=merge-duplicates") || prefer.includes("resolution=ignore-duplicates")) {
        const target = url.searchParams.get("on_conflict")?.split(",") ?? (await primaryKey(tx, table));
        const updates = cols.filter((c) => !target.includes(c));
        sql +=
          prefer.includes("ignore-duplicates") || updates.length === 0
            ? ` on conflict (${target.map(ident).join(", ")}) do nothing`
            : ` on conflict (${target.map(ident).join(", ")}) do update set ${updates.map((c) => `${ident(c)} = excluded.${ident(c)}`).join(", ")}`;
      }
      const { rows } = await tx.query(`${sql} returning ${selectList}`, params);
      return representation ? reply(await shape(rows), wantsObject, 201) : [201, null];
    }

    if (method === "PATCH") {
      const cols = Object.keys(body ?? {}).filter((c) => known.includes(c));
      if (cols.length === 0) return pgError(400, "PGRST204", "nothing to update");
      params.push(JSON.stringify(body));
      const set = cols.map((c) => `${ident(c)} = (json_populate_record(null::public.${ident(table)}, $1::json)).${ident(c)}`).join(", ");
      const { rows } = await tx.query(`update public.${ident(table)} set ${set} ${where(url, params)} returning ${selectList}`, params);
      return representation ? reply(await shape(rows), wantsObject) : [204, null];
    }

    if (method === "DELETE") {
      const { rows } = await tx.query(`delete from public.${ident(table)} ${where(url, params)} returning ${selectList}`, params);
      return representation ? reply(await shape(rows), wantsObject) : [204, null];
    }
    return pgError(405, "PGRST000", `${method} isn't supported`);
  });
}

function reply(rows, wantsObject, status = 200) {
  if (!wantsObject) return [status, rows];
  if (rows.length !== 1) {
    return pgError(406, "PGRST116", "JSON object requested, multiple (or no) rows returned", `The result contains ${rows.length} rows`);
  }
  return [status, rows[0]];
}

// Postgres errors → PostgREST's shape and status codes.
function fromPgError(error) {
  const code = error.code ?? "PGRST000";
  const status = error.status ?? (code === "42501" ? 403 : code === "23505" ? 409 : code === "P0001" ? 400 : 400);
  return pgError(status, code, error.message, error.detail ?? null);
}

// PGlite has one connection, so requests take turns.
let queue = Promise.resolve();
const serially = (task) => {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
};

const server = createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", async () => {
    const url = new URL(req.url, "http://127.0.0.1");
    const send = (status, payload, extra = {}) => {
      res.writeHead(status, {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
        ...extra,
      });
      res.end(payload === null || status === 204 ? undefined : JSON.stringify(payload));
    };
    if (req.method === "OPTIONS") return send(204, null);
    try {
      const body = raw ? JSON.parse(raw) : {};
      const bearer = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
      if (url.pathname.startsWith("/auth/v1/")) {
        const [status, payload] = await serially(() => handleAuth(req.method, url.pathname.slice(8), url, body, bearer));
        return send(status, payload);
      }
      const rest = /^\/rest\/v1\/(rpc\/[a-z_]+|[a-z_]+)$/.exec(url.pathname)?.[1];
      if (!rest) return send(404, { code: "PGRST000", message: "Not found" });
      const claims = verify(bearer);
      const [status, payload] = await serially(() =>
        handleRest(req.method, rest, url, body, req.headers, claims?.sub ?? null).catch((e) => fromPgError(e))
      );
      const count = Array.isArray(payload) ? payload.length : payload ? 1 : 0;
      return send(status, req.method === "HEAD" ? null : payload, { "content-range": `0-${Math.max(count - 1, 0)}/${count}` });
    } catch (e) {
      return send(400, { code: "PGRST100", message: e.message });
    }
  });
});
server.listen(PORT, "127.0.0.1", () =>
  console.log(`Local Supabase ready on http://127.0.0.1:${PORT} (${universityCount} universities, ${((Date.now() - started) / 1000).toFixed(0)} s)`)
);
