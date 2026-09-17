import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url(),
  SESSION_DURATION_HOURS: z.coerce.number().int().min(1).max(24 * 31).default(24),
});

export type Config = z.infer<typeof environmentSchema>;

export function parseConfig(environment: NodeJS.ProcessEnv): Config {
  return environmentSchema.parse(environment);
}

export const config = parseConfig(process.env);
