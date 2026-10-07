import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z
    .string()
    .url()
    .refine((value) => value.startsWith("postgres://") || value.startsWith("postgresql://"), {
      message: "must be a PostgreSQL connection URL",
    }),
  CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(1).max(60000).default(5000),
  MIGRATION_TIMEOUT_MS: z.coerce.number().int().min(1).max(120000).default(60000),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1).max(120000).default(10000),
});

export type AppConfig = {
  nodeEnv: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  connectionTimeoutMs: number;
  migrationTimeoutMs: number;
  shutdownTimeoutMs: number;
};

export function parseConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    const reasons = result.error.issues.map((issue) => {
      const variable = issue.path[0] ?? "environment";
      return `${String(variable)}: ${issue.message}`;
    });
    throw new Error(`Invalid backend configuration: ${reasons.join("; ")}`);
  }

  return {
    nodeEnv: result.data.NODE_ENV,
    port: result.data.PORT,
    databaseUrl: result.data.DATABASE_URL,
    connectionTimeoutMs: result.data.CONNECTION_TIMEOUT_MS,
    migrationTimeoutMs: result.data.MIGRATION_TIMEOUT_MS,
    shutdownTimeoutMs: result.data.SHUTDOWN_TIMEOUT_MS,
  };
}
