import { defineConfig, devices } from "@playwright/test";

// The logged-in happy path (e2e/logged-in.spec.ts): sign up, fill the
// profile, browse recommendations, save, compare, track an application,
// rank the offer, delete the account. It runs against the local Supabase
// stand-in (scripts/local-supabase/server.mjs: real Postgres with every
// migration, seed and row level security, in memory) and the app in dev
// mode, on their own ports, so nothing touches the real database.
//
//   npm run test:e2e:local
//
// Dev mode, not the e2e build: that build caches the shared list from
// data/fixtures, whose ids differ from the seeded local database.

const PORT = 3201;
const LOCAL_SUPABASE_PORT = 54331;

export default defineConfig({
  testDir: "e2e",
  testMatch: "logged-in.spec.ts",
  // Dev mode compiles each page on first visit.
  timeout: 240_000,
  expect: { timeout: 30_000 },
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", navigationTimeout: 120_000 },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node scripts/local-supabase/server.mjs",
      url: `http://127.0.0.1:${LOCAL_SUPABASE_PORT}/rest/v1/country_info?limit=1`,
      env: { LOCAL_SUPABASE_PORT: String(LOCAL_SUPABASE_PORT) },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npx next dev -p ${PORT}`,
      url: `http://localhost:${PORT}/privacy`,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${LOCAL_SUPABASE_PORT}`,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-anon-key",
        SITE_URL: `http://localhost:${PORT}`,
        NEXT_DIST_DIR: ".next-local-e2e",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
