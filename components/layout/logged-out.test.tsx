import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Navbar } from "@/components/layout/navbar";
import { NAV_LINKS } from "@/components/layout/navbar-auth";
import { PersonalFit, PersonalSave } from "@/components/universities/personal-island";
import { ReportFigure } from "@/components/universities/report-figure";
import type { UniversitySummary } from "@/lib/types";

// What a logged-out visitor's HTML contains. Public pages are cached and
// rendered on the server without cookies, so this is exactly the HTML every
// visitor (and every screen reader, keyboard and crawler) gets.

describe("a logged-out visitor's HTML", () => {
  it("has the header's Log in, and no Log out or members' links", () => {
    const html = renderToStaticMarkup(<Navbar />);
    expect(html).toContain('href="/login"');
    expect(html).not.toMatch(/Log out/);
    for (const link of [...NAV_LINKS, { href: "/profile" }]) {
      expect(html, link.href).not.toContain(`href="${link.href}"`);
    }
  });

  it("has only the visitor's version of a university page's personal parts", () => {
    const university = { id: "u1", name: "Example U" } as UniversitySummary;
    const html = renderToStaticMarkup(
      <>
        <PersonalSave id="u1" />
        <PersonalFit university={university} />
        <ReportFigure universityId="u1" />
      </>
    );
    expect(html).toContain("Log in to save");
    expect(html).toContain("Create free account");
    expect(html).toContain("Log in to report it");
    expect(html).not.toMatch(/Log out|Report a wrong figure|href="\/profile"|Fill in your profile/);
  });
});
