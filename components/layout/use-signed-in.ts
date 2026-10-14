"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { hasAuthCookie } from "@/lib/auth-cookie";

// Whether this browser has a login cookie: false on the server and during
// hydration (public pages are cached for everyone, so the server renders
// the visitor version), the cookie's answer after. Re-read on every
// navigation, since logging in or out changes the page. Only decides what
// to show; members-only pages and actions still check the session on the
// server.
const noSubscribe = () => () => {};

export function useSignedIn(): boolean {
  usePathname();
  return useSyncExternalStore(noSubscribe, () => hasAuthCookie(document.cookie), () => false);
}
