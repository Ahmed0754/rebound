// this is my entry point, it reads the port, builds the server, then listens. 

import { createApiServer } from "./controllers/server.js";

const port = Number(process.env.API_PORT ?? 4000);

createApiServer().listen(port, () => {
  console.log(`api listening on http://localhost:${port}`);
});
