// Checks every link on the public pages a visitor sees first: the landing
// page (which includes the navbar and footer), the privacy and credits
// pages. Run after `npm run build`:
//
//   npm run check:links
//
// It starts the production server, loads each page logged out, and checks:
// - internal links (/something) load directly with status 200: no 404s and
//   no redirects (a redirect usually means "log in first");
// - links to a part of a page (#try-it, /#real-data) point at an element
//   that exists;
// - links to other sites use https.
// Exits with an error listing every broken link, so CI fails on one.
import { spawn } from "node:child_process";
import { join } from "node:path";

const PORT = Number(process.env.CHECK_LINKS_PORT ?? 3999);
const BASE = `http://localhost:${PORT}`;
const PAGES = ["/", "/privacy", "/credits"];

// Members-only links that are deliberate, with the reason. Everything else
// must load without logging in.
const ALLOWED_LOGIN_LINKS = {
  // "To delete your account, go to your profile": deleting needs a login.
  "/privacy": ["/profile"],
};

const nextBin = join(import.meta.dirname, "..", "node_modules", "next", "dist", "bin", "next");
const server = spawn(process.execPath, [nextBin, "start", "-p", String(PORT)], {
  cwd: join(import.meta.dirname, ".."),
  stdio: ["ignore", "pipe", "pipe"],
});
server.stderr.on("data", (d) => process.stderr.write(d));

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(BASE, { redirect: "manual" });
      if (res.status) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("The server didn't start within 60 seconds");
}

const htmlCache = new Map();
async function page(path) {
  if (!htmlCache.has(path)) {
    const res = await fetch(BASE + path, { redirect: "manual" });
    htmlCache.set(path, { status: res.status, location: res.headers.get("location"), html: await res.text() });
  }
  return htmlCache.get(path);
}

// The href of every <a> on a page (not <link> tags for icons and styles).
// Members' links are never in a public page's HTML (they're added in the
// browser for students who are logged in), so every link here is one a
// visitor can follow.
function anchorHrefs(html) {
  return [...html.matchAll(/<a\b[^>]*?\shref="([^"]+)"[^>]*>/g)].map((m) => m[1].replaceAll("&amp;", "&"));
}

const hasId = (html, id) => new RegExp(`\\sid="${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`).test(html);

const problems = [];
let checked = 0;
try {
  await waitForServer();
  for (const source of PAGES) {
    const { html, status } = await page(source);
    if (status !== 200) {
      problems.push(`${source}: the page itself returned ${status}`);
      continue;
    }
    // A visitor's page never carries the members' controls.
    if (/aria-label="Log out"|>Log out</.test(html)) problems.push(`${source}: has a "Log out" control for a logged-out visitor`);
    for (const href of new Set(anchorHrefs(html))) {
      checked++;
      if (href.startsWith("#")) {
        if (!hasId(html, href.slice(1))) problems.push(`${source}: "${href}" points at a missing section`);
      } else if (href.startsWith("/")) {
        const url = new URL(href, BASE);
        const target = await page(url.pathname + url.search);
        const allowed = (ALLOWED_LOGIN_LINKS[source] ?? []).includes(url.pathname);
        if (target.status >= 300 && target.status < 400 && allowed && target.location?.startsWith("/login")) {
          // deliberate, see ALLOWED_LOGIN_LINKS
        } else if (target.status >= 300 && target.status < 400) {
          problems.push(`${source}: "${href}" redirects (${target.status}) to ${target.location}`);
        } else if (target.status !== 200) {
          problems.push(`${source}: "${href}" returned ${target.status}`);
        } else if (url.hash && !hasId(target.html, url.hash.slice(1))) {
          problems.push(`${source}: "${href}" points at a missing section`);
        }
      } else if (/^mailto:/.test(href)) {
        // fine
      } else if (!href.startsWith("https://")) {
        problems.push(`${source}: "${href}" is not an https link`);
      }
    }
  }
} finally {
  server.kill();
}

if (problems.length) {
  console.error(`FAIL ${problems.length} broken link(s) out of ${checked} checked:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`OK  ${checked} links on ${PAGES.join(", ")}: all load, none redirect, external links use https`);
