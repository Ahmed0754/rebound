import { loadEnv } from "./env.js";

// Validate configuration before importing anything that reads it.
const env = loadEnv();

const { createApiServer } = await import("./server.js");

createApiServer().listen(env.API_PORT, () => {
  console.log(`api listening on http://localhost:${env.API_PORT}`);
});
