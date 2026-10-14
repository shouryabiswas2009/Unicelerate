import { readFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Accessibility check (axe-core) on the main public pages, in light and
// dark mode. Fails on "serious" or "critical" problems; smaller ones are
// printed so they can be fixed too.

const fixture = JSON.parse(readFileSync(join(process.cwd(), "data", "fixtures", "shared-universities.json"), "utf8"));
const col = (name: string) => fixture.columns.indexOf(name);
const WATERLOO_ID: string = fixture.rows.find((r: unknown[]) => r[col("name")] === "University of Waterloo")[col("id")];

const PAGES = ["/", "/universities", `/universities/${WATERLOO_ID}`, "/signup"];

for (const scheme of ["light", "dark"] as const) {
  for (const path of PAGES) {
    test(`${path} has no serious accessibility problems (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const { violations } = await new AxeBuilder({ page }).analyze();
      const blocking = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      for (const v of violations) console.log(`[${scheme}] ${path}: ${v.impact} ${v.id} (${v.nodes.length}): ${v.help}`);
      expect(blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`)).toEqual([]);
    });
  }
}
