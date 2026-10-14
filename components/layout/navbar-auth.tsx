"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/components/layout/logout-button";
import { MemberMenu } from "@/components/layout/member-menu";
import { useSignedIn } from "@/components/layout/use-signed-in";

// The parts of the navbar that depend on being logged in. Public pages are
// cached and shared by everyone, so the server can't know who's looking:
// it renders the visitor version ("Log in" only), and the member links are
// added in the browser when a login cookie is there. Nothing for members
// is in a visitor's HTML, so screen readers, keyboards and crawlers never
// meet a "Log out" button they can't use. Members-only pages still check
// the session on the server; this only picks which links to show.

export const NAV_LINKS = [
  { href: "/recommendations", label: "Recommendations" },
  { href: "/universities", label: "Browse" },
  { href: "/compare", label: "Compare" },
  { href: "/saved", label: "Saved" },
  { href: "/applications", label: "Applications" },
  { href: "/offers", label: "Offers" },
];

export function MemberNavLinks() {
  if (!useSignedIn()) return null;
  // Six links only fit on wide screens; below `lg` they're in the menu.
  return (
    <nav aria-label="Main" className="hidden items-center gap-5 text-sm font-medium text-muted-foreground lg:flex">
      {NAV_LINKS.map((link) => (
        <Link key={link.href} href={link.href} className="transition-colors hover:text-foreground">
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

export function NavbarAccount() {
  const signedIn = useSignedIn();
  if (!signedIn) {
    // Visitors: just "Log in". Signing up starts from the landing page or
    // the prompts on browse and university pages. The <head> script hides
    // it at once for members (html[data-auth="in"]), so they don't see it
    // flash before this switches over.
    return (
      <div className="guest-only">
        <Button variant="outline" asChild>
          <Link href="/login">Log in</Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" asChild className="hidden lg:inline-flex">
        <Link href="/profile">Profile</Link>
      </Button>
      <MemberMenu />
      <LogoutButton />
    </div>
  );
}
