"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Flag as FlagIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reportFigure } from "@/lib/actions/reports";
import { REPORT_FIELDS } from "@/lib/figure-report";
import { useSignedIn } from "@/components/layout/use-signed-in";

// "Report a wrong figure" on a shared university's page. The page is cached
// for everyone, so the HTML has the visitors' version (a link to log in) and
// the students' small form is added in the browser (useSignedIn). Reports
// are only readable by the student who sent them, and the server action
// checks the session.
export function ReportFigure({ universityId }: { universityId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(reportFigure, undefined);

  if (!useSignedIn()) {
    return (
      <p className="guest-only text-sm text-muted-foreground">
        Spotted a wrong figure?{" "}
        <Link href={`/login?next=/universities/${universityId}`} className="underline">
          Log in to report it
        </Link>
        .
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <div>
        {state?.ok ? (
          <p className="text-sm" role="status">
            Thanks, we&apos;ll check it against the source. You can see your reports on your{" "}
            <Link href="/profile" className="underline">
              profile
            </Link>
            .
          </p>
        ) : !open ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            <FlagIcon className="size-3.5" aria-hidden /> Report a wrong figure
          </Button>
        ) : (
          <form action={action} className="space-y-3 rounded-lg border p-4">
            <input type="hidden" name="university_id" value={universityId} />
            <div className="space-y-1.5">
              <Label htmlFor="report-field">Which figure?</Label>
              <select id="report-field" name="field" required className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                {Object.entries(REPORT_FIELDS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="report-current">What the page shows (optional)</Label>
                <Input id="report-current" name="current_value" maxLength={200} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="report-suggested">What it should be</Label>
                <Input id="report-suggested" name="suggested_value" maxLength={200} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-source">Where you found it (link, optional)</Label>
              <Input id="report-source" name="source_url" type="url" placeholder="https://" maxLength={500} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-note">Anything else (optional)</Label>
              <textarea id="report-note" name="note" maxLength={1000} rows={2} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
            </div>
            {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Sending…" : "Send report"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
