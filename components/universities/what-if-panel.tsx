"use client";

import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChanceBadge } from "@/components/universities/chance-badge";
import { MatchScoreBadge } from "@/components/universities/match-score-badge";
import {
  WHAT_IF_RANGES,
  compareWhatIf,
  signed,
  snapToStep,
  valuesFromProfile,
  type WhatIfKey,
  type WhatIfValues,
} from "@/lib/what-if";
import { FOCUS_LABELS } from "@/lib/focus";
import type { Profile, UniversitySummary } from "@/lib/types";
import { useTweenedNumber } from "@/components/motion/use-tweened-number";

// "What if?" sliders on the details page. Everything runs in the browser
// with the same pure scoring functions as the server (lib/what-if.ts), so
// the numbers update instantly and nothing is saved to the profile.
export function WhatIfPanel({ profile, university }: { profile: Profile; university: UniversitySummary }) {
  const saved = useMemo(() => valuesFromProfile(profile), [profile]);
  const [values, setValues] = useState<WhatIfValues>(saved);
  const result = useMemo(() => compareWhatIf(profile, university, values), [profile, university, values]);

  const set = (key: WhatIfKey, value: number | null) =>
    setValues((current) => ({ ...current, [key]: value === null ? null : snapToStep(key, value) }));

  const percent = (p: number | null) => (p === null ? null : Math.round(p * 100));
  // The headline numbers glide to their new values while a slider moves.
  const shownScore = Math.round(useTweenedNumber(result.whatIf.score));
  const shownPercent = Math.round(useTweenedNumber((result.whatIf.probability ?? 0) * 100));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-medium">What if?</h3>
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Demo estimate</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setValues(saved)}
          disabled={!result.changed}
        >
          <RotateCcw className="size-3.5" aria-hidden /> Reset to my profile
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {(Object.keys(WHAT_IF_RANGES) as WhatIfKey[]).map((key) => {
          const range = WHAT_IF_RANGES[key];
          const value = values[key];
          const id = `what-if-${key}`;
          return (
            <div key={key} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <label htmlFor={id} className="text-muted-foreground">
                  {range.label}
                </label>
                <span className="font-medium tabular-nums">{value === null ? "Not taken" : value}</span>
              </div>
              {value === null ? (
                // SAT and IELTS can be missing; offer to try a score instead of
                // pretending the student has one.
                <Button type="button" variant="outline" size="sm" onClick={() => set(key, range.tryValue)}>
                  Try a score
                </Button>
              ) : (
                <>
                  <input
                    id={id}
                    type="range"
                    min={range.min}
                    max={range.max}
                    step={range.step}
                    value={value}
                    onChange={(e) => set(key, Number(e.target.value))}
                    className="w-full accent-primary"
                  />
                  {key !== "gpa_percentage" && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline"
                      onClick={() => set(key, null)}
                    >
                      Without {range.label}
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* What if campus life counted? Same rule as ticking the focus on the profile. */}
      <fieldset className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <legend className="sr-only">Campus-life focuses</legend>
        {(["academic_community", "social_life"] as const).map((focus) => (
          <label key={focus} className="flex min-h-11 cursor-pointer items-center gap-2 sm:min-h-9">
            <input
              type="checkbox"
              checked={values[focus] ?? false}
              onChange={(e) => setValues((current) => ({ ...current, [focus]: e.target.checked }))}
              className="size-4 accent-primary"
            />
            Count {FOCUS_LABELS[focus].toLowerCase()}
          </label>
        ))}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2" aria-live="polite">
        <div className="border-t pt-3">
          <p className="text-xs text-muted-foreground">Match score</p>
          <div className="mt-1 flex items-center gap-2">
            <MatchScoreBadge score={shownScore} />
            {result.changed && (
              <span className="text-sm text-muted-foreground">
                {signed(result.scoreChange)} vs. your profile ({result.actual.score})
              </span>
            )}
          </div>
        </div>
        <div className="border-t pt-3">
          <p className="text-xs text-muted-foreground">Admission estimate</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <ChanceBadge
              chance={result.whatIf.chance}
              source={result.whatIf.chanceSource}
              probability={result.whatIf.probability ?? undefined}
            />
            {result.whatIf.probability !== null ? (
              <span className="text-sm">
                ~{shownPercent}%
                {result.changed && result.probabilityChange !== null && (
                  <span className="text-muted-foreground">
                    {" "}
                    ({signed(result.probabilityChange)} points vs. ~{percent(result.actual.probability)}%)
                  </span>
                )}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">No percentage for this school</span>
            )}
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Demo estimate: the same scoring as above, re-run with these numbers. The
        admission percentage comes from a model trained on simulated applicants,
        so treat it as a rough illustration, not a prediction. Your saved profile
        doesn&apos;t change.
      </p>
    </div>
  );
}
