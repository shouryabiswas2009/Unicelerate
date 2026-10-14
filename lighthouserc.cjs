// Lighthouse CI (free): a performance guard on the landing page and
// /universities, run against the end-to-end build (fake database, real
// shared list). Budgets come from docs/PERFORMANCE.md; on first rollout
// they only WARN, so a slow CI machine can't block a release.
//
//   npm run test:lighthouse   (after npm run test:e2e:build)
module.exports = {
  ci: {
    collect: {
      url: ["http://localhost:3100/", "http://localhost:3100/universities"],
      numberOfRuns: 3,
      startServerCommand: "node scripts/e2e/serve.mjs",
      startServerReadyPattern: "ready on",
    },
    assert: {
      assertions: {
        // docs/PERFORMANCE.md (Redesign, 2026-10-08): TBT 87–214 ms on /,
        // 141–381 ms on /universities; layout shift 0; 345 / 442 KB.
        "total-blocking-time": ["warn", { maxNumericValue: 400 }],
        "cumulative-layout-shift": ["warn", { maxNumericValue: 0.1 }],
        "largest-contentful-paint": ["warn", { maxNumericValue: 4000 }],
        "total-byte-weight": ["warn", { maxNumericValue: 600000 }],
        "categories:accessibility": ["warn", { minScore: 0.95 }],
        "categories:performance": ["warn", { minScore: 0.7 }],
      },
    },
    upload: { target: "filesystem", outputDir: ".lighthouseci" },
  },
};
