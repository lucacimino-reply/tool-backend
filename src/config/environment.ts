import "dotenv/config";

export type AppConfig = {
  databaseUrl: string;
  port: number;
  migrationTimeoutMs: number;
};

const DEFAULT_PORT = 3000;
const DEFAULT_MIGRATION_TIMEOUT_MS = 60_000;

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

export function getConfig(): AppConfig {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  return {
    databaseUrl,
    port: positiveInteger(process.env.PORT, DEFAULT_PORT, "PORT"),
    migrationTimeoutMs: positiveInteger(
      process.env.MIGRATION_TIMEOUT_MS,
      DEFAULT_MIGRATION_TIMEOUT_MS,
      "MIGRATION_TIMEOUT_MS",
    ),
  };
}
