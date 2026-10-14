import {
  LEIDEN_UNIVERSITY_COUNT,
  RESEARCH_FIELD_LABELS,
  RESEARCH_IMPACT_LABEL,
  describeImpact,
  ordinal,
  researchImpactFor,
} from "@/lib/research-impact";
import type { Profile, ResearchFieldKey, UniversitySummary } from "@/lib/types";

// How research impact is shown in compare and offers: the student's figure
// (their field when there is one) and where it comes from. No server-only
// code, so it renders anywhere.
export function ResearchImpactValue({
  university,
  profile,
}: {
  university: UniversitySummary;
  profile: Pick<Profile, "intended_majors"> | null;
}) {
  const shown = researchImpactFor(profile, university);
  const impact = university.research_impact;
  if (!shown || !impact) {
    return <span className="text-muted-foreground">Not available (not in the Leiden Ranking)</span>;
  }
  return (
    <span>
      {describeImpact(shown)}
      <span className="block text-xs text-muted-foreground">
        <a href={impact.source_url} target="_blank" rel="noopener noreferrer" className="underline">
          Leiden Ranking
        </a>
        , papers {impact.data_year}
      </span>
    </span>
  );
}

// The full figure on a university's page: overall and per field, what the
// number means, the source, licence and when it was checked.
export function ResearchImpactPanel({ university }: { university: UniversitySummary }) {
  const impact = university.research_impact;
  return (
    <div className="mt-8 space-y-2">
      <h2 className="font-medium">{RESEARCH_IMPACT_LABEL}</h2>
      {!impact ? (
        <p className="text-sm text-muted-foreground">
          {university.source === "user-entered"
            ? "Not available for schools you add yourself."
            : "Not available: this university isn't in the Leiden Ranking (which includes universities with at least 1,500 publications in 2020–2023), or we couldn't match it to the ranking with confidence."}
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-6 border-t sm:grid-cols-3">
            <div className="border-b py-3">
              <dt className="text-xs text-muted-foreground">Overall</dt>
              <dd className="font-medium">{ordinal(impact.overall)} percentile</dd>
            </div>
            {(Object.keys(RESEARCH_FIELD_LABELS) as ResearchFieldKey[]).map((key) => (
              <div key={key} className="border-b py-3">
                <dt className="text-xs text-muted-foreground">{RESEARCH_FIELD_LABELS[key]}</dt>
                <dd className="font-medium">
                  {typeof impact.fields?.[key] === "number" ? (
                    `${ordinal(impact.fields[key]!)} percentile`
                  ) : (
                    <span className="text-muted-foreground">Not available</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">
            {Math.round(impact.pp_top10 * 1000) / 10}% of its {impact.publications.toLocaleString("en-US")}{" "}research
            papers from {impact.data_year} are among the 10% most cited in their field worldwide, a higher share than{" "}
            {impact.overall}% of the {LEIDEN_UNIVERSITY_COUNT.toLocaleString("en-US")}{" "}universities in the ranking.
            It measures research, not teaching. A field shows &ldquo;not available&rdquo; when the university has
            fewer than 100 papers in it. Source:{" "}
            <a href={impact.source_url} target="_blank" rel="noopener noreferrer" className="underline">
              {impact.source}
            </a>{" "}
            ({impact.licence}), built from OpenAlex data. Data last checked {impact.checked_on}.
          </p>
        </>
      )}
    </div>
  );
}
