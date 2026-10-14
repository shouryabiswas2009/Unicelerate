import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The end-to-end tests build into their own folder (pointed at a fake
  // database), so they never overwrite the normal build.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // /credits reads docs/CREDITS.md at request time; include it in the
  // deployment (it isn't imported, so Next.js wouldn't find it on its own).
  outputFileTracingIncludes: {
    "/credits": ["./docs/CREDITS.md"],
  },
  images: {
    // Only the exact photos the site uses (credited in docs/CREDITS.md), so
    // the image optimizer can't be used to fetch anything else from the host.
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com", pathname: "/20/cambridge.JPG", search: "" },
    ],
  },
};

export default nextConfig;
