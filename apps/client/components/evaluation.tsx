"use client";

// The pieces the evaluation page is built from. Everything here only shows
// what the server sent: no grade is worked out in the browser.

import { createContext, useContext, type ReactNode } from "react";
import type { JudgeCall, ReferenceRow } from "@/lib/api";

// The source ids the page has a row for, so a mention of one can link to it.
export const KnownSources = createContext<Set<string>>(new Set());

// REFERENCES.md's own inline markdown: `code`, **bold**, *italic*, [links](…)
// and bare URLs. Nothing block-level - every cell is one line.
const TOKEN = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s)|]+)/g;

export function Md({ text }: { text: string }) {
  const known = useContext(KnownSources);
  const parts = text.split(TOKEN);

  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;

        if (part.startsWith("`")) {
          const inner = part.slice(1, -1);
          return known.has(inner) ? <SourceLink key={i} id={inner} /> : <code key={i}>{inner}</code>;
        }

        if (part.startsWith("**"))
          return (
            <strong key={i}>
              <Md text={part.slice(2, -2)} />
            </strong>
          );

        if (part.startsWith("*"))
          return (
            <em key={i}>
              <Md text={part.slice(1, -1)} />
            </em>
          );

        if (part.startsWith("[")) {
          const [, label, href] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part)!;
          // Links between the repo's own files go nowhere from a browser.
          return href.startsWith("http") ? (
            <a key={i} href={href} target="_blank" rel="noreferrer">
              <Md text={label} />
            </a>
          ) : (
            <Md key={i} text={label} />
          );
        }

        // A bare URL, minus any full stop or comma the sentence ended on.
        const url = part.replace(/[.,;]+$/, "");
        return (
          <span key={i}>
            <a href={url} target="_blank" rel="noreferrer" className="url">
              {url}
            </a>
            {part.slice(url.length)}
          </span>
        );
      })}
    </>
  );
}

export function SourceLink({ id }: { id: string }) {
  return (
    <a className="src" href={`#src-${id}`}>
      {id}
    </a>
  );
}

export function Sources({ ids }: { ids: string[] }) {
  return (
    <span className="src-list">
      {ids.map((id) => (
        <SourceLink key={id} id={id} />
      ))}
    </span>
  );
}

const BADGES: Record<string, [label: string, tone: string]> = {
  met: ["Met", "good"],
  missed: ["Missed", "bad"],
  not_applicable: ["Doesn't apply", "neutral"],
  unsatisfiable: ["No candidate could", "neutral"],
  judge_failed: ["Judge failed", "bad"],
  suits: ["Suits", "good"],
  questionable: ["Questionable", "warn"],
  unsuitable: ["Unsuitable", "bad"],
  pass: ["Pass", "good"],
  fail: ["Fail", "bad"],
};

export function Badge({ value }: { value: string | null }) {
  if (value === null) return <span className="badge badge-neutral">—</span>;

  const [label, tone] = BADGES[value] ?? [value, "neutral"];
  return <span className={`badge badge-${tone}`}>{label}</span>;
}

// A row from REFERENCES.md, cell by cell, under the headings it sits in.
export function Reference({ row, label = "What REFERENCES.md says" }: { row: ReferenceRow | null; label?: string }) {
  if (row === null) return null;

  return (
    <details className="ref">
      <summary>
        {label}{" "}
        <span className="muted">
          · §{row.section}
          {row.subsection ? ` › ${row.subsection.replace(/`/g, "")}` : ""}
        </span>
      </summary>
      <dl className="ref-cells">
        {Object.entries(row.cells).map(([header, value]) => (
          <div key={header}>
            <dt>{header}</dt>
            <dd>
              <Md text={value} />
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

// The judge's answer as it came back, indented when it is JSON.
function pretty(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export function CallView<T>({ title, call, children }: { title: string; call: JudgeCall<T>; children?: ReactNode }) {
  const ok = call.result !== null;
  const ms = call.attempts.reduce((sum, attempt) => sum + attempt.ms, 0);

  return (
    <section className="card">
      <h3>
        {title} <Badge value={ok ? "pass" : "fail"} />
      </h3>
      <p className="small muted" style={{ marginTop: 0 }}>
        <code>{call.request.model}</code> · temperature {call.request.temperature ?? "default"} · {call.attempts.length}{" "}
        attempt{call.attempts.length === 1 ? "" : "s"} · {(ms / 1000).toFixed(1)}s
        {ok ? "" : " · no answer parsed, so nothing below came from this call"}
      </p>
      {children}

      <details className="call" open>
        <summary>System instruction</summary>
        <pre>{call.request.system}</pre>
      </details>
      <details className="call" open>
        <summary>Message sent</summary>
        <pre>{call.request.contents}</pre>
      </details>
      <details className="call">
        <summary>Response schema it had to answer in</summary>
        <pre>{JSON.stringify(call.request.responseSchema, null, 2)}</pre>
      </details>

      {call.attempts.map((attempt, i) => (
        <details className="call" key={i} open>
          <summary>
            Attempt {i + 1}: {attempt.error ? "failed" : "answered"} in {(attempt.ms / 1000).toFixed(1)}s
          </summary>
          {attempt.error && <p className="error small">{attempt.error}</p>}
          {attempt.raw !== null && <pre>{pretty(attempt.raw)}</pre>}
        </details>
      ))}
    </section>
  );
}
