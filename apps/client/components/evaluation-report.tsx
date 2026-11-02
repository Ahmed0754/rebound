"use client";

//Everything one evaluation found, laid out section by section. Only shows
//what the server sent - see apps/server/eval/live.ts for where it comes from.

import { Fragment, type ReactNode } from "react";
import { Badge, CallView, KnownSources, Md, Reference, Sources } from "@/components/evaluation";
import { ExerciseFigure } from "@/components/exercise-figure";
import { LimitsPanel } from "@/components/limits";
import type { Evaluation } from "@/lib/api";
import {
  ACTIVITY_LEVELS,
  AGE_BANDS,
  AGGRAVATORS,
  CONDITIONS,
  EQUIPMENT,
  GOALS,
  ONSETS,
  regionLabel,
  SESSION_MINUTES,
} from "@/lib/questionnaire";

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

const list = (values: string[], labels: Record<string, string>, none: string) =>
  values.length === 0 ? none : values.map((v) => labels[v] ?? v).join(", ");

//Counted from what came back, for the summary at the top.
function tally(outcomes: (string | null)[]) {
  return {
    met: outcomes.filter((o) => o === "met").length,
    applies: outcomes.filter((o) => o === "met" || o === "missed" || o === "judge_failed").length,
  };
}

function Section({ id, title, by, children }: { id: string; title: string; by: string; children: ReactNode }) {
  return (
    <section id={id} className="eval-section">
      <h2>
        {title} <span className="by">{by}</span>
      </h2>
      {children}
    </section>
  );
}

//Criteria for other regions, or that these limits rule out, folded away
//behind one line so the ones that asked something of this plan lead.
function Folded({ count, region, children }: { count: number; region: string; children: ReactNode }) {
  if (count === 0) return null;

  return (
    <details className="folded">
      <summary className="small muted">
        {count} more that don&rsquo;t apply to a {region} plan with these limits
      </summary>
      {children}
    </details>
  );
}

