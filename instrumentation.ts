import type { Instrumentation } from "next";

// Server errors, one structured line each, in Vercel's built-in runtime
// logs (Project → Logs; free, no extra service). Only what's needed to find
// the bug: the message, React's digest (the id shown on the error page),
// the route and the path. Never headers, cookies or the query string, which
// can carry personal data.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const message = err instanceof Error ? err.message : String(err);
  const digest = typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined;
  console.error(
    JSON.stringify({
      level: "error",
      source: "onRequestError",
      message,
      digest,
      method: request.method,
      path: request.path.split("?")[0],
      route: context.routePath,
      routeType: context.routeType,
    })
  );
};
