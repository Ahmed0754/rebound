// The Express app: the middleware every request passes through, every route
// this server exposes, and the fallbacks for a request nothing else answered.
// Built here and started in index.ts, so the tests can use it without a port.

import express, { type ErrorRequestHandler } from "express";
import regimesController from "./controllers/regimes.js";

// The page runs on :3000 and this API on :4000, so the browser must be told :3000 is allowed.
const webOrigin = process.env.WEB_ORIGIN || "http://localhost:3000";

export const app = express();

// Set before any routing, so every reply carries them, errors included.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", webOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // The browser asks permission with its own OPTIONS request before a cross-origin
  // POST, PUT or DELETE. A method left out of the header above is refused by the
  // browser itself, which looks from here like the server never being called.
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});

app.use(express.json());

// A liveness probe: "is this process up", not a question about the app, so it
// sits outside /api.
app.get("/health", (_req, res) => {
  res.send({ ok: true });
});

app.use("/api/regimes", regimesController);

// Reached only when no route matched.
app.use((_req, res) => {
  res.status(404).send({ error: "not found" });
});

// Express 5 sends a thrown or rejected handler here. The real error goes to
// the terminal; the browser only ever sees this fixed sentence.
const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error(error);
  res.status(500).send({ error: "internal server error" });
};

app.use(handleError);
