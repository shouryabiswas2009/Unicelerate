import type { Metadata } from "next";
import Link from "next/link";
import { FeedbackForm } from "@/components/feedback/feedback-form";
import { feedbackPage } from "@/lib/feedback";

export const metadata: Metadata = {
  title: "Send feedback",
  description: "Tell us about a bug, a figure that looks wrong, or something missing.",
};

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  // The page the student came from ("Send feedback" links add ?from=).
  const from = feedbackPage((await searchParams).from);
  return (
    <article className="page-container max-w-2xl py-12 sm:py-16">
      <p className="eyebrow">Feedback</p>
      <h1 className="mt-3 text-section font-bold">Send feedback</h1>
      <p className="mt-3 leading-relaxed text-muted-foreground">
        Found a bug, a figure that looks wrong, or something missing? Every message is read by hand. You
        don&apos;t need an account. What&apos;s stored and who sees it is on the{" "}
        <Link href="/privacy" className="underline">
          privacy page
        </Link>
        .
      </p>
      <div className="mt-8">
        <FeedbackForm page={from} />
      </div>
    </article>
  );
}
