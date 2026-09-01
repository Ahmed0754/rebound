import { defineConfig } from "vitest/config";

// Only isolation.test.ts — see vitest.config.ts for why it's split out.
export default defineConfig({
  test: {
    include: ["src/isolation.test.ts"],
  },
});
