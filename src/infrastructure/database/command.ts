import { fileURLToPath } from 'node:url';
import { Migration, runner } from 'node-pg-migrate';
import {
  DatabaseConfigurationError,
  parseDatabaseEnv,
} from '../../config/database.ts';
import { createPool, verifyConnection } from './pool.ts';

const dir = fileURLToPath(new URL('../../../migrations/', import.meta.url));
const [command, name] = process.argv.slice(2);

async function run(): Promise<void> {
  if (command === 'create') {
    if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
      console.error('Usage: npm run db:migration:create -- migration-name');
      process.exitCode = 1;
      return;
    }
    console.log(await Migration.create(name, dir, { language: 'sql' }));
    return;
  }

  const config = parseDatabaseEnv(process.env);
  if (command === 'check') {
    const pool = createPool(config, () =>
      console.error('Unexpected idle PostgreSQL client error'),
    );
    try {
      await verifyConnection(pool);
      console.log('PostgreSQL connection verified');
    } finally {
      await pool.end();
    }
    return;
  }

  if (command !== 'up' && command !== 'down')
    throw new Error('Unknown database command');

  const migrations = await runner({
    databaseUrl: {
      connectionString: config.connectionString,
      connectionTimeoutMillis: config.DB_CONNECTION_TIMEOUT_MS,
    },
    dir,
    direction: command,
    ...(command === 'down' ? { count: 1 } : {}),
    migrationsTable: 'pgmigrations',
    checkOrder: true,
    singleTransaction: true,
    logger: { info() {}, warn() {}, error() {} },
  });
  console.log(`${migrations.length} migration(s) processed`);
}

try {
  await run();
} catch (error) {
  console.error(
    error instanceof DatabaseConfigurationError
      ? error.message
      : 'Database command failed',
  );
  process.exitCode = 1;
}
