import { Flag } from "@/components/flag";
import { ChanceBadge } from "@/components/universities/chance-badge";
import { MatchScoreBadge } from "@/components/universities/match-score-badge";
import { StrengthsConcerns } from "@/components/universities/strengths-concerns";
import { SourceBadge } from "@/components/universities/source-badge";
import { ResearchImpactValue } from "@/components/universities/research-impact";
import { StrengthValue } from "@/components/universities/strength";
import { checkAge, type CountryInfo } from "@/lib/country-info";
import { STRENGTH_LABEL, hasVerifiedRanking } from "@/lib/strength-display";
import { RESEARCH_IMPACT_LABEL, researchImpactFor } from "@/lib/research-impact";
import { bestIndexes, totalYearlyCost } from "@/lib/compare";
import { usd } from "@/lib/format";
import { APPROX_NOTE, approxInCurrency } from "@/lib/display-currency";
import { livingCostDisplay, tuitionDisplay, type MoneyDisplay } from "@/lib/money";
import { formatRank, type AdmissionChance, type MatchEntry } from "@/lib/matching";
import { cn } from "@/lib/utils";
import { CAMPUS_KIND_LABELS, CAMPUS_PROXIES, PROXY_LABELS, academicCommunityScore, proxyLines, socialFunScore } from "@/lib/campus-life";
import type { Profile } from "@/lib/types";

// "Not enough data" is null in value() below, so it's never "best".
const CHANCE_ORDER: Record<AdmissionChance, number | null> = {
  Reach: 1,
  Match: 2,
  Safety: 3,
  "Not enough data": null,
};

type Row = {
  label: string;
  render: (entry: MatchEntry, profile: Profile) => React.ReactNode;
  // Rows where "best" has a clear meaning say which number to compare and
  // which direction is better. Rows without these are never highlighted.
  value?: (entry: MatchEntry, profile: Profile) => number | null;
  better?: "higher" | "lower";
  // Some rows are only fair to compare in certain cases (see ranking below).
  comparable?: (entries: MatchEntry[], profile: Profile) => boolean;
  // Rows shown only when they apply to at least one of the schools.
  shown?: (entries: MatchEntry[]) => boolean;
};

const muted = (text: string) => <span className="text-muted-foreground">{text}</span>;

