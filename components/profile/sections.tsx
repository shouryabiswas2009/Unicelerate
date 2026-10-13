"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/field-error";
import { TagInput } from "@/components/tag-input";
import { GradesField } from "@/components/profile/grades-field";
import { VisaFields } from "@/components/profile/visa-fields";
import { CoursesEditor } from "@/components/profile/courses-editor";
import { SectionForm, type FieldState } from "@/components/profile/section-form";
import { COUNTRY_OPTIONS } from "@/lib/countries";
import { APPROX_NOTE, DEFAULT_DISPLAY_CURRENCY, DISPLAY_CURRENCIES, approxInCurrency, currencyName } from "@/lib/display-currency";
import { BALANCED_DESCRIPTION, FOCUS_DESCRIPTIONS, FOCUS_LABELS, focusesOf } from "@/lib/focus";
import { usd } from "@/lib/format";
import { ACADEMIC_PREFS, ACADEMIC_PREF_LABELS, SOCIAL_PREFS, SOCIAL_PREF_LABELS } from "@/lib/campus-life-config";
import { QUIZ_MAJORS } from "@/lib/quiz-options";
import { DEGREE_LEVELS, FOCUSES, type Profile } from "@/lib/types";

// The fields of each profile section (the page lays them out:
// app/(dashboard)/profile/page.tsx). Each section saves on its own
// (components/profile/section-form.tsx). Plain native inputs and selects
// keep the page light and fully keyboard-usable.

type P = Partial<Profile> | null;
const control = "h-11";
const selectClass =
  "h-11 w-full rounded-md border bg-background px-3 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";
const MAJOR_SUGGESTIONS = [...new Set([...QUIZ_MAJORS, "Arts", "Medicine", "Law", "Nursing", "Political Science", "Statistics"])];

// After a failed save, the value the student typed; otherwise the saved one.
function valueOf(state: FieldState, profile: P, name: keyof Profile): string | undefined {
  const typed = state.values?.[name];
  if (typed !== undefined) return typed;
  const saved = profile?.[name];
  return saved === null || saved === undefined ? undefined : String(saved);
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {hint && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>}
      {children}
      <FieldError message={error} />
    </div>
  );
}

export function AboutSection({ profile }: { profile: P }) {
  return (
    <SectionForm section="about" label="about you">
      {(state) => (
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="full_name" label="Full name" error={state.errors.full_name}>
            <Input id="full_name" name="full_name" autoComplete="name" defaultValue={valueOf(state, profile, "full_name")} aria-invalid={!!state.errors.full_name} className={control} />
          </Field>
          <Field id="country" label="Home country" hint="Where you live now. Used for visa guidance and to show money in context." error={state.errors.country}>
            <Input id="country" name="country" list="country-options" autoComplete="country-name" defaultValue={valueOf(state, profile, "country")} placeholder="e.g. India" aria-describedby="country-hint" aria-invalid={!!state.errors.country} className={control} />
            <datalist id="country-options">
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
        </div>
      )}
    </SectionForm>
  );
}

export function AcademicsSection({ profile }: { profile: P }) {
  return (
    <SectionForm section="academics" label="academics">
      {(state) => (
        <div className="grid gap-5 sm:grid-cols-2">
          <GradesField
            // A new key when the saved system changes resets the picker's state.
            key={profile?.grade_system ?? "percentage"}
            initialSystem={profile?.grade_system ?? "percentage"}
            initialInput={valueOf(state, profile, "grade_input")}
            initialPercentage={valueOf(state, profile, "gpa_percentage")}
            homeCountry={profile?.country}
            errors={state.errors}
          />
          <Field id="ielts_score" label="IELTS (optional)" hint="Not entered: we leave it out, not count it as zero." error={state.errors.ielts_score}>
            <Input id="ielts_score" name="ielts_score" type="number" step="0.5" min={0} max={9} defaultValue={valueOf(state, profile, "ielts_score")} placeholder="e.g. 7.0" aria-describedby="ielts_score-hint" aria-invalid={!!state.errors.ielts_score} className={control} />
          </Field>
          <Field id="sat_score" label="SAT (optional)" hint="Used for admission estimates at US schools. Not entered: left out, not zero." error={state.errors.sat_score}>
            <Input id="sat_score" name="sat_score" type="number" step="10" min={400} max={1600} defaultValue={valueOf(state, profile, "sat_score")} placeholder="e.g. 1350" aria-describedby="sat_score-hint" aria-invalid={!!state.errors.sat_score} className={control} />
          </Field>
          <CoursesEditor initial={profile?.courses ?? []} overall={profile?.gpa_percentage ?? null} majors={profile?.intended_majors ?? []} />
        </div>
      )}
    </SectionForm>
  );
}

