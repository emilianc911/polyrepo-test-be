import pg from "pg";
import { config } from "./config.js";
import { logger } from "./logger.js";

const { Pool } = pg;

export const pool = new Pool({
  host: config.pg.host,
  port: config.pg.port,
  user: config.pg.user,
  password: config.pg.password,
  database: config.pg.database,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  logger.error({ err }, "pg pool error");
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as never);
}

export async function withTx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function waitForDb(maxAttempts = 30, delayMs = 1_000): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (err) {
      lastErr = err;
      logger.warn(
        { attempt, max: maxAttempts },
        `pg not ready: ${(err as Error).message}`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}
