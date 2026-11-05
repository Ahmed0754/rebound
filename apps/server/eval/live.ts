// The eval's graders and judge, run on one saved regime instead of a fixture,
// with everything shown: what each check made of the plan, the exact requests
// the judge was sent and its raw answers, and the REFERENCES.md row behind
// every criterion, benchmark and source a grade names.
//
// For looking at, not for measuring. One plan proves nothing about the
// judge, and nothing here is saved: the judge is asked again on every call.
// The offline harness (judge-report.ts) is still where scores come from.
//
// Differences from the offline run, each shown beside what it affects:
//  - the candidates are every exercise the answers allow in today's
//    catalogue, not the 20 the generator was shown, which were never kept.
//    "Unsatisfiable" means no allowed exercise could meet a criterion.
//  - a plan edited since it was made is graded as it stands now. The record
//    from generation describes the plan as it was made.

import type { GenerateContentParameters } from "@google/genai";
import { firedRules, getLimits, type Answers, type Limits } from "../src/clinical.js";
import { getCandidates, type Candidate } from "../src/models/exercises.js";
import { ai, MODEL } from "../src/models/gemini.js";
import type { Onboarding } from "../src/models/onboarding.js";
import { toCandidateQuery, type Quality, type Regime } from "../src/models/regimes.js";
import { CRITERIA, type QualityResult } from "../src/quality.js";
import { grade, PROVISIONAL, rubric, RUBRIC_VERSION } from "./graders.js";
import {
  buildPlanJudgeRequest,
  buildRationaleJudgeRequest,
  JUDGE_MODEL,
  JUDGE_VERSION,
  parsePlanJudgement,
  parseRationaleJudgement,
  SAFETY,
  type JudgeCase,
  type PlanJudgement,
  type RationaleJudgement,
} from "./judge.js";
import { expandSources, loadReferences, sourcesIn, type Row } from "./reference-index.js";

// The §2 row each benchmark compares with, by its parameter name there.
const BENCHMARK_ROWS: Record<string, string> = {
  "BENCH-HOLD": "Static stretch hold",
  "BENCH-REPS": "Strength reps",
  "BENCH-SETS": "Sets",
};

type Outcome = "met" | "missed" | "not_applicable" | "unsatisfiable";

function outcomeOf(result: QualityResult, id: string): Outcome | null {
  if (result.met.includes(id)) return "met";
  if (result.missed.includes(id)) return "missed";
  if (result.notApplicable.includes(id)) return "not_applicable";
  if (result.unsatisfiable.includes(id)) return "unsatisfiable";
  return null;
}

/** One question put to the judge: exactly what was sent, and every answer that came back. */
export type JudgeCall<T> = {
  request: {
    model: string;
    system: string;
    contents: string;
    temperature: number | undefined;
    responseSchema: unknown;
  };
  attempts: { ms: number; raw: string | null; error: string | null }[];
  // Null when no attempt gave an answer that parsed.
  result: T | null;
};

// Two attempts, as judge-report.ts gives it: a malformed answer is a failed
// judgement, never a partial one, and one retry is cheap.
async function ask<T>(request: GenerateContentParameters, parse: (text: string) => T): Promise<JudgeCall<T>> {
  const attempts: JudgeCall<T>["attempts"] = [];
  let result: T | null = null;

  for (let attempt = 1; attempt <= 2 && result === null; attempt++) {
    const started = Date.now();
    let raw: string | null = null;

    try {
      const response = await ai.models.generateContent(request);
      raw = response.text ?? "{}";
      result = parse(raw);
      attempts.push({ ms: Date.now() - started, raw, error: null });
    } catch (caught) {
      attempts.push({ ms: Date.now() - started, raw, error: String(caught) });
    }
  }

  return {
    request: {
      model: request.model,
      system: String(request.config?.systemInstruction ?? ""),
      contents: String(request.contents),
      temperature: request.config?.temperature,
      responseSchema: request.config?.responseSchema,
    },
    attempts,
    result,
  };
}

