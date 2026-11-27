import { z } from 'zod';

const postgresUrl = z.string().refine((value) => {
  try {
    const url = new URL(value);
    decodeURIComponent(value);
    return (
      /^postgres(?:ql)?:\/\//i.test(value) &&
      !/\s/.test(value) &&
      Boolean(url.hostname && url.username && url.pathname.slice(1)) &&
      !url.hash
    );
  } catch {
    return false;
  }
}, 'Expected a PostgreSQL URL with an explicit host, user, and database');

function integer(min: number, max: number, fallback: number) {
  return z
    .string()
    .trim()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(min).max(max))
    .prefault(String(fallback));
}

const poolSchema = z.object({
  DB_POOL_MAX: integer(1, 100, 10),
  DB_CONNECTION_TIMEOUT_MS: integer(1, 60_000, 5_000),
  DB_IDLE_TIMEOUT_MS: integer(1, 300_000, 30_000),
});

export type DatabaseConfig = z.output<typeof poolSchema> & {
  connectionString: string;
};

type EnvInput = Record<string, string | undefined>;

export class DatabaseConfigurationError extends Error {}

export function parseDatabaseEnv(
  input: EnvInput,
  variable: 'DATABASE_URL' | 'TEST_DATABASE_URL' = 'DATABASE_URL',
): DatabaseConfig {
  const url = postgresUrl.safeParse(input[variable]);
  const pool = poolSchema.safeParse(input);
  if (!url.success) {
    throw new DatabaseConfigurationError(
      `Invalid environment configuration: ${variable}`,
    );
  }
  if (!pool.success) {
    const names = pool.error.issues.map((issue) => issue.path.join('.'));
    throw new DatabaseConfigurationError(
      `Invalid environment configuration: ${names.join(', ')}`,
    );
  }
  return { ...pool.data, connectionString: url.data };
}
