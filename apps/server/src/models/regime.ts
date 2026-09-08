import { GoogleGenAI, Type } from "@google/genai";
import { findByRegion } from "./exercises.js";

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

  const response = await ai.models.generateContent({
    model,
    contents: `A user says their "${muscle}" hurts. From this list of exercises, pick exactly 3 and assign sets and reps for each:\n\n${JSON.stringify(
      candidates.map((e) => ({ id: e.id, name: e.name, description: e.description }))
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

  const byId = new Map(candidates.map((e) => [e.id, e]));

  return (parsed.picks ?? [])
    .filter((pick) => byId.has(pick.exerciseId))
    .slice(0, 3)
    .map((pick) => ({ ...byId.get(pick.exerciseId)!, sets: pick.sets, reps: pick.reps }));
}
