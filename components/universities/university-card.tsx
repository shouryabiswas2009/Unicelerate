"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { MatchScoreBadge, matchTier } from "@/components/universities/match-score-badge";
import { ChanceBadge } from "@/components/universities/chance-badge";
import { StrengthsConcerns } from "@/components/universities/strengths-concerns";
import { SaveButton } from "@/components/universities/save-button";
import { Flag } from "@/components/flag";
import { cn } from "@/lib/utils";
import {
  formatRank,
  type DisplayRanking,
  type MatchEntry,
  type MatchExplanation,
  type MatchResult,
} from "@/lib/matching";
import { SourceBadge } from "@/components/universities/source-badge";
import { tuitionDisplay } from "@/lib/money";
import { ApplicationStatusControl } from "@/components/applications/application-status-control";
import type { ApplicationStatus } from "@/lib/types";
import type { AdmissionPrediction } from "@/lib/admission-model";
import type { RankInfo } from "@/lib/ranking";
import { StrengthValue } from "@/components/universities/strength";
import { VisaNote } from "@/components/universities/visa-note";
import { CampusLifeLines, selectedCampusKinds } from "@/components/universities/campus-life";
import { STRENGTH_LABEL, hasVerifiedRanking } from "@/lib/strength-display";
import { COOP_LABELS, COOP_SHORT_LABELS } from "@/lib/focus";
import type { UniversitySummary } from "@/lib/types";
import { universityPath } from "@/lib/university-path";

const TIER_BORDER = {
  strong: "border-t-emerald-500",
  moderate: "border-t-amber-500",
  weak: "border-t-border",
} as const;

export function UniversityCard({
  university,
  match,
  explanation,
  ranking,
  prediction,
  rank,
  visa = null,
  guest = false,
  isSaved = false,
  index = 0,
  compare,
  tracking,
}: {
  university: UniversitySummary;
  match: MatchResult;
  explanation: MatchExplanation;
  ranking?: DisplayRanking;
  prediction?: AdmissionPrediction | null;
  // Quality, chance and the one-line reason (lib/ranking.ts).
  rank?: RankInfo;
  // Visa and work rights, when the student shows or factors it in.
  visa?: MatchEntry["visa"];
  // A visitor without an account: no personal score, chance or saving.
  guest?: boolean;
  isSaved?: boolean;
  index?: number;
  // Present when the card is shown in a board that supports comparing.
  compare?: { selected: boolean; disabled: boolean; onToggle: () => void };
  // Present on the saved page: the application tracked for this school, or
  // null if it isn't tracked yet.
  tracking?: { application: { id: string; status: ApplicationStatus } | null };
}) {
  const tuition = tuitionDisplay(university);

  return (
    // A short staggered slide-up for the first screenful of cards (capped at
    // the 8th, so a page never waits on its own animation).
    <motion.div
      // When sorting or filtering reorders the list, the first screenful of
      // cards slides to its new place (framer-motion animates the move with
      // transforms). Further down it isn't worth the work.
      layout={index < 9 ? "position" : false}
      // Slide up a little, first screenful only. No fade: the card is fully
      // visible in the HTML (even before JavaScript runs), and the server and
      // browser render the same starting point. MotionConfig skips the slide
      // for reduced motion.
      initial={index < 9 ? { y: 12 } : false}
      animate={{ y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index, 8) * 0.05 }}
      className="relative h-full"
    >
      {/* Sibling of the Link (not nested inside it) so the button stays a
          separately clickable element rather than an <a> inside an <a>. */}
      {!guest && (
        <SaveButton
          universityId={university.id}
          initiallySaved={isSaved}
          className="absolute top-3 right-3 z-10"
        />
      )}

      <Link href={universityPath(university)} className="block h-full">
        <Card
          className={cn(
            "h-full rounded-lg border-t-2 transition-colors hover:border-x-primary/40 hover:border-b-primary/40",
            guest ? "border-t-primary/40" : TIER_BORDER[matchTier(match.score)]
          )}
        >
          <CardHeader>
            <div className="flex items-start justify-between gap-2 pr-10">
              <CardTitle className="text-base leading-snug">
                {university.name}
              </CardTitle>
              {!guest && <MatchScoreBadge score={match.score} />}
            </div>
            <CardDescription className="flex items-center gap-1.5">
              <Flag country={university.country} />
              {/* City and state tell apart US colleges with the same name
                  (there are several "Bethel University"s). */}
              {university.city && university.state
                ? `${university.city}, ${university.state}`
                : university.country}
              <span className={cn("ml-auto", guest && "hidden")}>
                <ChanceBadge
                  chance={match.chance}
                  source={match.chanceSource}
                  probability={prediction?.probability}
                />
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {rank && !guest && (
              <div className="space-y-1 border-l-2 border-primary/40 pl-3 text-sm">
                {match.chanceSource === "model" && prediction && (
                  <p className="font-medium">
                    ~{Math.round(prediction.probability * 100)}% chance{" "}
                    <span className="font-normal text-muted-foreground">(estimate, not a promise)</span>
                  </p>
                )}
                <p className="text-muted-foreground">{rank.reason}</p>
              </div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Data</span>
              <SourceBadge university={university} />
            </div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">Tuition</span>
              <span className="font-medium" title={tuition.note ?? undefined}>
                {tuition.text}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3 text-sm">
              <span className="shrink-0 text-muted-foreground" title={STRENGTH_LABEL}>
                Strength
              </span>
              <StrengthValue university={university} />
            </div>
            {/* Co-op next to strength: only from the school's own page, so
                most schools honestly say "Not available". */}
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="shrink-0 text-muted-foreground">Co-op</span>
              <span
                className={cn(university.coop_program && university.coop_program !== "unknown" ? "font-medium" : "text-muted-foreground")}
                title={COOP_LABELS[university.coop_program ?? "unknown"]}
              >
                {COOP_SHORT_LABELS[university.coop_program ?? "unknown"]}
              </span>
            </div>
            {/* A ranking only when someone entered it from the ranking's own page. */}
            {ranking && ranking.rank !== null && hasVerifiedRanking(university) && (
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-muted-foreground">Ranking ({ranking.label})</span>
                <span className="font-medium">
                  {formatRank(ranking.rank)} <span className="text-xs font-normal text-muted-foreground">(from its source)</span>
                </span>
              </div>
            )}
            <CampusLifeLines university={university} selected={selectedCampusKinds(match.factors.map((f) => f.key))} />
            {visa && <VisaNote visa={visa} />}
            <StrengthsConcerns explanation={explanation} limit={2} />
            {/* Leaves room for the controls pinned to the bottom corners. */}
            {(compare || tracking) && <div className="h-6" />}
          </CardContent>
        </Card>
      </Link>

      {/* Like the save button, these are siblings of the Link, not inside it. */}
      {tracking && (
        <div className="absolute bottom-3 left-4 z-10">
          <ApplicationStatusControl
            universityId={university.id}
            application={tracking.application}
          />
        </div>
      )}
      {compare && (
        <label
          className={cn(
            "absolute right-4 bottom-3 z-10 flex items-center gap-1.5 text-xs text-muted-foreground",
            compare.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
          )}
        >
          <input
            type="checkbox"
            checked={compare.selected}
            disabled={compare.disabled}
            onChange={compare.onToggle}
            className="size-3.5 accent-primary"
          />
          Compare
        </label>
      )}
    </motion.div>
  );
}
