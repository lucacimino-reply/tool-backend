import "dotenv/config";

export type AppConfig = {
  databaseUrl: string;
  migrationTimeoutMs: number;
  port: number;
};

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
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
    migrationTimeoutMs: positiveInteger(process.env.MIGRATION_TIMEOUT_MS, 60_000, "MIGRATION_TIMEOUT_MS"),
    port: positiveInteger(process.env.PORT, 3000, "PORT"),
  };
}
