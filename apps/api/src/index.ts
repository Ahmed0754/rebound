import { serve } from "@hono/node-server";
import { app } from "./app.js";

const port = 3000;
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`);
});
