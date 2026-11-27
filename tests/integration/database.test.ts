import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';
import type pg from 'pg';
import { afterAll, beforeAll, expect, test } from 'vitest';
import {
  createPool,
  verifyConnection,
} from '../../src/infrastructure/database/pool.ts';
import { parseIntegrationTarget, verifyIntegrationTarget } from './target.ts';

const config = parseIntegrationTarget(process.env);
const pool = createPool(
  {
    ...config,
    DB_CONNECTION_TIMEOUT_MS: Math.min(config.DB_CONNECTION_TIMEOUT_MS, 5_000),
  },
  () => console.error('Unexpected idle PostgreSQL test client error'),
);
let client: pg.PoolClient;

beforeAll(async () => {
  try {
    client = await pool.connect();
  } catch {
    throw new Error(
      'Could not connect to the dedicated PostgreSQL integration database',
    );
  }
  await verifyIntegrationTarget(client);
});

afterAll(async () => {
  client?.release();
  await pool.end();
  expect(pool.totalCount).toBe(0);
});

test('verifies connectivity and executes a parameterized query', async () => {
  await expect(verifyConnection(client)).resolves.toBeUndefined();
  const value = "test's parameter";
  const { rows } = await client.query<{ value: string }>(
    'SELECT $1::text AS value',
    [value],
  );
  expect(rows).toEqual([{ value }]);
});

test('applies and rolls back a fixture and records its history in a private schema', async () => {
  const schema = `integration_${randomUUID().replaceAll('-', '')}`;
  const options = {
    dbClient: client,
    dir: fileURLToPath(new URL('../fixtures/migrations/', import.meta.url)),
    migrationsTable: 'pgmigrations',
    schema,
    migrationsSchema: schema,
    singleTransaction: true,
    logger: { info() {}, warn() {}, error() {} },
  };

  await client.query("SET statement_timeout = '5s'");
  // Only the schema created successfully by this run is eligible for cleanup.
  await client.query(`CREATE SCHEMA "${schema}"`);
  try {
    await runner({ ...options, direction: 'up' });
    const { rows: history } = await client.query(
      `SELECT name FROM "${schema}".pgmigrations`,
    );
    expect(history).toEqual([{ name: '1700000000000_probe' }]);
    const probe = `${schema}.migration_probe`;
    const lookup = 'SELECT to_regclass($1)::text AS relation';
    const applied = await client.query<{ relation: string | null }>(lookup, [
      probe,
    ]);
    expect(applied.rows[0]?.relation).toMatch(/migration_probe$/);

    await runner({ ...options, direction: 'down', count: 1 });
    const rolledBack = await client.query<{ relation: string | null }>(lookup, [
      probe,
    ]);
    expect(rolledBack.rows[0]?.relation).toBeNull();
    const { rows } = await client.query(
      `SELECT name FROM "${schema}".pgmigrations`,
    );
    expect(rows).toEqual([]);
  } finally {
    await client.query(`DROP SCHEMA "${schema}" CASCADE`);
  }
});

test('rejects an application database URL and a mismatched server identity', async () => {
  expect(() =>
    parseIntegrationTarget({
      TEST_DATABASE_URL:
        'postgres://marketplace_app@localhost/marketplace_webhook_service',
    }),
  ).toThrow('TEST_DATABASE_URL');
  await client.query('BEGIN');
  try {
    await client.query('SET LOCAL ROLE pg_database_owner');
    await expect(verifyIntegrationTarget(client)).rejects.toThrow(
      'did not verify',
    );
  } finally {
    await client.query('ROLLBACK');
  }
});

test('reports a rejected connection safely and closes its pool', async () => {
  const url = new URL(config.connectionString);
  url.pathname = `/missing_${randomUUID().replaceAll('-', '')}`;
  const rejected = createPool(
    {
      ...config,
      connectionString: url.href,
      DB_CONNECTION_TIMEOUT_MS: 2_000,
    },
    () => console.error('Unexpected idle PostgreSQL test client error'),
  );
  try {
    await expect(verifyConnection(rejected)).rejects.toThrow(
      /^PostgreSQL connection check failed$/,
    );
  } finally {
    await rejected.end();
  }
  expect(rejected.totalCount).toBe(0);
  await expect(rejected.query('SELECT 1')).rejects.toThrow(/after calling end/);
});
