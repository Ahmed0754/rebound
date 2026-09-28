// The Gemini client, and the one question this app asks it: pick three
// exercises and dose them. Sits beside db.ts because it is the other place
// data comes from.

import { GoogleGenAI, Type } from "@google/genai";
import type { Exercise } from "./exercises.js";
import type { RegimeItem } from "../types/index.js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const model = process.env.GEMINI_MODEL ?? "gemini-3.7-flash";

// Named for the vendor so it does not shadow TypeScript's built-in `Pick<T, K>`.
type GeminiPick = { exerciseId: string; sets: number; reps: number };

/**
 * Asks Gemini to pick three of `candidates` and assign sets/reps. Every id it
 * returns is checked back against `candidates`, so it cannot invent an exercise.
 */
export async function pickExercises(muscle: string, candidates: Exercise[]): Promise<RegimeItem[]> {
  // Send only what it needs to choose; the full rows stay here to rebuild from.
  const shortlist = candidates.map(({ id, name, description }) => ({ id, name, description }));

  const response = await ai.models.generateContent({
    model,
    contents: `A user says their "${muscle}" hurts. From this list of exercises, pick exactly 3 and assign sets and reps for each:\n\n${JSON.stringify(
      shortlist
    )}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          picks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                exerciseId: { type: Type.STRING },
                sets: { type: Type.INTEGER },
                reps: { type: Type.INTEGER },
              },
              required: ["exerciseId", "sets", "reps"],
            },
          },
        },
        required: ["picks"],
      },
    },
  });

  const picks = (JSON.parse(response.text ?? "{}") as { picks?: GeminiPick[] }).picks ?? [];
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));

  return picks
    // An id we never sent means Gemini invented it, so the pick is dropped.
    .filter((pick) => byId.has(pick.exerciseId))
    // Three is all the page shows.
    .slice(0, 3)
    .map((pick) => ({ ...byId.get(pick.exerciseId)!, sets: pick.sets, reps: pick.reps }));
}
