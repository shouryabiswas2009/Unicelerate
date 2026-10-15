"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { sendFeedback } from "@/lib/actions/feedback";
import { FEEDBACK_MAX } from "@/lib/feedback";

// "Send feedback": a message, an optional email for a reply, and the page it
// was sent from (pre-filled from the link, editable). Works logged in or not.
export function FeedbackForm({ page }: { page: string | null }) {
  const [state, action, pending] = useActionState(sendFeedback, undefined);
  const [length, setLength] = useState(0);

  if (state?.ok) {
    return (
      <p role="status" className="rounded-lg border p-4">
        Thank you, your message has been sent. It&apos;s read by hand; if you left an email address,
        you may get a reply.
      </p>
    );
  }
  return (
    <form action={action} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="feedback-message">Your message</Label>
        <Textarea
          id="feedback-message"
          name="message"
          required
          minLength={3}
          maxLength={FEEDBACK_MAX}
          rows={6}
          onChange={(e) => setLength(e.target.value.length)}
          aria-describedby="feedback-message-hint"
        />
        <p id="feedback-message-hint" className="text-xs text-muted-foreground">
          A bug, a figure that looks wrong, something missing or confusing. {length.toLocaleString("en-US")} /{" "}
          {FEEDBACK_MAX.toLocaleString("en-US")}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="feedback-email">Email for a reply (optional)</Label>
        <Input id="feedback-email" name="email" type="email" maxLength={254} autoComplete="email" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="feedback-page">Which page is it about? (optional)</Label>
        <Input id="feedback-page" name="page" defaultValue={page ?? ""} maxLength={200} placeholder="/recommendations" />
      </div>
      {/* Only bots fill this in (see sendFeedback). */}
      <div aria-hidden="true" className="hidden">
        <label htmlFor="feedback-website">Website</label>
        <input id="feedback-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="min-h-11">
        {pending ? "Sending…" : "Send feedback"}
      </Button>
    </form>
  );
}