export function StudySection({ profile }: { profile: P }) {
  return (
    <SectionForm section="study" label="what you want to study">
      {(state) => (
        <div className="grid gap-5">
          <Field id="intended_majors" label="Intended majors" hint="Type and press Enter; pick from the suggestions or write your own." error={state.errors.intended_majors}>
            <TagInput id="intended_majors" name="intended_majors" defaultValues={profile?.intended_majors} suggestions={MAJOR_SUGGESTIONS} placeholder="e.g. Computer Science" />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="preferred_degree_level" label="Degree level" error={state.errors.preferred_degree_level}>
              <select id="preferred_degree_level" name="preferred_degree_level" defaultValue={valueOf(state, profile, "preferred_degree_level") ?? "Undergraduate"} className={selectClass}>
                {DEGREE_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="preferred_countries" label="Countries you'd like to study in" error={state.errors.preferred_countries}>
              <TagInput id="preferred_countries" name="preferred_countries" defaultValues={profile?.preferred_countries} suggestions={COUNTRY_OPTIONS} placeholder="e.g. Canada" />
            </Field>
          </div>
        </div>
      )}
    </SectionForm>
  );
}

const BUDGET_MAX = 150000;
const BUDGET_STEP = 1000;

export function MoneySection({ profile }: { profile: P }) {
  return (
    <SectionForm section="money" label="budget">
      {(state) => <BudgetFields state={state} profile={profile} />}
    </SectionForm>
  );
}

// Budget as a range (two sliders with number boxes beside them) plus the
// display currency, showing the range in US dollars and that currency.
function BudgetFields({ state, profile }: { state: FieldState; profile: P }) {
  const [min, setMin] = useState(Number(valueOf(state, profile, "budget_min") ?? 0) || 0);
  const [max, setMax] = useState(Number(valueOf(state, profile, "budget_max") ?? 40000) || 40000);
  const [currency, setCurrency] = useState(profile?.display_currency ?? DEFAULT_DISPLAY_CURRENCY);
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const inCurrency = [approxInCurrency(lo, currency), approxInCurrency(hi, currency)];
  const error = state.errors.budget_min ?? state.errors.budget_max;
  return (
    <div className="space-y-5">
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Yearly budget, tuition and living (US dollars)</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="budget_min">At least</Label>
            <input aria-label="Minimum budget slider" type="range" min={0} max={BUDGET_MAX} step={BUDGET_STEP} value={Math.min(lo, BUDGET_MAX)} onChange={(e) => setMin(Number(e.target.value))} className="h-11 w-full accent-primary" />
            <Input id="budget_min" name="budget_min" type="number" min={0} step={100} value={min} onChange={(e) => setMin(Number(e.target.value))} aria-invalid={!!state.errors.budget_min} className={control} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="budget_max">At most</Label>
            <input aria-label="Maximum budget slider" type="range" min={0} max={BUDGET_MAX} step={BUDGET_STEP} value={Math.min(hi, BUDGET_MAX)} onChange={(e) => setMax(Number(e.target.value))} className="h-11 w-full accent-primary" />
            <Input id="budget_max" name="budget_max" type="number" min={0} step={100} value={max} onChange={(e) => setMax(Number(e.target.value))} aria-invalid={!!state.errors.budget_max} className={control} />
          </div>
        </div>
        <FieldError message={error} />
        <p className="text-sm" aria-live="polite">
          {usd(lo)} – {usd(hi)} a year
          {inCurrency[0] && inCurrency[1] && (
            <span className="text-muted-foreground">
              {" "}({inCurrency[0]} – {inCurrency[1].replace(/^≈ /, "")}, {APPROX_NOTE})
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          Schools are compared with their full tuition: the US &ldquo;net price&rdquo; after federal aid isn&apos;t used,
          because international students usually can&apos;t get that aid.
        </p>
      </fieldset>
      <Field id="display_currency" label="Also show amounts in" hint="Everything stays in US dollars; this adds an approximate amount next to it." error={state.errors.display_currency}>
        <select id="display_currency" name="display_currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className={selectClass} aria-describedby="display_currency-hint">
          {DISPLAY_CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {code === "USD" ? "US dollars only" : currencyName(code)}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

// Optional follow-ups under a campus-life focus. They only re-weight its
// proxies (lib/campus-life-config.ts); nothing ticked = "Not sure".
function CampusFollowUp({ name, legend, options, saved, note }: { name: string; legend: string; options: [string, string][]; saved: string[]; note?: string }) {
  return (
    <fieldset className="mb-3 ml-7 space-y-2">
      <legend className="text-xs font-medium text-muted-foreground">{legend}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {options.map(([value, label]) => (
          <label key={value} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm sm:min-h-9">
            <input type="checkbox" name={name} value={value} defaultChecked={saved.includes(value)} className="size-4 accent-primary" />
            {label}
          </label>
        ))}
      </div>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </fieldset>
  );
}

export function PrioritiesSection({ profile }: { profile: P }) {
  return (
    <SectionForm section="priorities" label="priorities">
      {(state) => {
        // Checkboxes start from the saved choice (a failed save keeps it too).
        const ticked = profile ? focusesOf(profile as Profile) : [];
        return (
          <div className="space-y-8">
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">What matters most to you? (tick any)</legend>
              <p className="text-sm text-muted-foreground">
                Changes how universities are scored and where the offer sliders start. {BALANCED_DESCRIPTION}
              </p>
              <ul className="divide-y border-y">
                {FOCUSES.map((focus) => (
                  <li key={focus}>
                    <label className="flex min-h-11 cursor-pointer items-start gap-3 py-3">
                      <input type="checkbox" name="focuses" value={focus} defaultChecked={ticked.includes(focus)} className="mt-1 size-4 accent-primary" />
                      <span className="space-y-0.5">
                        <span className="block text-sm font-medium">{FOCUS_LABELS[focus]}</span>
                        <span className="block text-xs text-muted-foreground">{FOCUS_DESCRIPTIONS[focus]}</span>
                      </span>
                    </label>
                    {focus === "academic_community" && (
                      <CampusFollowUp
                        name="campus_academic_prefs"
                        legend="What kind? (optional)"
                        options={ACADEMIC_PREFS.map((p) => [p, ACADEMIC_PREF_LABELS[p]])}
                        saved={profile?.campus_academic_prefs ?? []}
                      />
                    )}
                    {focus === "social_life" && (
                      <CampusFollowUp
                        name="campus_social_prefs"
                        legend="What kind? (optional)"
                        options={SOCIAL_PREFS.map((p) => [p, SOCIAL_PREF_LABELS[p]])}
                        saved={profile?.campus_social_prefs ?? []}
                        note="Greek life can't change a score: no official source lists fraternities and sororities. Published social-life figures are thinner than academic ones, so many schools show limited data."
                      />
                    )}
                  </li>
                ))}
              </ul>
              <FieldError message={state.errors.focuses} />
            </fieldset>
            <VisaFields profile={profile as Profile | null} errors={state.errors} />
          </div>
        );
      }}
    </SectionForm>
  );
}
