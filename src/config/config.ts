import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url().refine(
    (value) => {
      const protocol = new URL(value).protocol;
      return protocol === 'postgres:' || protocol === 'postgresql:';
    },
    'must use the postgres:// or postgresql:// protocol',
  ),
  SESSION_DURATION_HOURS: z.coerce.number().int().min(1).max(24 * 31).default(24),
  MIGRATION_LOCK_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
});

export type Config = z.infer<typeof environmentSchema>;

export function parseConfig(environment: NodeJS.ProcessEnv): Config {
  const result = environmentSchema.safeParse(environment);
  if (result.success) return result.data;
  const reasons = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid environment configuration: ${reasons.join('; ')}`);
}

export const config = parseConfig(process.env);
