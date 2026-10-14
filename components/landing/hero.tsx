import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight } from "lucide-react";
import { BRAND_NAME } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { AccentTitle } from "@/components/landing/section-heading";
import type { LandingStats } from "@/lib/landing";

// Photo by Vadim Sherbakov on Unsplash (Unsplash License; see docs/CREDITS.md).
// Allowed by exact path in next.config.ts.
const HERO_PHOTO = "https://images.unsplash.com/20/cambridge.JPG";

// The top of the landing page: headline and two buttons on the left; on the
// right a photo that runs to the edge of the screen with a slanted left
// edge, and one small, flat stat block on top of it. The number is counted from the
// database (lib/landing.ts), not typed in.
export function Hero({ stats }: { stats: LandingStats }) {
  return (
    <section className="relative overflow-hidden">
      <div className="page-container grid items-center gap-10 py-12 lg:min-h-[34rem] lg:grid-cols-2 lg:py-20">
        <div className="relative z-10 space-y-6">
          {/* "rise": each line moves into place a little after the one above
              (CSS only, see globals.css; nothing waits on JavaScript). */}
          <p className="eyebrow rise">Welcome to {BRAND_NAME}</p>
          <h1 className="rise text-display font-extrabold text-balance" style={{ "--rise-delay": "60ms" } as React.CSSProperties}>
            <AccentTitle title="Find the university that actually fits you." accent="fits you." />
          </h1>
          <p className="rise max-w-md text-muted-foreground text-pretty" style={{ "--rise-delay": "120ms" } as React.CSSProperties}>
            {BRAND_NAME}{" "}matches you to universities by budget, grades, major
            and what matters most to you, using official US figures and fees
            checked on each university&apos;s own website.
          </p>
          <div className="rise flex flex-wrap items-center gap-5" style={{ "--rise-delay": "180ms" } as React.CSSProperties}>
            <Button size="lg" asChild>
              <Link href="/signup">
                Get started
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Link
              href="#try-it"
              className="inline-flex items-center gap-1.5 text-sm font-semibold underline decoration-primary/40 underline-offset-4 transition-colors hover:decoration-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              Try it, no account needed
              <ArrowDown className="size-4" aria-hidden />
            </Link>
          </div>
        </div>

        {/* Photo: full-bleed to the right edge on large screens (slanted left
            edge), a plain image with small corners under the text on small ones. */}
        <div className="relative h-72 overflow-hidden rounded-lg sm:h-96 lg:absolute lg:inset-y-0 lg:right-0 lg:h-auto lg:w-[48%] lg:rounded-none lg:[clip-path:polygon(14%_0,100%_0,100%_100%,0_100%)]">
          <Image
            src={HERO_PHOTO}
            alt="A historic college building behind a striped green lawn"
            fill
            // Loaded first on this page, but without a <link rel="preload">:
            // the preload hint also travels in the landing page's prefetched
            // data, which made every page that links home fetch the photo.
            loading="eager"
            fetchPriority="high"
            sizes="(min-width: 1024px) 48vw, 100vw"
            className="object-cover"
          />
        </div>
      </div>

      {stats.universities > 0 && (
        <div className="page-container pointer-events-none relative -mt-24 flex justify-end pb-6 lg:absolute lg:inset-x-0 lg:bottom-10 lg:mt-0 lg:pb-0">
          <div
            className="appear pointer-events-auto mr-3 w-44 rounded-md bg-band p-5 text-band-foreground sm:mr-6"
            style={{ "--appear-delay": "300ms" } as React.CSSProperties}
          >
            <p className="font-heading text-4xl font-extrabold tabular-nums">
              {stats.universities.toLocaleString("en-US")}
            </p>
            <p className="mt-1 text-sm text-band-muted">universities in {stats.countries} countries</p>
            <span className="mt-4 block h-px w-10 bg-band-muted/60" aria-hidden />
          </div>
        </div>
      )}
    </section>
  );
}
