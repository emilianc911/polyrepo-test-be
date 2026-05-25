import { Router } from "express";
import { query } from "../db.js";
import { redis } from "../redis.js";
import { s3 } from "../storage.js";
import { config } from "../config.js";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { asyncHandler } from "../utils/asyncHandler.js";

export const healthRouter = Router();

healthRouter.get(
  "/health",
  asyncHandler(async (_req, res) => {
    res.json({ status: "ok" });
  }),
);

healthRouter.get(
  "/health/deep",
  asyncHandler(async (_req, res) => {
    const checks: Record<string, { ok: boolean; error?: string }> = {};
    try {
      await query("SELECT 1");
      checks.db = { ok: true };
    } catch (err) {
      checks.db = { ok: false, error: (err as Error).message };
    }
    try {
      const pong = await redis.ping();
      checks.redis = { ok: pong === "PONG" };
    } catch (err) {
      checks.redis = { ok: false, error: (err as Error).message };
    }
    try {
      await s3.send(new HeadBucketCommand({ Bucket: config.s3.bucket }));
      checks.s3 = { ok: true };
    } catch (err) {
      checks.s3 = { ok: false, error: (err as Error).message };
    }
    const allOk = Object.values(checks).every((c) => c.ok);
    res.status(allOk ? 200 : 503).json({ status: allOk ? "ok" : "degraded", checks });
  }),
);
