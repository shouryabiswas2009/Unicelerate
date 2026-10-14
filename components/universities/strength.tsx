"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  CONFIDENCE_TEXT,
  SIGNAL_INFO,
  STRENGTH_DISCLAIMER,
  STRENGTH_LABEL,
  describePeerGroup,
  strengthSummary,
} from "@/lib/strength-display";
import { ordinal } from "@/lib/research-impact";
import type { StrengthSignalKey } from "@/lib/strength-config";
import type { UniversitySummary } from "@/lib/types";

// The Unicelerate strength index wherever a ranking used to be: tier,
// number (a range when estimated), position in our list, confidence, and a
// "How is this calculated?" popover. The index is computed at import time
// (lib/strength.ts); this only displays it.

const TIER_STYLE: Record<string, string> = {
  A: "bg-emerald-600 text-white",
  B: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100",
  C: "bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-100",
  D: "bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100",
  E: "bg-muted text-muted-foreground",
};

export function StrengthValue({ university, className }: { university: UniversitySummary; className?: string }) {
  const s = strengthSummary(university);
  if (!s) return <span className={cn("text-muted-foreground", className)}>Not available</span>;
  return (
    <span className={cn("inline-flex flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5 text-right", className)}>
      <span className={cn("rounded px-1.5 text-xs font-semibold", TIER_STYLE[s.tier])} title={`Tier ${s.tier}`}>
        {s.tier}
      </span>
      <span className="font-medium tabular-nums">{s.value}</span>
      <span className="text-xs text-muted-foreground">
        {s.position} · {s.isEstimate ? "Estimated from similar schools" : `${s.confidence} confidence`}
      </span>
      <StrengthExplainer university={university} />
    </span>
  );
}

// A small toggle, not a library popover: it sits inside cards that are
// links, so a click must open it without following the link.
export function StrengthExplainer({ university }: { university: UniversitySummary }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-block">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="inline-flex min-h-6 items-center text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
      >
        How is this calculated?
      </button>
      {open && (
        <span
          id={id}
          role="dialog"
          onClick={(e) => {
            // Links inside still work; anything else doesn't open the card.
            if (!(e.target as HTMLElement).closest("a")) e.preventDefault();
            e.stopPropagation();
          }}
          className="absolute right-0 z-30 mt-1 block w-72 max-w-[80vw] rounded-md border bg-popover p-3 text-left text-xs text-popover-foreground shadow-md"
        >
          <StrengthBreakdown university={university} />
        </span>
      )}
    </span>
  );
}

// What went into one school's index, with sources and licences.
export function StrengthBreakdown({ university }: { university: UniversitySummary }) {
  const details = university.strength_signals;
  const s = strengthSummary(university);
  if (!details || !s) return <span className="block">Not available for this school.</span>;
  const signals = Object.entries(details.signals) as [StrengthSignalKey, { percentile: number }][];
  return (
    <span className="block space-y-2">
      <span className="block font-medium">{STRENGTH_LABEL}</span>
      <span className="block text-muted-foreground">
        {STRENGTH_DISCLAIMER}{" "}Each figure becomes a percentile among comparable schools; the index is their weighted
        average (0–100). Tier: A top 10%, B next 20%, C next 30%, D next 25%, E bottom 15% of our list.
      </span>
      {s.isEstimate ? (
        <span className="block">
          <strong>Estimated from similar schools:</strong> we have too few figures for this school, so this is the
          range of the middle half of {details.peer_count} similar schools ({describePeerGroup(details.peer_group)}).
        </span>
      ) : null}
      {signals.length > 0 && (
        <span className="block">
          <span className="block font-medium">{s.isEstimate ? "Figures we do have" : "Signals used"}</span>
          {signals.map(([key, v]) => (
            <span key={key} className="flex justify-between gap-2">
              <span>
                {SIGNAL_INFO[key].label}{" "}
                <span className="text-muted-foreground">
                  ({SIGNAL_INFO[key].source}
                  {SIGNAL_INFO[key].licence ? `, ${SIGNAL_INFO[key].licence}` : ""})
                </span>
              </span>
              <span className="shrink-0 tabular-nums">{ordinal(Math.round(v.percentile))} pct</span>
            </span>
          ))}
        </span>
      )}
      <span className="block text-muted-foreground">
        {CONFIDENCE_TEXT[s.confidence]}. Computed {details.computed_on}
        {details.openalex_fetched_on ? `; OpenAlex data from ${details.openalex_fetched_on}` : ""}.{" "}
        <Link href="/credits" className="underline">
          Sources and licences
        </Link>
      </span>
    </span>
  );
}
