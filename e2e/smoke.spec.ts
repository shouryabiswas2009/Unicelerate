import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

// Smoke tests of the public pages, as a logged-out visitor, against a
// production build whose database is the fake in scripts/e2e (real shared
// list from data/fixtures). Each test is one thing a visitor does.

const fixture = JSON.parse(readFileSync(join(process.cwd(), "data", "fixtures", "shared-universities.json"), "utf8"));
const col = (name: string) => fixture.columns.indexOf(name);
const waterloo = fixture.rows.find((r: unknown[]) => r[col("name")] === "University of Waterloo");
const WATERLOO_ID: string = waterloo[col("id")];

test("the landing page renders, with no members' controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("header").getByRole("link", { name: "Log in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Log out" })).toHaveCount(0);
});

test("the quiz returns five universities", async ({ page }) => {
  await page.goto("/#try-it");
  await page.getByRole("button", { name: "Show my matches" }).click();
  const results = page.locator("#try-it ol > li");
  await expect(results).toHaveCount(5, { timeout: 15_000 });
  await expect(results.first().getByRole("link")).toHaveAttribute("href", /^\/universities\//);
});

test("browse: searching by name finds the school", async ({ page }) => {
  await page.goto("/universities");
  await page.getByRole("textbox", { name: "Search universities by name" }).fill("Waterloo");
  await expect(page).toHaveURL(/q=Waterloo/);
  await expect(page.getByText("University of Waterloo").first()).toBeVisible();
});

test("browse: the filters show their chosen values in the page itself", async ({ request }) => {
  const html = await (await request.get("/universities?country=Canada&sort=tuition-asc")).text();
  expect(html).toMatch(/<option value="Canada" selected="">Canada<\/option>|<option selected="" value="Canada">/);
  expect(html).toMatch(/<option value="tuition-asc" selected="">Lowest tuition<\/option>|<option selected="" value="tuition-asc">/);
});

test("a university page shows strength, campus life, sources and visa guidance", async ({ page }) => {
  await page.goto(`/universities/${WATERLOO_ID}`);
  await expect(page.getByRole("heading", { level: 1, name: "University of Waterloo" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Strength (Unicelerate index)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Campus life" })).toBeVisible();
  await expect(page.getByText(/Data coverage: Good/).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Data sources and dates" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Visas and work in Canada/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Log out" })).toHaveCount(0);
});

test("credits, privacy and the sitemap load", async ({ request }) => {
  for (const path of ["/credits", "/privacy", "/sitemap.xml"]) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
});

test("an unknown address shows the 404 page", async ({ page }) => {
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/couldn.t find that page/i);
});

test("no public page carries a Log out control", async ({ request }) => {
  for (const path of ["/", "/universities", `/universities/${WATERLOO_ID}`, "/credits", "/privacy", "/signup", "/login", "/no-such-page"]) {
    const html = await (await request.get(path)).text();
    expect(html, path).not.toMatch(/aria-label="Log out"|>Log out</);
  }
});

test("the footer's links all load", async ({ page, request }) => {
  await page.goto("/");
  const hrefs = await page.locator("footer a[href^='/']").evaluateAll((links) => links.map((a) => a.getAttribute("href")!));
  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of new Set(hrefs)) {
    const response = await request.get(href, { maxRedirects: 0 });
    expect([200, 307], href).toContain(response.status());
  }
});

test("numbers in running text keep the space after them", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.locator("#password-hint")).toContainText("At least 8 characters");
  await page.goto(`/universities/${WATERLOO_ID}`);
  await expect(page.getByText(/[\d,]+ universities in the ranking/)).toBeVisible();
});

test("the footer links to feedback and says when the data was last refreshed", async ({ page }) => {
  await page.goto("/privacy");
  const footer = page.locator("footer");
  await expect(footer.getByRole("link", { name: "Send feedback" })).toHaveAttribute("href", "/feedback?from=%2Fprivacy");
  await expect(footer).toContainText(/University data last refreshed \d{1,2} [A-Z][a-z]+ \d{4}\./);
});
