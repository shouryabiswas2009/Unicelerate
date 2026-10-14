// Builds the site for the end-to-end tests into .next-e2e, pointed at the
// fake database (scripts/e2e/fake-supabase.mjs), which runs during the build
// so pages built ahead of time get real data. The normal .next is untouched.
import { spawn } from "node:child_process";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-anon-key",
  SITE_URL: "http://localhost:3100",
  NEXT_DIST_DIR: ".next-e2e",
  NEXT_TELEMETRY_DISABLED: "1",
};

const fake = spawn(process.execPath, [join(ROOT, "scripts", "e2e", "fake-supabase.mjs")], { stdio: "inherit" });
const build = spawn("npx", ["next", "build"], { cwd: ROOT, env, stdio: "inherit", shell: process.platform === "win32" });
build.on("exit", (code) => {
  fake.kill();
  process.exit(code ?? 1);
});
