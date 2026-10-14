// Fetches official pages politely and shows what they say, so a curated
// figure is always read from its page (never typed from memory):
//
//   node scripts/curated/fetch-page.mjs <url> [pattern …]
//     prints the page's status, final address and every line of its text
//     matching a pattern (case-insensitive), with a little context.
//
//   node scripts/curated/fetch-page.mjs --degrees data/curated/candidates.csv
//     fetches each candidate's homepage and reports whether the page itself
//     mentions undergraduate, master's and doctoral study.
//
// Pages are cached in ml/data/raw/candidates/pages/ (git-ignored); at most
// one request a second; a page that can't be fetched is reported, never
// guessed.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseCsv } from "./csv.mjs";

const ROOT = join(import.meta.dirname, "..", "..");
const CACHE = join(ROOT, "ml", "data", "raw", "candidates", "pages");
mkdirSync(CACHE, { recursive: true });
const UA = "Mozilla/5.0 (compatible; Unicelerate/1.0; +https://www.unicelerate.com)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;

export async function fetchPage(url) {
  const file = join(CACHE, createHash("sha1").update(url).digest("hex") + ".json");
  if (existsSync(file)) {
    const cached = JSON.parse(readFileSync(file, "utf8"));
    if (cached.status !== 0) return cached; // a failed fetch is tried again
  }
  const wait = 1000 - (Date.now() - last);
  if (wait > 0) await sleep(wait);
  last = Date.now();
  let result;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en" }, redirect: "follow", signal: AbortSignal.timeout(25000) });
    const html = await res.text();
    result = { url, status: res.status, final: res.url, text: toText(html) };
  } catch (e) {
    result = { url, status: 0, final: url, text: "", error: String(e.cause?.code ?? e.message) };
  }
  writeFileSync(file, JSON.stringify(result));
  return result;
}

// Visible text, one line per block, entities decoded (enough to read fees).
export function toText(html) {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d|\/td|\/th|\/section)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#36;|&dollar;/g, "$")
    .replace(/&pound;/g, "£")
    .replace(/&euro;/g, "€")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#39;|&rsquo;|&#8217;/g, "'")
    .replace(/&[a-z]+;/g, " ")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

const DEGREE_PATTERNS = {
  Undergraduate: /undergraduate|bachelor|baccalaur|licence|grundständig|bachelorstudium/i,
  Masters: /master|maîtrise|postgraduate|graduate studies|graduate programs|graduate school/i,
  PhD: /\bph\.?\s?d\b|doctoral|doctorate|doctorat|promotion|research degree/i,
};

if (process.argv[2] === "--degrees") {
  // Optional country, to check one country's candidates.
  const rows = parseCsv(readFileSync(process.argv[3], "utf8")).filter((r) => !process.argv[4] || r.country === process.argv[4]);
  for (const r of rows) {
    const page = await fetchPage(r.website);
    const levels = Object.entries(DEGREE_PATTERNS).filter(([, re]) => re.test(page.text)).map(([level]) => level);
    console.log([r.ror, page.status, page.final, levels.join(";") || "-", page.error ?? ""].join(" | "));
  }
} else if (process.argv[2]) {
  const page = await fetchPage(process.argv[2]);
  console.log(`${page.status} ${page.final}${page.error ? ` (${page.error})` : ""}`);
  const patterns = process.argv.slice(3).map((p) => new RegExp(p, "i"));
  const lines = page.text.split("\n");
  if (patterns.length === 0) console.log(lines.slice(0, 80).join("\n"));
  lines.forEach((line, i) => {
    if (patterns.some((p) => p.test(line))) console.log(`${i}: ${lines.slice(Math.max(0, i - 1), i + 2).join(" ⏐ ").slice(0, 400)}`);
  });
}
