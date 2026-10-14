import { ADMISSION_MODEL_INFO, type AdmissionPrediction } from "@/lib/admission-model";
import type { DegreeLevel } from "@/lib/types";

// The model's estimate plus one bar per factor, so the number can be
// explained ("SAT: +9 points") instead of just trusted.
export function AdmissionEstimate({
  prediction,
  degreeLevel,
}: {
  prediction: AdmissionPrediction | null;
  degreeLevel: DegreeLevel;
}) {
  if (!prediction) {
    return (
      <p className="text-sm text-muted-foreground">
        {degreeLevel !== "Undergraduate"
          ? "The admission estimate is only shown for undergraduate profiles: the demo model was trained on simulated undergraduate applicants."
          : "The admission estimate is only shown for schools with official College Scorecard figures: the demo model was simulated around those schools' real admission rates and SAT ranges, not illustrative or self-entered ones."}
      </p>
    );
  }

  const percent = Math.round(prediction.probability * 100);
  const biggest = Math.max(10, ...prediction.contributions.map((c) => Math.abs(c.points)));
  const { testMetrics, baselineTestMetrics } = ADMISSION_MODEL_INFO;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold">~{percent}%</span>
        <span className="text-sm text-muted-foreground">estimated chance of admission</span>
      </div>

      <div className="space-y-1.5">
        {prediction.contributions.map(({ label, points, known }) =>
          !known ? (
            <div key={label} className="grid grid-cols-[8.5rem_1fr_3.5rem] items-center gap-2 text-sm">
              <span className="text-muted-foreground">{label}</span>
              <span className="text-xs text-muted-foreground">no data — not counted</span>
              <span />
            </div>
          ) : (
          <div key={label} className="grid grid-cols-[8.5rem_1fr_3.5rem] items-center gap-2 text-sm">
            <span className="text-muted-foreground">{label}</span>
            {/* Two-sided bar: right of the center line raises the estimate,
                left of it lowers it. */}
            <div className="relative h-2 rounded-full bg-muted">
              <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
              <div
                className={
                  points >= 0
                    ? "animate-grow-x absolute inset-y-0 left-1/2 rounded-r-full bg-emerald-500"
                    : "animate-grow-x-from-right absolute inset-y-0 right-1/2 rounded-l-full bg-amber-500"
                }
                style={{ width: `${(Math.abs(points) / biggest) * 50}%` }}
              />
            </div>
            <span className="text-right tabular-nums">
              {points > 0 ? "+" : ""}
              {points} pts
            </span>
          </div>
          )
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Points compare you with an average applicant in the training data.
        This is a <strong>demo estimate</strong>{" "}from a logistic regression
        trained on <strong>simulated</strong>{" "}applicants built around real
        College Scorecard admission rates and SAT ranges. The applicants and
        how they were admitted are invented, so this isn&apos;t a real
        prediction — don&apos;t rely on it. On held-out simulated data it scored ROC-AUC{" "}
        {testMetrics.roc_auc.toFixed(3)} vs. {baselineTestMetrics.roc_auc.toFixed(3)}{" "}for
        the old rule of thumb.
      </p>
    </div>
  );
}
