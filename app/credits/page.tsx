import type { Metadata } from "next";
import { creditsHtml } from "@/lib/credits";

export const metadata: Metadata = {
  title: "Credits",
  description: "Who provided the data and images on this site, with links and the licence or terms that apply.",
};

export default function CreditsPage() {
  const { title, html } = creditsHtml();
  return (
    <article className="page-container max-w-3xl py-12 sm:py-16">
      <p className="eyebrow">Credits</p>
      <h1 className="mt-3 text-section font-bold">{title}</h1>
      {/* Rendered from docs/CREDITS.md (lib/credits.ts). */}
      <div className="markdown mt-6" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
