import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool, withTx } from "./db.js";
import { logger } from "./logger.js";

// Arbitrary 64-bit constant used with pg_advisory_lock to ensure that even if
// multiple processes (api + worker, or rolling-update overlap) start at the
// same time, only one applies migrations at a time. Other processes block on
// the lock until the migrator is done.
const ADVISORY_LOCK_KEY = 4242;

/**
 * Locate the `migrations/` folder relative to this module.
 *
 * - In the Docker image, the compiled migrator lives at /app/dist/migrate.js
 *   and the SQL files at /app/migrations/*.sql (see Dockerfile).
 * - Under `tsx watch` it lives at <repo>/src/migrate.ts and SQL at
 *   <repo>/migrations/*.sql.
 *
 * In both cases the `migrations` folder is two levels up + one across.
 */
function migrationsDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // dist/ or src/ -> repo root -> migrations
  return path.resolve(here, "..", "migrations");
}

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT        PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function listSqlFiles(dir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      logger.warn({ dir }, "migrations dir not found, skipping");
      return [];
    }
    throw err;
  }
  return entries
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
}

async function appliedSet(): Promise<Set<string>> {
  const { rows } = await pool.query<{ filename: string }>(
    "SELECT filename FROM schema_migrations",
  );
  return new Set(rows.map((r) => r.filename));
}

/**
 * Apply every `migrations/*.sql` file that hasn't been recorded yet, in
 * lexicographic order. Each file is wrapped in a transaction together with
 * the INSERT into schema_migrations, so a partial failure leaves no dangling
 * "applied" rows. Each SQL file is itself expected to be idempotent: see the
 * docstring at the top of `migrations/001_init.sql`.
 */
export async function runMigrations(): Promise<void> {
  await ensureMigrationsTable();

  // pg_advisory_lock is per-session, so we must use a single client (NOT the
  // pool) to acquire and release on the same connection.
  const client = await pool.connect();
  try {
    logger.info({ key: ADVISORY_LOCK_KEY }, "acquiring migration lock");
    await client.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK_KEY]);
    try {
      const dir = migrationsDir();
      const files = await listSqlFiles(dir);
      const applied = await appliedSet();
      const pending = files.filter((f) => !applied.has(f));

      if (pending.length === 0) {
        logger.info({ count: files.length }, "schema up to date");
        return;
      }

      logger.info(
        { count: pending.length, files: pending },
        "applying pending migrations",
      );
      for (const file of pending) {
        const fullPath = path.join(dir, file);
        const sql = await fs.readFile(fullPath, "utf8");
        await withTx(async (tx) => {
          await tx.query(sql);
          await tx.query(
            "INSERT INTO schema_migrations (filename) VALUES ($1)",
            [file],
          );
        });
        logger.info({ file }, "migration applied");
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}
