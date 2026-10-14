// Runs the app on http://localhost:3200 against the local Supabase stand-in
// (scripts/local-supabase/server.mjs), for testing logged-in pages without
// the real database. Environment variables set here take precedence over
// .env.local, so the app talks only to 127.0.0.1:54321.
//
//   npm run dev:local
import { spawn } from "node:child_process";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
export const LOCAL_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-anon-key",
  SITE_URL: "http://localhost:3200",
  NEXT_DIST_DIR: ".next-local",
  NEXT_TELEMETRY_DISABLED: "1",
};

const children = [
  spawn(process.execPath, [join(ROOT, "scripts", "local-supabase", "server.mjs")], { stdio: "inherit" }),
  spawn("npx", ["next", "dev", "-p", "3200"], {
    cwd: ROOT,
    env: { ...process.env, ...LOCAL_ENV },
    stdio: "inherit",
    shell: process.platform === "win32",
  }),
];
const stop = () => children.forEach((c) => c.kill());
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.on("exit", stop);
