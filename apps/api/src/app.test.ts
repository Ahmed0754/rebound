import { describe, it, expect, vi } from "vitest";

const mockExercises = [
  { id: "1", name: "Straight Leg Raise", bodyRegion: "knee", description: "..." },
  { id: "2", name: "Wall Sit", bodyRegion: "knee", description: "..." },
  { id: "3", name: "Step-Up", bodyRegion: "knee", description: "..." },
];

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    exercise: {
      findMany: vi.fn().mockResolvedValue(mockExercises),
    },
  })),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          picks: [
            { exerciseId: "1", sets: 3, reps: 10 },
            { exerciseId: "2", sets: 2, reps: 30 },
            { exerciseId: "3", sets: 3, reps: 12 },
          ],
        }),
      }),
    },
  })),
  Type: { OBJECT: "OBJECT", ARRAY: "ARRAY", STRING: "STRING", INTEGER: "INTEGER" },
}));

const { app } = await import("./app.js");

describe("POST /poc/regime", () => {
  it("returns 400 when muscle is missing", async () => {
    const res = await app.request("/poc/regime", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it("returns a 3-exercise regime for a known muscle", async () => {
    const res = await app.request("/poc/regime", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ muscle: "knee" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.muscle).toBe("knee");
    expect(body.regime).toHaveLength(3);
    expect(body.regime[0]).toMatchObject({ id: "1", sets: 3, reps: 10 });
  });
});
