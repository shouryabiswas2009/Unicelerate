import {
  ACADEMIC_PREF_WEIGHTS,
  ACADEMIC_PROXIES,
  ATHLETICS_LABELS,
  IPEDS_YEARS,
  LOCALE_LABELS,
  SOCIAL_PREF_WEIGHTS,
  SOCIAL_PROXIES,
  type AcademicProxy,
  type SocialProxy,
} from "@/lib/campus-life-config";
import { isNum, type CampusRow } from "@/lib/campus-life-score";
import { COOP_LABELS, RESEARCH_LABELS } from "@/lib/focus";
import { NUMBER_FORMAT } from "@/lib/format";
import type { CampusCoverage, CampusLife, UniversitySummary } from "@/lib/types";

export {
  academicCommunityScore,
  academicPrefsOf,
  academicProxyValues,
  coverageFor,
  socialFunScore,
  socialPrefsOf,
  socialProxyValues,
  type CampusScore,
} from "@/lib/campus-life-score";

// The two campus-life focuses: "Academic & career community" and "Campus
// social life & fun". Each is built only from published, cited proxies
// (docs/CAMPUS-LIFE-DATA.md), turned into 0..1 and averaged with weights
// that follow the student's optional choices. It's a proxy based on
// published figures, never a rating of how fun or social a place is.
//
// The proxies are stored at import time (scripts/campus-life/build.mjs →
// universities.campus_life, with the "Not sure" score precomputed); the
// student's own choices only re-weight them here.

export type CampusKind = "academic" | "social";

export const CAMPUS_KIND_LABELS: Record<CampusKind, string> = {
  academic: "Academic & career community",
  social: "Campus social life",
};

// The copy rule, in one place.
export const CAMPUS_DISCLAIMER = "A proxy based on published figures, not a rating of how fun the place is.";

// ─── What the student sees: the proxies themselves ───────────────────────

export type CampusProxyLine = { proxy: AcademicProxy | SocialProxy; text: string; source: string; url: string | null };

// Dataset-wide sources (the same for every US school).
export const IPEDS_SOURCE = { label: "IPEDS (NCES)", url: "https://nces.ed.gov/ipeds/datacenter/DataFiles.aspx" };
export const SCORECARD_SOURCE = { label: "College Scorecard", url: "https://collegescorecard.ed.gov/data/" };

