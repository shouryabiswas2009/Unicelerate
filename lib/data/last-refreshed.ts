import { unstable_cache } from "next/cache";
import { anonClient } from "@/lib/data/universities";

// The day the shared university data was last refreshed (the newest
// fetched_at), for the footer. One tiny cached query, refreshed daily or
// when an import calls revalidateTag("universities"); null if the database
// can't be reached, and the footer then leaves the line out.
export const getLastRefreshed = unstable_cache(
  async (): Promise<string | null> => {
    try {
      const { data, error } = await anonClient()
        .from("universities")
        .select("fetched_at")
        .is("created_by", null)
        .order("fetched_at", { ascending: false, nullsFirst: false })
        .limit(1);
      if (error || !data?.[0]?.fetched_at) return null;
      return String(data[0].fetched_at).slice(0, 10);
    } catch {
      return null;
    }
  },
  ["last-refreshed", "v2"],
  { revalidate: 86400, tags: ["universities"] }
);

// "2026-10-14" → "14 October 2026".
export function formatDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? day
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
