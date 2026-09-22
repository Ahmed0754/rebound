// This is the "brain" of the app. It takes a body part, gets the matching
// exercises from the database, and asks Gemini (Google's AI) to pick 3 of
// them and decide how many sets/reps for each.

import { GoogleGenAI, Type } from "@google/genai";
import { findByRegion, type Exercise } from "./exercises.js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const model = process.env.GEMINI_MODEL ?? "gemini-3.7-flash";

// The final shape returned to the user: a real exercise plus the AI's sets/reps.
export type RegimeItem = {
  id: string;
  name: string;
  bodyRegion: string;
  description: string;
  sets: number;
  reps: number;
};

// Looks up exercises for the body part, then asks Gemini to pick 3 and assign
// sets/reps. Gemini can only choose from the exercises we send it - and we
// double check its picks against that same list before returning anything,
// so it can never make up an exercise that doesn't actually exist.
export async function buildRegime(muscle: string): Promise<RegimeItem[]> {
  const candidates = await findByRegion(muscle);

  // Nothing in the database for this body part - don't even bother asking the AI.
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

  // Ask Gemini to pick 3 exercises from the shortlist and assign sets/reps.
  // responseSchema forces Gemini to reply in exactly this shape - no free text,
  // no missing fields.
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

  // Turn Gemini's JSON text reply into a real object.
  const parsed = JSON.parse(response.text ?? "{}") as {
    picks?: { exerciseId: string; sets: number; reps: number }[];
  };

  // Look-up table so a returned id can be traded back for the real row.
  const byId = new Map<string, Exercise>();

  for (const candidate of candidates) {
    byId.set(candidate.id, candidate);
  }

  // Keep only picks that match a real exercise, limit to 3, and build the final
  // result using the real exercise data plus Gemini's sets/reps numbers.
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
