import Link from "next/link";
import { ArrowRight, BarChart3, ClipboardList, Gauge, GraduationCap, Plane, Target, type LucideIcon } from "lucide-react";
import { SectionHeading } from "@/components/landing/section-heading";

type Feature = { icon: LucideIcon; title: string; description: string };

// What the app can do, in plain words. Keep these accurate to what exists.
// They're plain rows on purpose: the features live on members-only pages,
// and the landing page keeps just three ways in (Get started, Try it, and
// the closing banner).
const FEATURES: Feature[] = [
  {
    icon: BarChart3,
    title: "Strength index",
    description: "Our own labelled estimate of each school's strength from open data (graduation, earnings, research), with its confidence and sources.",
  },
  {
    icon: Gauge,
    title: "Admission estimate",
    description: "For US schools with official figures, a demo model estimates your chance and shows what moved it.",
  },
  {
    icon: GraduationCap,
    title: "Your grades and courses",
    description: "Enter grades in your own system (Canadian provinces, CBSE, IB, A Levels and more), and list courses so the ones that matter for your major count more.",
  },
  {
    icon: Target,
    title: "What matters most",
    description: "Tick reputation, work experience, research, cost, or the two campus-life factors (academic & career community, social life), and the scoring leans that way.",
  },
  {
    icon: Plane,
    title: "Visa and work rights",
    description: "Optionally weigh post-study work, proof of funds and work hours from government pages, each cited and dated.",
  },
  {
    icon: ClipboardList,
    title: "Applications and offers",
    description: "Track status, deadlines and costs, then rank your offers by what matters to you.",
  },
];

// Design sample (docs/DESIGN-SYSTEM.md): an open section, not a grid of
// cards. A numbered list with hairlines between rows; the heading sits in a
// left column and the list runs beside it. No icon circles, no shadows.
export function WhatsNew() {
  return (
    <section id="whats-new" aria-labelledby="whats-new-heading" className="page-container section-y scroll-mt-16">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        <div className="reveal space-y-6 lg:sticky lg:top-24 lg:self-start">
          <SectionHeading
            id="whats-new-heading"
            eyebrow="What's new"
            title="Tools that go past a ranking list"
            accent="past a ranking list"
            description="Every page scores with the same rules, and every figure says where it came from."
          />
          <Link
            href="/universities"
            className="inline-flex items-center gap-1.5 font-medium underline decoration-primary/40 underline-offset-4 transition-colors hover:decoration-primary"
          >
            Browse universities
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        <ol className="reveal divide-y border-y">
          {FEATURES.map((feature, i) => (
            <li key={feature.title} className="grid grid-cols-[3rem_1fr] gap-x-4 py-6 sm:grid-cols-[4rem_14rem_1fr] sm:gap-x-6">
              <span className="font-heading text-sm font-semibold tabular-nums text-primary" aria-hidden>
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="flex items-start gap-2 font-semibold">
                <feature.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                {feature.title}
              </h3>
              <p className="col-start-2 mt-1 text-muted-foreground sm:col-start-3 sm:mt-0">{feature.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
