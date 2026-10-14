"use client";

import { createContext, useActionState, useContext, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { saveProfile, saveProfileSection, type ProfileFormState, type SectionState } from "@/lib/actions/profile";
import type { ProfileFieldErrors } from "@/lib/profile-validation";
import type { ProfileSection } from "@/lib/profile-sections";
import { fieldOf, withoutEdited } from "@/lib/form-errors";

// How the profile page saves. Normally each section is its own small form
// with a Save button and a visible status ("Saving…", "Saved ✓", "Couldn't
// save"), so a student can fix one thing without touching the rest. For a
// brand-new profile (or a preset being applied) the required fields are
// spread over several sections, so the whole page is ONE form instead:
// CombinedProfileForm provides it, and the sections render inside it.

export type FieldState = { errors: ProfileFieldErrors; values?: Record<string, string> };

const Combined = createContext<FieldState | null>(null);

// Fields edited since the last save, so their (now stale) errors hide. A new
// save result starts a fresh set.
function useEditedFields(result: unknown) {
  const [edited, setEdited] = useState<{ result: unknown; fields: Set<string> }>({ result, fields: new Set() });
  const fields = edited.result === result ? edited.fields : new Set<string>();
  const onEdit = (event: FormEvent) => {
    const field = fieldOf(event.target);
    if (field && !fields.has(field)) setEdited({ result, fields: new Set([...fields, field]) });
  };
  return { fields, onEdit };
}

export function CombinedProfileForm({ children, submitLabel }: { children: ReactNode; submitLabel: string }) {
  const [state, action, pending] = useActionState<ProfileFormState, FormData>(saveProfile, undefined);
  const { fields, onEdit } = useEditedFields(state);
  return (
    // noValidate: the server's messages are the single source of error text.
    <form action={action} noValidate onChange={onEdit}>
      <Combined.Provider value={{ errors: withoutEdited(state?.fieldErrors ?? {}, fields), values: state?.values }}>{children}</Combined.Provider>
      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t bg-background px-4 py-4 sm:mx-0 sm:px-0">
        <Button type="submit" size="lg" disabled={pending} className="min-h-11">
          {pending ? "Saving…" : submitLabel}
        </Button>
        <p aria-live="polite" className="text-sm">
          {state?.error && <span className="text-destructive">{state.error}</span>}
          {state?.notice && <span className="text-amber-700 dark:text-amber-400">{state.notice}</span>}
        </p>
      </div>
    </form>
  );
}

export function SectionForm({
  section,
  label,
  children,
}: {
  section: ProfileSection;
  label: string;
  children: (state: FieldState) => ReactNode;
}) {
  const combined = useContext(Combined);
  if (combined) return <>{children(combined)}</>;
  return <StandaloneSection section={section} label={label}>{children}</StandaloneSection>;
}

function StandaloneSection({ section, label, children }: { section: ProfileSection; label: string; children: (state: FieldState) => ReactNode }) {
  const [state, action, pending] = useActionState<SectionState, FormData>(saveProfileSection, undefined);
  const { fields, onEdit } = useEditedFields(state);
  return (
    <form action={action} noValidate onChange={onEdit} className="space-y-6">
      <input type="hidden" name="section" value={section} />
      {children({ errors: withoutEdited(state?.fieldErrors ?? {}, fields), values: state?.values })}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="outline" disabled={pending} className="min-h-11">
          {pending ? "Saving…" : `Save ${label}`}
        </Button>
        <p aria-live="polite" className="text-sm">
          {pending ? (
            <span className="text-muted-foreground">Saving…</span>
          ) : state?.ok ? (
            <span className="text-emerald-700 dark:text-emerald-400">Saved ✓</span>
          ) : state?.error ? (
            <span className="text-destructive">Couldn&apos;t save: {state.error}</span>
          ) : null}
          {state?.notice && <span className="ml-2 text-amber-700 dark:text-amber-400">{state.notice}</span>}
        </p>
      </div>
    </form>
  );
}
