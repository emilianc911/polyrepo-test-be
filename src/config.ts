function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function int(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Env ${name} must be a number, got: ${v}`);
  return n;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v === "1" || v.toLowerCase() === "true";
}

export const config = {
  env: process.env.NODE_ENV ?? "development",
  logLevel: process.env.LOG_LEVEL ?? "info",
  port: int("PORT", 4000),
  publicUrl: process.env.PUBLIC_URL ?? "http://localhost:4000",

  pg: {
    host: process.env.PGHOST ?? "db",
    port: int("PGPORT", 5432),
    user: process.env.PGUSER ?? "app",
    password: process.env.PGPASSWORD ?? "app",
    database: process.env.PGDATABASE ?? "app",
  },

  redis: {
    url: process.env.REDIS_URL ?? "redis://cache:6379",
  },

  auth: {
    jwtSecret: required("JWT_SECRET", "change-me-in-prod"),
    jwtTtlSeconds: int("JWT_TTL_SECONDS", 86400),
  },

  s3: {
    endpoint: process.env.S3_ENDPOINT ?? "http://objects:9000",
    publicEndpoint: process.env.S3_PUBLIC_ENDPOINT ?? "http://localhost:9000",
    region: process.env.S3_REGION ?? "us-east-1",
    accessKey: process.env.S3_ACCESS_KEY ?? "minio",
    secretKey: process.env.S3_SECRET_KEY ?? "minio12345",
    bucket: process.env.S3_BUCKET ?? "polyrepo-uploads",
    forcePathStyle: bool("S3_FORCE_PATH_STYLE", true),
  },

  smtp: {
    host: process.env.SMTP_HOST ?? "mail",
    port: int("SMTP_PORT", 1025),
    user: process.env.SMTP_USER || undefined,
    pass: process.env.SMTP_PASS || undefined,
    from: process.env.SMTP_FROM ?? "Polyrepo Demo <noreply@polyrepo.local>",
  },
} as const;

export type AppConfig = typeof config;
