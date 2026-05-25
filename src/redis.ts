import { Redis } from "ioredis";
import { config } from "./config.js";
import { logger } from "./logger.js";

// BullMQ requires `maxRetriesPerRequest: null` on its connections.
function makeClient(role: string, opts: { forBullMQ?: boolean } = {}): Redis {
  const client = new Redis(config.redis.url, {
    maxRetriesPerRequest: opts.forBullMQ ? null : 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });
  client.on("error", (err: Error) => {
    logger.error({ role, err: err.message }, "redis error");
  });
  return client;
}

// Generic command client (cache, ad-hoc reads/writes).
export const redis = makeClient("commands");

// Pub/sub clients — must NOT also issue regular commands once subscribed.
export const pubClient = makeClient("pubsub-pub");
export const subClient = makeClient("pubsub-sub");

// Dedicated client for BullMQ (queue + workers).
export const bullConnection = makeClient("bullmq", { forBullMQ: true });

export async function waitForRedis(maxAttempts = 30, delayMs = 1_000): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const pong = await redis.ping();
      if (pong === "PONG") return;
    } catch (err) {
      logger.warn(
        { attempt, max: maxAttempts },
        `redis not ready: ${(err as Error).message}`,
      );
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error("redis did not become ready in time");
}
