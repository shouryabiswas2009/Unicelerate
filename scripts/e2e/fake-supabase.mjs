// A tiny stand-in for Supabase's REST API, for the end-to-end tests in CI:
// the public pages read the shared university list and the visa guidance,
// and this serves them from data/fixtures (exported from the real database
// with the public key: npm run data:export-fixture). No private table, no
// writes, no auth: a visitor's view only.
//
//   node scripts/e2e/fake-supabase.mjs   (listens on FAKE_SUPABASE_PORT, default 54321)
//
// It understands only what the public pages send (PostgREST query syntax):
// select, eq / is / ilike / in filters, order, offset and limit.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const fixture = JSON.parse(readFileSync(join(ROOT, "data", "fixtures", "shared-universities.json"), "utf8"));
const universities = fixture.rows.map((row) => Object.fromEntries(fixture.columns.map((c, i) => [c, row[i]])));
const plain = (text) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
// search_text, as migration_011 builds it: name plus aliases, plain.
for (const u of universities) u.search_text = plain([u.name, ...(u.aliases ?? [])].join(" "));

const TABLES = {
  universities,
  country_info: JSON.parse(readFileSync(join(ROOT, "data", "fixtures", "country-info.json"), "utf8")),
};

function matches(row, column, condition) {
  const dot = condition.indexOf(".");
  const op = condition.slice(0, dot);
  const value = condition.slice(dot + 1);
  const cell = row[column];
  switch (op) {
    case "eq":
      return String(cell) === value;
    case "is":
      return value === "null" ? cell === null || cell === undefined : String(cell) === value;
    case "ilike": {
      // PostgREST accepts * or % as the wildcard; \ escapes.
      const pattern = value.replace(/\\([\\%_])/g, "\u0000$1").replace(/[.+?^${}()|[\]]/g, "\\$&").replace(/[*%]/g, ".*").replace(/_/g, ".").replace(/\u0000(.)/g, "\\$1");
      return new RegExp(`^${pattern}$`, "is").test(String(cell ?? ""));
    }
    case "in":
      return value.replace(/^\(|\)$/g, "").split(",").includes(String(cell));
    default:
      throw new Error(`fake-supabase: filter "${op}" isn't supported`);
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const send = (status, body) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const table = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname)?.[1];
  if (req.method !== "GET" || !table) return send(404, { code: "PGRST000", message: "Only public reads are faked" });
  const rows = TABLES[table];
  if (!rows) return send(404, { code: "PGRST205", message: `Could not find the table 'public.${table}'` });

  let result = rows;
  for (const [key, condition] of url.searchParams) {
    if (["select", "order", "offset", "limit"].includes(key)) continue;
    result = result.filter((row) => matches(row, key, condition));
  }
  const order = url.searchParams.get("order");
  if (order) {
    const [column, direction = "asc"] = order.split(".");
    result = [...result].sort((a, b) => (a[column] < b[column] ? -1 : a[column] > b[column] ? 1 : 0) * (direction === "desc" ? -1 : 1));
  }
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const limit = url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : result.length;
  result = result.slice(offset, offset + limit);

  const select = url.searchParams.get("select") ?? "*";
  if (select !== "*") {
    const columns = select.split(",");
    for (const c of columns) {
      if (rows.length && !(c in rows[0]) && c !== "search_text") {
        return send(400, { code: "42703", message: `column ${table}.${c} does not exist` });
      }
    }
    result = result.map((row) => Object.fromEntries(columns.map((c) => [c, row[c] ?? null])));
  }
  send(200, result);
});

const port = Number(process.env.FAKE_SUPABASE_PORT ?? 54321);
server.listen(port, "127.0.0.1", () => console.log(`fake Supabase on http://127.0.0.1:${port} (${universities.length} universities)`));
