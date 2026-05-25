import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  host: process.env.PGHOST || "db",
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || "todos",
  password: process.env.PGPASSWORD || "todos",
  database: process.env.PGDATABASE || "todos",
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  console.error("[db] unexpected pool error:", err);
});

export async function query(text, params) {
  return pool.query(text, params);
}

export async function ensureSchema() {
  // Idempotent bootstrap: keeps the demo runnable even if a separate
  // migration step was skipped in the deploy environment.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS todos (
      id          SERIAL PRIMARY KEY,
      title       TEXT NOT NULL,
      done        BOOLEAN NOT NULL DEFAULT FALSE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function closePool() {
  await pool.end();
}
