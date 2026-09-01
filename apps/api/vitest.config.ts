import { defineConfig } from "vitest/config";

// isolation.test.ts needs a live database and is deliberately excluded from
// the default run — it has its own script (test:isolation) and its own CI
// job, the same way check:rls is split out from the main lint/typecheck/test
// job rather than silently making the fast suite depend on a real database.
export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "src/isolation.test.ts"],
  },
});
