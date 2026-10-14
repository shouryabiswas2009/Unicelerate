// Runs the fake database and the end-to-end build together (for Lighthouse
// CI, which wants one start command). Prints "ready on" once both are up.
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
const children = [
  spawn(process.execPath, [join(ROOT, "scripts", "e2e", "fake-supabase.mjs")], { stdio: "inherit" }),
  spawn("npx", ["next", "start", "-p", "3100"], { cwd: ROOT, env, stdio: ["ignore", "pipe", "inherit"], shell: process.platform === "win32" }),
];
children[1].stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  if (/Ready in|started server/i.test(String(chunk))) console.log("ready on http://localhost:3100");
});
const stop = () => children.forEach((c) => c.kill());
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.on("exit", stop);
