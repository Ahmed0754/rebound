import { GoogleGenAI, Type } from "@google/genai";
import { pool, type ExerciseRow } from "./db.js";

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
 * Picks exercises for a body region and asks Gemini to assign sets/reps.
 * Gemini only ever chooses from the rows we hand it, and every id it returns
 * is checked back against that pool before it reaches the caller.
 */
export async function buildRegime(muscle: string): Promise<RegimeItem[]> {
  const { rows: pool_ } = await pool.query<ExerciseRow>(
    `select id, name, body_region, description
       from exercises
      where body_region ilike '%' || $1 || '%'`,
    [muscle]
  );

  if (pool_.length === 0) {
    return [];
  }

  const response = await ai.models.generateContent({
    model,
    contents: `A user says their "${muscle}" hurts. From this list of exercises, pick exactly 3 and assign sets and reps for each:\n\n${JSON.stringify(
      pool_.map((e) => ({ id: e.id, name: e.name, description: e.description }))
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

  console.log("raw picks from Gemini:", parsed.picks);

  const byId = new Map(pool_.map((e) => [e.id, e]));

  return (parsed.picks ?? [])
    .filter((pick) => byId.has(pick.exerciseId))
    .slice(0, 3)
    .map((pick) => {
      const exercise = byId.get(pick.exerciseId)!;
      return {
        id: exercise.id,
        name: exercise.name,
        bodyRegion: exercise.body_region,
        description: exercise.description,
        sets: pick.sets,
        reps: pick.reps,
      };
    });
}
