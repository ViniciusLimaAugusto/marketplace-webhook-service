import pg from 'pg';
import type { DatabaseConfig } from '../../config/database.ts';

export function createPool(
  config: DatabaseConfig,
  reportIdleError: () => void,
) {
  const pool = new pg.Pool({
    connectionString: config.connectionString,
    max: config.DB_POOL_MAX,
    connectionTimeoutMillis: config.DB_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: config.DB_IDLE_TIMEOUT_MS,
  });
  pool.on('error', reportIdleError);
  return pool;
}

export async function verifyConnection(
  pool: Pick<pg.Pool, 'query'>,
): Promise<void> {
  try {
    await pool.query('SELECT 1');
  } catch {
    throw new Error('PostgreSQL connection check failed');
  }
}
