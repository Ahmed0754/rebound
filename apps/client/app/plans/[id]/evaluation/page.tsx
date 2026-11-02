"use client";

//How one plan was judged: every code check the eval runs, the LLM judge's
//verdicts with its reasons, the exact prompts it was sent and what it said
//back, and the published source behind each grade. Run live on request, so
//this is the judge working now, on this plan.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { EvaluationReport } from "@/components/evaluation-report";
import { AccountError, BackLink, ErrorMessage, Loading } from "@/components/ui";
import { evaluateRegime, messageOf, type Evaluation } from "@/lib/api";
import { useRequiredUser } from "@/lib/current-user";

type Run =
  | { status: "idle" }
  | { status: "running"; since: number }
  | { status: "error"; message: string }
  | { status: "done"; result: Evaluation };

//Seconds since the run started, so a 10-second wait reads as work, not a hang.
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, []);

  return <>{((now - since) / 1000).toFixed(1)}s</>;
}

export default function EvaluationPage() {
  const { id } = useParams<{ id: string }>();
  const { user, token, error: accountError } = useRequiredUser();
  const [run, setRun] = useState<Run>({ status: "idle" });

  if (accountError) {
    return (
      <main className="page">
        <AccountError message={accountError} />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="page">
        <Loading />
      </main>
    );
  }

  async function start() {
    if (!token) return;

    setRun({ status: "running", since: Date.now() });

    try {
      setRun({ status: "done", result: await evaluateRegime(token, id) });
    } catch (e) {
      setRun({ status: "error", message: messageOf(e) });
    }
  }

  const running = run.status === "running";

  return (
    <main className="page page-wide">
      <BackLink href={`/plans/${id}`}>Back to the plan</BackLink>

      <h1>How this plan was judged</h1>
      <p className="lead">
        Each run grades the plan with the same code checks the eval uses, then asks the LLM judge two questions: does
        each exercise suit you, and do the rationales stay safe. You see what it was sent, what it answered, and the
        published source behind every criterion. It makes two Gemini calls and saves nothing.
      </p>

      <div className="row" style={{ marginBottom: 20 }}>
        <button type="button" className="btn btn-primary" onClick={start} disabled={running}>
          {running ? "Judging…" : run.status === "done" ? "Run the judge again" : "Run the judge"}
        </button>
        {run.status === "running" && (
          <span className="muted small">
            Grading in code, then asking the judge about the picks and the rationales… <Elapsed since={run.since} />
          </span>
        )}
      </div>

      {run.status === "error" && <ErrorMessage>{run.message}</ErrorMessage>}
      {run.status === "done" && <EvaluationReport e={run.result} />}
    </main>
  );
}
