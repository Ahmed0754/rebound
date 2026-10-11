// The free-text screen. No network: the one model call is stubbed, so these
// can force every outcome, the outage included.

import { describe, it, expect, vi, afterEach } from "vitest";
import { buildClassifierRequest, parseVerdict, screenNote } from "./classifier.js";
import { ai } from "./gemini.js";

afterEach(() => {
  vi.restoreAllMocks();
});

// Stands in for the model's reply, one call at a time.
function replies(...answers: (object | Error)[]) {
  const spy = vi.spyOn(ai.models, "generateContent");

  for (const answer of answers) {
    if (answer instanceof Error) {
      spy.mockRejectedValueOnce(answer);
    } else {
      spy.mockResolvedValueOnce({ text: JSON.stringify(answer) } as never);
    }
  }

  return spy;
}

describe("buildClassifierRequest", () => {
  // TDD.md rule 4, for this call as for generation.
  it("sends a system instruction, at temperature 0", () => {
    const { config } = buildClassifierRequest("my knee hurts");

    expect(String(config?.systemInstruction)).toContain("You only classify the note.");
    expect(config?.temperature).toBe(0);
  });

  it("fences the note as user content", () => {
    const built = buildClassifierRequest("36 weeks pregnant, sciatica's been brutal");

    expect(built.contents).toBe("<user_note>\n36 weeks pregnant, sciatica's been brutal\n</user_note>");
    expect(String(built.config?.systemInstruction)).not.toContain("36 weeks");
  });
});

describe("parseVerdict", () => {
  it("flags a contradicting answer rather than reading it as clear", () => {
    expect(parseVerdict('{"flagged":true,"categories":[],"quote":"x"}').categories).toEqual([
      "other_medical",
    ]);
    expect(parseVerdict('{"flagged":false,"categories":["night_pain"],"quote":"x"}').flagged).toBe(
      true
    );
  });

  it("drops categories it does not know", () => {
    expect(parseVerdict('{"flagged":false,"categories":["vibes"],"quote":""}')).toEqual({
      flagged: false,
      categories: [],
      quote: "",
    });
  });

  it("throws on an answer that is not a verdict", () => {
    expect(() => parseVerdict('{"ok":true}')).toThrow();
    expect(() => parseVerdict("not json")).toThrow();
  });
});

describe("screenNote", () => {
  // The PRD's own example: "no" on the pregnancy box, then this in the note.
  it("flags a red flag the tick-boxes missed", async () => {
    replies({ flagged: true, categories: ["pregnancy_related"], quote: "36 weeks pregnant" });

    await expect(screenNote("36 weeks pregnant, sciatica's been brutal")).resolves.toMatchObject({
      screening: "flagged",
      categories: ["pregnancy_related"],
      quote: "36 weeks pregnant",
    });
  });

  it("clears an ordinary note", async () => {
    replies({ flagged: false, categories: [], quote: "" });

    await expect(screenNote("stairs are the worst part")).resolves.toMatchObject({
      screening: "clear",
      quote: null,
    });
  });

  it("routes self-harm found by the classifier to crisis", async () => {
    replies({ flagged: true, categories: ["self_harm"], quote: "no point anymore" });

    await expect(screenNote("there's no point anymore")).resolves.toMatchObject({
      screening: "crisis",
    });
  });

  // The backstop: caught with no model at all, so an outage cannot let it by.
  it("catches crisis language without calling the model", async () => {
    const spy = replies();

    await expect(screenNote("I want to kill myself")).resolves.toMatchObject({ screening: "crisis" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("retries once before giving up", async () => {
    const spy = replies(new Error("timeout"), { flagged: false, categories: [], quote: "" });

    await expect(screenNote("sore after football")).resolves.toMatchObject({ screening: "clear" });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  // ADR 0021, as decided: unscreened, marked, and let through.
  it("marks a note unavailable when the classifier is down", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    replies(new Error("503"), new Error("503"));

    await expect(screenNote("sore after football")).resolves.toEqual({
      screening: "unavailable",
      categories: [],
      quote: null,
      model: null,
    });
  });
});
