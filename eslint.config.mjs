import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Generated images (ImageResponse) can only use a plain <img>; next/image
  // doesn't exist there.
  {
    files: ["app/**/opengraph-image.tsx", "app/**/icon.tsx", "app/**/apple-icon.tsx"],
    rules: { "@next/next/no-img-element": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The Python virtual environment ships third-party JS files.
    "ml/.venv/**",
  ]),
]);

export default eslintConfig;
