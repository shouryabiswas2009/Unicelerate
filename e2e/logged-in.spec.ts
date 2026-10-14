import { expect, test, type Page } from "@playwright/test";
import { LOCAL_TEST_ACCOUNT } from "./local-test-account";

// The logged-in happy path, end to end, against the local Supabase stand-in
// (playwright.local.config.ts; never the real database). One student goes
// from sign-up to deleting their account; each step checks what a student
// would see. Run with: npm run test:e2e:local

// A fresh address per run, so a re-run never meets "already registered".
const email = LOCAL_TEST_ACCOUNT.email.replace("@", `+${Date.now()}@`);
const password = LOCAL_TEST_ACCOUNT.password;

// No "NaN", "undefined" or "[object Object]" in what the page shows.
async function expectNoBrokenValues(page: Page) {
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(/\bNaN\b|\bundefined\b|\[object Object\]/);
}

test("a student signs up, gets recommendations, saves, compares, tracks an offer and deletes the account", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await test.step("sign up", async () => {
    await page.goto("/signup");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/profile/);
  });

  await test.step("fill the profile: Ontario grades, a course, two campus focuses, visa factored in", async () => {
    await page.goto("/profile?preset=canada-grade12");
    await page.getByLabel("Full name").fill("Test Student");
    await page.getByPlaceholder("e.g. 88").fill("88");
    await page.getByPlaceholder("e.g. 7.0").fill("7.5");
    await page.getByRole("button", { name: "Add a course" }).click();
    await page.locator("select[name=course_subject]").selectOption("calculus");
    await page.locator("select[name=course_level]").selectOption("ap");
    await page.getByLabel("Course 1 grade (%)").fill("94");
    const majors = page.locator("#intended_majors");
    await majors.fill("Computer Science");
    await majors.press("Enter");
    await expect(page.locator("input[type=hidden][name=intended_majors]")).toHaveValue("Computer Science");
    await page.getByLabel("At most").fill("60000");
    for (const focus of ["work_experience", "academic_community", "social_life"]) {
      await page.locator(`input[type=checkbox][value=${focus}]`).check();
    }
    await page.locator("input[type=radio][value=factor]").check();
    await page.getByRole("button", { name: "Save profile & see recommendations" }).click();
    await expect(page).toHaveURL(/\/recommendations/);
    await expect(page.getByRole("heading", { name: "Your recommendations" })).toBeVisible();
    await expectNoBrokenValues(page);
  });

  await test.step("recommendations: country filter and a sort that applies inside the groups", async () => {
    await page.goto("/recommendations?country=Canada&sort=tuition-asc");
    const titles = page.locator("[data-slot=card-title]");
    await expect(titles.first()).toBeVisible();
    // Cheapest first, even inside "Not enough data" (a bug this test guards).
    const first = page.locator("[data-slot=card]").filter({ has: titles }).first();
    const second = page.locator("[data-slot=card]").filter({ has: titles }).nth(1);
    const fee = async (card: typeof first) => Number(((await card.innerText()).match(/≈ \$([\d,]+)\/yr/)?.[1] ?? "").replace(/,/g, ""));
    expect(await fee(first)).toBeLessThanOrEqual(await fee(second));
    await expectNoBrokenValues(page);
  });

  await test.step("save two schools", async () => {
    const save = page.getByRole("button", { name: "Save university" });
    const before = await save.count();
    await save.first().click();
    await expect(save).toHaveCount(before - 1);
    await save.first().click();
    await expect(save).toHaveCount(before - 2);
    await page.goto("/saved");
    await expect(page.locator("[data-slot=card-title]")).toHaveCount(2);
  });

  await test.step("compare them, with the co-op row", async () => {
    // Each card's "Compare" tick (labels, unlike the "Compare" nav link).
    const ticks = page.locator("label").filter({ hasText: /^Compare$/ });
    await ticks.nth(0).click();
    await ticks.nth(1).click();
    await page.locator('a[href^="/compare?ids="]').click();
    await expect(page.getByRole("rowheader", { name: "Co-op / internship program" }).or(page.getByText("Co-op / internship program").first())).toBeVisible();
    await expectNoBrokenValues(page);
  });

  await test.step("track an application, mark it admitted and rank the offer", async () => {
    await page.goto("/saved");
    await page.getByRole("button", { name: "+ Track application" }).first().click();
    await page.goto("/applications");
    const card = page.locator("form").filter({ has: page.locator("select[name=status]") }).first();
    await card.locator("select[name=status]").selectOption("admitted");
    await card.getByRole("button", { name: "Save" }).click();
    await expect(card.getByText("Saved")).toBeVisible();
    await page.goto("/offers");
    await expect(page.getByText("Best overall")).toBeVisible();
    await expectNoBrokenValues(page);
  });

  await test.step("delete the account; the login no longer works", async () => {
    await page.goto("/profile");
    await page.getByRole("button", { name: "Delete my account…" }).click();
    await page.getByLabel("Type DELETE to confirm").fill("DELETE");
    await page.getByRole("button", { name: "Permanently delete everything" }).click();
    await expect(page).toHaveURL(/\/account-deleted/);
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText(/invalid login credentials/i)).toBeVisible();
  });

  expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
});
