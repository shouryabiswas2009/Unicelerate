import { readFileSync } from "node:fs";
import { join } from "node:path";
import { marked } from "marked";

// The /credits page shows docs/CREDITS.md itself, so the file in the repo
// and the page can never disagree. next.config.ts makes sure the file is
// included in the deployment (outputFileTracingIncludes).
//
// The markdown is our own file (not user input), so rendering its HTML is
// safe; links to other sites open in a new tab.
export function creditsHtml(): { title: string; html: string } {
  const markdown = readFileSync(join(process.cwd(), "docs", "CREDITS.md"), "utf8");
  // The first "# Heading" becomes the page title; the rest is the body.
  const [, title = "Credits and citations", body = markdown] = markdown.match(/^# (.+)\n([\s\S]*)$/) ?? [];
  const html = (marked.parse(body, { async: false }) as string).replace(
    /<a href="(https?:\/\/[^"]+)"/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer"'
  );
  return { title, html };
}
