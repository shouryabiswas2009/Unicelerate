import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { BRAND_NAME } from "@/lib/brand";
import { FeedbackLink } from "@/components/layout/feedback-link";
import { formatDay, getLastRefreshed } from "@/lib/data/last-refreshed";

// Columns of links: public pages only, so a visitor never lands on a login
// screen they didn't ask for. No contact details or social links that
// don't exist.
const COLUMNS: { title: string; links: { href: string; label: string; external?: boolean }[] }[] = [
  {
    title: "Explore",
    links: [
      { href: "/universities", label: "Browse universities" },
      { href: "/#real-data", label: "Where the data comes from" },
    ],
  },
  {
    title: "About",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/credits", label: "Credits" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/login", label: "Log in" },
      { href: "/signup", label: "Sign up" },
    ],
  },
];

export async function Footer() {
  const refreshed = await getLastRefreshed();
  return (
    <footer className="bg-footer text-footer-foreground">
      <div className="page-container grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="space-y-3">
          <Link href="/" aria-label={`${BRAND_NAME} home`} className="inline-flex rounded-md">
            <Logo size={28} />
          </Link>
          <p className="max-w-xs text-sm text-footer-muted">
            Find the university that fits you, not just the ranking. Free to use, built on sourced data.
          </p>
        </div>
        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <h2 className="mb-3 text-sm font-semibold">{column.title}</h2>
            <ul className="space-y-2 text-sm">
              {column.links.map((link) => (
                <li key={link.href}>
                  {link.external ? (
                    <a href={link.href} target="_blank" rel="noopener noreferrer" className="text-footer-muted hover:text-footer-foreground hover:underline">
                      {link.label}
                    </a>
                  ) : (
                    <Link href={link.href} className="text-footer-muted hover:text-footer-foreground hover:underline">
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
              {column.title === "About" && (
                <li>
                  <FeedbackLink className="text-footer-muted hover:text-footer-foreground hover:underline" />
                </li>
              )}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-footer-muted/20">
        <p className="page-container py-5 text-xs text-footer-muted">
          &copy; {new Date().getFullYear()} {BRAND_NAME}. Figures are guidance only: always check the official source before you decide.
          {refreshed && <> University data last refreshed {formatDay(refreshed)}.</>}
        </p>
      </div>
    </footer>
  );
}
