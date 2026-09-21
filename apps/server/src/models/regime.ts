//This is buisness logic (buildRegime)
//Asks data model for candidates, then sends to GEMINI with a forced shchema

import { GoogleGenAI, Type } from "@google/genai";
import { findByRegion, type Exercise } from "./exercises.js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const model = process.env.GEMINI_MODEL ?? "gemini-3.7-flash";

export type RegimeItem = {
  id: string;
  name: string;
  bodyRegion: string;
  description: string;
  sets: number;
  reps: number;
};

/**
 * Finds the exercises stored for a body region and asks Gemini to pick three
 * and assign sets/reps. Gemini only ever chooses from the rows we hand it, and
 * every id it returns is checked back against those rows before it reaches the
 * caller, so it cannot invent an exercise.
 */
export async function buildRegime(muscle: string): Promise<RegimeItem[]> {
  const candidates = await findByRegion(muscle);

  if (candidates.length === 0) {
    return [];
  }

  // Send Gemini only what it needs to choose. Holding back everything else
  // keeps the prompt small and leaves us the full rows to rebuild from.
  const shortlist: { id: string; name: string; description: string }[] = [];

  for (const candidate of candidates) {
    shortlist.push({
      id: candidate.id,
      name: candidate.name,
      description: candidate.description,
    });
  }

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

  const parsed = JSON.parse(response.text ?? "{}") as {
    picks?: { exerciseId: string; sets: number; reps: number }[];
  };

  // Look-up table so a returned id can be traded back for the real row.
  const byId = new Map<string, Exercise>();

  for (const candidate of candidates) {
    byId.set(candidate.id, candidate);
  }

  const picks = parsed.picks ? parsed.picks : [];
  const regime: RegimeItem[] = [];

  for (const pick of picks) {
    // Three is all the page shows, so stop once we have them.
    if (regime.length === 3) {
      break;
    }

    const exercise = byId.get(pick.exerciseId);

    // The id was not one we handed Gemini, so it invented it. Drop the pick.
    if (exercise === undefined) {
      continue;
    }

    regime.push({
      id: exercise.id,
      name: exercise.name,
      bodyRegion: exercise.bodyRegion,
      description: exercise.description,
      sets: pick.sets,
      reps: pick.reps,
    });
  }

  return regime;
}