function curatedSource(life: CampusLife | null | undefined, proxy: string) {
  const row = life?.curated?.find((c) => c.proxy === proxy);
  return row ? { source: `school or official page, checked ${row.checked_on}`, url: row.source_url, note: row.label } : null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${NUMBER_FORMAT.format(n)} ${n === 1 ? one : many}`;

export function academicProxyLines(u: CampusRow & Pick<UniversitySummary, "internship_support_url">): CampusProxyLine[] {
  const life = u.campus_life;
  const lines: CampusProxyLine[] = [];
  const curated = (proxy: AcademicProxy, n: number | null | undefined, text: (n: number) => string) => {
    const src = curatedSource(life, proxy);
    if (isNum(n) && src) lines.push({ proxy, text: text(n), source: src.source, url: src.url });
  };
  curated("project_teams", life?.project_teams, (n) => `${plural(n, "design / project team")} listed`);
  curated("academic_clubs", life?.academic_clubs, (n) => `${plural(n, "academic or professional club")} listed`);
  curated("hackathons", life?.hackathons, (n) => `${plural(n, "hackathon")} listed`);
  const coop = u.coop_program ?? "unknown";
  if (coop !== "unknown") lines.push({ proxy: "coop", text: COOP_LABELS[coop], source: "school's own page", url: u.internship_support_url ?? null });
  if (u.research_intensity) {
    lines.push({ proxy: "research_activity", text: RESEARCH_LABELS[u.research_intensity], source: "Carnegie Classification, via College Scorecard", url: SCORECARD_SOURCE.url });
  }
  if (isNum(u.research_impact?.overall)) {
    lines.push({ proxy: "research_impact", text: `Research impact: ${u.research_impact.overall}th percentile`, source: "Leiden Ranking", url: u.research_impact.source_url });
  }
  return lines;
}

export function socialProxyLines(u: CampusRow): CampusProxyLine[] {
  const life = u.campus_life;
  if (!life) return [];
  const lines: CampusProxyLine[] = [];
  const ipeds = (year: string) => `IPEDS ${year} (NCES)`;
  if (isNum(life.locale) && life.locale in LOCALE_LABELS) {
    lines.push({ proxy: "setting", text: `${LOCALE_LABELS[life.locale]} setting`, source: ipeds(IPEDS_YEARS.locale), url: IPEDS_SOURCE.url });
  }
  if (isNum(life.undergrads)) {
    lines.push({ proxy: "size", text: plural(life.undergrads, "undergraduate"), source: SCORECARD_SOURCE.label, url: SCORECARD_SOURCE.url });
  }
  if (isNum(life.undergrads) && life.undergrads > 0 && isNum(life.housing)) {
    const share = Math.round((life.housing / life.undergrads) * 100);
    const text = share >= 100 ? "Campus housing for every undergraduate (capacity at least enrolment)" : `Campus housing for about ${share}% of undergraduates`;
    lines.push({ proxy: "residential", text, source: ipeds(IPEDS_YEARS.housing), url: IPEDS_SOURCE.url });
  }
  if (life.athletics) {
    const src = curatedSource(life, "athletics");
    const base = life.athletics === "none" ? ATHLETICS_LABELS.none : `Has varsity sport events: ${ATHLETICS_LABELS[life.athletics]}`;
    const note = life.football ? `football: ${life.football}` : src?.note;
    lines.push({
      proxy: "athletics",
      text: note ? `${base} (${note})` : base,
      source: src ? src.source : ipeds(IPEDS_YEARS.athletics),
      url: src ? src.url : IPEDS_SOURCE.url,
    });
  }
  const clubs = curatedSource(life, "social_clubs");
  if (isNum(life.social_clubs) && clubs) {
    lines.push({ proxy: "social_clubs", text: `${plural(life.social_clubs, "social or cultural club")} listed`, source: clubs.source, url: clubs.url });
  }
  return lines;
}

export function proxyLines(kind: CampusKind, u: CampusRow & Pick<UniversitySummary, "internship_support_url">): CampusProxyLine[] {
  return kind === "academic" ? academicProxyLines(u) : socialProxyLines(u);
}

// Every proxy of each kind, for the compare page's rows.
export const CAMPUS_PROXIES: Record<CampusKind, readonly (AcademicProxy | SocialProxy)[]> = {
  academic: ACADEMIC_PROXIES,
  social: SOCIAL_PROXIES,
};
export const PROXY_LABELS: Record<AcademicProxy | SocialProxy, string> = {
  project_teams: "Design / project teams",
  academic_clubs: "Academic & professional clubs",
  hackathons: "Hackathons",
  coop: "Co-op / internships",
  research_activity: "Research activity",
  research_impact: "Research impact",
  setting: "Setting",
  size: "Undergraduates",
  residential: "Campus housing",
  athletics: "Varsity sport events",
  social_clubs: "Social & cultural clubs",
};

// The proxy lines that count for the student's choices (all of them for
// "Not sure"), for explanation lines.
export function relevantProxyTexts(kind: CampusKind, u: CampusRow & Pick<UniversitySummary, "internship_support_url">, prefs: string[], limit = 2): string {
  const weights = (kind === "academic" ? ACADEMIC_PREF_WEIGHTS : SOCIAL_PREF_WEIGHTS) as Record<string, Partial<Record<string, number>>>;
  const chosen = prefs.length === 0 ? ["not_sure"] : prefs;
  // The proxies that count most for these choices first.
  const weight = (proxy: string) => Math.max(...chosen.map((p) => weights[p]?.[proxy] ?? 0));
  return proxyLines(kind, u)
    .filter((l) => weight(l.proxy) > 0)
    .sort((a, b) => weight(b.proxy) - weight(a.proxy))
    .slice(0, limit)
    .map((l) => l.text[0].toLowerCase() + l.text.slice(1))
    .join("; ");
}

// "Data coverage" in words: what was measured, never how good the place is.
export function coverageText(coverage: CampusCoverage): string {
  if (coverage === "Good") return "Data coverage: Good (includes club, team or event counts)";
  if (coverage === "Partial") return "Data coverage: Partial (no club or event counts published)";
  return "Data coverage: Not available";
}
