// The controller for regimes: one handler per route. Each reads the request,
// calls the model, and picks a status code. Mounted at /api/regimes in app.ts.

import { Router } from "express";
import { create, get } from "../models/regimes.js";

const router = Router();

router
  .post("/", async (req, res) => {
    // Anything that is not a string becomes "", so there is only one way to be invalid.
    const muscle = typeof req.body?.muscle === "string" ? req.body.muscle.trim().toLowerCase() : "";

    if (muscle === "") {
      res.status(400).send({ error: "muscle is required" });
      return;
    }

    const regime = await create(muscle);

    // Not an error: the request was fine, there is just nothing stored for that region.
    if (regime === null) {
      res.status(404).send({ error: `no exercises found for "${muscle}"` });
      return;
    }

    res.status(201).send(regime);
  })
  .get("/:id", async (req, res) => {
    const regime = await get(req.params.id);

    // An unused id and a malformed one get the same answer, so a stranger
    // learns nothing about how ids are shaped.
    if (regime === null) {
      res.status(404).send({ error: "no regime with that id" });
      return;
    }

    res.send(regime);
  });

export default router;
