import type pg from 'pg';
import { parseDatabaseEnv } from '../../src/config/database.ts';

const testDatabase = 'marketplace_webhook_service_test';
const testRole = 'marketplace_test';

type EnvInput = Record<string, string | undefined>;

export function parseIntegrationTarget(env: EnvInput) {
  const config = parseDatabaseEnv(env, 'TEST_DATABASE_URL');
  const url = new URL(config.connectionString);
  if (
    decodeURI(url.pathname.slice(1)) !== testDatabase ||
    decodeURIComponent(url.username) !== testRole ||
    url.search
  ) {
    throw new Error(
      'TEST_DATABASE_URL must use marketplace_test and marketplace_webhook_service_test with no URL query parameters',
    );
  }

  if (env.DATABASE_URL !== undefined) {
    const development = new URL(parseDatabaseEnv(env).connectionString);
    const target = decodeURI(development.pathname.slice(1));
    if (target === testDatabase) {
      throw new Error(
        'DATABASE_URL also identifies the integration test database',
      );
    }
  }

  return config;
}

export async function verifyIntegrationTarget(
  client: Pick<pg.ClientBase, 'query'>,
): Promise<void> {
  const {
    rows: [target],
  } = await client.query<{
    database: string;
    role: string;
    login: string;
    isolated: boolean;
  }>(`
    SELECT current_database() AS database, current_user AS role, session_user AS login,
      d.datdba = r.oid AND NOT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR
        r.rolreplication OR r.rolbypassrls) AND NOT EXISTS (
          SELECT 1 FROM pg_database other
          WHERE other.datname = 'marketplace_webhook_service'
            AND has_database_privilege(r.oid, other.oid, 'CONNECT')
        ) AS isolated
    FROM pg_roles r
    JOIN pg_database d ON d.datname = current_database()
    WHERE r.rolname = current_user
  `);

  if (
    target?.database !== testDatabase ||
    target.role !== testRole ||
    target.login !== testRole ||
    target.isolated !== true
  ) {
    throw new Error(
      'PostgreSQL did not verify the dedicated integration test database, role, and privileges',
    );
  }
}
