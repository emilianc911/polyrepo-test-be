import { logger } from "./logger.js";
import { waitForRedis } from "./redis.js";
import { startWorker } from "./jobs/workers.js";

async function main() {
  logger.info("starting worker");
  await waitForRedis();
  logger.info("redis ready, attaching worker");
  const worker = startWorker();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down worker");
    try {
      await worker.close();
    } catch (err) {
      logger.error({ err: (err as Error).message }, "error closing worker");
    }
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error({ err: (err as Error).message }, "worker failed to start");
  process.exit(1);
});
