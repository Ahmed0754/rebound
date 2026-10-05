// The controller for accounts: one handler per route. Mounted at /api/users
// in app.ts. Not behind any auth middleware - you cannot hold a user id
// before you have an account.

import { Router } from "express";
import { create, get, list, remove, DuplicateUsername } from "../models/users.js";

const router = Router();

// Lowercased before testing, so "Sam" and "sam" are judged the way the
// unique index on lower(username) judges them.
const USERNAME = /^[a-z0-9_]{3,30}$/;

router.post("/", async (req, res) => {
  const username =
    typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : "";

  if (!USERNAME.test(username)) {
    res.status(400).send({
      error: "username must be 3-30 characters: lowercase letters, numbers, underscore",
    });
    return;
  }

  try {
    const user = await create(username);
    res.status(201).send(user);
  } catch (error) {
    if (error instanceof DuplicateUsername) {
      res.status(409).send({ error: error.message });
      return;
    }

    throw error;
  }
});

router.get("/", async (_req, res) => {
  res.send(await list());
});

router.get("/:id", async (req, res) => {
  const user = await get(req.params.id);

  if (user === null) {
    res.status(404).send({ error: "no user with that id" });
    return;
  }

  res.send(user);
});

router.delete("/:id", async (req, res) => {
  const deleted = await remove(req.params.id);

  if (!deleted) {
    res.status(404).send({ error: "no user with that id" });
    return;
  }

  res.sendStatus(204);
});

export default router;
