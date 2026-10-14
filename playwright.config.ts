import { defineConfig, devices } from "@playwright/test";

// Smoke and accessibility tests for the public pages (e2e/), run against a
// production build (`next start`) whose database is a small fake that
// serves the real shared list from data/fixtures (scripts/e2e/fake-supabase.mjs).
// Nothing logs in and nothing is written.
//
//   npm run test:e2e        (builds into .next-e2e first)

const PORT = 3100;
const FAKE_SUPABASE = "http://127.0.0.1:54321";

export const E2E_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: FAKE_SUPABASE,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-anon-key",
  SITE_URL: `http://localhost:${PORT}`,
  NEXT_DIST_DIR: ".next-e2e",
  NEXT_TELEMETRY_DISABLED: "1",
};

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node scripts/e2e/fake-supabase.mjs",
      url: `${FAKE_SUPABASE}/rest/v1/country_info`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npx next start -p ${PORT}`,
      url: `http://localhost:${PORT}/privacy`,
      env: E2E_ENV,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
