// README screenshots of the live site's public pages, logged out (nothing
// signs in). Re-run after a visible change:
//
//   node scripts/screenshots.mjs [base URL, default https://www.unicelerate.com]
import { chromium } from "@playwright/test";
import { join } from "node:path";

const BASE = process.argv[2] ?? "https://www.unicelerate.com";
const OUT = join(import.meta.dirname, "..", "docs", "screenshots");
const WATERLOO = "/universities/89d1202a-8363-4c46-9362-ac5187742dab";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: "light", reducedMotion: "reduce" });

async function shot(name, path, prepare) {
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  if (prepare) await prepare();
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`${name}.png`);
}

await shot("landing", "/");
await shot("sample-matches", "/", async () => {
  await page.locator("#screen-previews, section:has-text('Examples for a sample student')").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
});
await shot("browse", "/universities");
await shot("university-page", WATERLOO);
await shot("university-campus-life", WATERLOO, async () => {
  await page.getByRole("heading", { name: "Campus life" }).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -80));
});
await browser.close();
