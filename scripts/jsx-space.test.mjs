import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The build's JSX compiler drops the space in `{count} words` when the text
// after the expression runs onto another line and contains an entity
// (&ldquo; &apos; …): the live site showed "8characters" and
// "2,831universities". Writing the space as {" "} always works, so this
// test asks for it wherever an expression is followed by text that
// continues on the next line.

const ROOT = join(import.meta.dirname, "..");
const files = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith(".tsx") ? [path] : [];
  });

describe("JSX text after an expression", () => {
  it('writes the space as {" "} when the text runs onto the next line', () => {
    const problems = [];
    for (const path of [...files(join(ROOT, "app")), ...files(join(ROOT, "components"))]) {
      const lines = readFileSync(path, "utf8").split("\n");
      lines.slice(0, -1).forEach((line, i) => {
        const s = line.trimEnd();
        if (!/\}( [^<>{}"'`]*)$/.test(s) || /=>$|\{$/.test(s) || s.includes("className")) return;
        if (/^\s*(\/\/|\*|import|const|return|if|export|type)/.test(s)) return;
        const next = lines[i + 1].trim();
        if (next && !/^(<|\{|\)|\}|\/|\*|\.|\?|:|&&|\|\|)/.test(next)) problems.push(`${path.slice(ROOT.length + 1)}:${i + 1}`);
      });
    }
    expect(problems).toEqual([]);
  });
});
