import { createServer } from "node:http";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { pinoHttp } from "pino-http";
import { ZodError } from "zod";

import { config } from "./config.js";
import { waitForDb } from "./db.js";
import { logger } from "./logger.js";
import { runMigrations } from "./migrate.js";
import { waitForRedis } from "./redis.js";
import { authRouter } from "./routes/auth.js";
import { attachmentsRouter } from "./routes/attachments.js";
import { commentsRouter } from "./routes/comments.js";
import { healthRouter } from "./routes/health.js";
import { projectsRouter } from "./routes/projects.js";
import { tasksRouter } from "./routes/tasks.js";
import { waitForS3 } from "./storage.js";
import { HttpError } from "./utils/errors.js";
import { attachWebSocket } from "./ws/server.js";

async function main() {
  logger.info({ env: config.env }, "starting api");

  await waitForDb();
  logger.info("db ready");
  await runMigrations();
  logger.info("schema ready");
  await waitForRedis();
  logger.info("redis ready");
  await waitForS3();
  logger.info("s3 ready");

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req: { url?: string }) => req.url === "/api/health" },
    }),
  );

  // Stricter rate limit on auth endpoints to deter password spraying.
  app.use(
    "/api/auth",
    rateLimit({
      windowMs: 60_000,
      limit: 30,
      standardHeaders: "draft-7",
      legacyHeaders: false,
    }),
  );

  app.use("/api", healthRouter);
  app.use("/api", authRouter);
  app.use("/api", projectsRouter);
  app.use("/api", tasksRouter);
  app.use("/api", commentsRouter);
  app.use("/api", attachmentsRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "not found" });
  });

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, details: err.details });
      return;
    }
    if (err instanceof ZodError) {
      res.status(400).json({ error: "validation_failed", details: err.flatten() });
      return;
    }
    logger.error({ err: (err as Error).message }, "unhandled error");
    res.status(500).json({ error: "internal_error" });
  };
  app.use(errorHandler);

  const server = createServer(app);
  attachWebSocket(server);

  server.listen(config.port, "0.0.0.0", () => {
    logger.info({ port: config.port }, "api listening");
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, "shutting down");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error({ err: (err as Error).message }, "api failed to start");
  process.exit(1);
});
