import { describe, it, expect } from "vitest";
import { mapLimit } from "./parallel.js";

describe("mapLimit", () => {
  it("keeps input order, and never runs more than the limit at once", async () => {
    let running = 0;
    let most = 0;
    const out = await mapLimit([30, 5, 20, 1, 10], 2, async (ms) => {
      running++;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, ms));
      running--;
      return ms * 2;
    });

    expect(out).toEqual([60, 10, 40, 2, 20]);
    expect(most).toBe(2);
  });

  it("handles no items", async () => {
    expect(await mapLimit([], 4, async (x) => x)).toEqual([]);
  });
});
