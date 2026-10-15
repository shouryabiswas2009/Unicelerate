"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// "Send feedback", remembering which page the visitor was on.
export function FeedbackLink({ className, children = "Send feedback" }: { className?: string; children?: React.ReactNode }) {
  const pathname = usePathname();
  const href = pathname && pathname !== "/feedback" ? `/feedback?from=${encodeURIComponent(pathname)}` : "/feedback";
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
