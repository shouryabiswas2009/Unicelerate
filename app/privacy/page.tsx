import type { Metadata } from "next";
import Link from "next/link";
import { BRAND_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Privacy",
  description: `What ${BRAND_NAME} stores about you, who can see it, and how to delete it.`,
};

const UPDATED = "14 October 2026";

// Plain-language privacy page. Keep it in line with what the code actually
// does: if you add something that stores or shares data, update this page.
export default function PrivacyPage() {
  return (
    <article className="page-container max-w-3xl py-12 sm:py-16">
      <p className="eyebrow">Privacy</p>
      <h1 className="mt-3 text-section font-bold">Your data on {BRAND_NAME}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated {UPDATED}.</p>

      <div className="mt-8 space-y-8 leading-relaxed">
        <Section title="In short">
          <p>
            {BRAND_NAME}{" "}is a free, non-commercial project. It stores only what it needs to match you
            with universities, only you can see your data, nothing is sold or shared, there are no ads,
            and you can delete everything at any time.
          </p>
        </Section>

        <Section title="What is stored when you create an account">
          <ul className="ml-5 list-disc space-y-1.5">
            <li>Your email address and password. Logins are handled by Supabase Auth; the password is stored only as a secure hash, and {BRAND_NAME} never sees it.</li>
            <li>Your profile: name, country, intended majors, grades and test scores you enter (and the grading system they came from), budget, preferred countries and degree level, the currency you&apos;d like amounts shown in, and what matters most to you.</li>
            <li>Universities you save, applications and offers you track (status, deadlines, costs, scholarships, notes, accept-by dates), and any universities you add yourself.</li>
            <li>Any &ldquo;wrong figure&rdquo; reports you send: which university and figure, what you suggest, an optional link and note. Only you can see them on the site; the site&apos;s owner reads them to check the figure against its source.</li>
          </ul>
        </Section>

        <Section title="If you send feedback">
          <p>
            The <Link href="/feedback" className="font-medium text-primary underline">feedback form</Link>{" "}
            stores your message, the page it&apos;s about, and an email address only if you give one (used
            just to reply to you). If you&apos;re logged in, it&apos;s linked to your account and deleted with
            it. Nobody can read feedback on the site, not even you after sending it; only the site&apos;s
            owner reads it, in the database. It isn&apos;t shared with anyone.
          </p>
        </Section>

        <Section title="If you use the site without an account">
          <p>
            The &ldquo;Try it&rdquo; quiz on the home page sends your three answers to the server
            once to work out your matches. They aren&apos;t saved anywhere. University pages can be
            read without an account; nothing about you is stored.
          </p>
        </Section>

        <Section title="Who can see it">
          <p>
            Only you. The database checks every request against your login (row-level security), so
            other users can&apos;t read your profile, saved schools, applications or the universities
            you added. The exceptions are a &ldquo;wrong figure&rdquo; report, which the site&apos;s owner
            reads to check the figure, and feedback, which only the owner reads. Your data isn&apos;t sold, rented or shared with anyone, and isn&apos;t used for
            advertising.
          </p>
        </Section>

        <Section title="Where it's kept, and who helps run the site">
          <ul className="ml-5 list-disc space-y-1.5">
            <li><strong>Supabase</strong>: the database and logins.</li>
            <li><strong>Vercel</strong>: hosts the website.</li>
            <li><strong>Resend</strong>: sends the sign-up confirmation email.</li>
          </ul>
          <p className="mt-3">They process data only to provide these services.</p>
        </Section>

        <Section title="Cookies and your browser">
          <p>
            The site sets only the cookies needed to keep you logged in. Your light or dark theme choice
            is remembered in your own browser. There are no advertising or tracking cookies.
          </p>
        </Section>

        <Section title="Visitor statistics">
          <p>
            Vercel Web Analytics counts page views so we can see which pages are used. It doesn&apos;t
            use cookies; visitors are told apart only by a hash of the request that&apos;s discarded
            after 24 hours. It records the page address, the referring site, an approximate location
            (country, region, city), browser, operating system and device type, and only shows totals. Vercel Speed Insights also records how
            fast pages load (timings such as how long the largest image took), with the page address and
            device type, the same way: no cookies, totals only.
          </p>
        </Section>

        <Section title="Deleting your account">
          <p>
            Go to <Link href="/profile" className="font-medium text-primary underline">your profile</Link> and
            choose &ldquo;Delete my account and data&rdquo;. It permanently deletes your login and
            everything listed above, straight away. You can also change or clear any profile answer at any
            time.
          </p>
        </Section>

        <Section title="Questions">
          <p>
            Use the <Link href="/feedback" className="font-medium text-primary underline">feedback form</Link>{" "}
            (leave an email address if you&apos;d like a reply). You don&apos;t need to ask anyone to delete
            your data: you can do it yourself at any time (see above).
          </p>
        </Section>
      </div>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <div className="text-muted-foreground">{children}</div>
    </section>
  );
}
