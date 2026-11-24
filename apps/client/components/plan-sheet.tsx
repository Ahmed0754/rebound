// A plan laid out for paper: every exercise with its start and finish photos,
// dose, reason and steps, then the limits it was built inside and when to
// stop. Hidden on screen; the print styles in globals.css show it in place of
// the page, so "Save as PDF" in the print dialog makes a file to share.
//
// The photos load without `loading="lazy"`: a lazy image in a hidden element
// would never load, and would be missing from the PDF.

import { LimitsPanel } from "@/components/limits";
import { WhenToStop } from "@/components/when-to-stop";
import type { Regime } from "@/lib/api";
import { dose, imageUrls, steps } from "@/lib/exercises";
import { regionLabel } from "@/lib/questionnaire";

export function PlanSheet({ plan }: { plan: Regime }) {
  const region = regionLabel(plan.muscle);
  const made = new Date(plan.createdAt).toLocaleDateString(undefined, { dateStyle: "long" });
  const count = plan.regime.length;

  return (
    <article className="print-sheet">
      <header className="sheet-head">
        <span className="brand">Rebound</span>
        <h1>{region} plan</h1>
        <p>
          {count} exercise{count === 1 ? "" : "s"} · made {made}
          {plan.updatedAt !== plan.createdAt && " · doses edited since"}
        </p>
      </header>

      <ol className="sheet-list">
        {plan.regime.map((ex, i) => {
          const [start, finish] = imageUrls(ex.id);

          return (
            <li key={ex.id} className="sheet-ex">
              <div className="sheet-photos">
                <img src={start} alt={`${ex.name}, start`} />
                <img src={finish} alt={`${ex.name}, finish`} />
              </div>
              <div>
                <h2>
                  {i + 1}. {ex.name}
                </h2>
                <p className="sheet-dose">{dose(ex)}</p>
                {ex.rationale && <p className="sheet-why">{ex.rationale}</p>}
                <ol className="sheet-steps">
                  {steps(ex.description).map((step, j) => (
                    <li key={j}>{step}</li>
                  ))}
                </ol>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="sheet-foot">
        {plan.limits && <LimitsPanel limits={plan.limits} title="The limits this plan was built inside" />}
        <WhenToStop className="sheet-stop" />
      </div>

      <p className="sheet-note">
        Made with Rebound, a student project. Not medical advice: its safety limits have not been reviewed by a
        clinician.
      </p>
    </article>
  );
}
