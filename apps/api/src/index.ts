import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const app = new Hono();

app.post("/poc/regime", async (c) => {
  const body = await c.req.json<{ muscle?: string }>();
  const muscle = body.muscle?.trim().toLowerCase();

  if (!muscle) {
    return c.json({ error: "muscle is required" }, 400);
  }

  const matched = await prisma.exercise.findMany({
    where: { bodyRegion: { contains: muscle, mode: "insensitive" } },
  });

  const pool = matched.length > 0 ? matched : await prisma.exercise.findMany();

  return c.json({ muscle, exercises: pool });
});

const port = 3000;
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`);
});