export async function evaluate(input: {
  regime: Regime;
  // What the quality checks made of it when it was generated.
  quality: Quality | null;
  onboarding: Onboarding;
  // Whether the regime recorded this questionnaire, or it was matched by
  // account, region and time because the regime predates recording it.
  link: "recorded" | "inferred";
}) {
  const started = Date.now();
  const { regime, quality, onboarding } = input;
  const answers: Answers = onboarding.answers;
  const region = answers.region;
  const limits: Limits = regime.limits ?? getLimits(answers);
  const [pool, references] = await Promise.all([
    getCandidates(toCandidateQuery(answers, limits)),
    loadReferences(),
  ]);
  const candidates: Candidate[] = pool ?? [];
  const tags = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const context = { region, answers, limits };
  const items = regime.regime;

  const graded = grade(items, candidates, context);

  // Only the provisional criteria code can't answer go to the judge, as in
  // judge-report.ts: the rest are graded once, in code.
  const judgeCriteria = PROVISIONAL.filter((c) => c.meets === undefined && c.appliesTo(context)).map(
    ({ id, says }) => ({ id, says })
  );
  const judgeCase: JudgeCase = {
    region,
    answers,
    freeText: onboarding.note.freeText,
    limits,
    items,
    tags,
    criteria: judgeCriteria,
  };
  const hasRationales = items.some((item) => item.rationale);

  const [planCall, rationaleCall] = await Promise.all([
    ask<PlanJudgement>(buildPlanJudgeRequest(judgeCase), (text) => parsePlanJudgement(text, judgeCase)),
    hasRationales
      ? ask<RationaleJudgement>(buildRationaleJudgeRequest(judgeCase), parseRationaleJudgement)
      : Promise.resolve(null),
  ]);

  const plan = planCall.result;
  const rationales = rationaleCall?.result ?? null;
  const cited = new Set<string>();
  const cite = (ids: string[]) => {
    const expanded = expandSources(ids, references);
    expanded.forEach((id) => cited.add(id));
    return expanded;
  };
  const criterionRow = (id: string): Row | null => references.criteria[id] ?? null;
  const citeRow = (row: Row | null) => {
    if (row !== null) {
      cite(sourcesIn(Object.values(row.cells).join(" "), references));
    }
    return row;
  };

  const live = CRITERIA.map((criterion) => ({
    id: criterion.id,
    ask: criterion.ask,
    sources: cite(criterion.sources),
    outcome: outcomeOf(graded.quality, criterion.id),
    atGeneration: quality === null ? null : outcomeOf(quality, criterion.id),
    missedFirst: quality?.firstMissed.includes(criterion.id) ?? false,
    reference: citeRow(criterionRow(criterion.id)),
  }));

  const provisional = PROVISIONAL.map((criterion) => {
    const judged = plan?.criteria.find((verdict) => verdict.id === criterion.id) ?? null;
    const applies = criterion.appliesTo(context);
    let outcome: Outcome | "judge_failed" | null;

    if (criterion.meets !== undefined) {
      outcome = outcomeOf(graded.provisional, criterion.id);
    } else if (!applies) {
      outcome = "not_applicable";
    } else {
      outcome = judged?.verdict ?? "judge_failed";
    }

    return {
      id: criterion.id,
      says: criterion.says,
      sources: cite(criterion.sources),
      gradedBy: criterion.meets === undefined ? ("judge" as const) : ("code" as const),
      outcome,
      judgeReason: judged?.reason ?? null,
      reference: citeRow(criterionRow(criterion.id)),
    };
  });

  const benchmarkSources = new Map(rubric().benchmarks.map((b) => [b.id, b.sources]));
  const benchmarks = rubric().benchmarks.map(({ id }) => {
    const row = references.benchmarks[BENCHMARK_ROWS[id]] ?? null;
    return {
      id,
      sources: cite(benchmarkSources.get(id) ?? []),
      notes: graded.benchmarks.filter((note) => note.id === id).map(({ exercise, note }) => ({ exercise, note })),
      reference: citeRow(row),
    };
  });

  const safety = SAFETY.map((statement) => {
    const judged = rationales?.safety.find((verdict) => verdict.id === statement.id) ?? null;
    return {
      id: statement.id,
      says: statement.says,
      // SAFE-1 and SAFE-2 also run live, as keyword checks in clinical.ts;
      // their failures are among the hard checks.
      liveCheck: statement.id === "SAFE-1" || statement.id === "SAFE-2",
      verdict: judged?.verdict ?? null,
      reason: judged?.reason ?? null,
      reference: citeRow(references.safety[statement.id] ?? null),
    };
  });

  const nameOf = new Map(items.map((item) => [item.id, item.name]));
  const picks = items.map((item) => {
    const judged = plan?.picks.find((verdict) => verdict.id === item.id) ?? null;
    const itemTags = tags.get(item.id) ?? null;
    const referencePlans = references.referencePlans.filter((row) =>
      (row.cells["Catalogue id"] ?? "").includes(`\`${item.id}\``)
    );
    referencePlans.forEach((row) => cite(sourcesIn(row.subsection ?? "", references)));

    return {
      ...item,
      tags:
        itemTags === null
          ? null
          : {
              primaryMuscles: itemTags.primaryMuscles,
              category: itemTags.category,
              level: itemTags.level,
              equipment: itemTags.equipment,
              force: itemTags.force,
              mechanic: itemTags.mechanic,
            },
      verdict: judged?.verdict ?? null,
      reason: judged?.reason ?? null,
      benchmarkNotes: graded.benchmarks.filter((note) => note.exercise === item.name),
      referencePlans,
      overlapsWith: graded.overlap
        .filter((group) => group.includes(item.id))
        .flatMap((group) => group.filter((id) => id !== item.id).map((id) => nameOf.get(id) ?? id)),
    };
  });

  return {
    regime: {
      id: regime.id,
      region,
      createdAt: regime.createdAt,
      updatedAt: regime.updatedAt,
      editedSinceGenerated: regime.updatedAt !== regime.createdAt,
    },
    questionnaire: {
      id: onboarding.id,
      link: input.link,
      createdAt: onboarding.createdAt,
      answers,
      freeText: onboarding.note.freeText,
      screening: onboarding.note.screening,
    },
    limits,
    limitsRecorded: regime.limits !== null,
    firedRules: firedRules(answers),
    pool: { size: candidates.length },
    generation: quality === null ? null : { attempts: quality.attempts, firstMissed: quality.firstMissed },
    versions: {
      generatorModel: MODEL,
      judgeModel: JUDGE_MODEL,
      judgeVersion: JUDGE_VERSION,
      rubric: RUBRIC_VERSION,
      // The same model judging its own plans may be kind to them.
      sameModel: MODEL === JUDGE_MODEL,
    },
    hard: graded.hard,
    live,
    provisional,
    picks,
    safety,
    rationalesSkipped: hasRationales ? null : "No exercise has a rationale (edited doses drop theirs), so there is nothing to judge.",
    benchmarks,
    shape: { pinned: graded.pinned, overlap: graded.overlap.map((group) => group.map((id) => nameOf.get(id) ?? id)) },
    calls: { plan: planCall, rationales: rationaleCall },
    references: {
      sources: Object.fromEntries([...cited].sort().flatMap((id) => (references.sources[id] ? [[id, references.sources[id]]] : []))),
      readLabels: references.readLabels,
    },
    ms: Date.now() - started,
  };
}

export type Evaluation = Awaited<ReturnType<typeof evaluate>>;