const ROWS: Row[] = [
  {
    label: "Data source",
    render: ({ university }) => <SourceBadge university={university} />,
  },
  {
    label: "Country",
    render: ({ university }) => (
      <span className="flex items-center gap-1.5">
        <Flag country={university.country} />
        {university.country}
      </span>
    ),
  },
  {
    label: "Match score",
    render: ({ match }) => <MatchScoreBadge score={match.score} />,
    value: ({ match }) => match.score,
    better: "higher",
  },
  {
    label: "Score breakdown",
    render: ({ match }) => (
      <ul className="space-y-0.5 text-xs text-muted-foreground">
        {match.factors.map((f) => (
          <li key={f.key}>
            {f.label}: {f.points === null ? (f.note ?? "unknown") : `${f.points}/${f.max}`}
          </li>
        ))}
      </ul>
    ),
  },
  {
    label: "Admission chance",
    render: ({ match, prediction }) => (
      <ChanceBadge chance={match.chance} source={match.chanceSource} probability={prediction?.probability} />
    ),
    value: ({ match }) => CHANCE_ORDER[match.chance],
    better: "higher",
  },
  {
    label: "Estimated admission chance (demo model)",
    render: ({ prediction }) =>
      prediction ? `~${Math.round(prediction.probability * 100)}%` : muted("Not available"),
    value: ({ prediction }) => prediction?.probability ?? null,
    better: "higher",
  },
  {
    label: "Tuition",
    render: ({ university }, profile) => (
      <Money display={tuitionDisplay(university)} usdAmount={university.tuition} currency={profile.display_currency} />
    ),
    value: ({ university }) => university.tuition,
    better: "lower",
  },
  {
    label: "Living cost",
    render: ({ university }, profile) => (
      <Money display={livingCostDisplay(university)} usdAmount={university.living_cost_per_year} currency={profile.display_currency} />
    ),
    value: ({ university }) => university.living_cost_per_year,
    better: "lower",
  },
  {
    label: "Estimated total per year",
    render: ({ university }, profile) => {
      const total = totalYearlyCost(university);
      const other = approxInCurrency(total, profile.display_currency);
      return total !== null
        ? `about ${usd(total)}/yr${other ? ` (${other})` : ""}`
        : muted("Not available (tuition or living cost missing)");
    },
    value: ({ university }) => totalYearlyCost(university),
    better: "lower",
  },
  {
    label: STRENGTH_LABEL,
    render: ({ university }) => <StrengthValue university={university} className="justify-start text-left" />,
    value: ({ university }) => university.strength_index ?? null,
    better: "higher",
    // An estimate is a range from similar schools, so no "best" mark then.
    comparable: (entries) => entries.every((e) => e.university.strength_is_estimate === false),
  },
  {
    label: "Ranking (entered from its source)",
    render: ({ university, ranking }) =>
      hasVerifiedRanking(university) && ranking.rank !== null ? `${formatRank(ranking.rank)} (${ranking.label})` : muted("None entered"),
    value: ({ university, ranking }) => (hasVerifiedRanking(university) ? ranking.rank : null),
    better: "lower",
    // A subject ranking (#15 in Computer Science) and an overall ranking
    // (#30 overall) aren't the same scale, so only crown a winner when every
    // school is ranked the same way.
    comparable: (entries) => new Set(entries.map((e) => e.ranking.label)).size === 1,
    shown: (entries) => entries.some((e) => hasVerifiedRanking(e.university)),
  },
  {
    label: RESEARCH_IMPACT_LABEL,
    render: ({ university }, profile) => <ResearchImpactValue university={university} profile={profile} />,
    value: ({ university }, profile) => researchImpactFor(profile, university)?.percentile ?? null,
    better: "higher",
    // A field percentile and an overall one aren't the same comparison.
    comparable: (entries, profile) => new Set(entries.map((e) => researchImpactFor(profile, e.university)?.field ?? "overall")).size === 1,
  },
  {
    label: "Visa and work rights",
    render: ({ visa }) =>
      visa ? (
        <span className="space-y-1">
          <span className="block">{visa.line}</span>
          {[...visa.fit.reasons, ...visa.fit.concerns, ...visa.fit.notes].map((line) => (
            <span key={line} className="block text-xs text-muted-foreground">
              {line}
            </span>
          ))}
          {visa.info && <VisaSources info={visa.info} />}
        </span>
      ) : (
        muted("Not shown")
      ),
    value: ({ visa }) => visa?.fit.score ?? null,
    better: "higher",
    // "Best" only when the student factors the visa in, not when only shown.
    comparable: (entries) => entries.every((e) => e.visa?.mode === "factor"),
    shown: (entries) => entries.some((e) => e.visa !== null),
  },
  {
    label: "Acceptance rate",
    render: ({ university }) =>
      university.acceptance_rate !== null ? `${university.acceptance_rate}%` : muted("Not available"),
    value: ({ university }) => university.acceptance_rate,
    better: "higher",
  },
  {
    label: "Typical admitted GPA vs. yours",
    render: ({ university }, profile) => {
      const avg = university.avg_admitted_gpa;
      if (avg == null) return muted("Unknown");
      const margin = profile.gpa_percentage - avg;
      return (
        <span>
          {avg} · you {profile.gpa_percentage}
          {profile.grade_basis === "approximate" ? " (approximate)" : ""}{" "}
          <span className={margin >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
            ({margin >= 0 ? "+" : ""}
            {Math.round(margin * 10) / 10})
          </span>
        </span>
      );
    },
    value: ({ university }, profile) =>
      university.avg_admitted_gpa != null ? profile.gpa_percentage - university.avg_admitted_gpa : null,
    better: "higher",
  },
  {
    label: "SAT middle 50% vs. yours",
    render: ({ university }, profile) => {
      const { sat_25, sat_75 } = university;
      if (sat_25 == null || sat_75 == null) return muted("Not used / unknown");
      const sat = profile.sat_score;
      const status =
        sat == null ? "no SAT on your profile" : sat >= sat_75 ? "above" : sat >= sat_25 ? "within" : "below";
      return (
        <span>
          {sat_25}–{sat_75} · you {sat ?? "—"}{" "}
          <span className="text-muted-foreground">({status})</span>
        </span>
      );
    },
  },
  {
    label: "Minimum IELTS vs. yours",
    render: ({ university }, profile) => {
      const min = university.min_ielts;
      if (min == null) return muted("Unknown");
      const ielts = profile.ielts_score;
      if (ielts == null) return <span>{min.toFixed(1)} · {muted("no IELTS on your profile")}</span>;
      return (
        <span>
          {min.toFixed(1)} · you {ielts.toFixed(1)}{" "}
          <span className={ielts >= min ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
            ({ielts >= min ? "meets it" : "below"})
          </span>
        </span>
      );
    },
    value: ({ university }, profile) =>
      university.min_ielts != null && profile.ielts_score != null
        ? profile.ielts_score - university.min_ielts
        : null,
    better: "higher",
  },
  {
    label: "Degree levels",
    render: ({ university }) =>
      (university.degree_levels ?? []).length > 0 ? university.degree_levels.join(", ") : muted("Unknown"),
  },
  {
    label: "Popular programs",
    render: ({ university }) => university.popular_programs.join(", "),
  },
  // Campus life: the confidence of each kind, then a row per published
  // proxy (shown when at least one school has it). Never highlighted as
  // "best": these are proxies, not ratings. Research impact has its own
  // row above.
  ...(["academic", "social"] as const).flatMap((kind): Row[] => [
    {
      label: `${CAMPUS_KIND_LABELS[kind]}: confidence`,
      render: ({ university }) => {
        const confidence = (kind === "academic" ? academicCommunityScore(university) : socialFunScore(university)).confidence;
        return confidence === "Not available" ? muted("Data not available") : `${confidence} (proxy, not a rating)`;
      },
    },
    ...CAMPUS_PROXIES[kind]
      .filter((proxy) => proxy !== "research_impact")
      .map((proxy) => {
        const line = (university: MatchEntry["university"]) => proxyLines(kind, university).find((l) => l.proxy === proxy);
        return {
          label: `${CAMPUS_KIND_LABELS[kind]}: ${PROXY_LABELS[proxy].toLowerCase()}`,
          render: ({ university }: MatchEntry) => line(university)?.text ?? muted("Not available"),
          shown: (entries: MatchEntry[]) => entries.some((e) => line(e.university)),
        };
      }),
  ]),
  {
    label: "Strengths & concerns",
    render: ({ explanation }) => <StrengthsConcerns explanation={explanation} />,
  },
];

export function CompareTable({
  entries,
  profile,
}: {
  entries: MatchEntry[];
  profile: Profile;
}) {
  return (
    <div className="space-y-2">
      {/* Scrolls sideways on small screens; the row labels stay pinned. */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="sticky left-0 z-10 w-36 min-w-36 bg-muted p-3 text-left font-medium text-muted-foreground">
                &nbsp;
              </th>
              {entries.map(({ university }) => (
                <th key={university.id} className="min-w-48 p-3 text-left align-top font-semibold">
                  {university.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.filter((row) => row.shown?.(entries) ?? true).map((row) => {
              const highlight =
                row.value && row.better && (row.comparable?.(entries, profile) ?? true)
                  ? bestIndexes(entries.map((e) => row.value!(e, profile)), row.better)
                  : new Set<number>();

              return (
                <tr key={row.label} className="border-b last:border-0">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-card p-3 text-left align-top font-medium text-muted-foreground"
                  >
                    {row.label}
                  </th>
                  {entries.map((entry, i) => (
                    <td
                      key={entry.university.id}
                      className={cn(
                        "p-3 align-top",
                        highlight.has(i) &&
                          "bg-emerald-500/10 font-semibold text-emerald-700 dark:text-emerald-300"
                      )}
                    >
                      {row.render(entry, profile)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Green cells are the best value in their row (lowest cost, highest
        score, and so on). The strength index is our own estimate from open
        data, not an official ranking; it isn&apos;t marked &ldquo;best&rdquo; when a
        school&apos;s figure is estimated from similar schools. The first row says
        where each school&apos;s figures come from.
      </p>
    </div>
  );
}

// A money figure, with "approximate" and its basis shown underneath when it
// was converted from another currency, so schools are compared fairly.
function Money({ display, usdAmount, currency }: { display: MoneyDisplay; usdAmount: number | null; currency?: string }) {
  if (display.text === "Not available") return <span className="text-muted-foreground">Not available</span>;
  const other = approxInCurrency(usdAmount, currency);
  return (
    <span>
      {display.text}
      {other && <span className="block text-xs text-muted-foreground">{other} ({APPROX_NOTE})</span>}
      {display.note && <span className="block text-xs text-muted-foreground">{display.note}</span>}
    </span>
  );
}

// Government sources for the visa figures, with how old each check is.
function VisaSources({ info }: { info: CountryInfo }) {
  const sources = [
    { label: "post-study work", url: info.post_study_source_url, checked: info.post_study_checked_on },
    { label: "funds", url: info.funds_source_url, checked: info.funds_checked_on },
    { label: "work hours", url: info.work_source_url, checked: info.work_checked_on },
  ].filter((s): s is { label: string; url: string; checked: string | null } => Boolean(s.url));
  return (
    <span className="block text-xs text-muted-foreground">
      Guidance only, not legal advice. Sources:{" "}
      {sources.map((s, i) => {
        const age = s.checked ? checkAge(s.checked) : null;
        return (
          <span key={s.label}>
            {i > 0 && ", "}
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">
              {s.label}
            </a>
            {age ? ` (${age.label}${age.stale ? ", may be out of date" : ""})` : ""}
          </span>
        );
      })}
    </span>
  );
}
