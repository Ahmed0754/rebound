"use client";

// Showing the work: the limits the server set from someone's answers, and how
// those answers narrowed the exercise library down before the AI chose. Both
// only display what the server sent - nothing here computes a limit.

import type { CSSProperties } from "react";
import type { Funnel, Limits, Range } from "@/lib/api";

function range({ min, max }: Range, suffix = ""): string {
  return min === max ? `${max}${suffix}` : `${min}–${max}${suffix}`;
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

// The server only ever allows stretching, strength, or both.
function kinds(categories: string[]): string {
  return categories.length === 1 ? `${capitalise(categories[0])} only` : "Any";
}

// The numbers as a small table, then the reasons they are as tight as they
// are. `reasons` are already sentences written for the user.
export function LimitsPanel({ limits, title }: { limits: Limits; title: string }) {
  const rows: [string, string][] = [
    ["Exercises", range(limits.count)],
    ["Sets each", range(limits.sets)],
    ["Reps per set", range(limits.reps)],
    ["Hold time", range(limits.hold, "s")],
    ["Hardest level", capitalise(limits.difficultyCap)],
    ["Kinds", kinds(limits.categories)],
  ];

  return (
    <section className="card">
      <h2>{title}</h2>

      <table className="limits-table">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {limits.reasons.length === 0 ? (
        <p className="muted small" style={{ margin: "12px 0 0" }}>
          Nothing in your answers needed extra caution, so these are the widest limits any plan gets.
        </p>
      ) : (
        <>
          <p className="small muted" style={{ margin: "16px 0 4px" }}>
            Tighter than the widest limits because:
          </p>
          <ul className="reasons">
            {limits.reasons.map((reason) => (
              <li key={reason}>{capitalise(reason)}.</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

// The widest each range can be (ABSOLUTE in the server's clinical.ts), so a
// plan's range can be drawn as part of the whole scale.
const SCALE = {
  sets: { min: 1, max: 4 },
  reps: { min: 5, max: 15 },
  hold: { min: 15, max: 30 },
};

const LEVELS = ["beginner", "intermediate", "expert"];
const KINDS = ["stretching", "strength"];

// A range drawn as a slider: the whole scale as a track, the allowed part
// lit between two knobs. Only a picture of the numbers; nothing to drag.
function RangeBar({ label, value, scale, suffix = "" }: { label: string; value: Range; scale: Range; suffix?: string }) {
  const at = (n: number) => `${((n - scale.min) / Math.max(scale.max - scale.min, 1)) * 100}%`;

  return (
    <div className="side-panel">
      <div className="side-title">
        {label} <span>{range(value, suffix)}</span>
      </div>
      <div className="range-bar" role="img" aria-label={`${label}: ${range(value, suffix)}`}>
        <span className="range-lit" style={{ left: at(value.min), right: `calc(100% - ${at(value.max)})` }} />
        <span className="range-knob" style={{ left: at(value.min) }} />
        <span className="range-knob" style={{ left: at(value.max) }} />
      </div>
      <div className="range-ends">
        <span>
          {scale.min}
          {suffix}
        </span>
        <span>
          {scale.max}
          {suffix}
        </span>
      </div>
    </div>
  );
}

// The same limits as LimitsPanel, laid out as a column of panels for the side
// of a plan: what kinds of exercise, how hard, and how much of each.
export function LimitsSidebar({ limits }: { limits: Limits }) {
  return (
    <div className="side-stack">
      <div className="side-panel">
        <div className="side-title">Kinds of exercise</div>
        <ul className="side-options">
          {KINDS.map((kind) => {
            const on = limits.categories.includes(kind);
            return (
              <li key={kind} className={on ? "on" : undefined}>
                <span className="fake-box" aria-hidden="true" />
                {capitalise(kind)}
                <span className="sr-only">{on ? "allowed" : "not allowed"}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="side-panel">
        <div className="side-title">Hardest level</div>
        <ul className="side-options">
          {LEVELS.map((level) => {
            const on = limits.difficultyCap === level;
            return (
              <li key={level} className={on ? "on" : undefined}>
                <span className="fake-radio" aria-hidden="true" />
                {capitalise(level)}
                {on && <span className="sr-only">(the hardest allowed)</span>}
              </li>
            );
          })}
        </ul>
      </div>

      <RangeBar label="Sets each" value={limits.sets} scale={SCALE.sets} />
      <RangeBar label="Reps per set" value={limits.reps} scale={SCALE.reps} />
      <RangeBar label="Hold time" value={limits.hold} scale={SCALE.hold} suffix="s" />

      <div className="side-panel">
        <div className="side-title">Why these limits</div>
        {limits.reasons.length === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>
            Nothing in your answers needed extra caution, so these are the widest limits any plan gets.
          </p>
        ) : (
          <ul className="reasons small">
            {limits.reasons.map((reason) => (
              <li key={reason}>{capitalise(reason)}.</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// Each filter in the order the server applies it. `hint` is the hover text.
const STAGES: { key: keyof Funnel; label: string; hint: string }[] = [
  { key: "catalogue", label: "Exercises in the library", hint: "Every exercise Rebound knows." },
  { key: "region", label: "Work the area that hurts", hint: "Train the muscles around the body area you picked." },
  { key: "equipment", label: "Use only what you have", hint: "Need no equipment beyond what you said you own." },
  { key: "level", label: "At your level or easier", hint: "No harder than your activity level and limits allow." },
  { key: "category", label: "Kinds your limits allow", hint: "High pain or a recent flare-up allows stretching only." },
  { key: "aggravators", label: "Avoid what makes it worse", hint: "Leaves out movements like the ones you said aggravate it." },
  { key: "shown", label: "Shown to the AI", hint: "A random sample of what's left, for the AI to choose from." },
];

// A one-series bar list: every bar the same colour, the count at its tip, and
// widths against the whole library so the narrowing reads at a glance.
export function FunnelChart({ funnel }: { funnel: Funnel }) {
  return (
    <section className="card">
      <h2>How we narrowed it down</h2>

      <ol className="funnel">
        {STAGES.map(({ key, label, hint }) => (
          <li key={key} title={hint}>
            <span className="funnel-label">{label}</span>
            <span className="funnel-track">
              <span
                className="funnel-bar"
                style={{ "--share": funnel[key] / Math.max(funnel.catalogue, 1) } as CSSProperties}
              />
              <span className="funnel-value">{funnel[key]}</span>
            </span>
          </li>
        ))}
      </ol>

      <p className="muted small" style={{ margin: "12px 0 0" }}>
        The AI picks from these and sets the doses inside your limits. Software then checks every number and
        compares the plan with published exercise guidance. If anything falls short, the AI is told what and
        tries again, for up to 20 seconds. A plan that still breaks the limits is never saved.
      </p>
    </section>
  );
}
