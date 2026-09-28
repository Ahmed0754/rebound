// The entry point: reads the port, starts the app, and listens.

import { app } from "./app.js";

const port = Number(process.env.API_PORT ?? 4000);

app.listen(port, () => {
  console.log(`api listening on http://localhost:${port}`);
});
