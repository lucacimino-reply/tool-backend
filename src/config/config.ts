import { z } from "zod";

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z
    .string()
    .url()
    .refine(
      (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
      "Expected a PostgreSQL connection URL",
    )
    .default("postgresql://details:details@localhost:5432/details"),
  MIGRATION_TIMEOUT_MS: z.coerce.number().int().min(1).max(300000).default(30000),
});

export type AppConfig = {
  nodeEnv: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  migrationTimeoutMs: number;
};

export function parseConfig(environment: NodeJS.ProcessEnv): AppConfig {
  const result = configSchema.safeParse(environment);
  if (!result.success) {
    const reasons = result.error.issues
      .map((issue) => `${String(issue.path[0])}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid configuration: ${reasons}`);
  }

  return {
    nodeEnv: result.data.NODE_ENV,
    port: result.data.PORT,
    databaseUrl: result.data.DATABASE_URL,
    migrationTimeoutMs: result.data.MIGRATION_TIMEOUT_MS,
  };
}

export const config = parseConfig(process.env);
