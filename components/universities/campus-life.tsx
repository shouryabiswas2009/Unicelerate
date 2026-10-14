import { cn } from "@/lib/utils";
import {
  CAMPUS_DISCLAIMER,
  CAMPUS_KIND_LABELS,
  academicCommunityScore,
  proxyLines,
  socialFunScore,
  type CampusKind,
} from "@/lib/campus-life";
import type { UniversitySummary } from "@/lib/types";

// The two campus-life rows, "Academic & career community" and "Campus
// social life", side by side and never blended: the published proxies
// themselves with a confidence label, not a score. A row is hidden when
// nothing is known, unless the student ticked that focus (then it says
// "data not available", so a low-data school doesn't just look dull).

const KINDS: CampusKind[] = ["academic", "social"];

function confidenceOf(kind: CampusKind, university: UniversitySummary) {
  return (kind === "academic" ? academicCommunityScore(university) : socialFunScore(university)).confidence;
}

// Which campus focuses the student ticked, from their score breakdown.
export function selectedCampusKinds(factorKeys: string[]): Record<CampusKind, boolean> {
  return { academic: factorKeys.includes("campus_academic"), social: factorKeys.includes("campus_social") };
}

export function hasCampusLife(university: UniversitySummary): boolean {
  return KINDS.some((kind) => proxyLines(kind, university).length > 0);
}

// Compact, for cards: label, confidence, the first two proxies.
export function CampusLifeLines({ university, selected }: { university: UniversitySummary; selected: Record<CampusKind, boolean> }) {
  const rows = KINDS.map((kind) => ({ kind, lines: proxyLines(kind, university) })).filter((r) => r.lines.length > 0 || selected[r.kind]);
  if (rows.length === 0) return null;
  return (
    <div className="space-y-1.5 text-sm">
      {rows.map(({ kind, lines }) => (
        <div key={kind} className="flex items-start justify-between gap-3">
          <span className="shrink-0 text-muted-foreground">{CAMPUS_KIND_LABELS[kind]}</span>
          <span className="text-right">
            {lines.length === 0 ? (
              <span className="text-muted-foreground">Data not available</span>
            ) : (
              <>
                <span>
                  {lines
                    .slice(0, 2)
                    .map((l) => l.text)
                    .join(" · ")}
                  {lines.length > 2 && <span className="text-muted-foreground"> +{lines.length - 2} more</span>}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {confidenceOf(kind, university) === "Low" ? "Low confidence: limited published data" : `${confidenceOf(kind, university)} confidence`}
                </span>
              </>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

// Full, for the detail page: every proxy with its source.
export function CampusLifeDetails({ university, selected, className }: { university: UniversitySummary; selected?: Record<CampusKind, boolean>; className?: string }) {
  const rows = KINDS.map((kind) => ({ kind, lines: proxyLines(kind, university) })).filter((r) => r.lines.length > 0 || selected?.[r.kind]);
  if (rows.length === 0) return null;
  return (
    <div className={cn("space-y-4", className)}>
      <div className="grid gap-6 sm:grid-cols-2">
        {rows.map(({ kind, lines }) => (
          <div key={kind} className="space-y-2">
            <h3 className="flex items-baseline justify-between gap-2 text-sm font-semibold">
              {CAMPUS_KIND_LABELS[kind]}
              <span className="text-xs font-normal text-muted-foreground">
                {lines.length === 0 ? "Not available" : `${confidenceOf(kind, university)} confidence`}
              </span>
            </h3>
            {lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">Data not available: nothing published that we could cite.</p>
            ) : (
              <ul className="divide-y border-y text-sm">
                {lines.map((l) => (
                  <li key={l.proxy} className="py-2">
                    {l.text}
                    <span className="block text-xs text-muted-foreground">
                      {l.url ? (
                        <a href={l.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
                          {l.source}
                        </a>
                      ) : (
                        l.source
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {lines.length > 0 && confidenceOf(kind, university) === "Low" && (
              <p className="text-xs text-muted-foreground">Limited published data: one proxy only, so read it lightly.</p>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {CAMPUS_DISCLAIMER}{" "}
        Coverage is uneven: US schools have official figures for setting, size, housing and
        varsity sport; outside the US most social figures aren&apos;t published, and clubs and design teams are
        hand-checked for only a few schools. Nothing official covers parties, Greek life or festivals, so those
        aren&apos;t shown.
      </p>
    </div>
  );
}
