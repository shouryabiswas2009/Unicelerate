import type { ReactNode } from "react";
import Link from "next/link";
import { TrendingUp, Percent, DollarSign } from "lucide-react";
import { SourceBadge } from "@/components/universities/source-badge";
import { CountryGuidance } from "@/components/universities/country-guidance";
import { ResearchImpactPanel } from "@/components/universities/research-impact";
import { StrengthBreakdown, StrengthValue } from "@/components/universities/strength";
import { CampusLifeDetails, hasCampusLife } from "@/components/universities/campus-life";
import { STRENGTH_LABEL, hasVerifiedRanking } from "@/lib/strength-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Flag } from "@/components/flag";
import { formatRank, type DisplayRanking } from "@/lib/matching";
import { usd } from "@/lib/format";
import { livingCostDisplay, tuitionDisplay } from "@/lib/money";
import { COOP_LABELS, RESEARCH_LABELS } from "@/lib/focus";
import { compareUrl } from "@/lib/compare";
import { formatCheckedOn, sourcesWithDates } from "@/lib/source-dates";
import { canonicalCountry } from "@/lib/countries";
import type { CountryInfoResult } from "@/lib/data/country-info";
import type { University } from "@/lib/types";

// The body of a university's page: the facts, sources and country guidance.
// The personal parts come in through slots, so the same layout serves both
// the cached public page (/universities/[id], personal parts load in the
// browser) and a student's own school (/universities/mine/[id], rendered
// on the server).
export function UniversityDetails({
  university,
  countryInfo,
  backLink,
  headerAction,
  afterHeader,
  fit,
  report,
  ranking = { rank: university.qs_ranking, label: "Overall" },
  highlightLevel,
}: {
  university: University;
  countryInfo: CountryInfoResult;
  backLink: ReactNode;
  headerAction: ReactNode; // the save button area
  afterHeader?: ReactNode; // sign-up prompt, or edit/delete for your own school
  fit?: ReactNode; // the "Your fit" section
  report?: ReactNode; // "Report a wrong figure" (shared universities only)
  ranking?: DisplayRanking;
  highlightLevel?: string; // the student's degree level, highlighted below
}) {
  const country = canonicalCountry(university.country);
  const official = university.source === "College Scorecard";
  const curated = university.source === "curated";
  const tuition = tuitionDisplay(university);
  const living = livingCostDisplay(university);

  // For curated rows: where each figure was checked, so it can be checked again.
  const sourceLinks = [
    { label: "Tuition", url: university.tuition_source_url },
    { label: "Living costs", url: university.living_cost_source_url },
    { label: "Admission rate", url: university.acceptance_source_url },
    { label: "Programs", url: university.programs_source_url },
    { label: "Co-op / internships", url: university.internship_support_url },
  ].filter((l): l is { label: string; url: string } => Boolean(l.url));

  const admissionFigures = [
    {
      label: "Typical admitted GPA",
      value: university.avg_admitted_gpa != null ? `${university.avg_admitted_gpa} / 100` : "Not available",
    },
    {
      // Scorecard publishes Reading and Math separately; adding them only
      // approximates the total-score range (see the note below).
      label: official ? "SAT 25th–75th (Reading + Math)" : "SAT middle 50%",
      value:
        university.sat_25 != null && university.sat_75 != null
          ? `${university.sat_25}–${university.sat_75}`
          : "Not used / not available",
    },
    {
      label: "Minimum IELTS",
      value: university.min_ielts != null ? university.min_ielts.toFixed(1) : "Not available",
    },
    {
      label: "Living cost",
      value: living.text,
    },
  ];

  // Extra official figures only Scorecard schools have. Each is shown only
  // when Scorecard actually reports it.
  const officialFigures = [
    { label: "Type", value: university.ownership ? university.ownership[0].toUpperCase() + university.ownership.slice(1) : null },
    { label: "Undergraduates", value: university.student_size != null ? university.student_size.toLocaleString("en-US") : null },
    { label: "In-state tuition", value: university.tuition_in_state != null ? `${usd(university.tuition_in_state)}/yr` : null },
    // Scorecard's net price: cost after grants, averaged over students who
    // received US federal aid. International students can't get that aid,
    // so it's shown separately and never used for scoring (see the note).
    { label: "Net price for US aid recipients", value: university.avg_net_price != null ? `${usd(university.avg_net_price)}/yr` : null },
    { label: "Graduate within 6 years", value: university.completion_rate != null ? `${university.completion_rate}%` : null },
    { label: "Return for a 2nd year", value: university.retention_rate != null ? `${university.retention_rate}%` : null },
    {
      label: "Median earnings, 10 yrs after entry",
      value: university.median_earnings_10yr != null ? `${usd(university.median_earnings_10yr)}/yr` : null,
    },
  ].filter((f) => f.value !== null);

  // The figures the research / work-experience focuses use. Shown for every
  // school, with "Not available" rather than a guess when we don't have one.
  const focusFigures = [
    {
      label: "Research activity (Carnegie)",
      value: university.research_intensity ? RESEARCH_LABELS[university.research_intensity] : "Not available",
    },
    {
      label: "Co-op / internship program",
      value: COOP_LABELS[university.coop_program ?? "unknown"],
    },
  ];

  const stats = [
    {
      icon: DollarSign,
      label: tuition.approximate ? "Tuition (approximate)" : "Tuition",
      value: tuition.text,
    },
    // The strength index (every shared school has one); a student's own
    // school shows the ranking they entered, if any.
    university.strength_index == null && ranking.rank !== null
      ? {
          icon: TrendingUp,
          label: `Ranking (entered by you) — ${ranking.label}`,
          value: formatRank(ranking.rank),
        }
      : {
          icon: TrendingUp,
          label: STRENGTH_LABEL,
          value: <StrengthValue university={university} className="justify-start text-left" />,
        },
    {
      icon: Percent,
      label: "Acceptance rate",
      value: university.acceptance_rate !== null ? `${university.acceptance_rate}%` : "Not available",
    },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      {backLink}

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            {university.name}
          </h1>
          <p className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
            <Flag country={university.country} />
            {[university.city, university.state, university.country].filter(Boolean).join(", ")}
            <span className="ml-1">
              <SourceBadge university={university} showLink />
            </span>
          </p>
        </div>
        {headerAction}
      </div>

      {afterHeader}

      {/* The three headline figures as a row with thin dividers, no boxes. */}
      <div className="mt-8 grid grid-cols-1 divide-y border-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {stats.map((stat) => (
          <div key={stat.label} className="py-4 sm:px-5 sm:first:pl-0">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <stat.icon className="size-3.5" aria-hidden />
              {stat.label}
            </p>
            <div className="mt-1 text-lg font-semibold">{stat.value}</div>
          </div>
        ))}
      </div>
      {(tuition.note || living.note) && (
        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          {tuition.note && <p>Tuition: {tuition.note}</p>}
          {living.note && <p>Living cost: {living.note}</p>}
        </div>
      )}

      {fit}

      <div className="mt-8 space-y-2">
        <h2 className="font-medium">About</h2>
        <p className="text-muted-foreground">{university.description}</p>
      </div>

      <div className="mt-8 space-y-2">
        <h2 className="font-medium">Admission figures</h2>
        <dl className="grid grid-cols-2 gap-x-6 border-t sm:grid-cols-4">
          {admissionFigures.map((figure) => (
            <div key={figure.label} className="border-b py-3">
              <dt className="text-xs text-muted-foreground">{figure.label}</dt>
              <dd className="font-medium">{figure.value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">
          {official ? (
            <>
              From the US Department of Education College Scorecard (data year{" "}
              {university.data_year}). Scorecard doesn&apos;t publish admitted
              GPAs or English-test minimums, so those show as not available. The
              SAT range adds the Reading and Math percentiles, which only
              approximates the total-score range.
            </>
          ) : curated ? (
            <>
              Checked by hand on the university&apos;s own website
              {university.data_year ? ` (${university.data_year})` : ""}; each
              figure&apos;s page is linked below. Most universities outside the US
              don&apos;t publish an admission rate or test-score range, so those
              show as not available.
            </>
          ) : university.source === "user-entered" ? (
            <>Entered by you{university.source_url ? " — see the source link at the top" : ""}.</>
          ) : (
            <>
              Illustrative approximations for this demo, not official admissions
              statistics. Check the university&apos;s own website before deciding.
            </>
          )}
        </p>
      </div>

      {sourceLinks.length > 0 && (
        <div className="mt-8 space-y-2">
          <h2 className="font-medium">Sources</h2>
          <ul className="space-y-1 text-sm">
            {sourceLinks.map(({ label, url }) => (
              <li key={label}>
                <span className="text-muted-foreground">{label}: </span>
                <a href={url} target="_blank" rel="noopener noreferrer" className="break-all underline">
                  {new URL(url).hostname}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-8 space-y-2">
        <h2 className="font-medium">Data sources and dates</h2>
        <ul className="space-y-1 text-sm">
          {sourcesWithDates(university).map((s) => (
            <li key={s.label}>
              {s.url ? (
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">
                  {s.label}
                </a>
              ) : (
                s.label
              )}
              {s.detail && <span className="text-muted-foreground">, {s.detail}</span>}
              <span className="text-muted-foreground">
                {" "}
                · {s.checkedOn ? `data last checked ${formatCheckedOn(s.checkedOn)}` : "no check date recorded"}
              </span>
            </li>
          ))}
        </ul>
        {report}
      </div>

      {officialFigures.length > 0 && (
        <div className="mt-8 space-y-2">
          <h2 className="font-medium">More official figures</h2>
          <dl className="grid grid-cols-2 gap-x-6 border-t sm:grid-cols-3">
            {officialFigures.map((figure) => (
              <div key={figure.label} className="border-b py-3">
                <dt className="text-xs text-muted-foreground">{figure.label}</dt>
                <dd className="font-medium">{figure.value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">
            College Scorecard, data year {university.data_year}. Earnings follow
            students who started several years earlier, so they describe an
            older group than the other figures.
            {university.avg_net_price != null && (
              <>
                {" "}Net price is the average cost after grants for students who received US federal aid;
                international students usually can&apos;t get that aid, so plan with the full tuition above
                (that&apos;s what your budget is compared with).
              </>
            )}
          </p>
        </div>
      )}

      <div className="mt-8 space-y-2">
        <h2 className="font-medium">{STRENGTH_LABEL}</h2>
        {university.strength_signals ? (
          <div className="border-l-2 border-primary/40 pl-4 text-sm">
            <StrengthBreakdown university={university} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Not available{university.source === "user-entered" ? " for schools you add yourself" : ""}.
          </p>
        )}
        {university.qs_ranking !== null && hasVerifiedRanking(university) && (
          <p className="text-sm">
            Ranking entered from its source: {formatRank(university.qs_ranking)}
            {university.source_url && (
              <>
                {" "}(
                <a href={university.source_url} target="_blank" rel="noopener noreferrer" className="underline">
                  source
                </a>
                )
              </>
            )}
          </p>
        )}
      </div>

      <ResearchImpactPanel university={university} />

      <div className="mt-8 space-y-2">
        <h2 className="font-medium">Research and work experience</h2>
        <dl className="grid grid-cols-2 gap-x-6 border-t">
          {focusFigures.map((figure) => (
            <div key={figure.label} className="border-b py-3">
              <dt className="text-xs text-muted-foreground">{figure.label}</dt>
              <dd className="font-medium">{figure.value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">
          {university.source === "user-entered"
            ? "Entered by you."
            : official
              ? "Research activity is the Carnegie Classification as reported by College Scorecard."
              : "The Carnegie research level only exists for US schools; for others see research impact above."}{" "}
          Co-op / internship programs are only filled in from the school&apos;s
          own page{university.internship_support_url ? (
            <>
              {" "}(
              <a href={university.internship_support_url} target="_blank" rel="noopener noreferrer" className="underline">
                source
              </a>
              )
            </>
          ) : null}
          ; &ldquo;not available&rdquo; means we haven&apos;t found a clear statement,
          not that there isn&apos;t one. Graduate earnings (above) are shown for
          information only and don&apos;t affect the work-experience focus.
        </p>
      </div>

      {hasCampusLife(university) && (
        <div className="mt-8 space-y-3">
          <h2 className="font-medium">Campus life</h2>
          <CampusLifeDetails university={university} />
        </div>
      )}

      <div className="mt-8">
        <CountryGuidance
          country={country}
          info={countryInfo.byCountry.get(country) ?? null}
          pending={countryInfo.pending}
        />
      </div>

      <div className="mt-8 space-y-2">
        <h2 className="font-medium">Popular programs</h2>
        <div className="flex flex-wrap gap-2">
          {university.popular_programs.map((program) => (
            <Badge
              key={program}
              variant={program === ranking.label ? "default" : "secondary"}
            >
              {program}
            </Badge>
          ))}
        </div>
      </div>

      {(university.degree_levels ?? []).length > 0 && (
        <div className="mt-8 space-y-2">
          <h2 className="font-medium">Degree levels offered</h2>
          <div className="flex flex-wrap gap-2">
            {university.degree_levels.map((level) => (
              <Badge
                key={level}
                variant={level === highlightLevel ? "default" : "secondary"}
              >
                {level}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="mt-10 flex gap-3">
        <Button asChild>
          <Link href={compareUrl([university.id])}>Compare</Link>
        </Button>
      </div>
    </div>
  );
}
