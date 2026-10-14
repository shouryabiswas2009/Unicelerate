// Lists the money amounts on an official page with the line around each,
// lowest first, so a person can pick the figure that matches the basis
// they'll record (e.g. the lowest international fee in a table).
//
//   node scripts/curated/amounts.mjs <url> [symbol, default £] [minimum, default 10000]
import { fetchPage } from "./fetch-page.mjs";

const [url, symbol = "£", min = "10000"] = process.argv.slice(2);
const page = await fetchPage(url);
console.log(`${page.status} ${page.final}`);
const lines = page.text.split("\n");
const esc = symbol.replace(/[$^*+?.()|[\]{}\\]/g, "\\$&");
const amount = new RegExp(`${esc}\\s?(\\d{1,3}(?:,\\d{3})+|\\d{4,})`, "g");
const found = [];
lines.forEach((line, i) => {
  for (const m of line.matchAll(amount)) {
    const value = Number(m[1].replace(/,/g, ""));
    if (value >= Number(min)) found.push({ value, i, context: lines.slice(Math.max(0, i - 2), i + 1).join(" ⏐ ").slice(-220) });
  }
});
found.sort((a, b) => a.value - b.value);
const seen = new Set();
for (const f of found) {
  if (seen.has(f.value)) continue;
  seen.add(f.value);
  console.log(`${symbol}${f.value.toLocaleString("en-US")}  [line ${f.i}]  ${f.context}`);
}