export function EvaluationReport({ e }: { e: Evaluation }) {
  const known = new Set(Object.keys(e.references.sources));
  const live = tally(e.live.map((c) => c.outcome));
  const provisional = tally(e.provisional.map((c) => c.outcome));
  const flagged = e.picks.filter((p) => p.verdict !== null && p.verdict !== "suits").length;
  const judgedPicks = e.picks.filter((p) => p.verdict !== null).length;
  const safety = e.safety.filter((s) => s.verdict !== null);
  const { answers } = e.questionnaire;

  return (
    <KnownSources.Provider value={known}>
      {/* The headline numbers, then everything that qualifies them. */}
      <section className="card">
        <div className="stats">
          <div>
            <span className="stat">{e.hard.length === 0 ? "Pass" : `${e.hard.length} failed`}</span>
            <span className="stat-label">Hard checks</span>
          </div>
          <div>
            <span className="stat">
              {live.met}/{live.applies}
            </span>
            <span className="stat-label">Enforced criteria met</span>
          </div>
          <div>
            <span className="stat">
              {provisional.met}/{provisional.applies}
            </span>
            <span className="stat-label">Provisional criteria met</span>
          </div>
          <div>
            <span className="stat">{judgedPicks === 0 ? "—" : `${flagged} of ${judgedPicks}`}</span>
            <span className="stat-label">Picks the judge flagged</span>
          </div>
          <div>
            <span className="stat">
              {safety.length === 0 ? "—" : `${safety.filter((s) => s.verdict === "met").length}/${safety.length}`}
            </span>
            <span className="stat-label">Safety statements kept</span>
          </div>
          <div>
            <span className="stat">{(e.ms / 1000).toFixed(1)}s</span>
            <span className="stat-label">This run</span>
          </div>
        </div>

        <ul className="caveats small">
          <li>
            <strong>Every judge score is provisional</strong> until an expert review calibrates the judge (judge{" "}
            {e.versions.judgeVersion}, rubric {e.versions.rubric}).
          </li>
          {e.versions.sameModel && (
            <li>
              The judge is the same model that made the plan (<code>{e.versions.judgeModel}</code>), so it may be kind
              to it. Set <code>GEMINI_JUDGE_MODEL</code> to use another.
            </li>
          )}
          {e.questionnaire.link === "inferred" && (
            <li>
              This plan was made before plans recorded their questionnaire, so it was matched to your latest{" "}
              {e.regime.region} questionnaire from before it (saved {when(e.questionnaire.createdAt)}).
            </li>
          )}
          {e.regime.editedSinceGenerated && (
            <li>
              The doses were edited after the plan was made. Everything is graded as the plan stands now; the generation
              record describes it as it was made, and edited exercises lose their rationale.
            </li>
          )}
          {!e.limitsRecorded && (
            <li>This plan predates recorded limits, so they were worked out again from the answers.</li>
          )}
          <li>
            &ldquo;No candidate could&rdquo; is checked against all {e.pool.size} exercises your answers allow today,
            not the 20 the AI was shown, which weren&rsquo;t kept.
          </li>
        </ul>
      </section>

      <nav className="toc small">
        <a href="#person">The person</a>
        <a href="#hard">Hard checks</a>
        <a href="#live">Enforced criteria</a>
        <a href="#provisional">Provisional criteria</a>
        <a href="#picks">Each exercise</a>
        <a href="#safety">Rationales</a>
        <a href="#benchmarks">Dose benchmarks</a>
        <a href="#shape">Shape</a>
        <a href="#calls">Judge calls</a>
        <a href="#sources">Sources</a>
      </nav>

      <Section id="person" title="Who the judge was told about" by="your questionnaire">
        <div className="card">
          <table className="limits-table">
            <tbody>
              {(
                [
                  ["Area", regionLabel(answers.region)],
                  ["Goal", GOALS[answers.goal] ?? answers.goal],
                  ["Started", ONSETS[answers.onset] ?? answers.onset],
                  ["Pain now", `${answers.painNow} of 10`],
                  ["Makes it worse", list(answers.aggravators, AGGRAVATORS, "Nothing listed")],
                  ["Age", AGE_BANDS[answers.ageBand] ?? answers.ageBand],
                  ["Conditions", list(answers.conditions, CONDITIONS, "None")],
                  ["Equipment", list(answers.equipment, EQUIPMENT, "None")],
                  ["Activity", ACTIVITY_LEVELS[answers.activityLevel] ?? answers.activityLevel],
                  ["Session", SESSION_MINUTES[answers.sessionMinutes] ?? `${answers.sessionMinutes} minutes`],
                  ["Note", e.questionnaire.freeText ?? "None"],
                  ["Note screening", e.questionnaire.screening],
                  ["Rules that fired", e.firedRules.length === 0 ? "None" : e.firedRules.join(", ")],
                ] as [string, string][]
              ).map(([label, value]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small muted" style={{ marginBottom: 0 }}>
            The judge never sees which maker built the plan. The note is sent between <code>&lt;user_note&gt;</code>{" "}
            tags and it&rsquo;s told the note is information, never instructions.
          </p>
        </div>
        <LimitsPanel limits={e.limits} title="The limits it was graded inside" />
      </Section>

      <Section id="hard" title="Hard checks" by="code · would block saving">
        <div className="card">
          {e.hard.length === 0 ? (
            <p style={{ margin: 0 }}>
              <Badge value="pass" /> Every dose is inside the limits, every exercise is one your answers allow, and no
              rationale tells you to push through pain or claims to heal anything.
            </p>
          ) : (
            <ul className="plain-list stack">
              {e.hard.map((problem) => (
                <li key={problem}>
                  <Badge value="fail" /> {problem}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      <Section id="live" title="Enforced quality criteria" by="code · checked live before saving">
        <p className="small muted">
          {e.generation === null
            ? "This plan has no generation record, so there's no first-try or at-generation column to compare."
            : `At generation it took ${e.generation.attempts} attempt${e.generation.attempts === 1 ? "" : "s"}. ${
                e.generation.firstMissed.length === 0
                  ? "The first plan that passed the hard checks already met every criterion."
                  : `The first plan that passed the hard checks missed ${e.generation.firstMissed.join(", ")}, and the AI was told so on the retry.`
              }`}
        </p>
        {[true, false].map((applies) => {
          const shown = e.live.filter((c) => (c.outcome !== "not_applicable") === applies);
          const cards = shown.map((c) => (
            <div key={c.id} className="card criterion">
              <div className="criterion-head">
                <code className="crit-id">{c.id}</code>
                <Badge value={c.outcome} />
                {e.generation !== null && c.atGeneration !== c.outcome && (
                  <span className="small muted">at generation: {c.atGeneration ?? "—"}</span>
                )}
                {c.missedFirst && <span className="small muted">missed on the first try</span>}
              </div>
              <p className="criterion-text">{c.reference ? <Md text={c.reference.cells.Criterion} /> : c.ask}</p>
              <p className="small muted">
                Asked of the AI on a miss: &ldquo;{c.ask}&rdquo; · <Sources ids={c.sources} />
              </p>
              <Reference row={c.reference} />
            </div>
          ));
          return applies ? (
            <Fragment key="applies">{cards}</Fragment>
          ) : (
            <Folded key="na" count={shown.length} region={e.regime.region}>
              {cards}
            </Folded>
          );
        })}
      </Section>

      <Section id="provisional" title="Provisional criteria" by="code or the judge · offline only">
        <p className="small muted">
          Each extrapolates from a guideline about one condition to everyone with pain here, so nothing ever retried for
          them. Code grades the ones the catalogue&rsquo;s tags can answer. The judge grades the rest.
        </p>
        {[true, false].map((applies) => {
          const shown = e.provisional.filter((c) => (c.outcome !== "not_applicable") === applies);
          const cards = shown.map((c) => (
            <div key={c.id} className="card criterion">
              <div className="criterion-head">
                <code className="crit-id">{c.id}</code>
                <Badge value={c.outcome} />
                <span className={`by-pill by-${c.gradedBy}`}>
                  {c.gradedBy === "judge" ? "graded by the judge" : "graded in code"}
                </span>
              </div>
              <p className="criterion-text">{c.says}</p>
              {c.judgeReason && (
                <blockquote className="judge-says">
                  <span className="judge-label">Judge:</span> {c.judgeReason}
                </blockquote>
              )}
              <p className="small muted">
                <Sources ids={c.sources} />
              </p>
              <Reference row={c.reference} />
            </div>
          ));
          return applies ? (
            <Fragment key="applies">{cards}</Fragment>
          ) : (
            <Folded key="na" count={shown.length} region={e.regime.region}>
              {cards}
            </Folded>
          );
        })}
      </Section>

      <Section id="picks" title="The judge on each exercise" by="the judge · blind">
        <p className="small muted">
          Asked whether each exercise suits you, from what the exercise is and how it&rsquo;s done. The judge is shown
          the exercises sorted by name, without doses or rationales, so nothing gives away who made the plan.
        </p>
        {e.picks.map((p) => (
          <div key={p.id} className="card">
            <div className="criterion-head">
              <span className="exercise-name">{p.name}</span>
              <Badge value={p.verdict ?? (e.calls.plan.result === null ? "judge_failed" : null)} />
            </div>
            <p className="dose">
              {p.sets} set{p.sets === 1 ? "" : "s"} × {p.unit === "hold" ? `${p.holdSeconds}s hold` : `${p.reps} reps`}
            </p>
            {p.reason && (
              <blockquote className="judge-says">
                <span className="judge-label">Judge:</span> {p.reason}
              </blockquote>
            )}
            {p.rationale && (
              <p className="rationale">
                <span className="muted">Why the AI picked it:</span> {p.rationale}
              </p>
            )}
            {p.tags && (
              <p className="small muted">
                Catalogue tags: {p.tags.category} · {p.tags.level} · {p.tags.primaryMuscles.join(", ")} ·{" "}
                {p.tags.equipment ?? "body only"}
                {p.tags.force && ` · ${p.tags.force}`}
                {p.tags.mechanic && ` · ${p.tags.mechanic}`}
              </p>
            )}
            {p.benchmarkNotes.map((n) => (
              <p key={n.id} className="notice small">
                <code>{n.id}</code> {n.note}
              </p>
            ))}
            {p.overlapsWith.length > 0 && (
              <p className="notice small">Looks like the same movement as {p.overlapsWith.join(", ")}.</p>
            )}
            {p.referencePlans.map((row, i) => (
              <p key={i} className="small">
                In the <Md text={row.subsection ?? ""} /> reference plan as{" "}
                <strong>{row.cells["AAOS exercise"]}</strong>, dosed {row.cells["AAOS dose"]} · match:{" "}
                <Md text={row.cells.Match} />
              </p>
            ))}
            <ExerciseFigure exerciseId={p.id} name={p.name} />
          </div>
        ))}
      </Section>

      <Section id="safety" title="The judge on the rationales" by="the judge · REFERENCES.md §4">
        {e.rationalesSkipped ? (
          <p className="card muted">{e.rationalesSkipped}</p>
        ) : (
          e.safety.map((s) => (
            <div key={s.id} className="card criterion">
              <div className="criterion-head">
                <code className="crit-id">{s.id}</code>
                <Badge value={s.verdict ?? "judge_failed"} />
                {s.liveCheck && <span className="by-pill by-code">also a live keyword check</span>}
              </div>
              <p className="criterion-text">{s.says}</p>
              {s.reason && (
                <blockquote className="judge-says">
                  <span className="judge-label">Judge:</span> {s.reason}
                </blockquote>
              )}
              <Reference row={s.reference} />
            </div>
          ))
        )}
      </Section>

      <Section id="benchmarks" title="Dose benchmarks" by="code · notes, not failures">
        <p className="small muted">
          Where a dose sits outside what the sources prescribe. Rebound is often stricter on purpose, so these are never
          marked down.
        </p>
        {e.benchmarks.map((b) => (
          <div key={b.id} className="card criterion">
            <div className="criterion-head">
              <code className="crit-id">{b.id}</code>
              <Badge value={b.notes.length === 0 ? "pass" : null} />
              {b.notes.length > 0 && <span className="small muted">{b.notes.length} outside the sources</span>}
            </div>
            {b.notes.map((n) => (
              <p key={n.exercise} className="notice small">
                <strong>{n.exercise}</strong>: {n.note}
              </p>
            ))}
            <p className="small muted">
              <Sources ids={b.sources} />
            </p>
            <Reference row={b.reference} />
          </div>
        ))}
      </Section>

      <Section id="shape" title="Shape" by="code">
        <div className="card">
          <p style={{ marginTop: 0 }}>
            <Badge value={e.shape.pinned ? "fail" : "pass"} />{" "}
            {e.shape.pinned
              ? "Every exercise is dosed at its ceiling for both sets and reps or hold."
              : "Not every dose is pinned at its ceiling."}
          </p>
          <p style={{ marginBottom: 0 }}>
            <Badge value={e.shape.overlap.length > 0 ? "fail" : "pass"} />{" "}
            {e.shape.overlap.length === 0
              ? "No two exercises look like the same movement."
              : `Same movement, going by category, force, mechanic and main muscle: ${e.shape.overlap.map((g) => g.join(" and ")).join("; ")}.`}
          </p>
        </div>
      </Section>

      <Section id="calls" title="What the judge was sent, and what it said" by="raw">
        <CallView title="Question 1: the exercises, blind" call={e.calls.plan} />
        {e.calls.rationales ? (
          <CallView title="Question 2: the rationales" call={e.calls.rationales} />
        ) : (
          <p className="card muted">Question 2 wasn&rsquo;t asked: {e.rationalesSkipped}</p>
        )}
      </Section>

      <Section id="sources" title="Sources" by="REFERENCES.md §1">
        <p className="small muted">
          Every source a criterion, statement or benchmark on this page credits. Nothing in REFERENCES.md is clinically
          reviewed yet.
        </p>
        <div className="card">
          <dl className="ref-cells">
            {e.references.readLabels.map((row) => (
              <div key={row.cells.Label}>
                <dt>
                  <Md text={row.cells.Label} />
                </dt>
                <dd>
                  <Md text={row.cells.Meaning} />{" "}
                  <span className="muted">Can support: {row.cells["What it can support"]}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
        {Object.entries(e.references.sources).map(([sourceId, row]) => (
          <div key={sourceId} id={`src-${sourceId}`} className="card source">
            <div className="criterion-head">
              <code className="crit-id">{sourceId}</code>
              <span className="small muted">{row.subsection}</span>
            </div>
            <dl className="ref-cells">
              {Object.entries(row.cells)
                .filter(([header]) => header !== "Id")
                .map(([header, value]) => (
                  <div key={header}>
                    <dt>{header}</dt>
                    <dd>
                      <Md text={value} />
                    </dd>
                  </div>
                ))}
            </dl>
          </div>
        ))}
      </Section>
    </KnownSources.Provider>
  );
}
