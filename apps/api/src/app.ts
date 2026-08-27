import { Hono } from "hono";
import { cors } from "hono/cors";
import { PrismaClient } from "@prisma/client";
import { GoogleGenAI, Type } from "@google/genai";

const prisma = new PrismaClient();
export const app = new Hono();

app.use("/poc/*", cors());
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const model = process.env.GEMINI_MODEL ?? "gemini-3.7-flash";

app.post("/poc/regime", async (c) => {
  const body = await c.req.json<{ muscle?: string }>();
  const muscle = body.muscle?.trim().toLowerCase();

  if (!muscle) {
    return c.json({ error: "muscle is required" }, 400);
  }

  const matched = await prisma.exercise.findMany({
    where: { bodyRegion: { contains: muscle, mode: "insensitive" } },
  });

  const pool = matched.length > 0 ? matched : await prisma.exercise.findMany();

  const response = await ai.models.generateContent({
    model,
    contents: `A user says their "${muscle}" hurts. From this list of exercises, pick exactly 3 and assign sets and reps for each:\n\n${JSON.stringify(
      pool.map((e) => ({ id: e.id, name: e.name, description: e.description }))
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

  const poolById = new Map(pool.map((e) => [e.id, e]));

  const regime = (parsed.picks ?? [])
    .filter((pick) => poolById.has(pick.exerciseId))
    .slice(0, 3)
    .map((pick) => ({
      ...poolById.get(pick.exerciseId)!,
      sets: pick.sets,
      reps: pick.reps,
    }));

  return c.json({ muscle, regime });
});
