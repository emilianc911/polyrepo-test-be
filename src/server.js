import cors from "cors";
import express from "express";
import { closePool, ensureSchema, query } from "./db.js";

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || "0.0.0.0";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", async (_req, res) => {
  try {
    await query("SELECT 1");
    res.json({ status: "ok" });
  } catch (err) {
    res.status(503).json({ status: "degraded", error: String(err.message || err) });
  }
});

app.get("/api/todos", async (_req, res, next) => {
  try {
    const { rows } = await query(
      "SELECT id, title, done, created_at FROM todos ORDER BY id DESC",
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

app.post("/api/todos", async (req, res, next) => {
  try {
    const title = String(req.body?.title || "").trim();
    if (!title) {
      return res.status(400).json({ error: "title is required" });
    }
    const { rows } = await query(
      "INSERT INTO todos (title) VALUES ($1) RETURNING id, title, done, created_at",
      [title],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

app.patch("/api/todos/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "invalid id" });
    }
    const done = Boolean(req.body?.done);
    const { rows } = await query(
      "UPDATE todos SET done = $1 WHERE id = $2 RETURNING id, title, done, created_at",
      [done, id],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "not found" });
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

app.delete("/api/todos/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "invalid id" });
    }
    const result = await query("DELETE FROM todos WHERE id = $1", [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "not found" });
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

app.use((err, _req, res, _next) => {
  console.error("[api] unhandled error:", err);
  res.status(500).json({ error: "internal_error" });
});

async function main() {
  let attempts = 0;
  // Postgres in the compose stack may still be starting up when the API
  // process boots. Retry the schema bootstrap a few times before giving up.
  while (true) {
    try {
      await ensureSchema();
      break;
    } catch (err) {
      attempts += 1;
      if (attempts >= 10) {
        console.error("[api] could not connect to db, giving up:", err.message);
        process.exit(1);
      }
      console.warn(`[api] db not ready (attempt ${attempts}/10): ${err.message}`);
      await new Promise((r) => setTimeout(r, 2_000));
    }
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(`[api] listening on http://${HOST}:${PORT}`);
  });

  const shutdown = async (signal) => {
    console.log(`[api] received ${signal}, shutting down`);
    server.close(() => {
      closePool().finally(() => process.exit(0));
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[api] fatal:", err);
  process.exit(1);
});
