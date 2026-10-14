// The test student for logged-in checks against the local Supabase stand-in
// (npm run dev:local, scripts/local-supabase/server.mjs). These values only
// work on that in-memory server on 127.0.0.1, which forgets every account
// when it stops; they are not, and must never become, a real account.
export const LOCAL_TEST_ACCOUNT = {
  email: "student@unicelerate.test",
  password: "local-only-Kq7v-practice",
};
