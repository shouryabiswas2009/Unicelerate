import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { BRAND_NAME } from "@/lib/brand";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { MemberNavLinks, NavbarAccount } from "@/components/layout/navbar-auth";

// Rendered the same for everyone, so public pages can be cached: the server
// HTML is the visitor's version, and the member links are added in the
// browser when there's a login cookie (components/layout/navbar-auth.tsx).
// Members-only pages still check the session on the server.
export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="page-container flex h-16 items-center justify-between">
        <Link href="/" aria-label={`${BRAND_NAME} home`} className="rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
          <Logo size={26} markClassName="text-primary" />
        </Link>

        <MemberNavLinks />

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <NavbarAccount />
        </div>
      </div>
    </header>
  );
}
