import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: z
    .string()
    .trim()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(65535))
    .prefault('3000'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
});

export type Env = z.output<typeof envSchema>;

export function parseEnv(input: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(input);

  if (!result.success) {
    const variables = result.error.issues.map((issue) => issue.path.join('.'));
    throw new Error(
      `Invalid environment configuration: ${variables.join(', ')}`,
    );
  }

  return result.data;
}
