// This is the entry point - the file you actually run to start the server.
// It builds the server (defined in server.ts) and starts it listening.

import { createApiServer } from "./controllers/server.js";

// Use the port from the environment if one is set, otherwise default to 4000.
const port = Number(process.env.API_PORT ?? 4000);

createApiServer().listen(port, () => {
  console.log(`api listening on http://localhost:${port}`);
});
